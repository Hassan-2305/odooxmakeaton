import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@brightloop/shared";
import { type Request, type RequestHandler, Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "../lib/errors.js";
import { clearSessionCookie, currentUser, requireAuth, setSessionCookie } from "../middleware/auth.js";
import type { Csrf } from "../middleware/csrf.js";
import { validate } from "../middleware/validate.js";
import type { AuthService, IssuedSession } from "../services/auth.service.js";

export interface AuthRateLimit {
  windowMs: number;
  limit: number;
}

interface Deps {
  authService: AuthService;
  csrf: Csrf;
  secureCookies: boolean;
  /** Per-IP limit on register and login. `false` disables it. */
  rateLimit?: AuthRateLimit | false;
}

const DEFAULT_RATE_LIMIT: AuthRateLimit = { windowMs: 15 * 60 * 1000, limit: 20 };

export function createAuthRouter({ authService, csrf, secureCookies, rateLimit: limits = DEFAULT_RATE_LIMIT }: Deps) {
  const router = Router();

  const limiter: RequestHandler = limits
    ? rateLimit({
        windowMs: limits.windowMs,
        limit: limits.limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_req, _res, next) =>
          next(new AppError(429, "rate_limited", "Too many attempts. Try again in a few minutes.")),
      })
    : (_req, _res, next) => next();

  const meta = (req: Request) => ({ userAgent: req.get("user-agent")?.slice(0, 500), ip: req.ip });

  /** Sets the session cookie and a CSRF token bound to the new session. */
  function signIn(res: Parameters<RequestHandler>[1], session: IssuedSession) {
    setSessionCookie(res, session.token, session.expiresAt, secureCookies);
    return csrf.issue(res, session.sessionId);
  }

  /** Issues a CSRF token for the current session (or the signed-out state). */
  router.get("/csrf", (req, res) => {
    res.json({ csrfToken: csrf.issue(res, csrf.bindingOf(req)) });
  });

  router.post("/register", limiter, validate({ body: registerSchema }), async (req, res) => {
    const session = await authService.register(req.body as RegisterInput, meta(req));
    const csrfToken = signIn(res, session);
    res.status(201).json({ user: session.user, csrfToken });
  });

  router.post("/login", limiter, validate({ body: loginSchema }), async (req, res) => {
    // Replace, don't stack, sessions when someone signs in again.
    if (req.auth) await authService.logout(req.auth.sessionId);
    const session = await authService.login(req.body as LoginInput, meta(req));
    const csrfToken = signIn(res, session);
    res.json({ user: session.user, csrfToken });
  });

  router.post("/logout", async (req, res) => {
    if (req.auth) await authService.logout(req.auth.sessionId);
    clearSessionCookie(res, secureCookies);
    res.json({ csrfToken: csrf.issue(res, "anon") });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: currentUser(req) });
  });

  return router;
}
