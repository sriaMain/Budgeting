import { useEffect, useRef, useCallback } from "react";
import { useAppDispatch } from "./useAppDispatch";
import { useAppSelector } from "./useAppSelector";
import { buildWebSocketUrl } from "../utils/apiConfig";
import axiosInstance from "../utils/axiosInstance";
import {
  setNotifications,
  addNotification,
  markRead,
  markAllRead,
  deleteNotification,
  clearNotifications,
  setLoading,
} from "../store/notificationSlice";
import type { Notification } from "../types/notification";

export const useNotifications = () => {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.accessToken);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { notifications, unreadCount, loading } = useAppSelector(
    (state) => state.notifications
  );
  
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Fetch all notifications from REST API
  const fetchNotifications = useCallback(
    async (filters?: { type?: string; priority?: string; is_read?: string }) => {
      if (!isAuthenticated) return;
      
      dispatch(setLoading(true));
      try {
        const params: Record<string, string> = {};
        if (filters?.type && filters.type !== "all") params.type = filters.type;
        if (filters?.priority && filters.priority !== "all") params.priority = filters.priority;
        if (filters?.is_read && filters.is_read !== "all") {
          params.is_read = filters.is_read === "read" ? "true" : "false";
        }

        const response = await axiosInstance.get("/notifications/", { params });
        dispatch(
          setNotifications({
            notifications: response.data.notifications,
            unreadCount: response.data.unread_count,
          })
        );
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      } finally {
        dispatch(setLoading(false));
      }
    },
    [dispatch, isAuthenticated]
  );

  // Mark single notification as read
  const markAsRead = useCallback(
    async (id: number) => {
      try {
        await axiosInstance.post(`/notifications/${id}/read/`);
        dispatch(markRead(id));
      } catch (error) {
        console.error(`Failed to mark notification ${id} as read:`, error);
      }
    },
    [dispatch]
  );

  // Mark all notifications as read
  const markAllNotificationsAsRead = useCallback(async () => {
    try {
      await axiosInstance.post("/notifications/read-all/");
      dispatch(markAllRead());
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  }, [dispatch]);

  // Delete a notification
  const removeNotification = useCallback(
    async (id: number) => {
      try {
        await axiosInstance.delete(`/notifications/${id}/`);
        dispatch(deleteNotification(id));
      } catch (error) {
        console.error(`Failed to delete notification ${id}:`, error);
      }
    },
    [dispatch]
  );

  // Clear all notifications
  const clearAllNotifications = useCallback(async () => {
    try {
      await axiosInstance.post("/notifications/clear-all/");
      dispatch(clearNotifications());
    } catch (error) {
      console.error("Failed to clear notifications:", error);
    }
  }, [dispatch]);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated || !token) return;

    if (socketRef.current) {
      socketRef.current.close();
    }

    const wsUrl = buildWebSocketUrl("ws/notifications/", token);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket connected to notifications");
      reconnectAttemptsRef.current = 0;
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "NEW_NOTIFICATION" && data.notification) {
          dispatch(addNotification(data.notification));
        }
      } catch (error) {
        console.error("Error parsing notification WebSocket message:", error);
      }
    };

    socket.onclose = (event) => {
      console.log("Notification WebSocket disconnected:", event.reason);
      socketRef.current = null;
      
      // Auto-reconnect with backoff (max 30s)
      if (isAuthenticated && token) {
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connectWebSocket();
        }, timeout);
      }
    };

    socket.onerror = (error) => {
      console.error("Notification WebSocket error:", error);
      socket.close();
    };
  }, [isAuthenticated, token, dispatch]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      connectWebSocket();
    } else {
      dispatch(clearNotifications());
      if (socketRef.current) {
        socketRef.current.close();
      }
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [isAuthenticated, fetchNotifications, connectWebSocket, dispatch]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllNotificationsAsRead,
    removeNotification,
    clearAllNotifications,
  };
};
