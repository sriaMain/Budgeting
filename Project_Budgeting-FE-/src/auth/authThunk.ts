import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosRefresh } from "../utils/axiosInstance";


interface   InitializeAuthResponse {
  isAuthenticated: boolean;
  userRole: "admin" | "user" | "manager";
  accessToken: string;
  username: string;
  email: string;
}

const normalizeRole = (backendRole: string): "admin" | "user" | "manager" => {
  const role = (backendRole || "").toLowerCase();
  if (role === "admin") return "admin";
  if (role === "project manager" || role === "manager") return "manager";
  return "user";
};

export const initializeAuth = createAsyncThunk<
  InitializeAuthResponse,   // SUCCESS return type
  void,                     // argument type (none)
  { rejectValue: string }   // ERROR return type
>(
  "auth/initializeAuth",
  async (_, thunkAPI) => {
    try {
      console.log("Initializing Auth");
      const response = await axiosRefresh.post("/accounts/refresh/");
      console.log("Auth Initialized:", response.data);

        return {
          isAuthenticated: true,
          userRole: normalizeRole(response.data.role),
          accessToken: response.data.access_token,
          username: response.data.username || '',
          email: response.data.email || '',
        };
    } catch (error) {
    
      return thunkAPI.rejectWithValue(
        "Authentication Expired please login again"
      );
    }
  }
);
