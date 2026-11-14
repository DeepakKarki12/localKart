import { useEffect } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken, api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCommerce } from "../context/CommerceContext";
export function useLiveOrders() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const { notify } = useCommerce();
  useEffect(() => {
    if (!user) return;
    const base = new URL(api.defaults.baseURL, window.location.origin);
    const socket = io(base.origin, {
      path: "/socket.io",
      auth: (cb) => cb({ token: getAccessToken() }),
      reconnectionAttempts: 5,
    });
    socket.on("orders:changed", () => {
      cache.invalidateQueries();
      notify("An order has been updated.");
    });
    socket.on("bookings:changed", () => cache.invalidateQueries());
    return () => socket.disconnect();
  }, [user?.id, cache, notify]);
}
