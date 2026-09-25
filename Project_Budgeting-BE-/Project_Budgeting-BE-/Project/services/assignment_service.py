from services.recommendation_engine import UserRecommendationEngine


class TaskAssignmentService:

    def __init__(self, project):
        self.project = project

    def auto_assign(self):
        engine = UserRecommendationEngine(self.project)
        ranked_users = engine.get_ranked_users()
        return ranked_users.first()

    def get_recommendations(self, limit=5):
        engine = UserRecommendationEngine(self.project)
        return engine.get_ranked_users()[:limit]
