import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

type AuthRole = "level1" | "level2" | "admin";

interface AuthTokenConfig {
  token: string;
  user: string;
  role: AuthRole;
}

interface AuthRequest extends Request {
  user?: { name: string; role: AuthRole };
}

function findToken(token: string): AuthTokenConfig | undefined {
  return config.auth.tokens.find((entry) => entry.token === token);
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = String(req.headers["authorization"] || req.headers["x-auth-token"] || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();

  if (!token) {
    if (config.auth.allowAnonymous || config.auth.tokens.length === 0) {
      req.user = { name: "anonymous", role: "level1" };
      next();
      return;
    }
    res.status(401).json({ error: "Token de autenticación requerido" });
    return;
  }

  const auth = findToken(token);
  if (!auth) {
    res.status(403).json({ error: "Token de autenticación inválido" });
    return;
  }

  req.user = { name: auth.user, role: auth.role };
  next();
}

export function authorizeRoles(allowedRoles: AuthRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(403).json({ error: "Acceso no autorizado" });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: "Rol no autorizado para esta operación" });
      return;
    }
    next();
  };
}
