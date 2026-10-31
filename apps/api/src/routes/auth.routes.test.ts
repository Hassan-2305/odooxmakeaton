import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "../lib/logger.js";
import { loadSession, requireAuth, requireRole } from "../middleware/auth.js";
import { CSRF_HEADER } from "../middleware/csrf.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createTestApp, testHasher } from "../test/test-app.js";

const PASSWORD = "Str0ng!pass";
const registration = {
  name: "Asha Rao",
  email: "asha@example.in",
  password: PASSWORD,
  confirmPassword: PASSWORD,
};

/** A cookie-keeping client with a CSRF token for the current session state. */
async function client(app: express.Express) {
  const agent = request.agent(app);
  const res = await agent.get("/api/auth/csrf");
  let csrfToken: string = res.body.csrfToken;
  return {
    agent,
    get csrf() {
      return csrfToken;
    },
    set csrf(token: string) {
      csrfToken = token;
    },
    post(path: string, body?: object) {
      return agent.post(path).set(CSRF_HEADER, csrfToken).send(body);
    },
  };
}

function cookie(res: request.Response, name: string) {
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  return cookies.find((c) => c.startsWith(`${name}=`));
}

let ctx: ReturnType<typeof createTestApp>;
beforeEach(() => {
  ctx = createTestApp();
});

describe("POST /api/auth/register", () => {
  it("creates a customer user, signs them in and hashes the password", async () => {
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/register", registration);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: "asha@example.in",
      name: "Asha Rao",
      role: "customer",
      customerId: expect.any(String),
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(cookie(res, "bl_session")).toBeDefined();

    const stored = [...ctx.store.users.values()][0]!;
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("ignores a role in the body: public sign-up is customer only", async () => {
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/register", { ...registration, role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("customer");
  });

  it("returns 409 for a duplicate email, ignoring case", async () => {
    const c = await client(ctx.app);
    await c.post("/api/auth/register", registration);

    const again = await client(ctx.app);
    const res = await again.post("/api/auth/register", { ...registration, email: "ASHA@Example.in" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "email_taken", details: { field: "email" } });
  });

  it("returns 409 when a concurrent sign-up wins the unique constraint", async () => {
    ctx.store.failNextCreate();
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/register", registration);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });

  it("returns 400 with a password field error for a weak password", async () => {
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/register", {
      ...registration,
      password: "weakpass",
      confirmPassword: "weakpass",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.fields.password).toEqual([
      "Password must be more than 8 characters",
      "Password must contain an uppercase letter",
      "Password must contain a special character",
    ]);
    expect(ctx.store.users.size).toBe(0);
  });

  it("returns 400 on confirmPassword when the passwords differ", async () => {
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/register", { ...registration, confirmPassword: "Other!pass1" });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ confirmPassword: ["Passwords do not match"] });
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    ctx.store.addUser("staff", "sam@brightloop.in", await testHasher.hash(PASSWORD));
  });

  it("sets an httpOnly, SameSite=Lax session cookie", async () => {
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/login", { email: "Sam@Brightloop.in", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "sam@brightloop.in", role: "staff", customerId: null });

    const session = cookie(res, "bl_session")!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/Path=\//);
    expect(session).toMatch(/Expires=/);
    expect(session).not.toMatch(/Secure/i);

    const csrf = cookie(res, "bl_csrf")!;
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(res.body.csrfToken).toEqual(expect.any(String));
  });

  it("stores only a hash of the session token", async () => {
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/login", { email: "sam@brightloop.in", password: PASSWORD });

    const token = cookie(res, "bl_session")!.split(";")[0]!.split("=")[1]!;
    const [storedId] = [...ctx.store.sessions.keys()];
    expect(storedId).toMatch(/^[0-9a-f]{64}$/);
    expect(storedId).not.toBe(token);
  });

  it.each([
    ["a wrong password", { email: "sam@brightloop.in", password: "Wr0ng!pass" }],
    ["an unknown email", { email: "nobody@brightloop.in", password: PASSWORD }],
  ])("returns the same 401 for %s", async (_label, body) => {
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/login", body);

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({
      code: "invalid_credentials",
      message: "Email or password is incorrect",
    });
    expect(cookie(res, "bl_session")).toBeUndefined();
  });

  it("rejects deactivated users", async () => {
    ctx.store.addUser("staff", "gone@brightloop.in", await testHasher.hash(PASSWORD), { isActive: false });
    const c = await client(ctx.app);
    const res = await c.post("/api/auth/login", { email: "gone@brightloop.in", password: PASSWORD });

    expect(res.status).toBe(401);
  });

  it("replaces the previous session when signing in again", async () => {
    const c = await client(ctx.app);
    const first = await c.post("/api/auth/login", { email: "sam@brightloop.in", password: PASSWORD });
    c.csrf = first.body.csrfToken;
    await c.post("/api/auth/login", { email: "sam@brightloop.in", password: PASSWORD });

    expect(ctx.store.sessions.size).toBe(1);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the signed-in user's role", async () => {
    ctx.store.addUser("admin", "root@brightloop.in", await testHasher.hash(PASSWORD));
    const c = await client(ctx.app);
    await c.post("/api/auth/login", { email: "root@brightloop.in", password: PASSWORD });

    const res = await c.agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "root@brightloop.in", role: "admin" });
  });

  it("returns role customer with a customerId after registering", async () => {
    const c = await client(ctx.app);
    await c.post("/api/auth/register", registration);

    const res = await c.agent.get("/api/auth/me");

    expect(res.body.user.role).toBe("customer");
    expect(res.body.user.customerId).toEqual(expect.any(String));
  });

  it("returns 401 without a session", async () => {
    const res = await request(ctx.app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns 401 and clears the cookie for an unknown session token", async () => {
    const res = await request(ctx.app).get("/api/auth/me").set("Cookie", "bl_session=forged");

    expect(res.status).toBe(401);
    expect(cookie(res, "bl_session")).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("POST /api/auth/logout", () => {
  it("ends the session server-side and clears the cookie", async () => {
    const c = await client(ctx.app);
    const reg = await c.post("/api/auth/register", registration);
    c.csrf = reg.body.csrfToken;

    const res = await c.post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(ctx.store.sessions.size).toBe(0);
    expect((await c.agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("CSRF protection", () => {
  it("rejects a mutating request without a token", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ email: "a@b.in", password: "x" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("csrf_invalid");
  });

  it("rejects a header that doesn't match the cookie", async () => {
    const c = await client(ctx.app);
    const other = await client(ctx.app);
    const res = await c.agent
      .post("/api/auth/login")
      .set(CSRF_HEADER, other.csrf)
      .send({ email: "a@b.in", password: "x" });

    expect(res.status).toBe(403);
  });

  it("rejects a forged token even when header and cookie match", async () => {
    const forged = "nonce.signature";
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .set("Cookie", `bl_csrf=${forged}`)
      .set(CSRF_HEADER, forged)
      .send({ email: "a@b.in", password: "x" });

    expect(res.status).toBe(403);
  });

  it("binds tokens to the session: the signed-out token stops working after login", async () => {
    ctx.store.addUser("staff", "sam@brightloop.in", await testHasher.hash(PASSWORD));
    const c = await client(ctx.app);
    const anonToken = c.csrf;
    const login = await c.post("/api/auth/login", { email: "sam@brightloop.in", password: PASSWORD });

    // The browser now holds the new cookie; replaying the old token in the header fails.
    const stale = await c.agent.post("/api/auth/logout").set(CSRF_HEADER, anonToken);
    expect(stale.status).toBe(403);

    const fresh = await c.agent.post("/api/auth/logout").set(CSRF_HEADER, login.body.csrfToken);
    expect(fresh.status).toBe(200);
  });

  it("lets GET requests through without a token", async () => {
    expect((await request(ctx.app).get("/api/health")).status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("returns 429 after too many attempts from one IP", async () => {
    const { app } = createTestApp({ authRateLimit: { windowMs: 60_000, limit: 2 } });
    const c = await client(app);
    const attempt = () => c.post("/api/auth/login", { email: "x@y.in", password: "Wr0ng!pass" });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    expect(limited.headers).toHaveProperty("ratelimit");
  });
});

describe("requireAuth / requireRole", () => {
  function guardedApp() {
    const app = express();
    app.use(cookieParser());
    app.use(loadSession(ctx.authService, { secure: false }));
    app.get("/any", requireAuth, (_req, res) => void res.json({ ok: true }));
    app.get("/admin", requireRole("admin"), (_req, res) => void res.json({ ok: true }));
    app.get("/back-office", requireRole("admin", "staff"), (_req, res) => void res.json({ ok: true }));
    app.get("/portal", requireRole("customer"), (_req, res) => void res.json({ ok: true }));
    app.use(errorHandler(silentLogger));
    return app;
  }

  async function sessionCookieFor(role: "admin" | "staff" | "customer") {
    const email = `${role}@brightloop.in`;
    ctx.store.addUser(role, email, await testHasher.hash(PASSWORD));
    const session = await ctx.authService.login({ email, password: PASSWORD });
    return `bl_session=${session.token}`;
  }

  it("returns 401 for every guarded route when signed out", async () => {
    const app = guardedApp();
    for (const path of ["/any", "/admin", "/back-office", "/portal"]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it.each([
    ["admin", { "/any": 200, "/admin": 200, "/back-office": 200, "/portal": 403 }],
    ["staff", { "/any": 200, "/admin": 403, "/back-office": 200, "/portal": 403 }],
    ["customer", { "/any": 200, "/admin": 403, "/back-office": 403, "/portal": 200 }],
  ] as const)("allows %s only where listed", async (role, expected) => {
    const app = guardedApp();
    const sessionCookie = await sessionCookieFor(role);
    for (const [path, status] of Object.entries(expected)) {
      const res = await request(app).get(path).set("Cookie", sessionCookie);
      expect(res.status, `${role} ${path}`).toBe(status);
    }
  });
});
