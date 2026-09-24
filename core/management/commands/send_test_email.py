"""
Safe, one-off way to confirm the active EMAIL_BACKEND (SMTP, once
EMAIL_HOST_USER/EMAIL_HOST_PASSWORD are set) can actually deliver, without
touching any business-logic call site.

Usage:
    python manage.py send_test_email --to someone@example.com
    python manage.py send_test_email --to someone@example.com --from "Name <user@gmail.com>"
"""

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Send a one-off test email through the configured EMAIL_BACKEND."

    def add_arguments(self, parser):
        parser.add_argument("--to", required=True, help="Recipient email address.")
        parser.add_argument(
            "--from",
            dest="from_email",
            default=None,
            help="Override the From address (defaults to settings.DEFAULT_FROM_EMAIL).",
        )

    def handle(self, *args, **options):
        recipient = options["to"]
        from_email = options["from_email"] or settings.DEFAULT_FROM_EMAIL

        html = (
            "<p>This is a test email confirming the application's configured "
            f"<code>EMAIL_BACKEND</code> ({settings.EMAIL_BACKEND}) can deliver mail.</p>"
        )
        email = EmailMultiAlternatives(
            subject="Test email",
            body="This is a test email confirming the configured EMAIL_BACKEND can deliver mail.",
            from_email=from_email,
            to=[recipient],
        )
        email.attach_alternative(html, "text/html")

        try:
            email.send(fail_silently=False)
        except Exception as exc:
            raise CommandError(f"Send failed: {exc}") from exc

        self.stdout.write(self.style.SUCCESS(f"Test email sent to {recipient} via {settings.EMAIL_BACKEND}"))
