import type { Request, RequestHandler, Response } from "express";
import { AppError } from "../lib/errors.js";
import { hmac, randomToken, safeEqual } from "../lib/tokens.js";

export const CSRF_COOKIE = "bl_csrf";
export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Signed double-submit CSRF protection. The token lives in a readable cookie; the
 * client echoes it in the `x-csrf-token` header on every mutating request. Tokens
 * are HMAC-signed and bound to the current session (or "anon" when signed out), so
 * a token planted by another site or left over from an old session is rejected.
 */
export function createCsrf(secret: string, { secure }: { secure: boolean }) {
  const bindingOf = (req: Request) => req.auth?.sessionId ?? "anon";
  const sign = (binding: string, nonce: string) => hmac(secret, `${binding}.${nonce}`);

  function isValid(token: string, binding: string) {
    const [nonce, signature, extra] = token.split(".");
    if (!nonce || !signature || extra !== undefined) return false;
    return safeEqual(signature, sign(binding, nonce));
  }

  return {
    /** Sets a fresh token cookie for `binding` and returns the token. */
    issue(res: Response, binding: string): string {
      const nonce = randomToken(16);
      const token = `${nonce}.${sign(binding, nonce)}`;
      res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: "lax", secure, path: "/" });
      return token;
    },

    bindingOf,

    /** Rejects POST/PUT/PATCH/DELETE without a matching, valid token. */
    protect: ((req, _res, next) => {
      if (SAFE_METHODS.has(req.method)) {
        next();
        return;
      }
      const header = req.get(CSRF_HEADER);
      const cookie: unknown = req.cookies?.[CSRF_COOKIE];
      const ok =
        typeof header === "string" &&
        typeof cookie === "string" &&
        safeEqual(header, cookie) &&
        isValid(header, bindingOf(req));
      if (!ok) {
        throw new AppError(403, "csrf_invalid", "Missing or invalid CSRF token. Refresh and try again.");
      }
      next();
    }) satisfies RequestHandler,
  };
}

export type Csrf = ReturnType<typeof createCsrf>;
