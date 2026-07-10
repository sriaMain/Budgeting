from django.db import models
from django.conf import settings

class Notification(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]
    
    TYPE_CHOICES = [
        ('budget', 'Budget'),
        ('expense', 'Expense'),
        ('invoice', 'Invoice'),
        ('payment', 'Payment'),
        ('project', 'Project'),
        ('task', 'Task'),
        ('contact', 'Contact'),
        ('login', 'User Login'),
        ('system', 'System Alert'),
        ('TASK_ASSIGNED', 'Task Assigned'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        db_index=True
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='low')
    is_read = models.BooleanField(default=False, db_index=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    module_name = models.CharField(max_length=100, null=True, blank=True)
    record_id = models.IntegerField(null=True, blank=True)
    redirect_url = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} for {self.recipient.username}"
