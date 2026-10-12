import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


STATUS_CHOICES = [
    ("Pending", "Pending Confirmation"),
    ("Processing", "Processing"),
    ("Completed", "Completed"),
    ("Failed", "Failed"),
    ("Cancelled", "Cancelled"),
]


class Migration(migrations.Migration):
    """Adds a lifecycle status to invoice payments.

    Every payment recorded before this migration was already counted as
    received, so existing rows are added as Completed (the AddField default)
    and invoice paid/balance amounts don't change. New payments then default
    to Pending until someone confirms them.
    """

    dependencies = [
        ("finances", "0020_invoice_billing_period"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="invoicepayment",
            name="status",
            field=models.CharField(choices=STATUS_CHOICES, db_index=True, default="Completed", max_length=20),
        ),
        migrations.AlterField(
            model_name="invoicepayment",
            name="status",
            field=models.CharField(choices=STATUS_CHOICES, db_index=True, default="Pending", max_length=20),
        ),
        migrations.AddField(
            model_name="invoicepayment",
            name="status_note",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="invoicepayment",
            name="status_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="invoicepayment",
            name="status_updated_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invoice_payment_status_updates",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
