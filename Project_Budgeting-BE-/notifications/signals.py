from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in
from django.utils import timezone

from Project.models import ProjectBudget, Project, Task
from product_group.models import Quote
from finances.models import Expense, Invoice, InvoicePayment
from client.models import Company
from .utils import notify_roles_or_users, create_notification

# 1. USER LOGIN
@receiver(user_logged_in)
def on_user_login(sender, request, user, **kwargs):
    title = "Successful Login"
    message = f"You logged in successfully from IP: {request.META.get('REMOTE_ADDR', 'Unknown')} at {timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC')}."
    create_notification(
        recipient=user,
        title=title,
        message=message,
        notification_type='login',
        priority='low'
    )

# 2. BUDGET CREATED / EXCEEDED
@receiver(post_save, sender=ProjectBudget)
def on_budget_save(sender, instance, created, **kwargs):
    project = instance.project
    if not project:
        return

    pm = project.project_manager

    if created:
        title = "New Budget Created"
        message = f"A new budget has been set for project: {project.project_name}. Total Budget: {instance.total_budget or 0} {instance.currency}."
        notify_roles_or_users(
            role_names=['Admin', 'Finance Manager'],
            title=title,
            message=message,
            notification_type='budget',
            priority='low',
            specific_users=[pm] if pm else None,
            module_name='Budgets',
            record_id=project.id,
            redirect_url=f'/projects/{project.id}'
        )
    else:
        # Check if budget is exceeded
        total_budget = instance.total_budget or 0
        bills_expenses = instance.bills_and_expenses or 0
        if total_budget > 0 and bills_expenses > total_budget:
            title = "Budget Limit Exceeded"
            message = f"Warning! Budget limit for project: {project.project_name} has been exceeded. Total Budget: {total_budget} {instance.currency}. Current Expenses: {bills_expenses} {instance.currency}."
            notify_roles_or_users(
                role_names=['Admin', 'Finance Manager'],
                title=title,
                message=message,
                notification_type='budget',
                priority='high',
                specific_users=[pm] if pm else None,
                module_name='Budgets',
                record_id=project.id,
                redirect_url=f'/projects/{project.id}'
            )

# 3. BUDGET APPROVAL / REJECTION (via Quote status)
@receiver(pre_save, sender=Quote)
def on_quote_pre_save(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Quote.objects.get(pk=instance.pk)
            instance._old_status = old.status
        except Quote.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None

@receiver(post_save, sender=Quote)
def on_quote_post_save(sender, instance, created, **kwargs):
    if created:
        title = "Quote Created"
        message = f"A new quote '{instance.quote_name}' (Quote No: {instance.quote_no}) has been created."
        notify_roles_or_users(
            role_names=['Admin', 'Finance Manager'],
            title=title,
            message=message,
            notification_type='quote',
            priority='low',
            specific_users=[instance.author] if instance.author else None,
            module_name='Pipeline',
            record_id=instance.quote_no,
            redirect_url=f'/pipeline/quote/{instance.quote_no}'
        )

    old_status = getattr(instance, '_old_status', None)
    if old_status != instance.status:
        # If quote is Confirmed (Approved)
        if instance.status == 'Confirmed':
            title = "Budget Quotation Approved"
            message = f"The budget quotation '{instance.quote_name}' (Quote No: {instance.quote_no}) has been APPROVED."
            notify_roles_or_users(
                role_names=['Admin', 'Finance Manager'],
                title=title,
                message=message,
                notification_type='quote',
                priority='medium',
                specific_users=[instance.author] if instance.author else None,
                module_name='Pipeline',
                record_id=instance.quote_no,
                redirect_url=f'/pipeline/quote/{instance.quote_no}'
            )
        # If quote is Rejected
        elif instance.status == 'Rejected':
            title = "Budget Quotation Rejected"
            message = f"The budget quotation '{instance.quote_name}' (Quote No: {instance.quote_no}) has been REJECTED."
            notify_roles_or_users(
                role_names=['Admin', 'Finance Manager'],
                title=title,
                message=message,
                notification_type='quote',
                priority='medium',
                specific_users=[instance.author] if instance.author else None,
                module_name='Pipeline',
                record_id=instance.quote_no,
                redirect_url=f'/pipeline/quote/{instance.quote_no}'
            )

# 4. EXPENSE ADDED / APPROVED
@receiver(pre_save, sender=Expense)
def on_expense_pre_save(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Expense.objects.get(pk=instance.pk)
            instance._old_status = old.status
        except Expense.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None

@receiver(post_save, sender=Expense)
def on_expense_post_save(sender, instance, created, **kwargs):
    project = instance.project
    pm = project.project_manager if (project and project.project_manager) else None

    if created:
        title = "New Expense Added"
        message = f"A new expense '{instance.description[:40]}' of amount {instance.amount} {project.currency if project else 'INR'} has been logged."
        notify_roles_or_users(
            role_names=['Admin', 'Finance Manager'],
            title=title,
            message=message,
            notification_type='expense',
            priority='low',
            exclude_user=instance.created_by,
            specific_users=[pm] if pm else None
        )
    else:
        old_status = getattr(instance, '_old_status', None)
        if old_status == 'pending' and instance.status == 'approved':
            title = "Expense Request Approved"
            message = f"Your expense request '{instance.description[:40]}' (No: {instance.expense_no}) of amount {instance.amount} {project.currency if project else 'INR'} has been APPROVED."
            notify_roles_or_users(
                role_names=['Admin', 'Finance Manager'],
                title=title,
                message=message,
                notification_type='expense',
                priority='medium',
                specific_users=[instance.created_by, pm]
            )

# 5. INVOICE CREATED / PAID / OVERDUE
@receiver(pre_save, sender=Invoice)
def on_invoice_pre_save(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Invoice.objects.get(pk=instance.pk)
            instance._old_status = old.status
        except Invoice.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None

@receiver(post_save, sender=Invoice)
def on_invoice_post_save(sender, instance, created, **kwargs):
    project = instance.project
    pm = project.project_manager if (project and project.project_manager) else None

    if created:
        title = "New Invoice Created"
        message = f"A new invoice '{instance.invoice_no}' of amount {instance.total_amount} {instance.quote.currency if (instance.quote and instance.quote.currency) else 'INR'} has been created."
        notify_roles_or_users(
            role_names=['Admin', 'Finance Manager'],
            title=title,
            message=message,
            notification_type='invoice',
            priority='low',
            specific_users=[pm] if pm else None,
            module_name='Reports',
            record_id=instance.id,
            redirect_url=f'/invoices/{instance.id}'
        )
    else:
        old_status = getattr(instance, '_old_status', None)
        if old_status != instance.status:
            if instance.status == 'Paid':
                title = "Invoice Fully Paid"
                message = f"Invoice '{instance.invoice_no}' of amount {instance.total_amount} has been fully PAID."
                notify_roles_or_users(
                    role_names=['Admin', 'Finance Manager'],
                    title=title,
                    message=message,
                    notification_type='invoice',
                    priority='medium',
                    specific_users=[pm] if pm else None,
                    module_name='Reports',
                    record_id=instance.id,
                    redirect_url=f'/invoices/{instance.id}'
                )
            elif instance.status == 'Overdue':
                title = "Invoice OVERDUE"
                message = f"Warning! Invoice '{instance.invoice_no}' of amount {instance.total_amount} is OVERDUE (Due date: {instance.due_date})."
                notify_roles_or_users(
                    role_names=['Admin', 'Finance Manager'],
                    title=title,
                    message=message,
                    notification_type='invoice',
                    priority='high',
                    specific_users=[pm] if pm else None,
                    module_name='Reports',
                    record_id=instance.id,
                    redirect_url=f'/invoices/{instance.id}'
                )

# 6. PAYMENT RECEIVED
@receiver(post_save, sender=InvoicePayment)
def on_payment_save(sender, instance, created, **kwargs):
    if created:
        invoice = instance.invoice
        if not invoice:
            return
        project = invoice.project
        pm = project.project_manager if (project and project.project_manager) else None

        title = "Payment Received"
        message = f"Payment of {instance.amount} received for Invoice '{invoice.invoice_no}'. Project: {project.project_name if project else 'None'}."
        notify_roles_or_users(
            role_names=['Admin', 'Finance Manager'],
            title=title,
            message=message,
            notification_type='payment',
            priority='medium',
            specific_users=[pm] if pm else None,
            module_name='Reports',
            record_id=invoice.id,
            redirect_url=f'/invoices/{invoice.id}'
        )

# 7. PROJECT CREATED / UPDATED / COMPLETED
@receiver(pre_save, sender=Project)
def on_project_pre_save(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Project.objects.get(pk=instance.pk)
            instance._old_status = old.status
            instance._old_manager_id = old.project_manager_id
        except Project.DoesNotExist:
            instance._old_status = None
            instance._old_manager_id = None
    else:
        instance._old_status = None
        instance._old_manager_id = None

@receiver(post_save, sender=Project)
def on_project_post_save(sender, instance, created, **kwargs):
    pm = instance.project_manager

    if created:
        title = "New Project Created"
        message = f"Project '{instance.project_name}' has been created and assigned to manager: {pm.get_full_name() if pm else 'None'}."
        notify_roles_or_users(
            role_names=['Admin', 'Finance Manager'],
            title=title,
            message=message,
            notification_type='project',
            priority='medium',
            specific_users=[pm] if pm else None,
            module_name='Projects',
            record_id=instance.id,
            redirect_url=f'/projects/{instance.id}'
        )
    else:
        old_status = getattr(instance, '_old_status', None)
        old_manager_id = getattr(instance, '_old_manager_id', None)

        # 1. Project Completed (status transitions to deployed)
        if old_status != instance.status and instance.status == 'deployed':
            title = "Project Completed"
            message = f"Congratulations! Project '{instance.project_name}' has been successfully completed and deployed."
            notify_roles_or_users(
                role_names=['Admin', 'Finance Manager'],
                title=title,
                message=message,
                notification_type='project',
                priority='high',
                specific_users=[pm] if pm else None,
                module_name='Projects',
                record_id=instance.id,
                redirect_url=f'/projects/{instance.id}'
            )
        # 2. Project Manager Changed
        elif old_manager_id != instance.project_manager_id:
            title = "Project Manager Assigned"
            message = f"You have been assigned as the Project Manager for project: '{instance.project_name}'."
            if pm:
                create_notification(
                    recipient=pm,
                    title=title,
                    message=message,
                    notification_type='project',
                    priority='medium',
                    module_name='Projects',
                    record_id=instance.id,
                    redirect_url=f'/projects/{instance.id}'
                )
        # 3. General Update
        else:
            title = "Project Details Updated"
            message = f"Project details for '{instance.project_name}' have been updated."
            notify_roles_or_users(
                role_names=['Admin', 'Finance Manager'],
                title=title,
                message=message,
                notification_type='project',
                priority='low',
                specific_users=[pm] if pm else None,
                module_name='Projects',
                record_id=instance.id,
                redirect_url=f'/projects/{instance.id}'
            )

# 8. TASK ASSIGNED / COMPLETED
@receiver(pre_save, sender=Task)
def on_task_pre_save(sender, instance, **kwargs):
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            instance._old_status = old.status
            instance._old_assigned_to_id = old.assigned_to_id
        except Task.DoesNotExist:
            instance._old_status = None
            instance._old_assigned_to_id = None
    else:
        instance._old_status = None
        instance._old_assigned_to_id = None

@receiver(post_save, sender=Task)
def on_task_post_save(sender, instance, created, **kwargs):
    project = instance.project
    pm = project.project_manager if (project and project.project_manager) else None
    assignee = instance.assigned_to

    if created:
        if assignee:
            title = "New Task Assigned"
            message = f"You have been assigned to task: '{instance.title}' in project: '{project.project_name if project else 'None'}'."
            create_notification(
                recipient=assignee,
                title=title,
                message=message,
                notification_type='task',
                priority='medium',
                module_name='Tasks',
                record_id=instance.id,
                redirect_url='/task-management'
            )
    else:
        old_status = getattr(instance, '_old_status', None)
        old_assigned_to_id = getattr(instance, '_old_assigned_to_id', None)

        # 1. Task Completed
        if old_status != instance.status and instance.status == 'completed':
            title = "Task Completed"
            message = f"Task '{instance.title}' has been marked as COMPLETED by assignee."
            notify_roles_or_users(
                role_names=['Admin'],
                title=title,
                message=message,
                notification_type='task',
                priority='low',
                specific_users=[pm, instance.created_by] if pm or instance.created_by else None,
                module_name='Tasks',
                record_id=instance.id,
                redirect_url='/task-management'
            )
        # 2. Assignment Changed
        elif old_assigned_to_id != instance.assigned_to_id and assignee:
            title = "New Task Assigned"
            message = f"You have been assigned to task: '{instance.title}' in project: '{project.project_name if project else 'None'}'."
            create_notification(
                recipient=assignee,
                title=title,
                message=message,
                notification_type='task',
                priority='medium',
                module_name='Tasks',
                record_id=instance.id,
                redirect_url='/task-management'
            )

# 9. CONTACT CREATED
@receiver(post_save, sender=Company)
def on_contact_save(sender, instance, created, **kwargs):
    if created:
        title = "New Contact Added"
        message = f"A new contact/company '{instance.company_name}' has been created."
        notify_roles_or_users(
            role_names=['Admin', 'Finance Manager', 'Project Manager'],
            title=title,
            message=message,
            notification_type='contact',
            priority='low',
            module_name='Contacts',
            record_id=instance.id,
            redirect_url='/contacts'
        )
