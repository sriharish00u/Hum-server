import { Session } from "../../models/session.model";
import { Message as MessageModel } from "../../models/message.model";

export interface Participant {
  userId: string;
  userName: string;
  joinedAt: number;
  leftAt?: number;
  role: 'victim' | 'guide' | 'observer';
  isVerifiedVolunteer: boolean;
}

import { User } from "../../models/user.model";

export interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  sessionId?: string;
}

export interface SessionInfo {
  id: string;
  type: "SOS" | "UNITY" | "REPORTX";
  createdBy: string;
  participants: Participant[];
  messages: Message[];
  status: "active" | "ended";
  createdAt: number;
  lat?: number;
  lng?: number;
}

const MAX_MESSAGES = 100;

class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private userLastAlert = new Map<string, number>();
  private alertCooldown = 8000;

  async rehydrate(): Promise<void> {
    try {
      const dbSessions = await Session.find({ status: "active" });
      for (const doc of dbSessions) {
        const session: SessionInfo = {
          id: doc._id.toString(),
          type: doc.type as SessionInfo["type"],
          createdBy: doc.createdBy,
          participants: [],
          messages: [],
          status: "active",
          createdAt: doc.startTime.getTime(),
        };
        this.sessions.set(session.id, session);

        const msgs = await MessageModel.find({ sessionId: session.id })
          .sort({ timestamp: -1 }).limit(100).lean();
        session.messages = msgs.reverse().map(m => ({
          id: m._id.toString(),
          userId: m.userId,
          userName: m.userName,
          text: m.text,
          timestamp: new Date(m.timestamp).getTime(),
          sessionId: session.id,
        }));
      }
      console.log(`[SessionManager] Rehydrated ${dbSessions.length} active sessions from DB`);
    } catch (e) {
      console.error("[SessionManager] Failed to rehydrate sessions:", e);
    }
  }

  async createSessionWithId(id: string, type: SessionInfo["type"], createdBy: string, userName = "Unknown"): Promise<SessionInfo> {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    const session: SessionInfo = {
      id,
      type,
      createdBy,
      participants: [{ userId: createdBy, userName, joinedAt: Date.now(), role: type === "SOS" ? "victim" : "observer", isVerifiedVolunteer: false }],
      messages: [],
      status: "active",
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);
    try {
      await Session.create({
        _id: id,
        type,
        title: "",
        createdBy,
        participants: [createdBy],
        startTime: new Date(session.createdAt),
        status: "active",
      });
    } catch (e) {
      console.error("[SessionManager] Failed to persist createSessionWithId:", e);
    }
    return session;
  }

  async createSession(type: SessionInfo["type"], createdBy: string, userName = "Unknown", lat?: number, lng?: number): Promise<SessionInfo> {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    const session: SessionInfo = {
      id,
      type,
      createdBy,
      participants: [{ userId: createdBy, userName, joinedAt: Date.now(), role: type === "SOS" ? "victim" : "observer", isVerifiedVolunteer: false }],
      messages: [],
      status: "active",
      createdAt: Date.now(),
      lat,
      lng,
    };
    this.sessions.set(id, session);
    try {
      await Session.create({
        _id: id,
        type,
        title: "",
        createdBy,
        participants: [createdBy],
        startTime: new Date(session.createdAt),
        status: "active",
      });
    } catch (e) {
      console.error("[SessionManager] Failed to persist createSession:", e);
    }
    return session;
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  async joinSession(sessionId: string, userId: string, userName: string): Promise<SessionInfo | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return undefined;
    const existing = session.participants.find(p => p.userId === userId && !p.leftAt);
    if (!existing) {
      // Check if user is verified volunteer
      const user = await User.findOne({ deviceId: userId });
      const isVerified = user?.isVerifiedVolunteer ?? false;
      
      let role: Participant['role'] = 'observer';
      if (session.type === 'SOS') {
        const guideCount = session.participants.filter(p => p.role === 'guide' && !p.leftAt).length;
        if (isVerified && guideCount < 3) {
          role = 'guide';
        }
      }
      
      session.participants.push({
        userId,
        userName,
        joinedAt: Date.now(),
        role,
        isVerifiedVolunteer: isVerified
      });
    }
    try {
      await Session.findByIdAndUpdate(sessionId, { $addToSet: { participants: userId } });
    } catch (e) {
      console.error("[SessionManager] Failed to persist joinSession:", e);
    }
    return session;
  }

  async leaveSession(sessionId: string, userId: string): Promise<SessionInfo | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
      participant.leftAt = Date.now();
    }
    try {
      await Session.findByIdAndUpdate(sessionId, { $pull: { participants: userId } });
    } catch (e) {
      console.error("[SessionManager] Failed to persist leaveSession:", e);
    }
    return session;
  }

  addMessage(sessionId: string, userId: string, userName: string, text: string): Message | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return undefined;

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      userName,
      text,
      timestamp: Date.now(),
    };

    session.messages.push(message);
    if (session.messages.length > MAX_MESSAGES) {
      session.messages = session.messages.slice(-MAX_MESSAGES);
    }

    MessageModel.create({
      sessionId,
      userId,
      userName,
      text,
      timestamp: new Date(message.timestamp),
    }).catch(e => console.error('[SessionManager] Failed to persist message:', e));

    return message;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "ended";
      setTimeout(() => {
        this.sessions.delete(sessionId);
      }, 30000);
    }
    try {
      await Session.findByIdAndUpdate(sessionId, { status: "ended", endTime: new Date() });
    } catch (e) {
      console.error("[SessionManager] Failed to persist endSession:", e);
    }
  }

  getRecentMessages(sessionId: string, limit = 50): Message[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.messages.slice(-limit);
  }

  getParticipants(sessionId: string): Participant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.participants.filter(p => !p.leftAt);
  }

  getAllParticipants(sessionId: string): Participant[] {
    const session = this.sessions.get(sessionId);
    return session?.participants || [];
  }

  getAllSessions(): Map<string, SessionInfo> {
    return this.sessions;
  }

  canTriggerAlert(userId: string): boolean {
    const lastTrigger = this.userLastAlert.get(userId) || 0;
    return Date.now() - lastTrigger > this.alertCooldown;
  }

  recordAlert(userId: string): void {
    this.userLastAlert.set(userId, Date.now());
  }
}

export const sessionManager = new SessionManager();