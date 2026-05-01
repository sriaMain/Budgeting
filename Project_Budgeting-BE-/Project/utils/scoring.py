from django.db.models import F, FloatField, ExpressionWrapper


def apply_scoring(queryset):
    """
    Lower score = better candidate
    """

    score_formula = (
        F("active_tasks") * 3
        - F("completed_tasks") * 1
    )

    return queryset.annotate(
        score=ExpressionWrapper(score_formula, output_field=FloatField())
    ).order_by("score", "active_tasks")
