import axios from "axios";
import { getSession, clearSession } from "@/lib/auth";

const BASE = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
});

api.interceptors.request.use((cfg) => {
  const s = getSession();
  if (s?.token) {
    cfg.headers = cfg.headers || {};
    cfg.headers.Authorization = `Bearer ${s.token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      clearSession();
    }
    return Promise.reject(err);
  }
);

export const API_BASE = BASE;
