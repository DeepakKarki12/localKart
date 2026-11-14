import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
export function attachSockets(server, app, env) {
  const io = new Server(server, {
    cors: { origin: env.CLIENT_URL, credentials: true },
  });
  io.use(async (socket, next) => {
    try {
      const claims = jwt.verify(socket.handshake.auth.token, env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "localcart",
        audience: "localcart-client",
      });
      const user = await User.findById(claims.sub);
      if (!user || user.accountStatus !== "active")
        throw new Error("Unauthorized");
      socket.data.userId = user.id;
      socket.data.exp = claims.exp;
      next();
    } catch {
      next(new Error("Please sign in."));
    }
  });
  io.on("connection", (socket) => {
    socket.join(socket.data.userId);
    const timer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.exp * 1000 - Date.now()),
    );
    socket.on("disconnect", () => clearTimeout(timer));
  });
  app.set("io", io);
  return io;
}
