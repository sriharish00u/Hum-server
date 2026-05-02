import { type Request, type Response, type NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AuthenticatedRequest } from './auth';

declare module 'express' {
  interface Request {
    parsedBody?: unknown;
  }
}

export const validate = <T>(schema: ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.format();
      return res.status(400).json({ error: 'Invalid request body', details: errors });
    }
    req.parsedBody = result.data;
    next();
  };
};

// Specific schemas for our API endpoints
export const reportSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().optional(),
  }),
  category: z.string().optional(),
  anonymous: z.boolean().optional(),
});

export const activitySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().optional(),
  }),
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()).optional(),
  maxParticipants: z.number().int().positive().optional(),
});

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const sessionEndSchema = z.object({
  outcome: z.enum(["resolved", "partial", "unresolved"]),
});

export const reportStatusSchema = z.object({
  status: z.enum(["open", "resolved"]),
});

export const deviceRegisterSchema = z.object({
  deviceId: z.string().min(1).max(128),
  name: z.string().min(1).max(32).optional(),
});

export const deviceNameSchema = z.object({
  name: z.string().min(2).max(32).trim(),
});

export const validateDeviceRegister = validate(deviceRegisterSchema);
export const validateDeviceName = validate(deviceNameSchema);

// Export ready‑to‑use middleware functions
export const validateReport = validate(reportSchema);
export const validateActivity = validate(activitySchema);
export const validateRegister = validate(registerSchema);
export const validateLogin = validate(loginSchema);
export const validateSessionEnd = validate(sessionEndSchema);
export const validateReportStatus = validate(reportStatusSchema);
