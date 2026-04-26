import { Router } from "express";
import { sessionManager } from "../modules/session";
import { validateSessionEnd } from "../middleware/validation";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// GET /api/sessions/nearby?type=SOS&lat=&lng=&radius=10 - Returns active SOS sessions with geo-filtering
router.get("/nearby", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { type = 'SOS', lat, lng, radius = '10' } = req.query;
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const radiusKm = parseFloat(radius as string);
  const userLat = lat ? parseFloat(lat as string) : null;
  const userLng = lng ? parseFloat(lng as string) : null;

  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  const results: any[] = [];
  sessionManager.getAllSessions().forEach(session => {
    if (session.type !== type || session.status !== 'active' || session.createdAt <= tenMinutesAgo) return;
    if (userLat !== null && userLng !== null && session.lat != null && session.lng != null) {
      if (haversineKm(userLat, userLng, session.lat, session.lng) > radiusKm) return;
    }
    results.push({ sessionId: session.id, type: session.type, createdBy: session.createdBy, participantCount: session.participants.length, createdAt: session.createdAt });
  });
  res.json(results.slice(0, 10));
});

// GET /api/sessions/:sessionId/messages - Returns messages for a session
router.get("/:sessionId/messages", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.params;
  const messages = sessionManager.getRecentMessages(sessionId, 100);
  res.json(messages);
});

// POST /api/sessions/:sessionId/end - Ends a session and saves outcome
router.post("/:sessionId/end", authMiddleware, validateSessionEnd, async (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.params;
  const { outcome } = req.parsedBody as { outcome: string };
  const userId = req.user!.id;

  const session = sessionManager.getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.createdBy !== userId) return res.status(403).json({ error: "Not authorized to end this session" });

  console.log(`📋 SESSION ENDED VIA API | sessionId: ${sessionId} | outcome: ${outcome}`);

  await sessionManager.endSession(sessionId);

  res.json({
    success: true,
    sessionId,
    outcome,
    endedAt: new Date().toISOString(),
  });
});

export default router;