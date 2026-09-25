from django.db import migrations


def seed(apps, schema_editor):
    VendorApprovalWorkflowConfig = apps.get_model("vendor_onboarding", "VendorApprovalWorkflowConfig")
    VendorApprovalLevel = apps.get_model("vendor_onboarding", "VendorApprovalLevel")

    config, created = VendorApprovalWorkflowConfig.objects.get_or_create(
        name="Default Vendor Approval Chain",
        company_code=None,
        plant=None,
        vendor_type=None,
        defaults={"is_active": True},
    )

    if created or not config.levels.exists():
        VendorApprovalLevel.objects.get_or_create(
            config=config,
            level_order=1,
            defaults={"name": "Final Approver"},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("vendor_onboarding", "0002_initial"),
    ]

    operations = [
        migrations.RunPython(seed, noop_reverse),
    ]
