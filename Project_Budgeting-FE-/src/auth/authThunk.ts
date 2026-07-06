import { createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from "../utils/axiosInstance";

interface InitializeAuthResponse {
  isAuthenticated: boolean;
  userRole: "admin" | "user" | "manager";
  accessToken: string;
  username: string;
  email: string;
  permissions: string[];
}

export const initializeAuth = createAsyncThunk<
  InitializeAuthResponse,   // SUCCESS return type
  void,                     // argument type (none)
  { rejectValue: string }   // ERROR return type
>(
  "auth/initializeAuth",
  async (_, thunkAPI) => {
    try {
      console.log("Initializing Auth");
      const response = await axiosInstance.post("/accounts/refresh/");
      console.log("Auth Initialized:", response.data);

      const backendRoles = response.data.roles || [];
      const backendRole = backendRoles[0] || 'user';

      let userRole: 'admin' | 'user' | 'manager' = 'user';
      if (backendRole.toLowerCase() === 'admin') {
        userRole = 'admin';
      } else if (backendRole.toLowerCase() === 'project manager' || backendRole.toLowerCase() === 'manager') {
        userRole = 'manager';
      } else {
        userRole = 'user';
      }

      return {
        isAuthenticated: true,
        userRole: userRole,
        accessToken: response.data.access_token, // backend returns 'access_token', not 'token'
        username: response.data.username || '',
        email: response.data.email || '',
        permissions: response.data.permissions || [],
      };
    } catch (error) {
      return thunkAPI.rejectWithValue(
        "Authentication Expired please login again"
      );
    }
  }
);

export const logoutUser = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>(
  "auth/logoutUser",
  async (_, thunkAPI) => {
    try {
      await axiosInstance.post("/accounts/logout/");
    } catch (error) {
      console.warn("Logout request to server failed:", error);
    } finally {
      thunkAPI.dispatch({ type: "auth/logoutSuccess" });
    }
  }
);
