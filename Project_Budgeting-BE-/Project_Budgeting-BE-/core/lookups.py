"""
Server-side IFSC and postal-code lookups for the onboarding forms.

The browser never calls third-party services directly: the backend proxies them so
timeouts, bad payloads and rate limits are handled in one place, results are cached,
and the provider URLs are configurable through environment variables:

    IFSC_LOOKUP_URL          default https://ifsc.razorpay.com/{code}
    INDIA_POST_LOOKUP_URL    default https://api.postalpincode.in/pincode/{code}
    POSTCODES_IO_LOOKUP_URL  default https://api.postcodes.io/postcodes/{code}
    ZIPPOPOTAM_LOOKUP_URL    default https://api.zippopotam.us/{country}/{code}
    LOOKUP_TIMEOUT_SECONDS   default 6
    INDIA_POST_TIMEOUT_SECONDS default 15 (India Post is often slow; Zippopotam is the fallback)

Every lookup returns a LookupResult: `found` (bool), `data` (dict), `message` (str for the
user) and `unavailable` (True when the provider failed - the form keeps manual entry).
A failed or empty lookup never raises.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from urllib.parse import quote

import requests
from django.core.cache import cache

from .countries import IFSC_REGEX, POSTAL_LOOKUP_PROVIDERS, country_name, postal_config, resolve_country

logger = logging.getLogger("core.lookups")

TIMEOUT = float(os.environ.get("LOOKUP_TIMEOUT_SECONDS", "6"))
INDIA_POST_TIMEOUT = float(os.environ.get("INDIA_POST_TIMEOUT_SECONDS", "15"))
IFSC_URL = os.environ.get("IFSC_LOOKUP_URL", "https://ifsc.razorpay.com/{code}")
INDIA_POST_URL = os.environ.get("INDIA_POST_LOOKUP_URL", "https://api.postalpincode.in/pincode/{code}")
POSTCODES_IO_URL = os.environ.get("POSTCODES_IO_LOOKUP_URL", "https://api.postcodes.io/postcodes/{code}")
ZIPPOPOTAM_URL = os.environ.get("ZIPPOPOTAM_LOOKUP_URL", "https://api.zippopotam.us/{country}/{code}")

FOUND_TTL = 60 * 60 * 24 * 7  # bank branches and postcodes change rarely
MISS_TTL = 60 * 60            # a "not found" is cached briefly
USER_AGENT = "PBT-Onboarding/1.0"


@dataclass
class LookupResult:
    found: bool
    data: dict = field(default_factory=dict)
    message: str = ""
    unavailable: bool = False

    def as_dict(self) -> dict:
        return {"found": self.found, "data": self.data, "message": self.message, "unavailable": self.unavailable}


class _ProviderError(Exception):
    """Timeout, network failure, 5xx, 429 or an unparseable payload."""


def _cache_get(key):
    # The cache is Redis; a lookup must still work when Redis is down.
    try:
        return cache.get(key)
    except Exception:  # noqa: BLE001
        return None


def _cache_set(key, value, ttl):
    try:
        cache.set(key, value, ttl)
    except Exception:  # noqa: BLE001
        pass


def _get_json(url: str, timeout: float = TIMEOUT):
    """GET -> (status_code, json or None). Raises _ProviderError on transport/server problems."""
    try:
        resp = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    except requests.Timeout as exc:
        raise _ProviderError("timeout") from exc
    except requests.RequestException as exc:
        raise _ProviderError(exc.__class__.__name__) from exc
    if resp.status_code == 429 or resp.status_code >= 500:
        raise _ProviderError(f"HTTP {resp.status_code}")
    try:
        body = resp.json()
    except ValueError:
        body = None
    return resp.status_code, body


def _title(value: str) -> str:
    value = (value or "").strip()
    # Provider data is often ALL CAPS; keep short acronyms (e.g. "SBI") as they are.
    return value.title() if value.isupper() and len(value) > 4 else value


# --------------------------------------------------------------------------- #
# IFSC                                                                         #
# --------------------------------------------------------------------------- #

def lookup_ifsc(raw_code: str) -> LookupResult:
    code = (raw_code or "").strip().upper().replace(" ", "")
    if not re.match(IFSC_REGEX, code):
        return LookupResult(False, message="Enter a valid 11-character IFSC code (e.g. HDFC0000001).")

    key = f"lookup:ifsc:{code}"
    cached = _cache_get(key)
    if cached is not None:
        return LookupResult(**cached)

    try:
        status_code, body = _get_json(IFSC_URL.format(code=quote(code)))
    except _ProviderError as exc:
        logger.warning("IFSC lookup unavailable (%s)", exc)
        return LookupResult(False, message="Bank lookup is unavailable right now - enter the bank details manually.", unavailable=True)

    if status_code == 404 or not isinstance(body, dict) or not body.get("BANK"):
        result = LookupResult(False, message="No bank branch was found for this IFSC code. Please check the code.")
        _cache_set(key, result.__dict__, MISS_TTL)
        return result

    address_parts = [body.get("ADDRESS"), body.get("CITY"), body.get("STATE")]
    data = {
        "ifsc_code": code,
        "bank_name": (body.get("BANK") or "").strip(),
        "branch_name": _title(body.get("BRANCH") or ""),
        "bank_address": (body.get("ADDRESS") or "").strip(),
        "city": _title(body.get("CITY") or ""),
        "district": _title(body.get("DISTRICT") or ""),
        "state": _title(body.get("STATE") or ""),
        "micr": (body.get("MICR") or "") if isinstance(body.get("MICR"), str) else "",
        "swift_code": (body.get("SWIFT") or "") if isinstance(body.get("SWIFT"), str) else "",
        "full_address": ", ".join(p.strip() for p in address_parts if isinstance(p, str) and p.strip()),
        "supports": {k.lower(): bool(body.get(k)) for k in ("NEFT", "RTGS", "IMPS", "UPI")},
        "source": "Razorpay IFSC directory",
    }
    result = LookupResult(True, data=data, message=f"{data['bank_name']} - {data['branch_name']}")
    _cache_set(key, result.__dict__, FOUND_TTL)
    return result


# --------------------------------------------------------------------------- #
# Postal code                                                                  #
# --------------------------------------------------------------------------- #

def _india_post(code: str) -> LookupResult:
    status_code, body = _get_json(INDIA_POST_URL.format(code=quote(code)), timeout=INDIA_POST_TIMEOUT)
    entry = body[0] if isinstance(body, list) and body else None
    offices = (entry or {}).get("PostOffice") or []
    if not entry or entry.get("Status") != "Success" or not offices:
        return LookupResult(False, message="No location was found for this PIN code. Enter the city and state manually.")
    first = offices[0]
    localities = sorted({o.get("Name", "").strip() for o in offices if o.get("Name")})
    return LookupResult(True, data={
        "city": (first.get("District") or "").strip(),
        "district": (first.get("District") or "").strip(),
        "state": (first.get("State") or "").strip(),
        "country": "India",
        "localities": localities[:25],
        "source": "India Post",
    })


def _postcodes_io(code: str) -> LookupResult:
    status_code, body = _get_json(POSTCODES_IO_URL.format(code=quote(code.replace(" ", ""))))
    result = (body or {}).get("result") if isinstance(body, dict) else None
    if status_code == 404 or not result:
        return LookupResult(False, message="No address was found for this postcode. Enter the town and county manually.")
    return LookupResult(True, data={
        "city": (result.get("admin_district") or result.get("parish") or "").strip(),
        "district": (result.get("admin_district") or "").strip(),
        "state": (result.get("admin_county") or result.get("region") or result.get("country") or "").strip(),
        "country": "United Kingdom",
        "postal_code": result.get("postcode") or code,
        "localities": [],
        "source": "postcodes.io",
    })


def _zippopotam(country: str, code: str) -> LookupResult:
    query = code
    if country == "CA":
        query = code.replace(" ", "")[:3].upper()  # Zippopotam knows Canadian FSAs only
    elif country == "NL":
        query = re.sub(r"\D", "", code)[:4]
    status_code, body = _get_json(ZIPPOPOTAM_URL.format(country=country.lower(), code=quote(query)))
    places = (body or {}).get("places") if isinstance(body, dict) else None
    if status_code == 404 or not places:
        return LookupResult(False, message="No location was found for this postal code. Enter the address manually.")
    first = places[0]
    return LookupResult(True, data={
        "city": (first.get("place name") or "").strip(),
        "district": "",
        "state": (first.get("state") or "").strip(),
        "state_code": (first.get("state abbreviation") or "").strip(),
        "country": country_name(country),
        "localities": sorted({(p.get("place name") or "").strip() for p in places if p.get("place name")})[:25],
        "source": "Zippopotam.us",
    })


def lookup_postal_code(country_value: str, raw_code: str) -> LookupResult:
    country = resolve_country(country_value)
    if not country:
        return LookupResult(False, message="Select a country first.")
    cfg = postal_config(country)
    if not cfg["has_postal_code"]:
        return LookupResult(False, message=f"{country_name(country)} does not use postal codes.")
    code = (raw_code or "").strip().upper() if country in {"GB", "CA", "NL", "IE"} else (raw_code or "").strip()
    if not code or (cfg["regex"] and not re.match(cfg["regex"], code)):
        return LookupResult(False, message=f"Enter a valid {cfg['label']} for {country_name(country)}.")
    provider = POSTAL_LOOKUP_PROVIDERS.get(country)
    if not provider:
        return LookupResult(False, message=f"Automatic address lookup isn't available for {country_name(country)} - enter the address manually.")

    key = f"lookup:postal:{country}:{re.sub(r'[^A-Z0-9]', '', code.upper())}"
    cached = _cache_get(key)
    if cached is not None:
        return LookupResult(**cached)

    try:
        if provider == "india_post":
            try:
                result = _india_post(code)
            except _ProviderError as exc:
                logger.warning("India Post lookup unavailable (%s) - trying Zippopotam", exc)
                result = _zippopotam(country, code)
        elif provider == "postcodes_io":
            result = _postcodes_io(code)
        else:
            result = _zippopotam(country, code)
    except _ProviderError as exc:
        logger.warning("Postal lookup unavailable for %s (%s)", country, exc)
        return LookupResult(False, message="Address lookup is unavailable right now - enter the address manually.", unavailable=True)
    except (TypeError, KeyError, AttributeError, ValueError) as exc:  # malformed provider payload
        logger.warning("Postal lookup returned an unexpected payload for %s (%s)", country, exc.__class__.__name__)
        return LookupResult(False, message="Address lookup is unavailable right now - enter the address manually.", unavailable=True)

    _cache_set(key, result.__dict__, FOUND_TTL if result.found else MISS_TTL)
    return result
