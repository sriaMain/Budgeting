from django.test import TestCase
from roles.models import Permission, PermissionCategory, Role
from roles.serializers import RoleDetailSerializer, RoleListSerializer


class RolePermissionSerializationTests(TestCase):
	def setUp(self):
		category = PermissionCategory.objects.create(permission_category_name="Test")
		self.active_permission = Permission.objects.create(
			code="test.active",
			label="Active permission",
			category=category,
			is_active=True,
		)
		self.inactive_permission = Permission.objects.create(
			code="test.inactive",
			label="Inactive permission",
			category=category,
			is_active=False,
		)
		self.role = Role.objects.create(role_name="Test role")
		self.role.permissions.add(self.active_permission, self.inactive_permission)

	def test_role_list_excludes_inactive_permissions(self):
		data = RoleListSerializer(self.role).data

		self.assertEqual(
			[permission["id"] for permission in data["permissions"]],
			[self.active_permission.id],
		)

	def test_role_detail_excludes_inactive_permissions(self):
		data = RoleDetailSerializer(self.role).data

		self.assertEqual(
			[permission["id"] for permission in data["permissions"]],
			[self.active_permission.id],
		)
