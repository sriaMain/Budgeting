"""Shared plumbing for the server-to-server APIs other systems call on Project Budgeting
(AIRA HRMS - hrms_integration.external_api, the helpdesk - Project.external_api).

Each caller has its own X-API-Key list in settings, so one can be rotated or revoked without
touching the other. Every response uses the {"status", "message", "data"} envelope.
"""
import hmac

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import APIException, AuthenticationFailed, Throttled
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


class ApiKeyPermission(BasePermission):
    """X-API-Key must match one of the keys in settings.<keys_setting> (constant-time compare)."""
    keys_setting = ''

    def has_permission(self, request, view):
        sent = request.headers.get('X-API-Key', '')
        keys = getattr(settings, self.keys_setting, [])
        if sent and any(hmac.compare_digest(sent, key) for key in keys):
            return True
        raise AuthenticationFailed("Invalid or inactive API key.")


def envelope(message, data=None, ok=True):
    return {"status": "success" if ok else "error", "message": message, "data": data}


def page_data(count, page, page_size, results, **extra):
    return {
        **extra,
        "count": count,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-count // page_size)),
        "results": results,
    }


class BadRequest(Exception):
    pass


class ExternalApiView(APIView):
    """Base view: no session/JWT auth (subclasses set an ApiKeyPermission), scoped throttling,
    and every error in the same envelope."""
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]

    def handle_exception(self, exc):
        if isinstance(exc, BadRequest):
            return Response(envelope(str(exc), ok=False), status=status.HTTP_400_BAD_REQUEST)
        if isinstance(exc, AuthenticationFailed):
            return Response(envelope("Invalid or inactive API key.", ok=False), status=status.HTTP_401_UNAUTHORIZED)
        if isinstance(exc, Throttled):
            return Response(envelope("Rate limit reached. Try again later.", {"retry_after_seconds": exc.wait}, ok=False),
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        if isinstance(exc, APIException):
            return Response(envelope(str(exc.detail), ok=False), status=exc.status_code)
        return super().handle_exception(exc)

    @staticmethod
    def _not_found(message):
        return Response(envelope(message, ok=False), status=status.HTTP_404_NOT_FOUND)

    @staticmethod
    def _paging(params):
        try:
            page = int(params.get('page', 1))
            page_size = int(params.get('page_size', DEFAULT_PAGE_SIZE))
        except ValueError:
            raise BadRequest("page and page_size must be whole numbers.")
        if page < 1 or not 1 <= page_size <= MAX_PAGE_SIZE:
            raise BadRequest(f"page must be 1 or more and page_size between 1 and {MAX_PAGE_SIZE}.")
        return page, page_size
