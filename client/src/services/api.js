import axios from "axios";

// On a phone, `localhost` points to the phone itself. Use the host that served
// the Vite app so a phone on the same Wi-Fi reaches the computer running API.
const configuredApi = import.meta.env.VITE_API_BASE_URL;
export const API_ORIGIN = configuredApi
  ? configuredApi.replace(/\/api\/?$/, "").replace(/\/$/, "")
  : `${window.location.protocol}//${window.location.hostname}:5000`;

const api = axios.create({
  baseURL: configuredApi || `${API_ORIGIN}/api`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("portal_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (config.data instanceof FormData) delete config.headers["Content-Type"];
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("portal_token");
      localStorage.removeItem("portal_user");
    }
    return Promise.reject(error);
  }
);

export default api;
