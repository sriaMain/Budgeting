"""Push AIRA employees' project lists to AIRA now and print what was sent and AIRA's reply.

    python manage.py aira_push EMP00081            # real push of one employee: body + AIRA's response
    python manage.py aira_push EMP00081 --dry-run  # only print the body
    python manage.py aira_push --all               # catch-up: every AIRA employee on any project
"""
import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from hrms_integration.models import HrmsEmployee
from hrms_integration.tasks import push_configured, render_push, send_push
from Project.models import ResourceAssignment


class Command(BaseCommand):
    help = "Push AIRA employees' complete project lists to AIRA and show the body and AIRA's response."

    def add_arguments(self, parser):
        parser.add_argument('employee_id', nargs='?', help="AIRA employee_id, e.g. EMP00081")
        parser.add_argument('--all', action='store_true',
                            help="Push every AIRA employee who is on any project (one-time catch-up).")
        parser.add_argument('--dry-run', action='store_true', help="Print the body without sending it.")

    def handle(self, employee_id, all, dry_run, **options):
        if bool(employee_id) == all:
            raise CommandError("Give one employee_id, or --all.")
        if all:
            account_ids = ResourceAssignment.objects.filter(resource_type='employee', is_active=True) \
                .values_list('resource_id', flat=True)
            employees = list(HrmsEmployee.objects.filter(account_id__in=account_ids).order_by('employee_id'))
        else:
            employees = list(HrmsEmployee.objects.filter(employee_id=employee_id))
            if not employees:
                raise CommandError(f"{employee_id} is not an AIRA employee synced into Project Budgeting.")

        if dry_run:
            for employee in employees:
                self.stdout.write(json.dumps(json.loads(render_push(employee)), indent=2))
            return
        if not push_configured():
            raise CommandError("Set AIRA_WEBHOOK_URL and AIRA_PUSH_API_KEY in .env first.")

        self.stdout.write(f"POST {settings.AIRA_WEBHOOK_URL}")
        for employee in employees:
            result = send_push(employee)
            if all:
                self.stdout.write(f"{employee.employee_id}: {result.outcome} ({result.detail})")
                continue
            self.stdout.write(json.dumps(json.loads(result.payload), indent=2))
            if result.response is None:
                self.stdout.write(f"No response from AIRA: {result.detail}")
            else:
                self.stdout.write(f"AIRA response: HTTP {result.response.status_code}")
                self.stdout.write(result.response.text)
            self.stdout.write(f"Outcome: {result.outcome}")
