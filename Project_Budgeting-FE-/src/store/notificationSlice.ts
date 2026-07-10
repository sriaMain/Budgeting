import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Notification } from "../types/notification";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
}

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
};

export const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    setNotifications: (
      state,
      action: PayloadAction<{ notifications: Notification[]; unreadCount: number }>
    ) => {
      state.notifications = action.payload.notifications;
      state.unreadCount = action.payload.unreadCount;
    },
    addNotification: (state, action: PayloadAction<Notification>) => {
      // Avoid duplicate keys
      const exists = state.notifications.some((n) => n.id === action.payload.id);
      if (!exists) {
        state.notifications.unshift(action.payload);
        if (!action.payload.is_read) {
          state.unreadCount += 1;
        }
      }
    },
    markRead: (state, action: PayloadAction<number>) => {
      const notification = state.notifications.find((n) => n.id === action.payload);
      if (notification && !notification.is_read) {
        notification.is_read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllRead: (state) => {
      state.notifications.forEach((n) => {
        n.is_read = true;
      });
      state.unreadCount = 0;
    },
    deleteNotification: (state, action: PayloadAction<number>) => {
      const index = state.notifications.findIndex((n) => n.id === action.payload);
      if (index !== -1) {
        const wasUnread = !state.notifications[index].is_read;
        state.notifications.splice(index, 1);
        if (wasUnread) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      }
    },
    clearNotifications: (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setNotifications,
  addNotification,
  markRead,
  markAllRead,
  deleteNotification,
  clearNotifications,
  setLoading,
} = notificationSlice.actions;

export default notificationSlice.reducer;
