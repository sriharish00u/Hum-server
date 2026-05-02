import { Router, type IRouter } from "express";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { authMiddleware } from "../middleware/auth";

const router: IRouter = Router();

const APP_ID = process.env.AGORA_APP_ID || "";
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || "";
const TOKEN_EXPIRY = 3600;

router.get("/token", authMiddleware, (req, res) => {
  const { channelName, uid } = req.query;

  if (!channelName || !uid) {
    res.status(400).json({ error: "channelName and uid are required" });
    return;
  }

  if (!APP_ID || !APP_CERTIFICATE) {
    res.status(500).json({ error: "Agora credentials not configured" });
    return;
  }

  const channel = channelName as string;
  const userId = parseInt(uid as string, 10) || 0;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(APP_ID, APP_CERTIFICATE, channel, userId, RtcRole.PUBLISHER, TOKEN_EXPIRY, 0);
    res.json({ token, channelName: channel, uid: userId });
  } catch (error) {
    console.error("Failed to generate Agora token:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

export default router;