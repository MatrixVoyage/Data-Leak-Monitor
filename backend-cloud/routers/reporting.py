from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime, timedelta, timezone

import models
import auth
from database import get_db

router = APIRouter(prefix="/api", tags=["Reporting"])

# ────────────────────────────────────────────────
# Time-window constants (single source of truth)
# ────────────────────────────────────────────────

# How long a device is considered "online" after last_seen
DEVICE_ONLINE_WINDOW_MINUTES = 15
# Window for all dashboard/traffic/DNS data
SESSION_WINDOW_HOURS = 24

def _get_cutoffs():
    """Return consistent time cutoffs for the current request."""
    now = datetime.now(timezone.utc)
    return {
        "session": now - timedelta(hours=SESSION_WINDOW_HOURS),
        "device_online": now - timedelta(minutes=DEVICE_ONLINE_WINDOW_MINUTES),
        "now": now,
    }


def _serialize_device(dev, db, session_cutoff=None):
    """Converts a Device model → the frontend's Device interface shape.
    Only counts traffic from the current session window."""
    mac = dev.mac
    cutoff = session_cutoff or (datetime.now(timezone.utc) - timedelta(hours=SESSION_WINDOW_HOURS))

    # Compute aggregate traffic stats for this device (SESSION-SCOPED)
    sent = db.query(func.sum(models.TrafficRecord.bytes)).filter(
        models.TrafficRecord.device_mac == mac,
        models.TrafficRecord.direction == "outbound",
        models.TrafficRecord.timestamp_end >= cutoff,
    ).scalar() or 0

    received = db.query(func.sum(models.TrafficRecord.bytes)).filter(
        models.TrafficRecord.device_mac == mac,
        models.TrafficRecord.direction == "inbound",
        models.TrafficRecord.timestamp_end >= cutoff,
    ).scalar() or 0

    # If no directional data, attribute all traffic from this device
    if sent == 0 and received == 0:
        total = db.query(func.sum(models.TrafficRecord.bytes)).filter(
            models.TrafficRecord.device_mac == mac,
            models.TrafficRecord.timestamp_end >= cutoff,
        ).scalar() or 0
        received = total

    suspicious = db.query(models.TrafficRecord).filter(
        models.TrafficRecord.device_mac == mac,
        models.TrafficRecord.is_suspicious == True,
        models.TrafficRecord.timestamp_end >= cutoff,
    ).count()

    risk = "low"
    if suspicious >= 10:
        risk = "high"
    elif suspicious >= 3:
        risk = "medium"

    # Determine live status from last_seen
    device_online_cutoff = datetime.now(timezone.utc) - timedelta(minutes=DEVICE_ONLINE_WINDOW_MINUTES)
    is_online = dev.last_seen and dev.last_seen >= device_online_cutoff

    return {
        "id": dev.mac,
        "name": dev.hostname or dev.ip or dev.mac,
        "type": dev.type or "unknown",
        "ip": dev.ip,
        "mac": dev.mac,
        "vendor": dev.vendor or "Unknown",
        "status": "online" if is_online else "offline",
        "firstSeen": dev.first_seen.isoformat() if dev.first_seen else None,
        "lastSeen": dev.last_seen.isoformat() if dev.last_seen else None,
        "totalBytesSent": sent,
        "totalBytesReceived": received,
        "suspiciousConnections": suspicious,
        "riskLevel": risk,
        "icon": dev.type or "unknown",
    }


def _serialize_traffic(rec):
    """Converts a TrafficRecord model → the frontend's TrafficRecord interface shape."""
    t = rec.timestamp_end or rec.timestamp_start or datetime.now(timezone.utc)
    t_str = t.isoformat()
    if not t.tzinfo and not t_str.endswith('Z'):
        t_str += 'Z'
        
    return {
        "id": rec.id,
        "timestamp": t_str,
        "sourceIp": rec.src_ip or "",
        "sourceDevice": rec.src_ip or "",
        "destIp": rec.dest_ip or "",
        "destDomain": rec.domain or "",
        "destCountry": rec.dest_country or "",
        "protocol": rec.protocol or "Unknown",
        "bytes": rec.bytes or 0,
        "packets": rec.packets or 0,
        "port": rec.dest_port or 0,
        "isSuspicious": bool(rec.is_suspicious),
        "riskReason": rec.risk_reason,
    }


def _serialize_alert(alert, db=None):
    """Converts an Alert model → the frontend's Alert interface shape."""
    source_ip = ""
    source_device = ""
    if alert.device_mac and db:
        dev = db.query(models.Device).filter(models.Device.mac == alert.device_mac).first()
        if dev:
            source_ip = dev.ip or ""
            source_device = dev.hostname or dev.ip or alert.device_mac
    return {
        "id": alert.id,
        "timestamp": alert.timestamp.isoformat() if alert.timestamp else None,
        "severity": alert.severity or "info",
        "type": alert.type or "anomaly",
        "title": alert.title or "",
        "description": alert.description or "",
        "sourceIp": source_ip,
        "sourceDevice": source_device,
        "destIp": alert.dest_ip or "",
        "destDomain": alert.dest_domain or "",
        "resolved": bool(alert.resolved),
        "actionTaken": alert.action_taken,
    }


def _serialize_anomaly(anom):
    """Converts an Anomaly model → the frontend's AnomalyEvent interface shape."""
    return {
        "id": anom.id,
        "timestamp": anom.timestamp.isoformat() if anom.timestamp else None,
        "type": anom.type or "pattern_change",
        "severity": anom.severity or "low",
        "confidence": anom.confidence or 0,
        "description": anom.description or "",
        "affectedDevice": anom.device_mac or "",
        "details": anom.details or {},
        "recommendation": anom.recommendation or "",
    }


# ────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────

@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Dashboard stats — scoped to current session window only."""
    cuts = _get_cutoffs()
    session = cuts["session"]
    online_cutoff = cuts["device_online"]

    # Devices: total = seen in session, online = seen recently
    total_devices = db.query(models.Device).filter(
        models.Device.last_seen >= session
    ).count()
    online_devices = db.query(models.Device).filter(
        models.Device.last_seen >= online_cutoff
    ).count()

    # Traffic: only current session
    total_bytes = db.query(func.sum(models.TrafficRecord.bytes)).filter(
        models.TrafficRecord.timestamp_end >= session
    ).scalar() or 0

    total_packets = db.query(func.sum(models.TrafficRecord.packets)).filter(
        models.TrafficRecord.timestamp_end >= session
    ).scalar() or 0

    # DNS: only current session
    dns_count = db.query(models.TrafficRecord).filter(
        models.TrafficRecord.timestamp_end >= session,
        (models.TrafficRecord.dest_port == 53) | (models.TrafficRecord.domain.isnot(None))
    ).count()

    # Alerts: always show all (user requested historical)
    unresolved_alerts = db.query(models.Alert).filter(models.Alert.resolved == False).count()
    total_alerts = db.query(models.Alert).count()

    suspicious_domains = db.query(models.TrafficRecord).filter(
        models.TrafficRecord.is_suspicious == True,
        models.TrafficRecord.timestamp_end >= session,
    ).count()

    anomalies_count = db.query(models.Anomaly).count()

    return {
        "totalDevices": total_devices,
        "onlineDevices": online_devices,
        "totalPackets": total_packets,
        "totalBytes": total_bytes,
        "alertsToday": total_alerts,
        "unresolvedAlerts": unresolved_alerts,
        "dnsQueries": dns_count,
        "suspiciousDomains": suspicious_domains,
        "anomaliesDetected": anomalies_count,
        "captureStatus": "active" if online_devices > 0 else "inactive",
        "uptime": "online",
        "avgLatency": 10
    }

@router.get("/analytics/timeseries")
def get_timeseries(db: Session = Depends(get_db)):
    """
    Return traffic volume aggregated into 15-minute bins over the last 24 hours.
    Uses SQL-level aggregation to avoid loading millions of rows into Python.
    Returns { time: ISO string, bytes: int, mb: float } for each bin.
    """
    cuts = _get_cutoffs()
    now = cuts["now"]
    twenty_four_hours_ago = cuts["session"]
    
    # Determine DB dialect for time-bucketing syntax
    db_url = str(db.bind.url) if db.bind else ""
    is_sqlite = "sqlite" in db_url
    
    if is_sqlite:
        # SQLite: use strftime to truncate to 15-min buckets
        # strftime('%Y-%m-%dT%H:', timestamp) || (cast(strftime('%M', timestamp) as int) / 15 * 15)
        from sqlalchemy import text
        rows = db.execute(text("""
            SELECT
                strftime('%Y-%m-%dT', timestamp_end) ||
                printf('%02d:', cast(strftime('%H', timestamp_end) as integer)) ||
                printf('%02d:00Z', (cast(strftime('%M', timestamp_end) as integer) / 15) * 15)
                AS bucket,
                SUM(bytes) as total_bytes,
                SUM(packets) as total_packets
            FROM traffic_records
            WHERE timestamp_end >= :cutoff
            GROUP BY bucket
            ORDER BY bucket
        """), {"cutoff": twenty_four_hours_ago.isoformat()}).fetchall()
    else:
        # PostgreSQL: use date_trunc equivalent with interval
        from sqlalchemy import text
        rows = db.execute(text("""
            SELECT
                to_char(
                    date_trunc('hour', timestamp_end) +
                    (floor(extract(minute from timestamp_end) / 15) * interval '15 minutes'),
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"'
                ) AS bucket,
                SUM(bytes) as total_bytes,
                SUM(packets) as total_packets
            FROM traffic_records
            WHERE timestamp_end >= :cutoff
            GROUP BY bucket
            ORDER BY bucket
        """), {"cutoff": twenty_four_hours_ago}).fetchall()

    # Build a lookup of the SQL results
    sql_data = {}
    for row in rows:
        bucket_key = row[0]
        sql_data[bucket_key] = {"bytes": int(row[1] or 0), "packets": int(row[2] or 0)}
    
    # Generate all 15-minute bins for the last 24 hours and zero-fill gaps
    result = []
    for i in range(96):  # 24 hours * 4 bins/hour = 96 bins
        t = twenty_four_hours_ago + timedelta(minutes=15 * i)
        # Snap to the 15-minute boundary
        t = t.replace(minute=(t.minute // 15) * 15, second=0, microsecond=0)
        t_str = t.strftime('%Y-%m-%dT%H:%M:00Z')
        
        data = sql_data.get(t_str, {"bytes": 0, "packets": 0})
        result.append({
            "time": t_str,
            "bytes": data["bytes"],
            "packets": data["packets"],
            "mb": round(data["bytes"] / (1024 * 1024), 2),
        })
    
    return result

@router.get("/analytics/protocols")
def get_protocols(db: Session = Depends(get_db)):
    """Protocol distribution — session-scoped."""
    cuts = _get_cutoffs()
    session_cutoff = cuts["session"]
    results = db.query(
        models.TrafficRecord.protocol,
        func.sum(models.TrafficRecord.packets)
    ).filter(
        models.TrafficRecord.timestamp_end >= session_cutoff
    ).group_by(models.TrafficRecord.protocol).all()

    total_packets = sum(r[1] for r in results) or 1
    return [{"protocol": r[0] or "Unknown", "packets": r[1], "percentage": round((r[1]/total_packets)*100, 1)} for r in results]

@router.get("/analytics/destinations")
def get_top_destinations(db: Session = Depends(get_db)):
    """Top external connections — session-scoped."""
    cuts = _get_cutoffs()
    session_cutoff = cuts["session"]
    results = db.query(
        models.TrafficRecord.domain,
        models.TrafficRecord.dest_ip,
        models.TrafficRecord.dest_country,
        models.TrafficRecord.is_suspicious,
        func.count(models.TrafficRecord.id).label("reqs")
    ).filter(
        models.TrafficRecord.timestamp_end >= session_cutoff
    ).group_by(
        models.TrafficRecord.domain,
        models.TrafficRecord.dest_ip,
        models.TrafficRecord.dest_country,
        models.TrafficRecord.is_suspicious
    ).order_by(desc("reqs")).limit(10).all()
    
    return [
        {
            "domain": r[0] or "Unknown",
            "ip": r[1],
            "country": r[2] or "??",
            "category": "malicious" if r[3] else "safe",
            "requests": r[4]
        }
        for r in results
    ]

@router.get("/packets")
def get_recent_packets(db: Session = Depends(get_db)):
    """Return only packets from the last 2 minutes for the real-time view."""
    two_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=2)
    records = db.query(models.TrafficRecord).filter(
        models.TrafficRecord.timestamp_end >= two_mins_ago
    ).order_by(desc(models.TrafficRecord.timestamp_end)).limit(100).all()
    return {"packets": [_serialize_traffic(r) for r in records]}

@router.get("/devices")
def list_devices(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """List devices seen in the current session only."""
    cuts = _get_cutoffs()
    session_cutoff = cuts["session"]
    # Only show devices that have been seen in the session window
    devices = db.query(models.Device).filter(
        models.Device.last_seen >= session_cutoff
    ).order_by(desc(models.Device.last_seen)).offset(skip).limit(limit).all()
    return [_serialize_device(d, db, session_cutoff) for d in devices]

@router.get("/traffic")
def list_traffic(
    skip: int = Query(0, ge=0),
    limit: int = Query(150, le=500),
    db: Session = Depends(get_db)
):
    """List traffic records — session-scoped."""
    cuts = _get_cutoffs()
    session_cutoff = cuts["session"]
    records = db.query(models.TrafficRecord).filter(
        models.TrafficRecord.timestamp_end >= session_cutoff
    ).order_by(desc(models.TrafficRecord.timestamp_end)).offset(skip).limit(limit).all()
    return [_serialize_traffic(r) for r in records]

@router.get("/anomalies")
def list_anomalies(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """List anomalies in camelCase for the frontend."""
    anomalies = db.query(models.Anomaly).order_by(desc(models.Anomaly.timestamp)).offset(skip).limit(limit).all()
    return [_serialize_anomaly(a) for a in anomalies]

@router.get("/alerts")
def list_alerts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """List alerts in camelCase for the frontend."""
    alerts = db.query(models.Alert).order_by(desc(models.Alert.timestamp)).offset(skip).limit(limit).all()
    return {"skip": skip, "limit": limit, "data": [_serialize_alert(a, db) for a in alerts]}

@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, db: Session = Depends(get_db)):
    """Acknowledge/Resolve an alert."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.resolved = True
    db.commit()
    return {"status": "resolved", "id": alert_id}

@router.delete("/alerts/clear")
def clear_resolved_alerts(db: Session = Depends(get_db)):
    """Delete all resolved alerts to clean up the dashboard."""
    count = db.query(models.Alert).filter(models.Alert.resolved == True).delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}

@router.delete("/alerts/clear-all")
def clear_all_alerts(db: Session = Depends(get_db)):
    """Delete all alerts (resolved and unresolved)."""
    count = db.query(models.Alert).delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}

@router.delete("/anomalies/clear-all")
def clear_all_anomalies(db: Session = Depends(get_db)):
    """Delete all anomaly records."""
    count = db.query(models.Anomaly).delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}

@router.delete("/flush-all")
def flush_all_data(include_devices: bool = Query(False), db: Session = Depends(get_db)):
    """
    Nuclear option: wipe ALL stored data and reset caches.
    
    Deletes: traffic_records, alerts, anomalies, device_baselines, processed_messages.
    Devices are kept by default. Pass ?include_devices=true to also delete devices.
    """
    import rules_engine
    
    deleted = {}
    deleted["anomalies"] = db.query(models.Anomaly).delete(synchronize_session=False)
    deleted["alerts"] = db.query(models.Alert).delete(synchronize_session=False)
    
    # Baselines must go before devices (FK constraint)
    deleted["baselines"] = db.query(models.DeviceBaseline).delete(synchronize_session=False)
    deleted["processed_messages"] = db.query(models.ProcessedMessage).delete(synchronize_session=False)
    
    # Traffic records reference devices via FK, delete traffic first
    deleted["traffic_records"] = db.query(models.TrafficRecord).delete(synchronize_session=False)
    
    if include_devices:
        deleted["devices"] = db.query(models.Device).delete(synchronize_session=False)
    
    db.commit()
    
    # Reset in-memory caches so new data is evaluated fresh
    rules_engine._domains_initialized = False
    rules_engine._known_domains.clear()
    
    return {"status": "flushed", "deleted": deleted}

@router.post("/debug/trigger-rules")
def trigger_rules_engine(db: Session = Depends(get_db)):
    """Manually run the rules engine on the last 50 traffic records. For debugging."""
    from rules_engine import evaluate_traffic_batch, _known_domains
    import rules_engine
    
    # Reset the known domains cache so injected test domains are detected as "unknown"
    rules_engine._domains_initialized = False
    rules_engine._known_domains.clear()
    
    records = db.query(models.TrafficRecord).order_by(
        desc(models.TrafficRecord.timestamp_end)
    ).limit(50).all()
    
    traffic_dicts = []
    for r in records:
        t_dict = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        traffic_dicts.append(t_dict)
    
    devices = db.query(models.Device).all()
    devices_dicts = [{"mac": d.mac, "hostname": d.hostname, "type": d.type, "ip": d.ip} for d in devices]
    
    generated = evaluate_traffic_batch(traffic_dicts, devices_dicts, db)
    
    return {
        "records_evaluated": len(traffic_dicts),
        "alerts_generated": len(generated),
        "alerts": [{"severity": a.severity, "title": a.title, "description": a.description} for a in generated]
    }

@router.get("/dns")
def list_dns_queries(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db)
):
    """Synthesize DNS query data from traffic records — session-scoped."""
    import hashlib
    
    cuts = _get_cutoffs()
    session_cutoff = cuts["session"]
    # Get traffic records that are DNS-related (port 53 or have resolved domains)
    dns_records = db.query(models.TrafficRecord).filter(
        models.TrafficRecord.timestamp_end >= session_cutoff,
        (models.TrafficRecord.dest_port == 53) | 
        (models.TrafficRecord.domain.isnot(None))
    ).order_by(desc(models.TrafficRecord.timestamp_end)).offset(skip).limit(limit).all()
    
    # Known tracking/advertising domain patterns
    tracking_patterns = ['doubleclick', 'analytics', 'tracking', 'adservice', 'facebook.com/tr',
                         'google-analytics', 'googlesyndication', 'adsense', 'criteo', 'hotjar']
    ad_patterns = ['ads.', 'ad.', 'adserver', 'banner', 'pagead', 'adsystem']
    suspicious_patterns = ['malware', 'phishing', 'botnet', 'exploit']
    
    def classify_domain(domain):
        if not domain:
            return "unknown", 0
        d = domain.lower()
        for p in suspicious_patterns:
            if p in d:
                return "malicious", 85
        for p in tracking_patterns:
            if p in d:
                return "tracking", 45
        for p in ad_patterns:
            if p in d:
                return "advertising", 30
        # Common safe domains
        safe = ['google.com', 'microsoft.com', 'apple.com', 'cloudflare', 'amazonaws',
                'github.com', 'stackoverflow', 'mozilla', '.gov', 'wikipedia']
        for s in safe:
            if s in d:
                return "safe", 5
        return "unknown", 15
    
    result = []
    for rec in dns_records:
        domain = rec.domain or rec.dest_ip or "unknown"
        category, threat_score = classify_domain(domain)
        
        # Determine query type from port/protocol
        query_type = "A"
        if rec.protocol == "UDP" and rec.dest_port == 53:
            query_type = "A"
        elif rec.protocol == "TCP" and rec.dest_port == 443:
            query_type = "AAAA"
        
        # Look up source device name
        source_device = rec.src_ip or ""
        if rec.device_mac:
            dev = db.query(models.Device).filter(models.Device.mac == rec.device_mac).first()
            if dev:
                source_device = dev.hostname or dev.ip or rec.device_mac
        
        result.append({
            "id": rec.id,
            "timestamp": (rec.timestamp_end or rec.timestamp_start or datetime.now(timezone.utc)).isoformat() if (rec.timestamp_end or rec.timestamp_start) else None,
            "sourceIp": rec.src_ip or "",
            "sourceDevice": source_device,
            "domain": domain,
            "queryType": query_type,
            "responseIp": rec.dest_ip or "",
            "isTracking": category == "tracking",
            "isBlocked": False,
            "category": category,
            "threatScore": threat_score,
        })
    
    return result

@router.delete("/admin/purge-test-data")
def purge_test_data(db: Session = Depends(get_db)):
    """Remove test/stale devices, merge case-duplicate MACs, and clean orphaned records."""
    
    # 1. Delete test devices (MACs from debugging sessions)
    test_macs = []
    all_devices = db.query(models.Device).all()
    for d in all_devices:
        mac = d.mac or ""
        if mac.startswith("ff:ee:dd") or mac.startswith("aa:bb:cc") or mac.startswith("FF:EE") or mac.startswith("AA:BB"):
            test_macs.append(mac)
    
    deleted_devices = 0
    deleted_traffic = 0
    for mac in test_macs:
        # Delete related child records first due to ForeignKey constraints
        db.query(models.Alert).filter(models.Alert.device_mac == mac).delete()
        db.query(models.Anomaly).filter(models.Anomaly.device_mac == mac).delete()
        db.query(models.DeviceBaseline).filter(models.DeviceBaseline.device_mac == mac).delete()
        deleted_traffic += db.query(models.TrafficRecord).filter(models.TrafficRecord.device_mac == mac).delete()
        deleted_devices += db.query(models.Device).filter(models.Device.mac == mac).delete()
    
    # 2. Merge case-duplicate MACs (keep lowercase, delete uppercase duplicates)
    merged_count = 0
    all_devices = db.query(models.Device).all()
    
    # Pre-build a map of existing lowercase devices
    lowercase_devices = {d.mac: d for d in all_devices if d.mac and d.mac == d.mac.lower()}
    
    for d in all_devices:
        if not d.mac: continue
        lower_mac = d.mac.lower()
        if d.mac != lower_mac:
            # Reassign all child records to the lowercase MAC
            for model in [models.TrafficRecord, models.Alert, models.Anomaly, models.DeviceBaseline]:
                db.query(model).filter(
                    model.device_mac == d.mac
                ).update({"device_mac": lower_mac}, synchronize_session="fetch")
            
            if lower_mac in lowercase_devices:
                # Lowercase version already exists, just delete the uppercase one
                db.delete(d)
            else:
                # Lowercase doesn't exist, convert this one
                new_dev_dict = {c.name: getattr(d, c.name) for c.name in d.__table__.columns.keys()}
                new_dev_dict["mac"] = lower_mac
                db.delete(d)
                db.flush()
                new_dev = models.Device(**new_dev_dict)
                db.add(new_dev)
                lowercase_devices[lower_mac] = new_dev
            merged_count += 1
    
    # 3. Clean up orphaned traffic records
    orphan_count = db.query(models.TrafficRecord).filter(
        models.TrafficRecord.src_ip.is_(None),
        models.TrafficRecord.device_mac.is_(None)
    ).delete()
    
    db.commit()
    return {
        "purged_devices": deleted_devices,
        "merged_duplicates": merged_count,
        "purged_traffic": deleted_traffic,
        "purged_orphans": orphan_count,
        "remaining_devices": db.query(models.Device).count()
    }

