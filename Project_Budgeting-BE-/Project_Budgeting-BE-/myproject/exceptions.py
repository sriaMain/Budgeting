from rest_framework.views import exception_handler
import traceback

def custom_exception_handler(exc, context):
    print("CUSTOM EXCEPTION HANDLER CALLED")
    response = exception_handler(exc, context)

    if response is None:
        print("UNHANDLED EXCEPTION:")
        traceback.print_exc()

    if response and isinstance(response.data, dict):
        # Take first error message only
        for _, value in response.data.items():
            if isinstance(value, list):
                response.data = {"error": value[0]}
            else:
                response.data = {"error": value}
            break

    return response

