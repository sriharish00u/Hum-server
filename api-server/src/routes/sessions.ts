import { Router } from "express";
import { sessionManager } from "../modules/session";

const router = Router();

// GET /api/sessions/nearby?type=SOS - Returns active SOS sessions created within last 10 minutes
router.get("/nearby", (req, res) => {
  const { type = "SOS" } = req.query;
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  
  const allSessions = sessionManager.getAllSessions();
  const nearbySessions: any[] = [];
  
  allSessions.forEach((session) => {
    if (
      session.type === type &&
      session.status === "active" &&
      session.createdAt > tenMinutesAgo
    ) {
      nearbySessions.push({
        sessionId: session.id,
        type: session.type,
        createdBy: session.createdBy,
        participantCount: session.participants.length,
        createdAt: session.createdAt,
      });
    }
  });
  
  // Limit to 5 results
  res.json(nearbySessions.slice(0, 5));
});

// GET /api/sessions/:sessionId/messages - Returns messages for a session
router.get("/:sessionId/messages", (req, res) => {
  const { sessionId } = req.params;
  const messages = sessionManager.getRecentMessages(sessionId, 100);
  res.json(messages);
});

// POST /api/sessions/:sessionId/end - Ends a session and saves outcome
router.post("/:sessionId/end", (req, res) => {
  const { sessionId } = req.params;
  const { outcome } = req.body;
  
  console.log(`📋 SESSION ENDED VIA API | sessionId: ${sessionId} | outcome: ${outcome}`);
  
  sessionManager.endSession(sessionId);
  
  res.json({
    success: true,
    sessionId,
    outcome,
    endedAt: new Date().toISOString(),
  });
});

export default router;