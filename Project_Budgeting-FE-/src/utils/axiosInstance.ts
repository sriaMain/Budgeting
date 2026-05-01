import axios from "axios";
import store from "../store/store";
import { API_BASE_URL } from "./apiConfig";

const axiosRefresh = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const token = store.getState().auth.accessToken;

  console.log("Attaching token to request:", token);

  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }

  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // Check if this request should skip auth redirect
    if (originalRequest.skipAuthRedirect) {
      console.log('Skipping auth redirect for this request');
      return Promise.reject(error);
    }

    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        const response = await axiosRefresh.post("/accounts/refresh/", {
          withCredentials: true,
        });

        store.dispatch({
          type: "auth/setAccessToken",
          payload: { accessToken: response.data.token },
        });

        originalRequest.headers["Authorization"] =
          "Bearer " + response.data.token;

        return axiosInstance(originalRequest);
      } catch (err) {
        store.dispatch({
          type: "auth/logoutSuccess",
        });

        window.location.href = "/";

        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
