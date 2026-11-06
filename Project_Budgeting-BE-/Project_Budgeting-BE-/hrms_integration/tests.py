"""AIRA push (hrms_integration.tasks.send_push): what counts as delivered, and the push log."""
import json
from datetime import date
from unittest import mock

import requests
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from hrms_integration.models import HrmsEmployee
from hrms_integration.tasks import send_push
from Project.models import Project, ResourceAssignment

URL = "http://aira.test/api/external/project-assignments/"
KEY = "test-push-key-not-real"


def reply(code, body):
    response = requests.Response()
    response.status_code = code
    response._content = body.encode()
    return response


@override_settings(AIRA_WEBHOOK_URL=URL, AIRA_PUSH_API_KEY=KEY)
class AiraPushTests(TestCase):
    def setUp(self):
        account = get_user_model().objects.create_user(username="emp81", email="emp81@example.com", password="x")
        self.employee = HrmsEmployee.objects.create(employee_id="EMP00081", account=account)
        project = Project.objects.create(
            project_name="AIRA", project_type="internal", start_date=date(2026, 10, 29), end_date=date(2026, 12, 31),
        )
        ResourceAssignment.objects.create(
            project=project, resource_type='employee', resource_id=account.pk,
            start_date=date(2026, 10, 29), end_date=date(2026, 10, 31), cost_rate=500, working_hours=10,
        )

    def push(self, response=None, error=None):
        with mock.patch("hrms_integration.tasks.requests.post", return_value=response, side_effect=error) as post, \
                self.assertLogs("hrms_integration.tasks", level="INFO") as logs:
            result = send_push(self.employee)
        log = "\n".join(logs.output)
        self.assertNotIn(KEY, log)  # the key is never logged
        self.assertIn("EMP00081", log)
        return result, post, log

    def test_saved_when_aira_confirms_success(self):
        result, post, log = self.push(reply(200, '{"success": true, "saved": 1}'))
        self.assertEqual(result.outcome, 'sent')
        self.assertEqual(post.call_args.args[0], URL)
        self.assertEqual(post.call_args.kwargs['headers']['X-API-Key'], KEY)
        body = json.loads(post.call_args.kwargs['data'])
        self.assertEqual(body['event'], 'employee.projects_changed')
        self.assertEqual(body['employee_id'], 'EMP00081')
        self.assertEqual(len(body['projects']), 1)
        row = body['projects'][0]
        for field in ('assignment_id', 'project_id', 'project_name', 'assignment_start_date'):
            self.assertIn(field, row)
        self.assertFalse([k for k in row if 'cost' in k or 'billing' in k or 'rate' in k], row)
        self.assertIn("HTTP 200, saved", log)
        self.assertIn(URL, log)

    def test_saved_with_airas_status_success_reply(self):
        result, _, log = self.push(reply(200, json.dumps({
            "status": "success", "message": "Project assignments updated.",
            "data": {"employee_id": "10000004", "saved": 1, "changed": 0, "removed": 0, "is_matched": True},
        })))
        self.assertEqual(result.outcome, 'sent')
        self.assertIn("HTTP 200, saved", log)

    def test_200_without_success_true_is_not_saved(self):
        result, _, log = self.push(reply(200, '{"success": false}'))
        self.assertEqual(result.outcome, 'failed')
        self.assertIn("not saved", log)

    def test_no_response_is_retried_and_logged(self):
        result, _, log = self.push(error=requests.ConnectTimeout())
        self.assertEqual(result.outcome, 'retry')
        self.assertIn("no response (ConnectTimeout)", log)

    def test_server_error_is_retried(self):
        result, _, log = self.push(reply(503, 'busy'))
        self.assertEqual(result.outcome, 'retry')
        self.assertIn("HTTP 503", log)

    def test_employee_no_longer_in_aira_is_not_pushed(self):
        from hrms_integration.tasks import push_account
        HrmsEmployee.objects.filter(pk=self.employee.pk).update(is_active_in_hrms=False)
        with mock.patch("hrms_integration.tasks.requests.post") as post:
            result = push_account(self.employee.account_id)
        self.assertEqual(result.outcome, 'skipped')
        post.assert_not_called()

    def test_bad_key_is_not_retried(self):
        result, _, log = self.push(reply(401, '{"detail": "Invalid or inactive API key"}'))
        self.assertEqual(result.outcome, 'failed')
        self.assertIn("HTTP 401", log)
