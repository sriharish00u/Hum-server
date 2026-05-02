const isProduction = process.env.NODE_ENV === "production";

if (!process.env.JWT_SECRET) {
  if (isProduction) {
    throw new Error(
      "CRITICAL: Running in production without JWT_SECRET set. " +
      "Set JWT_SECRET env var to a secure random string (min 32 chars). " +
      "Example: JWT_SECRET=$(openssl rand -hex 32)"
    );
  }
  console.warn("⚠️  WARNING: JWT_SECRET not set. Using insecure default for development only.");
}

export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

// Refresh tokens use a separate secret to allow rotation/revocation
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + "-refresh";

if (isProduction && !process.env.REFRESH_TOKEN_SECRET) {
  throw new Error(
    "CRITICAL: Running in production without REFRESH_TOKEN_SECRET set. " +
    "Set REFRESH_TOKEN_SECRET env var to a secure random string (min 32 chars). " +
    "Example: REFRESH_TOKEN_SECRET=$(openssl rand -hex 32)"
  );
}

const getCorsOrigins = (): string[] => {
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(",").filter(Boolean) || [];
  if (isProduction && envOrigins.length === 0) {
    throw new Error(
      "CRITICAL: Running in production without ALLOWED_ORIGINS set. " +
      "Set ALLOWED_ORIGINS env var (comma-separated) to allow specific origins. " +
      "Example: ALLOWED_ORIGINS=https://your-domain.com"
    );
  }
  return isProduction ? envOrigins : ["*"];
};

export { getCorsOrigins };