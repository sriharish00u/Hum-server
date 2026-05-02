import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agoraRouter from "./agora";
import sessionsRouter from "./sessions";
import authRouter from "./auth";
import dataRouter from "./data";
import communityRouter from "./community";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/agora", agoraRouter);
router.use("/sessions", sessionsRouter);
router.use("/auth", authRouter);
router.use("/communities", communityRouter);
router.use(dataRouter);

export default router;
