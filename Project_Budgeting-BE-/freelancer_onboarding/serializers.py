from rest_framework import serializers

from .models import Freelancer, FreelancerDocument


class FreelancerInviteSerializer(serializers.Serializer):
    """Used by the admin's 'Invite Freelancer' action - only the bare minimum
    needed to send the invite. Everything else is filled in by the freelancer
    themselves via the secure link."""
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()


EDITABLE_FIELDS = (
    "full_name", "email", "phone", "location",
    "professional_title", "skills", "years_of_experience", "portfolio_url", "linkedin_url",
    "availability", "preferred_start_date",
    "payment_method", "currency", "rate",
)


class FreelancerSerializer(serializers.ModelSerializer):
    """Read representation used for both the admin list/detail views and the
    public portal - status/timestamps are read-only, changed only via the
    dedicated invite/submit/resend actions."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS + (
            "id", "status", "last_saved_step", "created_at", "updated_at",
        )
        read_only_fields = ("id", "status", "created_at", "updated_at")


class FreelancerManualCreateSerializer(serializers.ModelSerializer):
    """'Add Manually' - an internal user fills the whole profile directly, so
    it's immediately usable (status='active') with no invitation/onboarding
    step needed."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS

    def create(self, validated_data):
        validated_data["status"] = "active"
        validated_data["created_by"] = self.context.get("request").user
        return super().create(validated_data)


class FreelancerAdminUpdateSerializer(serializers.ModelSerializer):
    """Admin 'Edit' action on an existing freelancer record."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS
        extra_kwargs = {"full_name": {"required": False}, "email": {"required": False}}


class FreelancerPublicUpdateSerializer(serializers.ModelSerializer):
    """Public 'Save & Continue' - every field optional so any subset of the
    form can be patched as the freelancer moves through the steps."""

    class Meta:
        model = Freelancer
        fields = EDITABLE_FIELDS + ("last_saved_step",)
        extra_kwargs = {
            "full_name": {"required": False},
            "email": {"required": False},
        }


class FreelancerDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FreelancerDocument
        fields = (
            "id", "freelancer", "file", "file_name", "file_size", "file_type",
            "category", "uploaded_by", "uploaded_at",
        )
        read_only_fields = ("uploaded_by", "uploaded_at", "file_name", "file_size", "file_type")

    def create(self, validated_data):
        request = self.context.get("request")
        file = validated_data["file"]

        validated_data["file_name"] = file.name
        validated_data["file_size"] = file.size
        validated_data["file_type"] = file.content_type or ""

        user = getattr(request, "user", None) if request else None
        if user is not None and user.is_authenticated:
            validated_data["uploaded_by"] = user

        return super().create(validated_data)
