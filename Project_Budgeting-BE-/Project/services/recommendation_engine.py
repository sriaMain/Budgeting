from django.db.models import Count, Q
from accounts.models import Account
from product_group.models import ProductGroup
from utils.scoring import apply_scoring


class UserRecommendationEngine:

    def __init__(self, project):
        self.project = project
        self.quote = project.quote

    # ------------------------------
    # Get product groups from quote
    # ------------------------------
    def _get_product_groups(self):
        return ProductGroup.objects.filter(
            product_services__quoteitem__quote=self.quote
        ).distinct()

    # ------------------------------
    # Get eligible users
    # ------------------------------
    def _get_eligible_users(self):
        groups = self._get_product_groups()

        queryset = Account.objects.filter(
            product_groups__in=groups,
            is_active=True,
            is_available=True
        ).distinct()

        # If quote is high value → assign only seniors
        if self.quote.total_amount > 100000:
            queryset = queryset.filter(role="senior")

        return queryset

    # ------------------------------
    # Add workload metrics
    # ------------------------------
    def _annotate_metrics(self, queryset):
        return queryset.annotate(
            active_tasks=Count(
                "assigned_tasks",
                filter=Q(assigned_tasks__status__in=["planned", "in_progress"])
            ),
            completed_tasks=Count(
                "assigned_tasks",
                filter=Q(assigned_tasks__status="completed")
            ),
            total_tasks=Count("assigned_tasks")
        )

    # ------------------------------
    # PUBLIC METHOD
    # ------------------------------
    def get_ranked_users(self):
        users = self._get_eligible_users()
        users = self._annotate_metrics(users)
        users = apply_scoring(users)

        return users
