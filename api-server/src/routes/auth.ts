import { Router } from "express";
import { User } from "../models/user.model";
import jwt from 'jsonwebtoken';
import { JWT_SECRET, REFRESH_TOKEN_SECRET } from '../lib/config';
import { authMiddleware, type AuthenticatedRequest, generateToken, generateRefreshToken } from "../middleware/auth";
import { validateDeviceRegister, validateDeviceName } from "../middleware/validation";
import rateLimit from "express-rate-limit";

const router = Router();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/device", authRateLimiter, validateDeviceRegister, async (req: AuthenticatedRequest, res) => {
  try {
    const { deviceId, name } = req.parsedBody as { deviceId: string; name?: string };

    const user = await User.findOneAndUpdate(
      { deviceId },
      { $setOnInsert: { name: name || 'Anonymous', deviceId } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const token = generateToken(user.deviceId);
    const refreshToken = generateRefreshToken(user.deviceId);

    res.json({
      token,
      refreshToken,
      user: {
        deviceId: user.deviceId,
        name: user.name,
        avatarId: user.avatarId,
        reputation: user.reputation,
        alertsHandled: user.alertsHandled,
        reportsSubmitted: user.reportsSubmitted,
        activitiesJoined: user.activitiesJoined,
        impactPoints: user.impactPoints,
      },
    });
  } catch (error) {
    console.error("Device register error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/device", authMiddleware, validateDeviceName, async (req: AuthenticatedRequest, res) => {
  try {
    const { name } = req.parsedBody as { name: string };
    const deviceId = req.user!.id;

    const user = await User.findOneAndUpdate(
      { deviceId },
      { name: name.trim() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      deviceId: user.deviceId,
      name: user.name,
      avatarId: user.avatarId,
      reputation: user.reputation,
      alertsHandled: user.alertsHandled,
      reportsSubmitted: user.reportsSubmitted,
      activitiesJoined: user.activitiesJoined,
      impactPoints: user.impactPoints,
    });
  } catch (error) {
    console.error("Device update error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/device/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await User.findOne({ deviceId: req.user!.id });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      deviceId: user.deviceId,
      name: user.name,
      avatarId: user.avatarId,
      reputation: user.reputation,
      alertsHandled: user.alertsHandled,
      reportsSubmitted: user.reportsSubmitted,
      activitiesJoined: user.activitiesJoined,
      impactPoints: user.impactPoints,
    });
  } catch (error) {
    console.error("GET /device/me error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/device/volunteer-verify", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { proofImageBase64 } = req.body;
  if (!proofImageBase64) return res.status(400).json({ message: "Proof image required" });

  // Reject payloads over ~1MB base64 (~750KB image)
  if (proofImageBase64.length > 1_000_000) {
    return res.status(413).json({ message: "Image too large. Max 750KB." });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) return res.status(500).json({ message: "AI verification not configured" });

  try {
    const user = await User.findOne({ deviceId: req.user!.id });
    if (!user) return res.status(404).json({ message: "User not found" });

    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: proofImageBase64 } },
            { text: 'This image is submitted as proof of volunteer or first-aid certification. Does it appear to show a legitimate certification card, ID badge, medical training certificate, or similar official credential? Reply with only JSON: {"verified": true/false, "reason": "brief reason"}' }
          ]
        }]
      }),
    });

    const aiData: any = await aiResponse.json();
    const textContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let result = { verified: false, reason: "Could not parse AI response" };
    try {
      result = JSON.parse(textContent.replace(/```json|```/g, "").trim());
    } catch {}

    // Sanitize and length-cap the reason field to prevent prompt injection
    const sanitizedReason = String(result.reason).slice(0, 200).replace(/[<>{}]/g, '');

    user.isVerifiedVolunteer = result.verified;
    user.volunteerVerificationStatus = result.verified ? "verified" : "rejected";
    await user.save();

    res.json({ status: user.volunteerVerificationStatus, reason: sanitizedReason });
  } catch (error) {
    console.error("Volunteer verify error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Missing refresh token' });
  try {
    // Verify with refresh-specific secret
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as { userId: string };
    
    // Check if token has been revoked (optional: check stored hash in DB)
    const user = await User.findOne({ deviceId: decoded.userId });
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    const newToken = generateToken(decoded.userId);
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

export default router;
