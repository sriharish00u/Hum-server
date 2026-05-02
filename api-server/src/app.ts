import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import rateLimit from "express-rate-limit";
import { getCorsOrigins } from "./lib/config";
import path from "path";

const app: Express = express();

const isProduction = process.env.NODE_ENV === "production";
const corsOrigins = getCorsOrigins();

const corsOptions: cors.CorsOptions = {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 100 : 1000,
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.use("/api", apiLimiter);
app.use("/api", router);

export default app;
