from django.core.validators import RegexValidator
from client.models import gstin_validator  # re-exported for convenience

pan_validator = RegexValidator(
    regex=r"^[A-Z]{5}[0-9]{4}[A-Z]$",
    message="Enter a valid PAN (format: AAAAA9999A)."
)

cin_validator = RegexValidator(
    regex=r"^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$",
    message="Enter a valid CIN."
)

tan_validator = RegexValidator(
    regex=r"^[A-Z]{4}[0-9]{5}[A-Z]$",
    message="Enter a valid TAN."
)

udyam_validator = RegexValidator(
    regex=r"^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$",
    message="Enter a valid UDYAM registration number."
)

ifsc_validator = RegexValidator(
    regex=r"^[A-Z]{4}0[A-Z0-9]{6}$",
    message="Enter a valid IFSC code."
)

mobile_validator = RegexValidator(
    regex=r"^[0-9]{10}$",
    message="Enter a valid 10-digit mobile number."
)

__all__ = [
    "pan_validator",
    "cin_validator",
    "tan_validator",
    "udyam_validator",
    "ifsc_validator",
    "mobile_validator",
    "gstin_validator",
]
