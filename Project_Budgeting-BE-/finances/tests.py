from decimal import Decimal
import datetime
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken

from Project.models import Project, Task, ProjectBudget
from finances.models import Invoice, VendorBill, PurchaseOrder, OutgoingPayment, Expense, ExpensePayment
from product_group.models import Quote, Product_Services
from accounts.models import Vendor
from roles.models import Role, Permission, PermissionCategory

User = get_user_model()

class DatabaseIntegrityAndValidationTests(APITestCase):

    def setUp(self):
        # Create roles
        self.admin_role, _ = Role.objects.get_or_create(role_name="Admin", defaults={"is_active": True})
        self.employee_role, _ = Role.objects.get_or_create(role_name="Employee", defaults={"is_active": True})

        # Create users
        self.admin_user = User.objects.create_superuser(
            username="adminuser",
            email="admin@example.com",
            password="password123",
            first_name="Admin",
            last_name="User"
        )
        self.admin_user.roles.add(self.admin_role)

        self.regular_user = User.objects.create_user(
            username="regularuser",
            email="regular@example.com",
            password="password123",
            first_name="Regular",
            last_name="User"
        )
        self.regular_user.roles.add(self.employee_role)

        # Clear permission cache to force reload
        self.admin_user.clear_permission_cache()
        self.regular_user.clear_permission_cache()

        # Create quote first
        self.quote = Quote.objects.create(
            quote_name="Test Quote",
            status="Confirmed",
            date_of_issue=datetime.date(2026, 7, 6),
            due_date=datetime.date(2026, 8, 6)
        )

        # Create project and link quote
        self.project = Project.objects.create(
            project_name="Test Project",
            status="planning",
            project_type="internal",
            project_manager=self.admin_user,
            start_date=datetime.date(2026, 7, 6),
            end_date=datetime.date(2026, 8, 6),
            created_from_quotation=self.quote
        )

        self.vendor = Vendor.objects.create(
            name="Test Vendor",
            vendor_type="company",
            email="vendor@example.com",
            phone="1234567890"
        )

        # Generate tokens
        self.admin_token = str(AccessToken.for_user(self.admin_user))
        self.regular_token = str(AccessToken.for_user(self.regular_user))

    def test_task_uniqueness_constraint(self):
        # Create first task
        Task.objects.create(
            project=self.project,
            title="Unique Task Title",
            allocated_hours=Decimal("10.00")
        )

        # Attempt to create duplicate task inside the same project
        with self.assertRaises(IntegrityError):
            Task.objects.create(
                project=self.project,
                title="Unique Task Title",
                allocated_hours=Decimal("5.00")
            )

    def test_negative_values_blocked(self):
        # ProjectBudget negative budget validation
        budget = ProjectBudget(
            project=self.project,
            total_budget=Decimal("-100.00")
        )
        with self.assertRaises(ValidationError):
            budget.full_clean()

        # VendorBill negative total amount validation
        bill = VendorBill(
            vendor=self.vendor,
            purchase_order=PurchaseOrder.objects.create(
                po_no="PO-TEMP",
                vendor=self.vendor,
                quote=self.quote,
                project=self.project
            ),
            bill_no="BILL-TEST",
            bill_date="2026-07-06",
            due_date="2026-08-06",
            total_amount=Decimal("-500.00")
        )
        with self.assertRaises(ValidationError):
            bill.full_clean()

    def test_role_based_access_control_roles(self):
        url = "/api/roles/roles/"
        
        # Regular user should be forbidden
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.regular_token}")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Admin user should succeed
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.admin_token}")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_purchase_order_transaction_rollback_safety(self):
        url = "/api/purchase-orders/"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.admin_token}")
        
        po_count_before = PurchaseOrder.objects.count()
        
        data = {
            "quote_no": str(self.quote.quote_no),
            "vendor_id": self.vendor.id,
            "items": [
                {
                    "quote_item_id": 9999, # invalid item
                    "quantity": 0 # invalid quantity
                }
            ]
        }
        
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Check that NO PurchaseOrder was created in the database due to rollback
        po_count_after = PurchaseOrder.objects.count()
        self.assertEqual(po_count_before, po_count_after)

    def test_soft_deletion_records(self):
        po = PurchaseOrder.objects.create(
            po_no="PO-SOFT-DELETE",
            vendor=self.vendor,
            quote=self.quote,
            project=self.project
        )
        
        po.delete()
        
        # Default query manager should NOT show soft deleted records
        self.assertFalse(PurchaseOrder.objects.filter(id=po.id).exists())
        
        # all_objects manager should show soft deleted records
        self.assertTrue(PurchaseOrder.all_objects.filter(id=po.id).exists())
        self.assertTrue(PurchaseOrder.all_objects.get(id=po.id).is_deleted)
