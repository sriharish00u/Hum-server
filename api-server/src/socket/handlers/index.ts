import type { Server, Socket } from "socket.io";
import { sessionManager } from "../../modules/session";

interface JoinSessionData {
  sessionId: string;
  userId: string;
  userName: string;
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
}

interface RegisterData {
  userId: string;
}

export function setupSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`\n🔌 CLIENT CONNECTED | socket: ${socket.id}`);
    let currentUserId: string | null = null;

    socket.on("register", (data: RegisterData) => {
      currentUserId = data.userId;
      socket.data.userId = data.userId;
      console.log(`👤 USER REGISTERED | socket: ${socket.id} | userId: ${data.userId}`);
    });

    socket.on("join-session", (data: JoinSessionData) => {
      const { sessionId, userId, userName } = data;
      console.log(`\n📥 JOIN SESSION | session: ${sessionId} | user: ${userName} (${userId})`);
      const session = sessionManager.joinSession(sessionId, userId);

      if (session) {
        socket.join(sessionId);
        const messages = sessionManager.getRecentMessages(sessionId, 50);
        const participants = sessionManager.getParticipants(sessionId);

        socket.emit("session-joined", {
          sessionId,
          messages,
          participants,
        });

        socket.to(sessionId).emit("participant-joined", { userId, userName });
      }
    });

    socket.on("send-message", (data: SendMessageData) => {
      const { sessionId, userId, userName, text } = data;
      console.log(`\n💬 NEW MESSAGE | session: ${sessionId} | from: ${userName} | text: "${text}"`);
      const message = sessionManager.addMessage(sessionId, userId, userName, text);

      if (message) {
        message.sessionId = sessionId;
        io.to(sessionId).emit("new-message", message);
        socket.emit("new-message", message);
      }
    });

    socket.on("leave-session", (data: LeaveSessionData) => {
      const { sessionId, userId } = data;
      sessionManager.leaveSession(sessionId, userId);
      socket.leave(sessionId);
      io.to(sessionId).emit("participant-left", { userId });
    });

    socket.on("trigger-sos", (data: TriggerSOSData) => {
      const { userId, userName, description } = data;
      console.log(`\n🚨 SOS TRIGGERED | user: ${userName} (${userId}) | description: "${description}"`);

      if (!sessionManager.canTriggerAlert(userId)) {
        socket.emit("alert-cooldown", { message: "Please wait before sending another alert" });
        return;
      }

      sessionManager.recordAlert(userId);
      const session = sessionManager.createSession("SOS", userId);
      console.log(`📍 SESSION CREATED | sessionId: ${session.id} | type: SOS`);

      const alert = {
        sessionId: session.id,
        createdBy: userId,
        userName,
        description,
        timestamp: Date.now(),
      };

      io.emit("receive-alert", alert);
      console.log(`📢 ALERT BROADCASTED | sessionId: ${session.id} | to all clients`);

      socket.emit("alert-sent", { sessionId: session.id });
    });

    socket.on("create-session", (data: { type: "UNITY" | "REPORTX"; userId: string; userName: string }) => {
      const { type, userId, userName } = data;
      console.log(`\n📁 SESSION CREATED | type: ${type} | user: ${userName} (${userId})`);
      const session = sessionManager.createSession(type, userId);
      console.log(`📍 SESSION ID: ${session.id}`);
      socket.emit("session-created", { session });
    });

    socket.on("end-session", (data: { sessionId: string }) => {
      const { sessionId } = data;
      console.log(`\n🛑 SESSION ENDED | sessionId: ${sessionId}`);
      sessionManager.endSession(sessionId);
      io.to(sessionId).emit("session-ended", { sessionId });
    });

    socket.on("disconnect", () => {
      console.log(`\n❌ CLIENT DISCONNECTED | socket: ${socket.id}`);
      if (currentUserId) {
        const allSessions = sessionManager.getAllSessions();
        allSessions.forEach((session) => {
          const userIndex = session.participants.indexOf(currentUserId!);
          if (userIndex !== -1) {
            session.participants.splice(userIndex, 1);
            io.to(session.id).emit("participant-left", { userId: currentUserId });
          }
        });
      }
    });
  });
}