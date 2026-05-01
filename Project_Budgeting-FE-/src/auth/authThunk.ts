import { createAsyncThunk } from "@reduxjs/toolkit";
import axiosInstance from "../utils/axiosInstance";


interface   InitializeAuthResponse {
  isAuthenticated: boolean;
  userRole: "admin" | "user" | "manager";
  accessToken: string;
  username: string;
  email: string;
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
     
        return {
          isAuthenticated: true,
          userRole: response.data.role,
          accessToken: response.data.token,
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
