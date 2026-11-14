import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  timeout: 15000,
});
let token;
let refreshPromise;
let sessionUser;
export function setSessionUser(user) {
  sessionUser = user ? { id: user.id, role: user.role } : undefined;
}
export function setAccessToken(value, user) {
  token = value;
  if (!value) setSessionUser(undefined);
  else if (user) setSessionUser(user);
}
export function getAccessToken() {
  return token;
}
export async function refreshSession() {
  if (!refreshPromise)
    refreshPromise = api
      .post("/auth/refresh")
      .then(({ data }) => {
        setAccessToken(data.accessToken, data.user);
        window.dispatchEvent(
          new CustomEvent("session-refreshed", { detail: data.user }),
        );
        return data.user;
      })
      .finally(() => {
        refreshPromise = undefined;
      });
  return refreshPromise;
}
api.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status === 401 &&
      config &&
      !config.retried &&
      (!config.url.startsWith("/auth/") || config.url === "/auth/me")
    ) {
      config.retried = true;
      const previousUser = sessionUser;
      let refreshedUser;
      try {
        refreshedUser = await refreshSession();
      } catch {
        setAccessToken(undefined);
        window.dispatchEvent(new Event("session-expired"));
        return Promise.reject(error);
      }
      if (
        previousUser &&
        (previousUser.id !== refreshedUser.id ||
          previousUser.role !== refreshedUser.role)
      ) {
        const changed = new Error(
          "Your signed-in account changed. Review your current account before trying again.",
        );
        changed.code = "SESSION_CHANGED";
        return Promise.reject(changed);
      }
      return api(config);
    }
    return Promise.reject(error);
  },
);
export const errorMessage = (error) =>
  (error.code === "SESSION_CHANGED" ? error.message : undefined) ||
  error.response?.data?.errors
    ?.map((issue) => issue.message)
    .filter(Boolean)
    .join(" ") ||
  error.response?.data?.message ||
  (error.code === "ECONNABORTED"
    ? "Request timed out. Please try again."
    : "Cannot connect. Check your connection and try again.");
