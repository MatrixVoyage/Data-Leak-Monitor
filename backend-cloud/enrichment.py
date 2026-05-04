"""
Enrichment Layer
=================
Resolves raw IP addresses into actionable context:
  - Geo-IP: Country/City via offline MaxMind GeoLite2 (.mmdb) + API fallback.
  - Domain: Reverse DNS with in-memory TTL cache.
  - Tracker: Matches against the curated tracker domain list.

Setup:
  1. Download GeoLite2-City.mmdb from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
  2. Place it in backend-cloud/data/GeoLite2-City.mmdb
  3. If the file is missing, the system falls back to ip-api.com (rate-limited).
"""

import socket
import time
import os
import requests
from typing import Optional, Dict, Tuple
from logger import logger

# --- Geo-IP ---

_geoip_reader = None
_geoip_available = False

try:
    import geoip2.database
    MMDB_PATH = os.path.join(os.path.dirname(__file__), "data", "GeoLite2-City.mmdb")
    if os.path.exists(MMDB_PATH):
        _geoip_reader = geoip2.database.Reader(MMDB_PATH)
        _geoip_available = True
        logger.info(f"GeoIP loaded from {MMDB_PATH}")
    else:
        logger.warning(f"MaxMind DB not found at {MMDB_PATH}. Falling back to API.")
except ImportError:
    logger.warning("geoip2 not installed. Falling back to ip-api.com for Geo-IP.")

# In-memory cache for Geo-IP: { ip: (country_code, country_name, city, timestamp) }
_geo_cache: Dict[str, Tuple[str, str, str, float]] = {}
GEO_CACHE_TTL = 3600  # 1 hour

# Rate-limit tracking for the free API fallback
_api_last_call = 0.0
API_RATE_LIMIT_MS = 700  # ip-api.com allows ~45/min on free tier


from functools import lru_cache

@lru_cache(maxsize=50000)
def resolve_geo(ip: str) -> Dict[str, str]:
    """
    Resolve an IP to geographic information.
    Returns: { "country_code": "US", "country": "United States", "city": "Mountain View" }
    """
    global _api_last_call

    if not ip or _is_private_ip(ip):
        return {"country_code": "LOCAL", "country": "Local Network", "city": ""}

    # Check cache
    if ip in _geo_cache:
        code, country, city, ts = _geo_cache[ip]
        if time.time() - ts < GEO_CACHE_TTL:
            return {"country_code": code, "country": country, "city": city}

    # Strategy 1: Offline MaxMind
    if _geoip_available:
        try:
            resp = _geoip_reader.city(ip)
            result = {
                "country_code": resp.country.iso_code or "??",
                "country": resp.country.name or "Unknown",
                "city": resp.city.name or "",
            }
            _geo_cache[ip] = (result["country_code"], result["country"], result["city"], time.time())
            return result
        except Exception:
            pass  # Fall through to API

    # Strategy 2: Free API fallback (ip-api.com)
    now = time.time()
    if now - _api_last_call < API_RATE_LIMIT_MS / 1000:
        return {"country_code": "??", "country": "Unknown", "city": ""}
    
    try:
        _api_last_call = time.time()
        resp = requests.get(f"http://ip-api.com/json/{ip}?fields=countryCode,country,city", timeout=2)
        if resp.status_code == 200:
            data = resp.json()
            result = {
                "country_code": data.get("countryCode", "??"),
                "country": data.get("country", "Unknown"),
                "city": data.get("city", ""),
            }
            _geo_cache[ip] = (result["country_code"], result["country"], result["city"], time.time())
            return result
    except Exception as e:
        logger.debug(f"Geo-IP API fallback failed for {ip}: {e}")

    return {"country_code": "??", "country": "Unknown", "city": ""}


from functools import lru_cache

# --- Reverse DNS / Domain Resolution ---

_dns_cache: Dict[str, Tuple[str, float]] = {}
DNS_CACHE_TTL = 3600  # 1 hour

@lru_cache(maxsize=50000)


def resolve_domain(ip: str) -> str:
    """Reverse-resolve an IP to a domain name."""
    if not ip or _is_private_ip(ip):
        return ""

    if ip in _dns_cache:
        domain, ts = _dns_cache[ip]
        if time.time() - ts < DNS_CACHE_TTL:
            return domain

    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        _dns_cache[ip] = (hostname, time.time())
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        _dns_cache[ip] = ("", time.time())
        return ""


# --- IoT Device Profile Mapping ---

# Maps device type to expected behavior patterns
IOT_PROFILES = {
    "laptop": {
        "expected_countries": ["US", "IN", "GB", "DE", "JP", "CA", "AU", "FR", "NL", "IE", "SG", "LOCAL"],
        "max_upload_bytes_per_window": 500 * 1024 * 1024,
        "expected_ports": [80, 443, 22, 53, 8080],
    },
    "desktop": {
        "expected_countries": ["US", "IN", "GB", "DE", "JP", "CA", "AU", "FR", "NL", "IE", "SG", "LOCAL"],
        "max_upload_bytes_per_window": 500 * 1024 * 1024,
        "expected_ports": [80, 443, 22, 53, 8080],
    },
    "mobile": {
        "expected_countries": ["US", "IN", "GB", "DE", "JP", "CA", "AU", "FR", "NL", "IE", "SG", "LOCAL"],
        "max_upload_bytes_per_window": 200 * 1024 * 1024,
        "expected_ports": [80, 443, 53],
    },
    "unknown": {
        "expected_countries": ["US", "IN", "GB", "DE", "JP", "CA", "AU", "FR", "NL", "IE", "SG", "LOCAL"],
        "max_upload_bytes_per_window": 200 * 1024 * 1024,
        "expected_ports": [80, 443, 53],
    },
    "smart-tv": {
        "expected_countries": ["US", "IN", "GB", "DE", "JP", "KR", "LOCAL"],
        "max_upload_bytes_per_window": 5 * 1024 * 1024,
        "expected_ports": [80, 443, 8080, 1935, 554],
    },
    "camera": {
        "expected_countries": ["US", "IN", "CN", "LOCAL"],
        "max_upload_bytes_per_window": 10 * 1024 * 1024,
        "expected_ports": [80, 443, 554, 8554],
    },
    "speaker": {
        "expected_countries": ["US", "IN", "IE", "LOCAL"],
        "max_upload_bytes_per_window": 1 * 1024 * 1024,
        "expected_ports": [80, 443, 8443],
    },
    "thermostat": {
        "expected_countries": ["US", "IN", "LOCAL"],
        "max_upload_bytes_per_window": 512 * 1024,
        "expected_ports": [80, 443],
    },
    "printer": {
        "expected_countries": ["US", "IN", "JP", "LOCAL"],
        "max_upload_bytes_per_window": 2 * 1024 * 1024,
        "expected_ports": [80, 443, 631, 9100],
    },
}


def get_device_profile(device_type: str) -> Optional[dict]:
    """Return the expected behavior profile for a device type."""
    return IOT_PROFILES.get(device_type.lower() if device_type else "")


# --- Helpers ---

def _is_private_ip(ip: str) -> bool:
    """Check if an IP is in a private/reserved range."""
    return (
        ip.startswith("192.168.") or
        ip.startswith("10.") or
        ip.startswith("172.16.") or ip.startswith("172.17.") or
        ip.startswith("172.18.") or ip.startswith("172.19.") or
        ip.startswith("172.20.") or ip.startswith("172.21.") or
        ip.startswith("172.22.") or ip.startswith("172.23.") or
        ip.startswith("172.24.") or ip.startswith("172.25.") or
        ip.startswith("172.26.") or ip.startswith("172.27.") or
        ip.startswith("172.28.") or ip.startswith("172.29.") or
        ip.startswith("172.30.") or ip.startswith("172.31.") or
        ip.startswith("127.") or
        ip.startswith("169.254.") or
        ip == "0.0.0.0" or
        ip == "255.255.255.255"
    )
