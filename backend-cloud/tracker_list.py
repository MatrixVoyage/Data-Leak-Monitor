"""
Known Tracker / Advertising / Telemetry Domain List
====================================================
This is the core intelligence for detecting tracking activity.
Domains are categorized for richer alerting.

Sources: EasyPrivacy, EasyList, community-curated lists.
"""

# Tracking & Analytics
TRACKERS = {
    # Google
    "google-analytics.com",
    "googleadservices.com",
    "googlesyndication.com",
    "googletagmanager.com",
    "googletagservices.com",
    "google-analytics.l.google.com",
    "analytics.google.com",
    "doubleclick.net",
    "ad.doubleclick.net",
    "pagead2.googlesyndication.com",
    "adservice.google.com",
    "crashlytics.com",
    "firebaselogging.googleapis.com",
    
    # Meta / Facebook
    "facebook.com",
    "connect.facebook.net",
    "pixel.facebook.com",
    "graph.facebook.com",
    "an.facebook.com",
    "ads.facebook.com",
    "www.facebook.com",
    
    # Microsoft
    "telemetry.microsoft.com",
    "vortex.data.microsoft.com",
    "settings-win.data.microsoft.com",
    "watson.telemetry.microsoft.com",
    "watson.microsoft.com",
    
    # Amazon
    "ad.amazon.com",
    "aax.amazon.com",
    "fls-na.amazon.com",
    "device-metrics-us.amazon.com",
    "unagi.amazon.com",
    
    # Apple
    "metrics.icloud.com",
    "xp.apple.com",
    "securemetrics.apple.com",
    
    # Twitter/X
    "ads-api.twitter.com",
    "analytics.twitter.com",
    "t.co",
    
    # TikTok
    "analytics.tiktok.com",
    "log.tiktokv.com",
    "mon.tiktokv.com",
    
    # Advertising Networks
    "adnxs.com",
    "adsrvr.org",
    "rubiconproject.com",
    "criteo.com",
    "criteo.net",
    "pubmatic.com",
    "openx.net",
    "taboola.com",
    "outbrain.com",
    "scorecardresearch.com",
    "quantserve.com",
    "moatads.com",
    "hotjar.com",
    "mixpanel.com",
    "segment.com",
    "segment.io",
    "amplitude.com",
    "appsflyer.com",
    "adjust.com",
    "branch.io",
    "clevertap.com",
    "onesignal.com",
    
    # IoT Telemetry (Smart TV, Cameras, etc.)
    "samsungacr.com",
    "infolink.pavv.co.kr",
    "samsungads.com",
    "lgtvsdp.com",
    "lgsmartplatform.com",
    "us.lgtvcommon.com",
    "ngfts.lge.com",
    "smartshare.lgtvsdp.com",
    "data.mistat.xiaomi.com",
    "tracking.miui.com",
    "metrics.data.hicloud.com",
    "logservice.hicloud.com",
    "device-api.urbanairship.com",
    
    # CDN-based trackers
    "cdn.mxpnl.com",
    "cdn.segment.com",
    "js-agent.newrelic.com",
    "bam.nr-data.net",
}

# Categories for richer alert descriptions
TRACKER_CATEGORIES = {
    "google-analytics.com": "Google Analytics",
    "doubleclick.net": "Google Ads (DoubleClick)",
    "googleadservices.com": "Google Ads",
    "facebook.com": "Meta/Facebook",
    "pixel.facebook.com": "Meta Tracking Pixel",
    "connect.facebook.net": "Meta SDK",
    "telemetry.microsoft.com": "Microsoft Telemetry",
    "vortex.data.microsoft.com": "Microsoft Telemetry",
    "samsungacr.com": "Samsung Smart TV Telemetry",
    "samsungads.com": "Samsung Ads",
    "lgtvsdp.com": "LG Smart TV Telemetry",
    "data.mistat.xiaomi.com": "Xiaomi Telemetry",
    "tracking.miui.com": "Xiaomi MIUI Tracking",
    "hotjar.com": "Hotjar Analytics",
    "mixpanel.com": "Mixpanel Analytics",
    "criteo.com": "Criteo Advertising",
    "taboola.com": "Taboola Advertising",
    "scorecardresearch.com": "ComScore Tracking",
    "ad.amazon.com": "Amazon Advertising",
}

def is_tracker(domain: str) -> bool:
    """Check if a domain or any of its parent domains is a known tracker."""
    if not domain:
        return False
    domain = domain.lower().strip(".")
    # Check exact match
    if domain in TRACKERS:
        return True
    # Check parent domains (e.g., "sub.google-analytics.com" → "google-analytics.com")
    parts = domain.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[i:])
        if parent in TRACKERS:
            return True
    return False

def get_tracker_category(domain: str) -> str:
    """Get a human-readable category for a tracker domain."""
    if not domain:
        return "Unknown Tracker"
    domain = domain.lower().strip(".")
    if domain in TRACKER_CATEGORIES:
        return TRACKER_CATEGORIES[domain]
    parts = domain.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[i:])
        if parent in TRACKER_CATEGORIES:
            return TRACKER_CATEGORIES[parent]
    return "Tracking/Advertising Service"
