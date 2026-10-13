"""
Country configuration shared by Client, Vendor and Freelancer onboarding.

One place answers "what does a form need for country X?":
  - display name, ISO alpha-2 / alpha-3, flag
  - local currency (ISO 4217 code + symbol) and international dialing code
  - address labels and postal-code format (and whether a lookup service exists)
  - tax identifier fields for a business / an individual
  - local bank routing identifier, IBAN / SWIFT expectations, account number format

Every country in ISO 3166-1 gets a usable config: countries without a curated entry
fall back to permissive, generic rules (free-form tax ID, optional postal code,
SWIFT + account number banking) so legitimate international data is never rejected
by an India- or US-shaped rule.

Country values are stored on records as the display name (e.g. "India",
"United States") - that is what existing rows hold - and `resolve_country()` maps
names, ISO codes and common aliases back to alpha-2.
"""
from __future__ import annotations

import re
from functools import lru_cache

import phonenumbers
import pycountry
from phonenumbers import PhoneMetadata

# --------------------------------------------------------------------------- #
# Currency                                                                     #
# --------------------------------------------------------------------------- #

COUNTRY_CURRENCY = {
    "AD": "EUR", "AE": "AED", "AF": "AFN", "AG": "XCD", "AI": "XCD", "AL": "ALL", "AM": "AMD", "AO": "AOA",
    "AQ": "", "AR": "ARS", "AS": "USD", "AT": "EUR", "AU": "AUD", "AW": "AWG", "AX": "EUR", "AZ": "AZN",
    "BA": "BAM", "BB": "BBD", "BD": "BDT", "BE": "EUR", "BF": "XOF", "BG": "EUR", "BH": "BHD", "BI": "BIF",
    "BJ": "XOF", "BL": "EUR", "BM": "BMD", "BN": "BND", "BO": "BOB", "BQ": "USD", "BR": "BRL", "BS": "BSD",
    "BT": "BTN", "BV": "NOK", "BW": "BWP", "BY": "BYN", "BZ": "BZD", "CA": "CAD", "CC": "AUD", "CD": "CDF",
    "CF": "XAF", "CG": "XAF", "CH": "CHF", "CI": "XOF", "CK": "NZD", "CL": "CLP", "CM": "XAF", "CN": "CNY",
    "CO": "COP", "CR": "CRC", "CU": "CUP", "CV": "CVE", "CW": "XCG", "CX": "AUD", "CY": "EUR", "CZ": "CZK",
    "DE": "EUR", "DJ": "DJF", "DK": "DKK", "DM": "XCD", "DO": "DOP", "DZ": "DZD", "EC": "USD", "EE": "EUR",
    "EG": "EGP", "EH": "MAD", "ER": "ERN", "ES": "EUR", "ET": "ETB", "FI": "EUR", "FJ": "FJD", "FK": "FKP",
    "FM": "USD", "FO": "DKK", "FR": "EUR", "GA": "XAF", "GB": "GBP", "GD": "XCD", "GE": "GEL", "GF": "EUR",
    "GG": "GBP", "GH": "GHS", "GI": "GIP", "GL": "DKK", "GM": "GMD", "GN": "GNF", "GP": "EUR", "GQ": "XAF",
    "GR": "EUR", "GS": "GBP", "GT": "GTQ", "GU": "USD", "GW": "XOF", "GY": "GYD", "HK": "HKD", "HM": "AUD",
    "HN": "HNL", "HR": "EUR", "HT": "HTG", "HU": "HUF", "ID": "IDR", "IE": "EUR", "IL": "ILS", "IM": "GBP",
    "IN": "INR", "IO": "USD", "IQ": "IQD", "IR": "IRR", "IS": "ISK", "IT": "EUR", "JE": "GBP", "JM": "JMD",
    "JO": "JOD", "JP": "JPY", "KE": "KES", "KG": "KGS", "KH": "KHR", "KI": "AUD", "KM": "KMF", "KN": "XCD",
    "KP": "KPW", "KR": "KRW", "KW": "KWD", "KY": "KYD", "KZ": "KZT", "LA": "LAK", "LB": "LBP", "LC": "XCD",
    "LI": "CHF", "LK": "LKR", "LR": "LRD", "LS": "LSL", "LT": "EUR", "LU": "EUR", "LV": "EUR", "LY": "LYD",
    "MA": "MAD", "MC": "EUR", "MD": "MDL", "ME": "EUR", "MF": "EUR", "MG": "MGA", "MH": "USD", "MK": "MKD",
    "ML": "XOF", "MM": "MMK", "MN": "MNT", "MO": "MOP", "MP": "USD", "MQ": "EUR", "MR": "MRU", "MS": "XCD",
    "MT": "EUR", "MU": "MUR", "MV": "MVR", "MW": "MWK", "MX": "MXN", "MY": "MYR", "MZ": "MZN", "NA": "NAD",
    "NC": "XPF", "NE": "XOF", "NF": "AUD", "NG": "NGN", "NI": "NIO", "NL": "EUR", "NO": "NOK", "NP": "NPR",
    "NR": "AUD", "NU": "NZD", "NZ": "NZD", "OM": "OMR", "PA": "USD", "PE": "PEN", "PF": "XPF", "PG": "PGK",
    "PH": "PHP", "PK": "PKR", "PL": "PLN", "PM": "EUR", "PN": "NZD", "PR": "USD", "PS": "ILS", "PT": "EUR",
    "PW": "USD", "PY": "PYG", "QA": "QAR", "RE": "EUR", "RO": "RON", "RS": "RSD", "RU": "RUB", "RW": "RWF",
    "SA": "SAR", "SB": "SBD", "SC": "SCR", "SD": "SDG", "SE": "SEK", "SG": "SGD", "SH": "SHP", "SI": "EUR",
    "SJ": "NOK", "SK": "EUR", "SL": "SLE", "SM": "EUR", "SN": "XOF", "SO": "SOS", "SR": "SRD", "SS": "SSP",
    "ST": "STN", "SV": "USD", "SX": "XCG", "SY": "SYP", "SZ": "SZL", "TC": "USD", "TD": "XAF", "TF": "EUR",
    "TG": "XOF", "TH": "THB", "TJ": "TJS", "TK": "NZD", "TL": "USD", "TM": "TMT", "TN": "TND", "TO": "TOP",
    "TR": "TRY", "TT": "TTD", "TV": "AUD", "TW": "TWD", "TZ": "TZS", "UA": "UAH", "UG": "UGX", "UM": "USD",
    "US": "USD", "UY": "UYU", "UZ": "UZS", "VA": "EUR", "VC": "XCD", "VE": "VES", "VG": "USD", "VI": "USD",
    "VN": "VND", "VU": "VUV", "WF": "XPF", "WS": "WST", "YE": "YER", "YT": "EUR", "ZA": "ZAR", "ZM": "ZMW",
    "ZW": "ZWG",
}

CURRENCY_SYMBOLS = {
    "INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CNY": "¥", "AUD": "A$", "CAD": "C$",
    "SGD": "S$", "HKD": "HK$", "NZD": "NZ$", "CHF": "CHF", "AED": "AED", "SAR": "SAR", "QAR": "QAR",
    "KWD": "KWD", "BHD": "BHD", "OMR": "OMR", "ZAR": "R", "BRL": "R$", "MXN": "MX$", "KRW": "₩", "RUB": "₽",
    "TRY": "₺", "ILS": "₪", "PHP": "₱", "THB": "฿", "VND": "₫", "NGN": "₦", "UAH": "₴", "PLN": "zł",
    "SEK": "kr", "NOK": "kr", "DKK": "kr", "ISK": "kr", "CZK": "Kč", "HUF": "Ft", "RON": "lei", "MYR": "RM",
    "IDR": "Rp", "PKR": "₨", "LKR": "Rs", "NPR": "Rs", "BDT": "৳", "TWD": "NT$", "KES": "KSh", "EGP": "E£",
    "GHS": "GH₵", "ARS": "AR$", "CLP": "CL$", "COP": "CO$", "PEN": "S/", "XOF": "CFA", "XAF": "FCFA",
}

# Currencies the finance module can price and convert today (core.app_constants).
# Onboarding records always keep the country's local currency; billing / order
# currency pickers are limited to these.
from .app_constants import CURRENCY_CHOICES  # noqa: E402

BILLING_CURRENCIES = [code for code, _ in CURRENCY_CHOICES]


def currency_symbol(code: str) -> str:
    return CURRENCY_SYMBOLS.get((code or "").upper(), (code or "").upper())


# --------------------------------------------------------------------------- #
# Country resolution                                                           #
# --------------------------------------------------------------------------- #

# Free-text values seen on existing records or typed by users.
COUNTRY_ALIASES = {
    "usa": "US", "u.s.": "US", "u.s.a.": "US", "united states of america": "US", "america": "US",
    "uk": "GB", "u.k.": "GB", "great britain": "GB", "britain": "GB", "england": "GB", "scotland": "GB",
    "wales": "GB", "northern ireland": "GB", "uae": "AE", "u.a.e.": "AE", "dubai": "AE",
    "south korea": "KR", "korea": "KR", "north korea": "KP", "russia": "RU", "vietnam": "VN",
    "turkey": "TR", "czech republic": "CZ", "holland": "NL", "ivory coast": "CI", "bharat": "IN",
    "hong kong sar": "HK", "taiwan": "TW", "iran": "IR", "laos": "LA", "syria": "SY",
    "tanzania": "TZ", "bolivia": "BO", "venezuela": "VE", "moldova": "MD", "brunei": "BN",
    "macau": "MO", "macao": "MO", "vatican": "VA", "palestine": "PS", "micronesia": "FM",
}


def _display_name(country) -> str:
    return getattr(country, "common_name", None) or country.name


@lru_cache(maxsize=1)
def _name_index() -> dict:
    index = {}
    for c in pycountry.countries:
        for value in (c.alpha_2, c.alpha_3, c.name, getattr(c, "common_name", None), getattr(c, "official_name", None)):
            if value:
                index[value.strip().lower()] = c.alpha_2
    for alias, code in COUNTRY_ALIASES.items():
        index[alias] = code
    return index


def resolve_country(value) -> str | None:
    """'India' / 'IN' / 'IND' / 'india' / 'USA' -> alpha-2 code, or None when unknown/blank."""
    if not value:
        return None
    return _name_index().get(str(value).strip().lower())


def country_name(code: str) -> str:
    c = pycountry.countries.get(alpha_2=(code or "").upper())
    return _display_name(c) if c else ""


def normalize_country_value(value) -> str:
    """Canonical display name for any accepted spelling; unknown values are returned trimmed."""
    code = resolve_country(value)
    return country_name(code) if code else (value or "").strip()


def is_india(value) -> bool:
    return resolve_country(value) == "IN"


def flag_emoji(code: str) -> str:
    code = (code or "").upper()
    if len(code) != 2 or not code.isalpha():
        return ""
    return "".join(chr(0x1F1E6 + ord(ch) - ord("A")) for ch in code)


# --------------------------------------------------------------------------- #
# Phone                                                                        #
# --------------------------------------------------------------------------- #

def dial_code(code: str) -> str:
    cc = phonenumbers.country_code_for_region((code or "").upper())
    return f"+{cc}" if cc else ""


def phone_lengths(code: str) -> list[int]:
    """Possible national-number lengths (digits after the dialing code)."""
    meta = PhoneMetadata.metadata_for_region((code or "").upper())
    if not meta or not meta.general_desc or not meta.general_desc.possible_length:
        return []
    return sorted(set(meta.general_desc.possible_length))


def phone_example(code: str) -> str:
    try:
        num = phonenumbers.example_number_for_type((code or "").upper(), phonenumbers.PhoneNumberType.MOBILE)
    except Exception:  # noqa: BLE001 - metadata gaps for tiny territories
        num = None
    return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.INTERNATIONAL) if num else ""


class PhoneValidationError(ValueError):
    pass


def normalize_phone(value: str, default_country=None) -> str:
    """Validate and return E.164 ('+919876543210').

    Accepts '+<cc> ...' in any spacing, or a national number when `default_country`
    (name or code) is given. Raises PhoneValidationError with a user-facing message.
    """
    raw = (value or "").strip()
    if not raw:
        return ""
    region = resolve_country(default_country) if default_country else None
    try:
        number = phonenumbers.parse(raw, None if raw.startswith("+") else region)
    except phonenumbers.NumberParseException:
        raise PhoneValidationError(
            "Enter the phone number with its country dialing code, e.g. +91 98765 43210."
            if not region else "Enter a valid phone number."
        )
    if not phonenumbers.is_valid_number(number):
        where = country_name(phonenumbers.region_code_for_number(number) or "") or "the selected country"
        raise PhoneValidationError(f"Enter a valid phone number for {where}.")
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


# --------------------------------------------------------------------------- #
# Address / postal code                                                        #
# --------------------------------------------------------------------------- #

GENERIC_POSTAL_REGEX = r"^[A-Za-z0-9][A-Za-z0-9 \-]{1,11}$"

# code: (label, regex, example, required)
POSTAL_RULES = {
    "IN": ("PIN code", r"^[1-9]\d{5}$", "500081", True),
    "US": ("ZIP code", r"^\d{5}(?:-\d{4})?$", "90210", True),
    "GB": ("Postcode", r"^(?:GIR ?0AA|[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2})$", "SW1A 1AA", True),
    "CA": ("Postal code", r"^[ABCEGHJ-NPRSTVXYabceghj-nprstvxy]\d[A-Za-z] ?\d[A-Za-z]\d$", "K1A 0B1", True),
    "AU": ("Postcode", r"^\d{4}$", "2000", True),
    "NZ": ("Postcode", r"^\d{4}$", "6011", True),
    "SG": ("Postal code", r"^\d{6}$", "018956", True),
    "MY": ("Postcode", r"^\d{5}$", "50450", True),
    "JP": ("Postal code", r"^\d{3}-?\d{4}$", "100-0001", True),
    "CN": ("Postal code", r"^\d{6}$", "100000", True),
    "KR": ("Postal code", r"^\d{5}$", "04524", True),
    "DE": ("Postal code", r"^\d{5}$", "10115", True),
    "FR": ("Postal code", r"^\d{5}$", "75001", True),
    "ES": ("Postal code", r"^\d{5}$", "28001", True),
    "IT": ("Postal code", r"^\d{5}$", "00118", True),
    "NL": ("Postcode", r"^\d{4} ?[A-Za-z]{2}$", "1012 AB", True),
    "BE": ("Postal code", r"^\d{4}$", "1000", True),
    "CH": ("Postal code", r"^\d{4}$", "8001", True),
    "AT": ("Postal code", r"^\d{4}$", "1010", True),
    "SE": ("Postal code", r"^\d{3} ?\d{2}$", "111 22", True),
    "NO": ("Postal code", r"^\d{4}$", "0150", True),
    "DK": ("Postal code", r"^\d{4}$", "1050", True),
    "FI": ("Postal code", r"^\d{5}$", "00100", True),
    "PL": ("Postal code", r"^\d{2}-\d{3}$", "00-001", True),
    "PT": ("Postal code", r"^\d{4}-\d{3}$", "1000-001", True),
    "CZ": ("Postal code", r"^\d{3} ?\d{2}$", "110 00", True),
    "IE": ("Eircode", r"^(?:[AC-FHKNPRTV-Yac-fhknprtv-y]\d{2}|[Dd]6[Ww]) ?[0-9AC-FHKNPRTV-Yac-fhknprtv-y]{4}$", "D02 X285", False),
    "ZA": ("Postal code", r"^\d{4}$", "8001", True),
    "BR": ("CEP", r"^\d{5}-?\d{3}$", "01310-100", True),
    "MX": ("Postal code", r"^\d{5}$", "06000", True),
    "PH": ("ZIP code", r"^\d{4}$", "1000", True),
    "TH": ("Postal code", r"^\d{5}$", "10200", True),
    "ID": ("Postal code", r"^\d{5}$", "10110", True),
    "VN": ("Postal code", r"^\d{6}$", "100000", False),
    "LK": ("Postal code", r"^\d{5}$", "00100", True),
    "BD": ("Postal code", r"^\d{4}$", "1000", True),
    "PK": ("Postal code", r"^\d{5}$", "44000", True),
    "NP": ("Postal code", r"^\d{5}$", "44600", False),
    "SA": ("Postal code", r"^\d{5}(?:-\d{4})?$", "11564", True),
    "IL": ("Postal code", r"^\d{7}$", "6100000", True),
    "TR": ("Postal code", r"^\d{5}$", "34000", True),
    "RU": ("Postal code", r"^\d{6}$", "101000", True),
    "EG": ("Postal code", r"^\d{5}$", "11511", False),
    "KE": ("Postal code", r"^\d{5}$", "00100", False),
    "NG": ("Postal code", r"^\d{6}$", "100001", False),
}

# Countries without a postal-code system - the field is hidden, never required.
NO_POSTAL_CODE = {
    "AE", "HK", "QA", "MO", "AO", "AG", "AW", "BS", "BZ", "BJ", "BW", "BF", "BI", "CM", "CF", "KM", "CG",
    "CD", "CK", "CI", "DJ", "DM", "GQ", "ER", "FJ", "TF", "GM", "GD", "GY", "KI", "KP", "LY", "ML", "MR",
    "NR", "NU", "RW", "KN", "LC", "ST", "SC", "SL", "SB", "SR", "SY", "TL", "TG", "TK", "TO", "TV", "UG",
    "VU", "YE", "ZW",
}

STATE_LABELS = {
    "IN": "State", "US": "State", "AU": "State / Territory", "CA": "Province", "GB": "County",
    "AE": "Emirate", "IE": "County", "JP": "Prefecture", "CN": "Province", "NZ": "Region",
    "DE": "State", "MY": "State", "MX": "State", "BR": "State", "IT": "Province", "ES": "Province",
    "FR": "Region", "NL": "Province", "ZA": "Province", "PH": "Province", "TH": "Province",
}

# Address lookup provider per country (see core/lookups.py). 'india_post' = api.postalpincode.in,
# 'postcodes_io' = UK postcodes.io, 'zippopotam' = api.zippopotam.us.
POSTAL_LOOKUP_PROVIDERS = {"IN": "india_post", "GB": "postcodes_io"}
ZIPPOPOTAM_COUNTRIES = {
    "US", "DE", "FR", "ES", "IT", "AU", "NZ", "CH", "AT", "BE", "NL", "CA", "JP", "MX", "BR", "SE", "NO",
    "DK", "FI", "PL", "PT", "CZ", "MY", "PH", "PK", "TH", "TR", "LK", "ZA", "HU", "SK", "SI", "HR", "LU",
    "IS", "LT", "RU", "AR", "BD", "DO", "GT", "MC", "SM", "LI", "AD",
}
for _c in ZIPPOPOTAM_COUNTRIES:
    POSTAL_LOOKUP_PROVIDERS.setdefault(_c, "zippopotam")


def postal_config(code: str) -> dict:
    code = (code or "").upper()
    if code in NO_POSTAL_CODE:
        return {"has_postal_code": False, "label": "Postal code", "regex": "", "example": "", "required": False, "lookup": False}
    label, regex, example, required = POSTAL_RULES.get(code, ("Postal code", GENERIC_POSTAL_REGEX, "", False))
    return {
        "has_postal_code": True,
        "label": label,
        "regex": regex,
        "example": example,
        "required": required,
        "lookup": code in POSTAL_LOOKUP_PROVIDERS,
    }


def validate_postal_code(value: str, country) -> str | None:
    """Returns an error message, or None when valid / not applicable."""
    value = (value or "").strip()
    code = resolve_country(country)
    if not value or not code:
        return None
    cfg = postal_config(code)
    if not cfg["has_postal_code"]:
        return None
    if not re.match(cfg["regex"], value):
        hint = f" (e.g. {cfg['example']})" if cfg["example"] else ""
        return f"Enter a valid {cfg['label']} for {country_name(code)}{hint}."
    return None


def normalize_postal_code(value: str, country) -> str:
    value = (value or "").strip()
    code = resolve_country(country)
    if code in {"GB", "CA", "NL", "IE"}:
        value = value.upper()
    return value


# --------------------------------------------------------------------------- #
# Tax identifiers                                                              #
# --------------------------------------------------------------------------- #

GENERIC_TAX_REGEX = r"^[A-Za-z0-9][A-Za-z0-9 ./\-]{2,29}$"

PAN_REGEX = r"^[A-Z]{5}[0-9]{4}[A-Z]$"
GSTIN_REGEX = r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"
EU_VAT_REGEX = r"^[A-Z]{2}[A-Z0-9+*]{2,13}$"

# code -> {"business": {...}, "individual": {...}}; each: label, regex, example, required, help
TAX_RULES = {
    "IN": {
        "business": {"label": "PAN", "regex": PAN_REGEX, "example": "AAAAA9999A", "required": True,
                     "help": "10-character Permanent Account Number of the business."},
        "individual": {"label": "PAN", "regex": PAN_REGEX, "example": "ABCDE1234F", "required": True,
                       "help": "10-character Permanent Account Number."},
        "secondary": {"label": "GSTIN", "regex": GSTIN_REGEX, "example": "22AAAAA0000A1Z5", "required": False,
                      "help": "Required only when GST registered."},
    },
    "US": {
        "business": {"label": "EIN", "regex": r"^\d{2}-?\d{7}$", "example": "12-3456789", "required": True,
                     "help": "Employer Identification Number."},
        "individual": {"label": "SSN / ITIN", "regex": r"^\d{3}-?\d{2}-?\d{4}$", "example": "123-45-6789", "required": False,
                       "help": "Only needed for W-9 reporting; leave blank if a W-8BEN applies."},
    },
    "GB": {
        "business": {"label": "UTR / VAT number", "regex": r"^(?:GB)?\d{9}(?:\d{3})?$|^\d{10}$", "example": "GB123456789", "required": True,
                     "help": "Company Unique Taxpayer Reference (10 digits) or VAT number."},
        "individual": {"label": "UTR / National Insurance number", "regex": r"^\d{10}$|^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$", "example": "1234567890", "required": False,
                       "help": "Self-assessment UTR or NI number."},
    },
    "CA": {
        "business": {"label": "Business Number (BN)", "regex": r"^\d{9}(?:[A-Z]{2}\d{4})?$", "example": "123456789RT0001", "required": True, "help": ""},
        "individual": {"label": "SIN", "regex": r"^\d{3}[ -]?\d{3}[ -]?\d{3}$", "example": "123 456 789", "required": False, "help": ""},
    },
    "AU": {
        "business": {"label": "ABN", "regex": r"^\d{2} ?\d{3} ?\d{3} ?\d{3}$", "example": "51 824 753 556", "required": True,
                     "help": "11-digit Australian Business Number."},
        "individual": {"label": "ABN / TFN", "regex": r"^\d{2} ?\d{3} ?\d{3} ?\d{3}$|^\d{3} ?\d{3} ?\d{2,3}$", "example": "51 824 753 556", "required": False, "help": ""},
    },
    "SG": {
        "business": {"label": "UEN", "regex": r"^(?:\d{8}[A-Z]|\d{9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$", "example": "201912345K", "required": True,
                     "help": "Unique Entity Number."},
        "individual": {"label": "NRIC / FIN", "regex": r"^[STFGM]\d{7}[A-Z]$", "example": "S1234567D", "required": False, "help": ""},
    },
    "AE": {
        "business": {"label": "TRN", "regex": r"^\d{15}$", "example": "100123456700003", "required": False,
                     "help": "15-digit Tax Registration Number (only if VAT registered)."},
        "individual": {"label": "TRN", "regex": r"^\d{15}$", "example": "100123456700003", "required": False, "help": ""},
    },
}

# EU / EEA: VAT identification number, country-prefixed.
EU_VAT_COUNTRIES = {
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT",
    "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
}


def tax_config(code: str) -> dict:
    code = (code or "").upper()
    if code in TAX_RULES:
        rules = dict(TAX_RULES[code])
    elif code in EU_VAT_COUNTRIES:
        prefix = "EL" if code == "GR" else code
        vat = {"label": "VAT number", "regex": EU_VAT_REGEX, "example": f"{prefix}123456789", "required": True,
               "help": f"EU VAT identification number, starting with {prefix}."}
        rules = {"business": vat, "individual": {**vat, "label": "Tax ID / VAT number", "required": False}}
    else:
        generic = {"label": "Tax Identification Number", "regex": GENERIC_TAX_REGEX, "example": "", "required": False,
                   "help": "The tax number issued in this country, if any."}
        rules = {"business": {**generic, "required": True}, "individual": generic}
    rules.setdefault("secondary", None)
    return rules


def validate_tax_id(value: str, country, entity: str = "business") -> str | None:
    value = (value or "").strip().upper()
    code = resolve_country(country)
    if not value or not code:
        return None
    rule = tax_config(code)["individual" if entity == "individual" else "business"]
    if not re.match(rule["regex"], value):
        hint = f" (e.g. {rule['example']})" if rule.get("example") else ""
        return f"Enter a valid {rule['label']} for {country_name(code)}{hint}."
    if code == "AU" and rule["label"].startswith("ABN") and len(re.sub(r"\D", "", value)) == 11 and not abn_is_valid(value):
        return "This ABN fails its checksum - please re-check the number."
    return None


def abn_is_valid(value: str) -> bool:
    digits = [int(d) for d in re.sub(r"\D", "", value)]
    if len(digits) != 11:
        return False
    digits[0] -= 1
    weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    return sum(d * w for d, w in zip(digits, weights)) % 89 == 0


# --------------------------------------------------------------------------- #
# Banking                                                                      #
# --------------------------------------------------------------------------- #

IFSC_REGEX = r"^[A-Z]{4}0[A-Z0-9]{6}$"
SWIFT_REGEX = r"^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$"

# ISO 13616 IBAN lengths.
IBAN_LENGTHS = {
    "AD": 24, "AE": 23, "AL": 28, "AT": 20, "AZ": 28, "BA": 20, "BE": 16, "BG": 22, "BH": 22, "BR": 29,
    "BY": 28, "CH": 21, "CR": 22, "CY": 28, "CZ": 24, "DE": 22, "DK": 18, "DO": 28, "EE": 20, "EG": 29,
    "ES": 24, "FI": 18, "FO": 18, "FR": 27, "GB": 22, "GE": 22, "GI": 23, "GL": 18, "GR": 27, "GT": 28,
    "HR": 21, "HU": 28, "IE": 22, "IL": 23, "IQ": 23, "IS": 26, "IT": 27, "JO": 30, "KW": 30, "KZ": 20,
    "LB": 28, "LC": 32, "LI": 21, "LT": 20, "LU": 20, "LV": 21, "MC": 27, "MD": 24, "ME": 22, "MK": 19,
    "MR": 27, "MT": 31, "MU": 30, "NL": 18, "NO": 15, "PK": 24, "PL": 28, "PS": 29, "PT": 25, "QA": 29,
    "RO": 24, "RS": 22, "SA": 24, "SC": 31, "SE": 24, "SI": 19, "SK": 24, "SM": 27, "ST": 25, "SV": 28,
    "TL": 23, "TN": 24, "TR": 26, "UA": 29, "VA": 22, "VG": 24, "XK": 20,
}
# Where an IBAN is the normal way to receive a transfer (UK uses sort code + account instead).
IBAN_REQUIRED = set(IBAN_LENGTHS) - {"GB", "BR", "CR", "DO", "GT", "SV", "LC", "VG", "EG", "IQ", "PK", "UA", "BY", "KZ", "TL", "ST", "SC", "MU", "MR", "TN", "IL"}

# Local routing identifier per country. `field` is the stored attribute: India keeps its
# own `ifsc_code` column, every other country uses the generic `routing_code`.
BANK_RULES = {
    "IN": {
        "routing": {"field": "ifsc_code", "label": "IFSC code", "regex": IFSC_REGEX, "example": "HDFC0000001",
                    "required": True, "lookup": "ifsc", "help": "11 characters; bank & branch are filled in automatically."},
        "account_number": {"label": "Account number", "regex": r"^\d{9,18}$", "example": "", "help": "9 to 18 digits."},
        "account_types": [["savings", "Savings"], ["current", "Current"], ["overdraft", "Overdraft / Cash credit"], ["nre", "NRE"], ["nro", "NRO"]],
        "swift": "optional", "iban": "hidden", "branch": True,
    },
    "US": {
        "routing": {"field": "routing_code", "label": "ABA routing number", "regex": r"^\d{9}$", "example": "021000021",
                    "required": True, "lookup": None, "checksum": "aba", "help": "9-digit ACH / wire routing number."},
        "account_number": {"label": "Account number", "regex": r"^\d{4,17}$", "example": "", "help": "4 to 17 digits."},
        "account_types": [["checking", "Checking"], ["savings", "Savings"]],
        "swift": "optional", "iban": "hidden", "branch": False,
    },
    "GB": {
        "routing": {"field": "routing_code", "label": "Sort code", "regex": r"^\d{2}-?\d{2}-?\d{2}$", "example": "20-00-00",
                    "required": True, "lookup": None, "help": "6 digits."},
        "account_number": {"label": "Account number", "regex": r"^\d{8}$", "example": "", "help": "8 digits."},
        "account_types": None, "swift": "optional", "iban": "optional", "branch": False,
    },
    "CA": {
        "routing": {"field": "routing_code", "label": "Transit & institution number", "regex": r"^\d{5}-?\d{3}$", "example": "12345-003",
                    "required": True, "lookup": None, "help": "5-digit transit + 3-digit institution number."},
        "account_number": {"label": "Account number", "regex": r"^\d{7,12}$", "example": "", "help": "7 to 12 digits."},
        "account_types": [["chequing", "Chequing"], ["savings", "Savings"]],
        "swift": "optional", "iban": "hidden", "branch": False,
    },
    "AU": {
        "routing": {"field": "routing_code", "label": "BSB", "regex": r"^\d{3}-?\d{3}$", "example": "062-000",
                    "required": True, "lookup": None, "help": "6-digit Bank-State-Branch number."},
        "account_number": {"label": "Account number", "regex": r"^\d{5,10}$", "example": "", "help": "5 to 10 digits."},
        "account_types": None, "swift": "optional", "iban": "hidden", "branch": False,
    },
    "NZ": {
        "routing": None,
        "account_number": {"label": "Account number", "regex": r"^\d{2}-?\d{4}-?\d{7}-?\d{2,3}$", "example": "12-3140-0171323-50",
                           "help": "Bank-branch-account-suffix."},
        "account_types": None, "swift": "optional", "iban": "hidden", "branch": False,
    },
    "SG": {
        "routing": {"field": "routing_code", "label": "Bank & branch code", "regex": r"^\d{4}-?\d{3}$", "example": "7171-001",
                    "required": False, "lookup": None, "help": "4-digit bank code + 3-digit branch code."},
        "account_number": {"label": "Account number", "regex": r"^\d{6,14}$", "example": "", "help": ""},
        "account_types": None, "swift": "required", "iban": "hidden", "branch": False,
    },
}

GENERIC_ACCOUNT_REGEX = r"^[A-Za-z0-9][A-Za-z0-9 \-]{3,33}$"


def bank_config(code: str) -> dict:
    code = (code or "").upper()
    if code in BANK_RULES:
        cfg = {k: v for k, v in BANK_RULES[code].items()}
    elif code in IBAN_REQUIRED:
        cfg = {
            "routing": None,
            "account_number": None,  # the IBAN carries the account number
            "account_types": None, "swift": "required", "iban": "required", "branch": False,
        }
    else:
        cfg = {
            "routing": {"field": "routing_code", "label": "Local bank / branch code", "regex": r"^[A-Za-z0-9 \-]{2,20}$",
                        "example": "", "required": False, "lookup": None, "help": "Optional local routing code."},
            "account_number": {"label": "Account number", "regex": GENERIC_ACCOUNT_REGEX, "example": "", "help": ""},
            "account_types": None,
            "swift": "required", "iban": "optional" if code in IBAN_LENGTHS else "hidden", "branch": True,
        }
    cfg["iban_length"] = IBAN_LENGTHS.get(code)
    return cfg


def aba_checksum_ok(value: str) -> bool:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 9:
        return False
    d = [int(x) for x in digits]
    return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 == 0


def iban_is_valid(value: str) -> bool:
    iban = re.sub(r"\s", "", value or "").upper()
    if not re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$", iban):
        return False
    expected = IBAN_LENGTHS.get(iban[:2])
    if expected and len(iban) != expected:
        return False
    rearranged = iban[4:] + iban[:4]
    numeric = "".join(str(int(ch, 36)) for ch in rearranged)
    return int(numeric) % 97 == 1


def normalize_bank_value(field: str, value: str) -> str:
    value = (value or "").strip()
    if field in {"ifsc_code", "swift_code"}:
        return value.upper().replace(" ", "")
    if field == "iban":
        return re.sub(r"\s", "", value).upper()
    if field == "account_number":
        return re.sub(r"[\s\-]", "", value)
    return value


def validate_bank_details(data: dict, country, partial: bool = False) -> dict:
    """Country-aware bank validation shared by every onboarding module.

    `data` keys (all optional): account_holder_name, account_number, ifsc_code, routing_code,
    swift_code, iban, bank_name. Returns {field: message}. `partial` skips required checks
    (drafts) but still rejects malformed values.
    """
    errors: dict = {}
    code = resolve_country(country) or "IN"
    cfg = bank_config(code)
    name = country_name(code)

    def present(key):
        return bool((data.get(key) or "").strip())

    routing = cfg.get("routing")
    if routing:
        key = routing["field"]
        val = normalize_bank_value(key, data.get(key) or "")
        if val:
            if not re.match(routing["regex"], val):
                errors[key] = f"Enter a valid {routing['label']} for {name}" + (f" (e.g. {routing['example']})." if routing.get("example") else ".")
            elif routing.get("checksum") == "aba" and not aba_checksum_ok(val):
                errors[key] = "This routing number fails the ABA checksum - please re-check it."
        elif routing.get("required") and not partial:
            errors[key] = f"{routing['label']} is required."

    acct = cfg.get("account_number")
    acct_val = normalize_bank_value("account_number", data.get("account_number") or "")
    if acct and acct_val and not re.match(acct["regex"], acct_val):
        errors["account_number"] = f"Enter a valid {acct['label'].lower()} for {name}." + (f" {acct['help']}" if acct.get("help") else "")

    iban_val = normalize_bank_value("iban", data.get("iban") or "")
    if iban_val:
        if not iban_is_valid(iban_val):
            errors["iban"] = "Enter a valid IBAN (the check digits don't match)."
        elif iban_val[:2] != code and cfg["iban"] != "hidden":
            errors["iban"] = f"This IBAN belongs to {country_name(iban_val[:2]) or iban_val[:2]}, not {name}."
    elif cfg["iban"] == "required" and not partial:
        errors["iban"] = "IBAN is required for bank accounts in this country."

    swift_val = normalize_bank_value("swift_code", data.get("swift_code") or "")
    if swift_val:
        if not re.match(SWIFT_REGEX, swift_val):
            errors["swift_code"] = "Enter a valid SWIFT / BIC (8 or 11 characters)."
        elif swift_val[4:6] != code:
            errors["swift_code"] = f"This SWIFT / BIC belongs to {country_name(swift_val[4:6]) or swift_val[4:6]}, not {name}."
    elif cfg["swift"] == "required" and not partial:
        errors["swift_code"] = "SWIFT / BIC is required for this country."

    if not partial:
        if not present("account_holder_name"):
            errors["account_holder_name"] = "Account holder name is required."
        if not present("bank_name"):
            errors["bank_name"] = "Bank name is required."
        if acct and not acct_val and not data.get("_has_saved_account_number"):
            errors["account_number"] = "Account number is required."
    if present("account_holder_name") and not re.match(r"^[^\d@#$%^*_=+<>{}\[\]|\\]{2,}$", data["account_holder_name"].strip()):
        errors["account_holder_name"] = "Enter the name exactly as it appears on the bank account (letters only)."
    return errors


# --------------------------------------------------------------------------- #
# Assembled config (served by /api/countries/)                                 #
# --------------------------------------------------------------------------- #

def country_summary(code: str) -> dict:
    c = pycountry.countries.get(alpha_2=code)
    currency = COUNTRY_CURRENCY.get(code, "")
    return {
        "code": code,
        "alpha3": c.alpha_3 if c else "",
        "name": _display_name(c) if c else code,
        "flag": flag_emoji(code),
        "dial_code": dial_code(code),
        "phone_lengths": phone_lengths(code),
        "currency_code": currency,
        "currency_symbol": currency_symbol(currency),
    }


@lru_cache(maxsize=1)
def all_country_summaries() -> list[dict]:
    rows = [country_summary(c.alpha_2) for c in pycountry.countries]
    return sorted(rows, key=lambda r: r["name"])


@lru_cache(maxsize=300)
def country_config(code: str) -> dict | None:
    code = (code or "").upper()
    if not pycountry.countries.get(alpha_2=code):
        return None
    summary = country_summary(code)
    currency = summary["currency_code"]
    return {
        **summary,
        "phone": {"dial_code": summary["dial_code"], "lengths": phone_lengths(code), "example": phone_example(code)},
        "currency": {"code": currency, "symbol": currency_symbol(currency), "billing_supported": currency in BILLING_CURRENCIES},
        "address": {"state_label": STATE_LABELS.get(code, "State / Province / Region"), "postal": postal_config(code)},
        "tax": tax_config(code),
        "bank": bank_config(code),
        "is_india": code == "IN",
    }
