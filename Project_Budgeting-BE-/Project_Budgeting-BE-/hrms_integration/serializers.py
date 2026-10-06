from decimal import Decimal

from rest_framework import serializers

from core.app_constants import CURRENCY_CHOICES

from .models import HrmsEmployee, HrmsSyncRun


class HrmsEmployeeSerializer(serializers.ModelSerializer):
    account_id = serializers.IntegerField(source='account.id', read_only=True, default=None)
    account_is_active = serializers.BooleanField(source='account.is_active', read_only=True, default=False)
    roles = serializers.SerializerMethodField()
    # Budgeting-only fields HRMS doesn't have - set by the admin when granting access.
    modules = serializers.SerializerMethodField()
    charges_per_hour = serializers.DecimalField(
        source='account.charges_per_hour', max_digits=10, decimal_places=2, read_only=True, default=None,
    )
    currency = serializers.CharField(source='account.currency', read_only=True, default=None)
    access_granted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HrmsEmployee
        fields = [
            'id', 'employee_id', 'full_name', 'email', 'department', 'designation',
            'hrms_role', 'branch', 'is_active_in_hrms', 'first_seen_at', 'last_seen_at',
            'removed_from_hrms_at', 'is_eligible', 'account_id', 'account_is_active', 'roles',
            'modules', 'charges_per_hour', 'currency', 'access_granted_at', 'access_granted_by_name', 'access_revoked_at', 'access_revoked_reason',
        ]

    def get_roles(self, obj):
        if obj.account is None:
            return []
        return [{'id': r.id, 'role_name': r.role_name} for r in obj.account.roles.all()]

    def get_modules(self, obj):
        if obj.account is None:
            return []
        return [{'id': m.id, 'product_service_name': m.product_service_name} for m in obj.account.modules.all()]

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
    # Same rules as Manage Users: every user needs a module and an hourly cost rate,
    # otherwise their logged time is costed at zero on projects.
    modules = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=False,
        error_messages={'empty': 'Select a module.'},
    )
    charges_per_hour = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0'))
    currency = serializers.ChoiceField(choices=CURRENCY_CHOICES, required=False, default='INR')
