import type { UserRole } from "@brightloop/shared";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import type { AuthService } from "../services/auth.service.js";

export const SESSION_COOKIE = "bl_session";

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: "/" };
}

export function setSessionCookie(res: Response, token: string, expires: Date, secure: boolean) {
  res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(secure), expires });
}

export function clearSessionCookie(res: Response, secure: boolean) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(secure));
}

/** Resolves the session cookie to `req.auth`. Never rejects; use requireAuth for that. */
export function loadSession(authService: AuthService, { secure }: { secure: boolean }): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string" && token) {
      const auth = await authService.authenticate(token);
      if (auth) req.auth = auth;
      else clearSessionCookie(res, secure);
    }
    next();
  };
}

export function currentUser(req: Request) {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth.user;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  currentUser(req);
  next();
};

/** 401 when signed out, 403 when signed in with a role that isn't listed. */
export function requireRole(...roles: [UserRole, ...UserRole[]]): RequestHandler {
  return (req, _res, next) => {
    const user = currentUser(req);
    if (!roles.includes(user.role)) throw new ForbiddenError();
    next();
  };
}
