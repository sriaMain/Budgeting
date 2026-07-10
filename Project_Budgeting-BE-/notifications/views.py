from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.shortcuts import get_object_or_404
from .models import Notification
from .serializers import NotificationSerializer

class NotificationListView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = Notification.objects.filter(recipient=request.user, is_deleted=False)
        
        # Filtering
        notification_type = request.query_params.get('type')
        priority = request.query_params.get('priority')
        is_read = request.query_params.get('is_read')

        if notification_type:
            # Allow 'task' to match both legacy 'task' and new 'TASK_ASSIGNED' notifications
            if notification_type == 'task':
                queryset = queryset.filter(notification_type__in=['task', 'TASK_ASSIGNED'])
            else:
                queryset = queryset.filter(notification_type=notification_type)
        if priority:
            queryset = queryset.filter(priority=priority)
        if is_read is not None:
            is_read_bool = is_read.lower() == 'true'
            queryset = queryset.filter(is_read=is_read_bool)

        serializer = NotificationSerializer(queryset, many=True)
        
        # Also return the unread count in response metadata for convenience
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False, is_deleted=False).count()
        
        return Response({
            'notifications': serializer.data,
            'unread_count': unread_count
        }, status=status.HTTP_200_OK)

class NotificationMarkReadView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, recipient=request.user, is_deleted=False)
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False, is_deleted=False).count()
        return Response({
            'message': 'Notification marked as read',
            'unread_count': unread_count
        }, status=status.HTTP_200_OK)

class NotificationMarkAllReadView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False, is_deleted=False).update(is_read=True)
        return Response({
            'message': 'All notifications marked as read',
            'unread_count': 0
        }, status=status.HTTP_200_OK)

class NotificationDeleteView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, recipient=request.user, is_deleted=False)
        notification.is_deleted = True
        notification.save(update_fields=['is_deleted'])
        
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False, is_deleted=False).count()
        return Response({
            'message': 'Notification deleted successfully',
            'unread_count': unread_count
        }, status=status.HTTP_200_OK)

class NotificationClearAllView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_deleted=False).update(is_deleted=True)
        return Response({
            'message': 'All notifications cleared successfully',
            'unread_count': 0
        }, status=status.HTTP_200_OK)
