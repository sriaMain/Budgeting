from rest_framework import serializers
from .models import CallCenter, ProfitCenter, GLAccount, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "category", "title", "message", "link", "is_read", "created_at"]


class CallCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallCenter
        fields = ["id", "code", "name", "is_active", "created_at", "updated_at"]


class ProfitCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfitCenter
        fields = ["id", "code", "name", "is_active", "created_at", "updated_at"]


class GLAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = GLAccount
        fields = [
            "id",
            "code",
            "name",
            "account_type",
            "odoo_account_id",
            "is_active",
            "created_at",
            "updated_at",
        ]
