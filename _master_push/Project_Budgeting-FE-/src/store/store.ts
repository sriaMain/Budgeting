import { configureStore } from "@reduxjs/toolkit";
import { authSlice } from "../auth/authSlice";

const store = configureStore({
  reducer: {
    auth: authSlice.reducer // Add your slices here
  },
});

export default store;

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;    