import axios from "axios";

// In production (Vercel), the frontend and API are served from the same domain.
// Keep the API relative so requests go through the Vercel /api rewrite.
const backendUrl = process.env.REACT_APP_BACKEND_URL;
const API = backendUrl ? `${backendUrl.replace(/\/$/, "")}/api` : "/api";

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export function apiError(detail, fallback = "Ocorreu um erro. Tente novamente.") {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const API_URL = API;
