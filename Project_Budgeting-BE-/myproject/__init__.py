
import ssl

try:
    ssl.create_default_context = ssl._create_unverified_context
except AttributeError:
    pass

from .celery import app as celery_app

__all__ = ('celery_app',)