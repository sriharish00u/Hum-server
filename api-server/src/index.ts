import "dotenv/config";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { setupSocketHandlers } from "./socket/handlers";
import { connectDB } from "./db/mongo";
import { getCorsOrigins } from "./lib/config";
import { sessionManager } from "./modules/session";

const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = getCorsOrigins();

const socketCorsOptions = isProduction
  ? { origin: allowedOrigins, methods: ["GET", "POST"] }
  : { origin: "*", methods: ["GET", "POST"] };

const io = new SocketIOServer(httpServer, {
  cors: socketCorsOptions,
});

setupSocketHandlers(io);

connectDB().then(async () => {
  await sessionManager.rehydrate();
  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});