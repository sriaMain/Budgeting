from django.core.validators import RegexValidator

# Re-exported for convenience - reused as-is from vendor_onboarding, which
# already defines these exact formats. Read-only import, no coupling risk:
# employee_onboarding never writes to vendor_onboarding's models/state.
from vendor_onboarding.validators import pan_validator, ifsc_validator, mobile_validator

aadhaar_validator = RegexValidator(
    regex=r"^[0-9]{12}$",
    message="Enter a valid 12-digit Aadhaar number."
)

uan_validator = RegexValidator(
    regex=r"^[0-9]{12}$",
    message="Enter a valid 12-digit UAN."
)

__all__ = [
    "pan_validator",
    "ifsc_validator",
    "mobile_validator",
    "aadhaar_validator",
    "uan_validator",
]
