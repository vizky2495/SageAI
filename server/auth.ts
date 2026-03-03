import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export const adminTokens = new Set<string>();
export const authSessions = new Map<string, { userId: string; isAdmin: boolean; createdAt: number }>();

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of authSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      authSessions.delete(token);
      adminTokens.delete(token);
    }
  }
}

setInterval(cleanExpiredSessions, 60 * 60 * 1000);

export function getSessionFromRequest(req: Request): { userId: string; isAdmin: boolean } | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const session = authSessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    authSessions.delete(token);
    adminTokens.delete(token);
    return null;
  }
  return session;
}

export function createSession(userId: string, isAdmin: boolean): string {
  const token = crypto.randomUUID();
  authSessions.set(token, { userId, isAdmin, createdAt: Date.now() });
  if (isAdmin) {
    adminTokens.add(token);
  }
  return token;
}

export function destroySession(token: string): void {
  authSessions.delete(token);
  adminTokens.delete(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ message: "Authentication required" });
  }
  (req as any).userId = session.userId;
  (req as any).isAdmin = session.isAdmin;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!session.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  (req as any).userId = session.userId;
  (req as any).isAdmin = session.isAdmin;
  next();
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
