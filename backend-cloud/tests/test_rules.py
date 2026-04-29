import pytest
from datetime import datetime, timezone
import sys
import os

# Add parent directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rules_engine import evaluate_traffic_batch

def test_evaluate_traffic_batch_high_upload():
    # Mock database is just used to query devices in rules engine, we can mock the session
    class MockQuery:
        def filter(self, *args, **kwargs):
            return self
        def all(self):
            return []
            
    class MockDB:
        def query(self, *args, **kwargs):
            return MockQuery()

    traffic_batch = [
        {
            "id": 1,
            "source_ip": "192.168.1.100",
            "source_device": "Unknown Camera",
            "dest_ip": "8.8.8.8",
            "dest_port": 443,
            "protocol": "TCP",
            "bytes": 50 * 1024 * 1024, # 50 MB (exceeds camera limits)
            "packets": 5000,
            "dest_country": "US",
            "domain": "video-upload.example.com",
            "domain_source": "sni",
            "timestamp_start": datetime.now(timezone.utc),
            "timestamp_end": datetime.now(timezone.utc),
            "is_suspicious": False,
            "risk_reason": ""
        }
    ]
    
    devices = [
        {
            "mac": "aa:bb:cc:dd:ee:ff",
            "ip": "192.168.1.100",
            "type": "camera"
        }
    ]
    
    alerts = evaluate_traffic_batch(traffic_batch, devices, MockDB())
    
    # We expect a high-volume upload alert
    assert len(alerts) > 0
    assert any(a.title == "Anomalous High-Volume Upload" for a in alerts)
