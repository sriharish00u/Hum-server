import "dotenv/config";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { setupSocketHandlers } from "./socket/handlers";

const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setupSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});