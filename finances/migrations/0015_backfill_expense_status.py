from decimal import Decimal

from django.db import migrations
from django.db.models import Sum


def backfill(apps, schema_editor):
    Expense = apps.get_model("finances", "Expense")

    for expense in Expense.objects.all():
        paid = expense.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        if paid <= Decimal("0.00"):
            new_status = "unpaid"
        elif paid >= expense.amount:
            new_status = "paid"
        else:
            new_status = "partially_paid"
        if expense.status != new_status:
            expense.status = new_status
            expense.save(update_fields=["status"])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("finances", "0014_expense_employee_expense_notes_expense_status_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, noop_reverse),
    ]
