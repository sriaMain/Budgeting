import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

/**
 * Used exclusively by the vendor self-service onboarding portal, which a
 * vendor accesses via a secure link with no login. Deliberately has NO
 * interceptors and NO withCredentials: the default `axiosInstance` always
 * attaches whatever admin Bearer token/cookies happen to be in the browser
 * and hard-redirects to "/" on any 401 - both wrong here, since this client
 * must only ever be authenticated by the token embedded in each request URL.
 */
const publicAxiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

export default publicAxiosInstance;
