const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";
const inferredApiOrigin =
  typeof window !== "undefined"
    ? `http://${window.location.hostname}:8000`
    : DEFAULT_API_ORIGIN;

const rawApiOrigin = import.meta.env.VITE_API_BASE_URL || inferredApiOrigin;
const normalizedApiOrigin = rawApiOrigin.replace(/\/+$/, "");

export const API_ORIGIN = normalizedApiOrigin;
export const API_BASE_URL = new URL("/api/", `${normalizedApiOrigin}/`).toString();

export const buildWebSocketUrl = (path: string, token?: string): string => {
  const url = new URL(path, `${normalizedApiOrigin}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
};