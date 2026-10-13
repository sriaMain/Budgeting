"""Rate limits for the token-only vendor self-service portal.

The shared settings scope `vendor_public` (60/hour per IP) was sized for a handful of calls,
but a normal onboarding session - load, a save per wizard step, ~10 document uploads, submit -
needs 40+ requests, so vendors were hitting 429s half-way through. The portal now saves a
whole step in ONE request (the /sections/ endpoint) and uses its own scope, whose rates live
here because settings.py is shared.
"""
from django.core.cache import cache
from rest_framework.throttling import ScopedRateThrottle


class VendorPortalThrottle(ScopedRateThrottle):
    """Per-IP (anonymous) limit keyed by the view's `throttle_scope`."""

    RATES = {
        # Reads + step saves + submit. Tokens are 256-bit random, so this limit is about load,
        # not about guessing links.
        "vendor_portal": "600/hour",
    }

    def get_rate(self):
        return self.RATES.get(self.scope) or super().get_rate()


def throttles_available():
    """The throttle keeps its history in the cache (Redis); an outage must not take the portal down."""
    try:
        cache.get("throttle-healthcheck")
    except Exception:  # noqa: BLE001 - any cache backend error
        return False
    return True
