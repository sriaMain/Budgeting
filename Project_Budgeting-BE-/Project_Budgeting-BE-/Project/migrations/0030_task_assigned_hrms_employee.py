from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hrms_integration', '0001_initial'),
        ('Project', '0029_task_start_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='assigned_hrms_employee',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='assigned_tasks', to='hrms_integration.hrmsemployee'),
        ),
    ]