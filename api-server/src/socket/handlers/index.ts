import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { sessionManager, type Session } from "../../modules/session";
import { incrementStat } from "../../models/stats.model";
import { JWT_SECRET } from "../../lib/config";
import { logger } from "../../lib/logger";

interface JoinSessionData {
  sessionId: string;
  userId: string;
  userName: string;
  type?: Session["type"];
}

interface SendMessageData {
  sessionId: string;
  userId: string;
  userName: string;
  text: string;
}

interface LeaveSessionData {
  sessionId: string;
  userId: string;
}

interface TriggerSOSData {
  userId: string;
  userName: string;
  description: string;
  lat?: number;
  lng?: number;
}

interface RegisterData {
  userId: string;
  userName?: string;
  token?: string;
}

export function setupSocketHandlers(io: Server): void {
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error("Authentication required"));
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const currentUserId = socket.data.userId;
    logger.info({ socketId: socket.id, userId: currentUserId }, 'client connected');

    socket.on("register", (data: RegisterData) => {
      try {
        // Verify the userId matches the authenticated user
        if (data.userId !== currentUserId) {
          socket.emit("error", { message: "User ID mismatch" });
          return;
        }
        socket.data.displayName = data.userName || "Anonymous";
        socket.join("alerts");
        logger.info({ socketId: socket.id, userId: currentUserId }, 'user registered');
      } catch (error) {
        logger.error({ err: error }, 'error in register handler');
      }
    });

    socket.on("join-session", async (data: JoinSessionData) => {
      try {
        const { sessionId, userId, userName, type } = data;
        if (!sessionId || !userId) throw new Error("Missing sessionId or userId");
        
        if (userId !== currentUserId) {
          socket.emit("error", { message: "Cannot join session as another user" });
          return;
        }
        
        logger.info({ sessionId, userId, userName }, 'join session');

        let session = sessionManager.getSession(sessionId);

        if (!session) {
          session = await sessionManager.createSessionWithId(sessionId, type ?? "REPORTX", userId, userName);
          logger.info({ sessionId }, 'auto-created session');
        }

        if (session) {
          socket.join(sessionId);
          const messages = sessionManager.getRecentMessages(sessionId, 50);
          const participants = sessionManager.getAllParticipants(sessionId);

          socket.emit("session-joined", {
            sessionId,
            messages,
            participants,
          });

          const updatedParticipants = sessionManager.getParticipants(sessionId);
          io.to(sessionId).emit("participants-updated", updatedParticipants);
        }
      } catch (error) {
        logger.error({ err: error }, 'error in join-session handler');
        socket.emit("error", { message: "Failed to join session" });
      }
    });

    socket.on("send-message", (data: SendMessageData) => {
      try {
        const { sessionId, userId, userName, text } = data;
        if (!sessionId || !text) throw new Error("Missing sessionId or text");
        
        // Verify userId matches authenticated user
        if (userId !== currentUserId) {
          socket.emit("error", { message: "Cannot send message as another user" });
          return;
        }
        
        logger.info({ sessionId, userId, userName, text: text.substring(0, 50) }, 'new message');
        const message = sessionManager.addMessage(sessionId, userId, userName, text);

        if (message) {
          message.sessionId = sessionId;
          io.to(sessionId).emit("new-message", message);
        }
      } catch (error) {
        logger.error({ err: error }, 'error in send-message handler');
      }
    });

    socket.on("leave-session", async (data: LeaveSessionData) => {
      try {
        const { sessionId, userId } = data;
        
        if (userId !== currentUserId) {
          socket.emit("error", { message: "Cannot leave session for another user" });
          return;
        }
        
        await sessionManager.leaveSession(sessionId, userId);
        socket.leave(sessionId);
        const updatedParticipants = sessionManager.getParticipants(sessionId);
        io.to(sessionId).emit("participants-updated", updatedParticipants);
      } catch (error) {
        logger.error({ err: error }, 'error in leave-session handler');
      }
    });

    socket.on("trigger-sos", async (data: TriggerSOSData) => {
      try {
        const { userId, userName, description, lat = 0, lng = 0 } = data;
        
        // Verify userId matches authenticated user
        if (userId !== currentUserId) {
          socket.emit("error", { message: "Cannot trigger SOS as another user" });
          return;
        }
        
        logger.info({ userId, userName, description, lat, lng }, 'SOS triggered');

        if (!sessionManager.canTriggerAlert(userId)) {
          socket.emit("alert-cooldown", { message: "Please wait before sending another alert" });
          return;
        }

        sessionManager.recordAlert(userId);
        const session = await sessionManager.createSession("SOS", userId, userName, lat, lng);
        logger.info({ sessionId: session.id }, 'session created');

        const alert = {
          sessionId: session.id,
          createdBy: userId,
          userName,
          description,
          timestamp: Date.now(),
          lat,
          lng,
        };

        io.to("alerts").emit("receive-alert", alert);
        logger.info({ sessionId: session.id }, 'alert broadcasted');

        socket.emit("alert-sent", { sessionId: session.id });

        incrementStat("sosHandled").catch(() => {});
      } catch (error) {
        logger.error({ err: error }, 'error in trigger-sos handler');
        socket.emit("error", { message: "Failed to trigger SOS" });
      }
    });

    socket.on("create-session", async (data: { type: "UNITY" | "REPORTX"; userId: string; userName: string }) => {
      try {
        const { type, userId, userName } = data;
        
        // Verify userId matches authenticated user
        if (userId !== currentUserId) {
          socket.emit("error", { message: "Cannot create session as another user" });
          return;
        }
        
        logger.info({ type, userId, userName }, 'create session');
        const session = await sessionManager.createSession(type, userId, userName);
        logger.info({ sessionId: session.id }, 'session created');
        socket.emit("session-created", { session });
      } catch (error) {
        logger.error({ err: error }, 'error in create-session handler');
      }
    });

    socket.on("end-session", async (data: { sessionId: string }) => {
      try {
        const { sessionId } = data;

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          socket.emit("error", { message: "Session not found" });
          return;
        }
        if (session.createdBy !== currentUserId) {
          socket.emit("error", { message: "Not authorized to end this session" });
          return;
        }

        logger.info({ sessionId }, 'session ended');
        await sessionManager.endSession(sessionId);
        io.to(sessionId).emit("session-ended", { sessionId });
      } catch (error) {
        logger.error({ err: error }, 'error in end-session handler');
      }
    });

    socket.on("user-location", (data: { sessionId: string; userId: string; lat: number; lng: number }) => {
      try {
        const { sessionId, userId, lat, lng } = data;

        if (userId !== currentUserId) {
          socket.emit("error", { message: "Cannot share location for another user" });
          return;
        }

        const session = sessionManager.getSession(sessionId);
        if (!session || !session.participants.some(p => p.userId === currentUserId)) {
          socket.emit("error", { message: "Not a participant of this session" });
          return;
        }

        io.to(sessionId).emit("users-location", { userId, lat, lng, timestamp: Date.now() });
      } catch (error) {
        logger.error({ err: error }, 'error in user-location handler');
      }
    });

    socket.on("disconnect", () => {
      try {
        logger.info({ socketId: socket.id }, 'client disconnected');
        if (currentUserId) {
          const allSessions = sessionManager.getAllSessions();
          allSessions.forEach((session) => {
            const participant = session.participants.find(p => p.userId === currentUserId && !p.leftAt);
            if (participant) {
              participant.leftAt = Date.now();
              io.to(session.id).emit("participants-updated", sessionManager.getParticipants(session.id));
            }
          });
        }
      } catch (error) {
        logger.error({ err: error }, 'error in disconnect handler');
      }
    });
  });
}