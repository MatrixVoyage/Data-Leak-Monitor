"""
Rules Engine & Alert Generator
================================
Processes enriched traffic flow records through a statistical and behavioral scoring system.
Implements Deduplication via Alert Keys and Feedback Loops.

Scoring:
  +3: Unknown/New External Connection
  +2: Geo Anomaly (unexpected country for device type, skipping CDNs)
  +2: Traffic Spike (bytes > baseline average)
  +1: Tracker / Telemetry activity

Alert Thresholds:
  Score >= 5 → HIGH severity + Anomaly Generation
  Score >= 3 → MEDIUM severity
"""

import uuid
import hashlib
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func

import models
from enrichment import resolve_geo, resolve_domain, get_device_profile
from tracker_list import is_tracker, get_tracker_category
from logger import logger

# --- Caches (In-Memory per process to reduce DB load) ---
_known_domains: Dict[str, set] = {} # { device_mac: set(domains) }
_domains_initialized = False

def _initialize_known_domains(db: Session):
    global _domains_initialized
    if _domains_initialized: return
    
    rows = db.query(models.TrafficRecord.device_mac, models.TrafficRecord.domain).filter(
        models.TrafficRecord.domain.isnot(None),
        models.TrafficRecord.domain != "",
        models.TrafficRecord.domain != "unknown"
    ).distinct().all()
    
    for mac, domain in rows:
        if mac not in _known_domains: _known_domains[mac] = set()
        _known_domains[mac].add(domain.lower())
    
    _domains_initialized = True
    logger.info(f"Initialized known domains for {len(_known_domains)} devices from DB.")

# --- Helpers ---
def _get_time_window(dt: datetime) -> str:
    if not dt: dt = datetime.now(timezone.utc)
    if dt.weekday() >= 5: return "weekend"
    if 1 <= dt.hour <= 5: return "weekday_night"
    return "weekday_active"

def _update_baseline(db: Session, mac: str, window: str, bytes_added: int) -> models.DeviceBaseline:
    if not mac: return None
    baseline = db.query(models.DeviceBaseline).filter_by(device_mac=mac, time_window=window).first()
    if not baseline:
        baseline = models.DeviceBaseline(
            id=str(uuid.uuid4()), device_mac=mac, time_window=window, avg_bytes_per_hour=bytes_added
        )
        db.add(baseline)
    else:
        # Exponential moving average (EWMA) to smooth spikes
        baseline.avg_bytes_per_hour = int((baseline.avg_bytes_per_hour * 0.9) + (bytes_added * 0.1))
    return baseline

def _is_cdn(domain: str) -> bool:
    if not domain: return False
    cdns = ["google", "aws", "amazon", "cloudflare", "akamai", "fastly", "edgecast"]
    d_lower = domain.lower()
    return any(c in d_lower for c in cdns)

# --- Rules ---
def _rule_tracker_detection(domain: str) -> Tuple[int, Optional[str]]:
    if is_tracker(domain):
        return 2, f"Tracking Activity: {get_tracker_category(domain)} ({domain})"
    return 0, None

def _rule_unknown_domain(device_mac: str, domain: str) -> Tuple[int, Optional[str]]:
    if not domain or domain == "unknown" or domain == "": return 0, None
    if not device_mac: return 0, None
    domain_lower = domain.lower()
    if device_mac not in _known_domains: _known_domains[device_mac] = set()
    
    if domain_lower not in _known_domains[device_mac]:
        _known_domains[device_mac].add(domain_lower)
        return 3, f"Unknown External Connection: {domain} (First contact from this device)"
    return 0, None

def _rule_geo_anomaly(dest_ip: str, device_type: str, domain: str) -> Tuple[int, Optional[str]]:
    if _is_cdn(domain): return 0, None # Skip Geo alerting for CDNs
    
    profile = get_device_profile(device_type)
    if not profile: return 0, None
    
    geo = resolve_geo(dest_ip)
    cc = geo.get("country_code", "??")
    if cc in ["??", "LOCAL"]: return 0, None
    
    if cc not in profile["expected_countries"]:
        return 2, f"Unusual Geo Destination: {device_type} connected to {geo.get('country', 'Unknown')} ({cc})"
    return 0, None

def _rule_traffic_spike(baseline: models.DeviceBaseline, bytes_len: int) -> Tuple[int, Optional[str]]:
    if not baseline or baseline.avg_bytes_per_hour == 0: return 0, None
    avg = baseline.avg_bytes_per_hour
    if bytes_len > avg * 2 and bytes_len > 100_000: # 2x normal AND > 100KB
        mb = bytes_len / 1_048_576
        avg_mb = avg / 1_048_576
        return 2, f"Traffic Spike: {mb:.1f}MB transferred (Baseline average: {avg_mb:.1f}MB)"
    return 0, None

class RuleResult:
    def __init__(self):
        self.score = 0
        self.reasons = []
    def add(self, score: int, reason: Optional[str]):
        if score > 0 and reason:
            self.score += score
            self.reasons.append(reason)

# --- Core Pipeline ---
def evaluate_traffic_batch(
    traffic_records: List[dict],
    devices: List[dict],
    db: Session
) -> List[models.Alert]:
    _initialize_known_domains(db)
    
    # Mappings
    device_map = {d.get("mac", ""): d for d in devices if d.get("mac")}
    
    generated_alerts = []
    
    for rec in traffic_records:
        mac = rec.get("device_mac", "")
        dest_ip = rec.get("dest_ip", "")
        domain = rec.get("domain", "")
        rec_bytes = rec.get("bytes", 0)
        
        dev_info = device_map.get(mac, {})
        dev_type = dev_info.get("type", "unknown")
        
        # Determine Baseline
        window = _get_time_window(rec.get("timestamp_start"))
        baseline = _update_baseline(db, mac, window, rec_bytes)
        
        result = RuleResult()
        result.add(*_rule_tracker_detection(domain))
        result.add(*_rule_unknown_domain(mac, domain))
        result.add(*_rule_geo_anomaly(dest_ip, dev_type, domain))
        result.add(*_rule_traffic_spike(baseline, rec_bytes))
        
        if result.score >= 3:
            severity = "high" if result.score >= 5 else "warning"
            alert_type = "anomaly"
            if any("Spike" in r for r in result.reasons): alert_type = "traffic_spike"
            if any("Unknown" in r for r in result.reasons): alert_type = "unusual_destination"
            if any("Tracking" in r for r in result.reasons): alert_type = "tracking"
            
            # --- Suppression / Deduplication Logic ---
            # Key format: mac + alert_type + hour + dest_ip
            hour = datetime.now(timezone.utc).hour
            target = domain if domain else dest_ip
            raw_key = f"{mac}_{alert_type}_{hour}_{target}"
            alert_key = hashlib.md5(raw_key.encode()).hexdigest()
            
            existing_alert = db.query(models.Alert).filter(models.Alert.alert_key == alert_key).first()
            
            if existing_alert:
                if existing_alert.status == "false_positive" or existing_alert.status == "expected":
                    continue # Respect feedback loop!
                
                # UPSERT
                existing_alert.occurrence_count += 1
                existing_alert.timestamp = datetime.now(timezone.utc)
                if result.score > 5: existing_alert.severity = "high"
                continue
            
            title = f"{alert_type.replace('_', ' ').title()} on {dev_info.get('hostname', 'Device')}"
            desc = f"Triggered {len(result.reasons)} rules (Score {result.score}): " + "; ".join(result.reasons)
            
            alert = models.Alert(
                id=str(uuid.uuid4()),
                alert_key=alert_key,
                severity=severity,
                type=alert_type,
                title=title,
                description=desc,
                device_mac=mac,
                dest_ip=dest_ip,
                dest_domain=domain,
            )
            db.add(alert)
            generated_alerts.append(alert)
            
            # --- Statistical Anomaly Generator ---
            # Generate anomaly records for all significant alerts
            anom_severity = "high" if result.score >= 5 else "medium" if result.score >= 4 else "low"
            anom = models.Anomaly(
                id=str(uuid.uuid4()),
                type=alert_type,
                severity=anom_severity,
                confidence=min(99, 40 + (result.score * 8)),
                description=desc,
                device_mac=mac,
                details={"score": result.score, "reasons": result.reasons, "target": target},
                recommendation="Review the device's baseline behavior. Block IP if unrecognized."
            )
            db.add(anom)
    
    # Must commit here to save baseline EWMA updates and upserts
    db.commit()
    return generated_alerts
