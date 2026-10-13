from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler
import traceback


def _first_message(value):
    """First human-readable message in a DRF error structure (list / dict / nested)."""
    if isinstance(value, (list, tuple)):
        return _first_message(value[0]) if value else ""
    if isinstance(value, dict):
        for item in value.values():
            return _first_message(item)
        return ""
    return value


def custom_exception_handler(exc, context):
    print("CUSTOM EXCEPTION HANDLER CALLED")
    response = exception_handler(exc, context)

    if response is None:
        print("UNHANDLED EXCEPTION:")
        traceback.print_exc()

    if response and isinstance(response.data, dict):
        original = response.data
        # Existing consumers read a single `error` message; validation errors also keep the
        # full {field: [messages]} map under `errors` so forms can show field-level messages.
        response.data = {"error": _first_message(original)}
        if isinstance(exc, ValidationError) and not ({"error", "detail"} >= set(original)):
            response.data["errors"] = original

    return response
