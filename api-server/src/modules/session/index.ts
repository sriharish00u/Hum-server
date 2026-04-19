export interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  sessionId?: string;
}

export interface Session {
  id: string;
  type: "SOS" | "UNITY" | "REPORTX";
  createdBy: string;
  participants: string[];
  messages: Message[];
  status: "active" | "ended";
  createdAt: number;
}

const MAX_MESSAGES = 100;

class SessionManager {
  private sessions = new Map<string, Session>();
  private userLastAlert = new Map<string, number>();
  private alertCooldown = 8000;

  createSession(type: Session["type"], createdBy: string): Session {
    const session: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      createdBy,
      participants: [createdBy],
      messages: [],
      status: "active",
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  joinSession(sessionId: string, userId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return undefined;
    if (!session.participants.includes(userId)) {
      session.participants.push(userId);
    }
    return session;
  }

  leaveSession(sessionId: string, userId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    session.participants = session.participants.filter((p) => p !== userId);
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
    return message;
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "ended";
      setTimeout(() => {
        this.sessions.delete(sessionId);
      }, 30000);
    }
  }

  getRecentMessages(sessionId: string, limit = 50): Message[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.messages.slice(-limit);
  }

  getParticipants(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session?.participants || [];
  }

  getAllSessions(): Map<string, Session> {
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