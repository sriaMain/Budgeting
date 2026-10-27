import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')

app = Celery('myproject')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Celery Beat Schedule for periodic tasks
app.conf.beat_schedule = {
    'check-running-timers-every-minute': {
        'task': 'Project.tasks.check_running_timers',
        'schedule': 60.0,  # Run every 60 seconds
    },
    # Pull employees from AIRA HRMS (replaces the old Refresh button).
    'sync-hrms-employees': {
        'task': 'hrms_integration.tasks.sync_hrms_employees',
        'schedule': float(os.environ.get('HRMS_AUTO_SYNC_EVERY_SECONDS', 900)),  # default every 15 min
    },
}