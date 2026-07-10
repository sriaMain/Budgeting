import jwt
from django.conf import settings
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from accounts.models import Account

class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query_string = self.scope.get("query_string", b"").decode()
        token = None

        if "token=" in query_string:
            token = query_string.split("token=")[-1].split("&")[0]

        if not token:
            await self.close(code=4001)
            return

        try:
            # Decode JWT token to authenticate connection
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = payload.get("user_id")
            self.user = await Account.objects.aget(id=user_id)
        except Exception:
            await self.close(code=4001)
            return

        self.group_name = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notification_event(self, event):
        """
        Invoked when a message is sent to the group.
        Relays the notification payload over the WebSocket channel.
        """
        await self.send_json(event.get("data", event))
