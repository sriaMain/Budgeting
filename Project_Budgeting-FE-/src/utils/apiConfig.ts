const DEFAULT_API_ORIGIN = "http://127.0.0.1:8001";
const inferredApiOrigin =
  typeof window !== "undefined"
    ? `http://${window.location.hostname}:8001`
    : DEFAULT_API_ORIGIN;

const rawApiOrigin = import.meta.env.VITE_API_BASE_URL || inferredApiOrigin;
const normalizedApiOrigin = rawApiOrigin.replace(/\/+$/, "");
const useDevProxy = import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL;

export const API_ORIGIN = normalizedApiOrigin;
export const API_BASE_URL = useDevProxy
  ? "/api/"
  : new URL("/api/", `${normalizedApiOrigin}/`).toString();

export const buildWebSocketUrl = (path: string, token?: string): string => {
  const baseUrl = useDevProxy && typeof window !== "undefined"
    ? window.location.origin
    : `${normalizedApiOrigin}/`;
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
};