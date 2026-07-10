from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

def create_notification(recipient, title, message, notification_type, priority='low', module_name=None, record_id=None, redirect_url=None):
    """
    Creates a Notification database record and broadcasts it over WebSockets.
    """
    from notifications.models import Notification
    from notifications.serializers import NotificationSerializer

    notification = Notification.objects.create(
        recipient=recipient,
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        module_name=module_name,
        record_id=record_id,
        redirect_url=redirect_url
    )

    # WebSocket Broadcast via Django Channels
    channel_layer = get_channel_layer()
    if channel_layer:
        data = NotificationSerializer(notification).data
        async_to_sync(channel_layer.group_send)(
            f"user_{recipient.id}",
            {
                "type": "notification_event",
                "data": {
                    "event": "NEW_NOTIFICATION",
                    "notification": data
                }
            }
        )
    return notification

def notify_roles_or_users(role_names, title, message, notification_type, priority='low', exclude_user=None, specific_users=None, module_name=None, record_id=None, redirect_url=None):
    """
    Creates notifications for users associated with specific roles, plus any specific users.
    """
    from accounts.models import Account
    from django.db.models import Q

    recipients = set()

    # Query role-based users
    if role_names:
        # We query accounts that are superusers or match any of the given roles
        users = Account.objects.filter(
            Q(roles__role_name__in=role_names) | Q(is_superuser=True)
        ).distinct()
        for u in users:
            recipients.add(u)

    # Add any explicitly supplied users
    if specific_users:
        for u in specific_users:
            if u:
                recipients.add(u)

    # Exclude user who performed the trigger action
    for recipient in recipients:
        if exclude_user and recipient.id == exclude_user.id:
            continue
        create_notification(recipient, title, message, notification_type, priority, module_name=module_name, record_id=record_id, redirect_url=redirect_url)
