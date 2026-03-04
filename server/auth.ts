import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "dorun-coin-dev-secret";

export interface StockUser {
  userId: string;
  role: string;
  organizationId?: number;
  username?: string;
}

// JWT 검증 미들웨어 (두런 코인과 시크릿 공유)
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "로그인 필요" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    (req as any).user = {
      userId: decoded.userId,
      role: decoded.role,
      organizationId: decoded.organizationId,
      username: decoded.username,
    } as StockUser;
    next();
  } catch {
    res.status(401).json({ error: "토큰 만료 또는 유효하지 않음" });
  }
}

// SSO 토큰 검증 (coin_token → stock session)
export function verifySsoToken(token: string): StockUser | null {
  const secrets = [
    process.env.HUB_SSO_SECRET,
    "hub-sso-shared-secret",
    JWT_SECRET,
  ].filter(Boolean) as string[];

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret) as any;
      return {
        userId: decoded.userId,
        role: decoded.role,
        organizationId: decoded.organizationId,
        username: decoded.username,
      };
    } catch {
      // try next secret
    }
  }
  return null;
}

// stock 전용 JWT 발급
export function generateStockToken(user: StockUser): string {
  return jwt.sign({ ...user, type: "access" }, JWT_SECRET, { expiresIn: "2h" });
}
