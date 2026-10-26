from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('Project', '0028_tm_monthly_periods'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='start_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]