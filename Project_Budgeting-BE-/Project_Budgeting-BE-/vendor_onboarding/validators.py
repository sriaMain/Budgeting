from django.core.validators import RegexValidator

# Indian statutory identifier formats (all upper-case; serializers upper-case input first).
GSTIN_REGEX = r"^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
PAN_REGEX = r"^[A-Z]{5}[0-9]{4}[A-Z]$"
CIN_REGEX = r"^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$"
# LLP Identification Number, e.g. AAB-1234.
LLPIN_REGEX = r"^[A-Z]{3}-[0-9]{4}$"
TAN_REGEX = r"^[A-Z]{4}[0-9]{5}[A-Z]$"
UDYAM_REGEX = r"^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$"
IFSC_REGEX = r"^[A-Z]{4}0[A-Z0-9]{6}$"

gstin_validator = RegexValidator(
    regex=GSTIN_REGEX,
    message="Enter a valid GSTIN (15 characters)."
)

pan_validator = RegexValidator(
    regex=PAN_REGEX,
    message="Enter a valid PAN (format: AAAAA9999A)."
)

# Kept for the historical migrations that reference it - the model now uses
# cin_or_llpin_validator (an LLP's identifier is an LLPIN, not a CIN).
cin_validator = RegexValidator(
    regex=CIN_REGEX,
    message="Enter a valid CIN."
)

cin_or_llpin_validator = RegexValidator(
    regex=f"{CIN_REGEX}|{LLPIN_REGEX}",
    message="Enter a valid CIN (21 characters) or LLPIN (e.g. AAB-1234)."
)

tan_validator = RegexValidator(
    regex=TAN_REGEX,
    message="Enter a valid TAN."
)

udyam_validator = RegexValidator(
    regex=UDYAM_REGEX,
    message="Enter a valid UDYAM registration number."
)

ifsc_validator = RegexValidator(
    regex=IFSC_REGEX,
    message="Enter a valid IFSC code."
)

# Kept for the historical migrations that reference it - TAN mobile numbers are now
# stored in E.164 ("+919876543210") and validated by the serializer.
mobile_validator = RegexValidator(
    regex=r"^[0-9]{10}$",
    message="Enter a valid 10-digit mobile number."
)

__all__ = [
    "pan_validator",
    "cin_validator",
    "cin_or_llpin_validator",
    "tan_validator",
    "udyam_validator",
    "ifsc_validator",
    "mobile_validator",
    "gstin_validator",
]
