from rest_framework import serializers

from .models import HrmsEmployee, HrmsSyncRun


class HrmsEmployeeSerializer(serializers.ModelSerializer):
    account_id = serializers.IntegerField(source='account.id', read_only=True, default=None)
    account_is_active = serializers.BooleanField(source='account.is_active', read_only=True, default=False)
    roles = serializers.SerializerMethodField()
    access_granted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HrmsEmployee
        fields = [
            'id', 'employee_id', 'full_name', 'email', 'department', 'designation',
            'hrms_role', 'branch', 'is_active_in_hrms', 'first_seen_at', 'last_seen_at',
            'removed_from_hrms_at', 'is_eligible', 'account_id', 'account_is_active', 'roles',
            'access_granted_at', 'access_granted_by_name', 'access_revoked_at', 'access_revoked_reason',
        ]

    def get_roles(self, obj):
        if obj.account is None:
            return []
        return [{'id': r.id, 'role_name': r.role_name} for r in obj.account.roles.all()]

    def get_access_granted_by_name(self, obj):
        user = obj.access_granted_by
        return (user.get_full_name() or user.username) if user else None


class HrmsSyncRunSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HrmsSyncRun
        fields = [
            'id', 'status', 'triggered_by_name', 'started_at', 'finished_at', 'fetched_count',
            'created_count', 'updated_count', 'returned_count', 'removed_count',
            'access_revoked_count', 'error_message',
        ]

    def get_triggered_by_name(self, obj):
        user = obj.triggered_by
        return (user.get_full_name() or user.username) if user else None


class GrantAccessSerializer(serializers.Serializer):
    roles = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
