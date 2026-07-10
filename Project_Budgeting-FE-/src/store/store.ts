import { configureStore } from "@reduxjs/toolkit";
import { authSlice } from "../auth/authSlice";
import { notificationSlice } from "./notificationSlice";

const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    notifications: notificationSlice.reducer,
  },
});

export default store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;    