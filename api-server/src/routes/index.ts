import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agoraRouter from "./agora";
import sessionsRouter from "./sessions";
import dataRouter from "./data";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/agora", agoraRouter);
router.use("/sessions", sessionsRouter);
router.use("/api", dataRouter);

export default router;
