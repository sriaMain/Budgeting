from celery import shared_task
from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags


def _format_inr(value):
    """Indian digit grouping (lakhs/crores), e.g. 354000.00 -> "3,54,000.00" -
    matches how quoted values are conventionally written back to an Indian
    client, rather than the 1,000-grouping used internally in the PDF."""
    try:
        value = float(value)
    except (TypeError, ValueError):
        value = 0.0
    sign = '-' if value < 0 else ''
    value = abs(value)
    whole = int(value)
    paise = round((value - whole) * 100)
    if paise == 100:
        whole += 1
        paise = 0
    digits = str(whole)
    if len(digits) <= 3:
        grouped = digits
    else:
        last3, rest = digits[-3:], digits[:-3]
        pairs = []
        while len(rest) > 2:
            pairs.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            pairs.insert(0, rest)
        grouped = ','.join(pairs) + ',' + last3
    return f"{sign}{grouped}.{paise:02d}"


@shared_task
def send_quote_email(quote_id, sender_name, sender_designation='', sender_email=''):
    """Sends the quotation to the client as a PDF attachment only - no
    quotation URL/link anywhere in the body. Regenerates the PDF from the
    quote (via generate_quote_pdf, the same function the "Download PDF"
    button uses) rather than being handed pre-rendered bytes, since a Celery
    task argument has to survive JSON serialization across the broker."""
    from .models import Quote
    from .views import generate_quote_pdf, quote_reference_for

    try:
        quote = Quote.objects.select_related('client').get(pk=quote_id)
    except Quote.DoesNotExist:
        return False

    client = quote.client
    if not client or not client.email:
        return False

    quote_reference = quote_reference_for(quote)
    company_name = settings.COMPANY_NAME
    customer_name = client.company_name

    contact_lines = [sender_name]
    if sender_designation:
        contact_lines.append(sender_designation)
    contact_lines.append(company_name)
    if sender_email:
        contact_lines.append(sender_email)
    if getattr(settings, 'COMPANY_WEBSITE', ''):
        contact_lines.append(settings.COMPANY_WEBSITE)

    body = f"""Dear {customer_name},

Greetings from {company_name}.

Please find attached our quotation {quote_reference} for your review and consideration.

Quotation Details:

Quotation Reference: {quote_reference}
Quotation Date: {quote.date_of_issue.strftime('%d %b %Y')}
Valid Until: {quote.due_date.strftime('%d %b %Y')}
Total Quotation Value: {quote.currency} {_format_inr(quote.total_amount)}

The detailed quotation, including the scope of services/products, pricing, applicable taxes, and commercial details, is attached to this email as a PDF.

We request you to review the attached quotation and let us know if you require any clarification or additional information.

We look forward to the opportunity to work with you.

Regards,

{chr(10).join(contact_lines)}
"""

    subject = f"Quotation {quote_reference} – {company_name}"
    pdf_bytes = generate_quote_pdf(quote)

    email = EmailMessage(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[client.email],
    )
    email.attach(f"Quotation-{quote_reference}.pdf", pdf_bytes, "application/pdf")
    email.send(fail_silently=False)
    return True

@shared_task
def send_quotation_status_change_email(quote_id, old_status, new_status):
    """
    Send email notification when quotation status changes.
    Sends to: Client POC, Quote Author, and Project Manager (if assigned)
    """
    from .models import Quote
    
    try:
        quote = Quote.objects.select_related(
            'client', 'poc', 'author'
        ).get(pk=quote_id)
    except Quote.DoesNotExist:
        return
    
    # Collect recipients
    recipients = []
    
    # Add quote creator/author email
    if quote.author and quote.author.email:
        recipients.append(quote.author.email)
    
    # Add created_by if different from author
    if quote.created_by and quote.created_by.email and quote.created_by.email not in recipients:
        recipients.append(quote.created_by.email)
    
    # Add admin users (superusers)
    from accounts.models import Account
    admin_users = Account.objects.filter(is_superuser=True, email__isnull=False)
    for admin in admin_users:
        if admin.email and admin.email not in recipients:
            recipients.append(admin.email)
    
    if not recipients:
        return
    
    # Prepare email context
    total_amount_display = f"{quote.total_amount:.2f}".lstrip('$')

    context = {
        'quote': quote,
        'old_status': old_status,
        'new_status': new_status,
        'quote_name': quote.quote_name,
        'quote_no': quote.quote_no,
        'client_name': quote.client.company_name if quote.client else 'N/A',
        'total_amount_display': total_amount_display,
        'date_of_issue': quote.date_of_issue,
        'due_date': quote.due_date,
    }
    
    # Create subject based on status
    subject = f"Quotation #{quote.quote_no} Status Changed: {new_status}"
    
    # Render HTML email
    html_message = render_to_string('emails/quotation_status_change.html', context)
    plain_message = strip_tags(html_message)
    
    # Send email
    try:
        email = EmailMultiAlternatives(
            subject=subject,
            body=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
        )
        email.attach_alternative(html_message, "text/html")
        email.send(fail_silently=False)
    except Exception as e:
        # Log the error but don't raise to avoid breaking the main process
        print(f"Error sending quotation status change email: {str(e)}")
        return False
    
    return True