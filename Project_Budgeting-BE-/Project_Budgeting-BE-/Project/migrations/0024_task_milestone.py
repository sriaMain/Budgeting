import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Project", "0023_project_project_amount_project_project_percentage_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="milestone",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="tasks",
                to="Project.milestone",
            ),
        ),
    ]
