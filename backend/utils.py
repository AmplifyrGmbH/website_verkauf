import re
from urllib.parse import urlparse


def extract_domain(url: str) -> str | None:
    try:
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path
        domain = domain.lstrip("www.")
        return domain.lower() if domain else None
    except Exception:
        return None


def normalize_phone(phone: str) -> str:
    return re.sub(r"[\s\-\+\(\)]", "", phone)


BAUKASTEN_INDICATORS = [
    ("wix.com", "wix"),
    ("jimdo.com", "jimdo"),
    ("squarespace.com", "squarespace"),
    ("weebly.com", "weebly"),
    ("webflow.io", "webflow"),
    ("strikingly.com", "strikingly"),
    ("one.com", "one.com"),
    ("homepage-baukasten", "homepage-baukasten"),
    ("site123.com", "site123"),
    ("webnode.com", "webnode"),
]

SERVER_MODERN = ["nginx", "apache", "litespeed", "caddy", "cloudflare"]


def detect_baukasten(html: str, url: str) -> str | None:
    combined = (html + url).lower()
    for indicator, name in BAUKASTEN_INDICATORS:
        if indicator in combined:
            return name
    return None


def is_modern_server(server_header: str) -> bool:
    if not server_header:
        return False
    s = server_header.lower()
    return any(ms in s for ms in SERVER_MODERN)
