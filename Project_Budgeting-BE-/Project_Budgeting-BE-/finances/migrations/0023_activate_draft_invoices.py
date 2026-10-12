from decimal import Decimal

from django.db import migrations
from django.utils import timezone


def activate_drafts(apps, schema_editor):
    """Draft was never a real workflow step - milestone/T&M invoices and edited
    invoices were simply saved as Draft while already active. Give each one the
    status Invoice.update_status() would derive (amounts are left untouched)."""
    Invoice = apps.get_model("finances", "Invoice")
    today = timezone.now().date()
    zero = Decimal("0.00")

    for invoice in Invoice.objects.filter(status="Draft").only("id", "due_date", "paid_amount", "balance_amount"):
        if invoice.balance_amount <= zero:
            new_status = "Paid"
        elif invoice.paid_amount > zero:
            new_status = "Overdue" if invoice.due_date < today else "Partially Paid"
        elif invoice.due_date < today:
            new_status = "Overdue"
        else:
            new_status = "Issued"
        Invoice.objects.filter(pk=invoice.pk).update(status=new_status)


class Migration(migrations.Migration):
    dependencies = [
        ("finances", "0022_payment_confirm_permission"),
    ]

    operations = [
        # Not reversible in a meaningful way (which rows were Draft isn't kept).
        migrations.RunPython(activate_drafts, migrations.RunPython.noop),
    ]
