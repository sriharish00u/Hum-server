import { Router } from "express";
import { sessionManager } from "../modules/session";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth";
import { incrementStat } from "../models/stats.model";
import { User } from "../models/user.model";
import { Message as MessageModel } from "../models/message.model";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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

// GET /api/sessions/:sessionId/messages - Returns messages for a session (from DB + memory)
router.get("/:sessionId/messages", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.params;
  try {
    const dbMessages = await MessageModel.find({ sessionId }).sort({ timestamp: 1 }).limit(200).lean();
    const memMessages = sessionManager.getRecentMessages(sessionId, 200);
    const combined = [...dbMessages.map(m => ({
      id: m._id.toString(),
      userId: m.userId,
      userName: m.userName,
      text: m.text,
      timestamp: new Date(m.timestamp).getTime(),
      sessionId,
    })), ...memMessages];
    const seen = new Set<string>();
    const deduped = combined.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    }).sort((a, b) => a.timestamp - b.timestamp);
    res.json(deduped);
  } catch (e) {
    console.error("GET /sessions/:sessionId/messages error:", e);
    res.json(sessionManager.getRecentMessages(sessionId, 100));
  }
});

// GET /api/sessions/:sessionId/media - Returns media for a session
router.get("/:sessionId/media", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.params;
  const mediaDir = path.join(uploadDir, sessionId);
  if (!fs.existsSync(mediaDir)) return res.json([]);
  const files = fs.readdirSync(mediaDir).map(f => ({
    uri: `/uploads/${sessionId}/${f}`,
    name: f,
    uploadedAt: new Date(fs.statSync(path.join(mediaDir, f)).mtime).toISOString(),
  }));
  res.json(files);
});

// POST /api/sessions/:sessionId/media - Upload media for a session
router.post("/:sessionId/media", authMiddleware, upload.single("media"), (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.params;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const mediaDir = path.join(uploadDir, sessionId);
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
  const dest = path.join(mediaDir, req.file.filename);
  fs.renameSync(req.file.path, dest);
  res.json({
    uri: `/uploads/${sessionId}/${req.file.filename}`,
    name: req.file.originalname,
    mimeType: req.file.mimetype,
    uploadedAt: new Date().toISOString(),
  });
});

// POST /api/sessions/:sessionId/end - Ends a session and saves outcome
router.post("/:sessionId/end", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.params;
  const { outcome, proofImageBase64, proofFileName } = req.body as { outcome: string; proofImageBase64?: string; proofFileName?: string };
  const userId = req.user!.id;

  if (!outcome) return res.status(400).json({ error: "outcome is required" });

  const session = sessionManager.getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.createdBy !== userId) return res.status(403).json({ error: "Not authorized to end this session" });

  console.log(`📋 SESSION ENDED VIA API | sessionId: ${sessionId} | outcome: ${outcome}${proofImageBase64 ? " | proof: " + (proofFileName || "attached") : ""}`);

  await sessionManager.endSession(sessionId);

  if (outcome === "resolved") {
    await incrementStat('resolvedReports');
    await User.findOneAndUpdate(
      { deviceId: userId },
      { $inc: { alertsHandled: 1, reputation: 15, impactPoints: 10 } }
    );
  } else if (outcome === "partial") {
    await User.findOneAndUpdate(
      { deviceId: userId },
      { $inc: { alertsHandled: 1, reputation: 5, impactPoints: 3 } }
    );
  }

  if (session.type === "SOS") {
    await incrementStat('sosHandled');
  }

  res.json({
    success: true,
    sessionId,
    outcome,
    proofReceived: !!proofImageBase64,
    endedAt: new Date().toISOString(),
  });
});

export default router;