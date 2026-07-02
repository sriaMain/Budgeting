import { createSlice } from "@reduxjs/toolkit";
import { initializeAuth } from "./authThunk";

interface initialStateType {
  isAuthenticated: boolean;
  userRole: "admin" | "user" | "manager" | null;
  accessToken: string | null;
  username: string | null;
  email: string | null;
}

const initialState: initialStateType = {
  isAuthenticated: false,
  userRole: null,
  accessToken: null,
  username: null,
  email: null,
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginSuccess: (state, action) => {
      state.isAuthenticated = true;
      state.userRole = action.payload.userRole;
      state.accessToken = action.payload.accessToken;
      state.username = action.payload.username;
      state.email = action.payload.email;
    },
    logoutSuccess: (state) => {
      state.isAuthenticated = false;
      state.userRole = null;
      state.accessToken = null;
      state.username = null;
      state.email = null;
    },
    setAccessToken: (state, action) => {
      state.accessToken = action.payload.accessToken;
    },
  },
  extraReducers: (builder) => {

    builder.addCase(initializeAuth.fulfilled, (state, action) => {
      state.isAuthenticated = true;
      state.userRole = action.payload.userRole;
      state.accessToken = action.payload.accessToken;
      state.username = action.payload.username;
      state.email = action.payload.email;
    });
    builder.addCase(initializeAuth.rejected, (state) => {
      state.isAuthenticated = false;
      state.userRole = null;
      state.accessToken = null;
      state.username = null;
      state.email = null;
    });
  },

});

export const { loginSuccess, logoutSuccess, setAccessToken } = authSlice.actions;
export default authSlice.reducer;
