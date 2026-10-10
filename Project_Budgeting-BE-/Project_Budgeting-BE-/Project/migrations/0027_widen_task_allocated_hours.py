from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Project", "0026_resourceassignment_external_name_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="task",
            name="allocated_hours",
            field=models.DecimalField(decimal_places=2, max_digits=10),
        ),
        migrations.AlterField(
            model_name="taskextrahoursrequest",
            name="previous_allocated_hours",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AlterField(
            model_name="taskextrahoursrequest",
            name="approved_allocated_hours",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
    ]
