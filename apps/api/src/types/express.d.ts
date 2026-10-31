import type { AuthUser } from "@brightloop/shared";

declare global {
  namespace Express {
    interface Request {
      /** Set by loadSession when the request carries a valid session cookie. */
      auth?: { user: AuthUser; sessionId: string };
    }
  }
}

export {};
