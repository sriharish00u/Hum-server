import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agoraRouter from "./agora";
import sessionsRouter from "./sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/agora", agoraRouter);
router.use("/sessions", sessionsRouter);

export default router;
