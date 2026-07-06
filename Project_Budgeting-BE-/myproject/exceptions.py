from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.db import IntegrityError
from django.core.exceptions import ValidationError as DjangoValidationError
import traceback

def custom_exception_handler(exc, context):
    print("CUSTOM EXCEPTION HANDLER CALLED:", type(exc))

    # Translate Django Core ValidationError to DRF ValidationError
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, 'message_dict'):
            exc = DRFValidationError(detail=exc.message_dict)
        elif hasattr(exc, 'messages'):
            exc = DRFValidationError(detail={"error": exc.messages[0]})
        else:
            exc = DRFValidationError(detail={"error": str(exc)})

    # Translate Django DB IntegrityError to DRF ValidationError
    if isinstance(exc, IntegrityError):
        err_msg = str(exc)
        if "unique" in err_msg.lower() or "duplicate" in err_msg.lower():
            exc = DRFValidationError(detail={"error": "A record with this information already exists."})
        elif "foreign key" in err_msg.lower():
            exc = DRFValidationError(detail={"error": "Foreign key constraint failed: referenced record does not exist."})
        else:
            exc = DRFValidationError(detail={"error": f"Database integrity error: {err_msg}"})

    response = exception_handler(exc, context)

    if response is None:
        print("UNHANDLED EXCEPTION:")
        traceback.print_exc()
        return Response(
            {"error": "An unexpected error occurred on the server."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    if response and isinstance(response.data, dict):
        if "error" not in response.data:
            # Flatten or format key errors
            for key, value in response.data.items():
                if isinstance(value, list):
                    msg = value[0]
                elif isinstance(value, dict):
                    first_key = list(value.keys())[0]
                    first_val = value[first_key]
                    msg = first_val[0] if isinstance(first_val, list) else first_val
                else:
                    msg = value
                
                response.data = {"error": f"{key}: {msg}" if key not in ["non_field_errors", "error", "__all__"] else msg}
                break

    return response

