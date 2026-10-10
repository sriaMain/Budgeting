import django.db.models.deletion
from django.db import migrations, models


def backfill_project(apps, schema_editor):
    VendorBill = apps.get_model("finances", "VendorBill")
    for bill in VendorBill.objects.filter(project__isnull=True, purchase_order__isnull=False).select_related("purchase_order"):
        bill.project_id = bill.purchase_order.project_id
        bill.save(update_fields=["project"])


def backfill_balance(apps, schema_editor):
    # balance_amount was never persisted after a payment before this fix.
    VendorBill = apps.get_model("finances", "VendorBill")
    VendorBill.objects.update(balance_amount=models.F("total_amount") - models.F("paid_amount"))


class Migration(migrations.Migration):

    dependencies = [
        ("Project", "0024_task_milestone"),
        ("finances", "0017_grant_admin_financial_audit_log_permission"),
    ]

    operations = [
        migrations.AlterField(
            model_name="vendorbill",
            name="purchase_order",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                to="finances.purchaseorder",
            ),
        ),
        migrations.AddField(
            model_name="vendorbill",
            name="project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="vendor_bills",
                to="Project.project",
            ),
        ),
        migrations.AddField(
            model_name="vendorbill",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.RunPython(backfill_project, migrations.RunPython.noop),
        migrations.RunPython(backfill_balance, migrations.RunPython.noop),
    ]
