from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from .models import Permission, PermissionCategory, Role


# These names must match roles.views. Keeping the key here explicit avoids a
# views import during Django app startup and fixes the old key mismatch.
ROLES_ACTIVE_CACHE_KEY = "roles_list_active_v2"
PERMISSION_TREE_CACHE_KEY = "permission_tree_v2"


def clear_rbac_catalog_caches():
    """Invalidate every response whose embedded permission IDs may be stale."""
    try:
        cache.delete_many([ROLES_ACTIVE_CACHE_KEY, PERMISSION_TREE_CACHE_KEY])
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"RBAC cache invalidation failed: {e}")


@receiver(post_save, sender=Role)
@receiver(post_delete, sender=Role)
def clear_roles_cache(sender, **kwargs):
    clear_rbac_catalog_caches()


@receiver(post_save, sender=Permission)
@receiver(post_delete, sender=Permission)
@receiver(post_save, sender=PermissionCategory)
@receiver(post_delete, sender=PermissionCategory)
def clear_permission_catalog_cache(sender, **kwargs):
    clear_rbac_catalog_caches()