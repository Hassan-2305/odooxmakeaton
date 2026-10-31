import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { CSRF_HEADER } from "../middleware/csrf.js";
import { RESET_TOKEN_TTL_MS } from "../services/password-reset.service.js";
import { createTestApp, testHasher } from "../test/test-app.js";

const OLD_PASSWORD = "Old!passw0rd";
const NEW_PASSWORD = "N3w!password";
const EMAIL = "asha@example.in";
const MINUTE = 60_000;

let ctx: ReturnType<typeof createTestApp>;

beforeEach(async () => {
  ctx = createTestApp();
  ctx.store.addUser("customer", EMAIL, await testHasher.hash(OLD_PASSWORD), { name: "Asha" });
});

async function client() {
  const agent = request.agent(ctx.app);
  const { body } = await agent.get("/api/auth/csrf");
  return {
    agent,
    post: (path: string, payload?: object) =>
      agent.post(path).set(CSRF_HEADER, body.csrfToken).send(payload),
  };
}

/** Requests a reset and returns the token from the emailed link. */
async function requestResetToken(email = EMAIL) {
  const c = await client();
  await c.post("/api/auth/forgot-password", { email });
  const message = ctx.mail.sent.at(-1)!;
  const link = message.text.match(/https?:\/\/\S+/)![0];
  return new URL(link).searchParams.get("token")!;
}

async function reset(token: string, password = NEW_PASSWORD) {
  const c = await client();
  return c.post("/api/auth/reset-password", { token, password, confirmPassword: password });
}

async function login(password: string) {
  const c = await client();
  return c.post("/api/auth/login", { email: EMAIL, password });
}

describe("POST /api/auth/forgot-password", () => {
  const expectedBody = {
    ok: true,
    message: "If an account exists for that email, we've sent a link to reset the password.",
  };

  it("emails a reset link to an existing account", async () => {
    const c = await client();
    const res = await c.post("/api/auth/forgot-password", { email: "ASHA@example.in" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expectedBody);
    expect(ctx.mail.sent).toHaveLength(1);
    const message = ctx.mail.sent[0]!;
    expect(message.to).toBe(EMAIL);
    expect(message.subject).toBe("Reset your Brightloop One password");
    expect(message.text).toMatch(/http:\/\/localhost:3000\/reset-password\?token=[\w-]{43}/);
    expect(message.text).toContain("expires in 30 minutes");
  });

  it("responds identically for an unknown email and sends nothing", async () => {
    const c = await client();
    const res = await c.post("/api/auth/forgot-password", { email: "nobody@example.in" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expectedBody);
    expect(ctx.mail.sent).toHaveLength(0);
    expect(ctx.store.resets).toHaveLength(0);
  });

  it("responds identically for a deactivated account and sends nothing", async () => {
    ctx.store.addUser("staff", "gone@example.in", "x", { isActive: false });
    const c = await client();
    const res = await c.post("/api/auth/forgot-password", { email: "gone@example.in" });

    expect(res.body).toEqual(expectedBody);
    expect(ctx.mail.sent).toHaveLength(0);
  });

  it("stores only a hash of the token, expiring in 30 minutes", async () => {
    const token = await requestResetToken();
    const [stored] = ctx.store.resets;

    expect(stored!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.expiresAt.getTime() - ctx.clock.now().getTime()).toBe(RESET_TOKEN_TTL_MS);
    expect(RESET_TOKEN_TTL_MS).toBe(30 * MINUTE);
  });

  it("still validates the email", async () => {
    const c = await client();
    const res = await c.post("/api/auth/forgot-password", { email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("email");
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets the new password so only it works for login", async () => {
    const token = await requestResetToken();

    const res = await reset(token);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((await login(NEW_PASSWORD)).status).toBe(200);
    expect((await login(OLD_PASSWORD)).status).toBe(401);
  });

  it("is single use: the same token fails the second time", async () => {
    const token = await requestResetToken();

    expect((await reset(token)).status).toBe(200);
    const second = await reset(token, "An0ther!pass");

    expect(second.status).toBe(400);
    expect(second.body.error).toEqual({
      code: "invalid_reset_token",
      message: "This reset link is invalid or has expired. Request a new one.",
    });
    expect((await login(NEW_PASSWORD)).status).toBe(200);
    expect((await login("An0ther!pass")).status).toBe(401);
  });

  it("is single use even when two resets race", async () => {
    const token = await requestResetToken();

    const results = await Promise.all([reset(token), reset(token, "An0ther!pass")]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("works just before the 30 minutes are up", async () => {
    const token = await requestResetToken();
    ctx.clock.advance(30 * MINUTE - 1000);

    expect((await reset(token)).status).toBe(200);
  });

  it("expires after 30 minutes", async () => {
    const token = await requestResetToken();
    ctx.clock.advance(30 * MINUTE);

    const res = await reset(token);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reset_token");
    expect((await login(OLD_PASSWORD)).status).toBe(200);
  });

  it("voids an older link when a new one is requested", async () => {
    const first = await requestResetToken();
    const second = await requestResetToken();

    expect((await reset(first)).status).toBe(400);
    expect((await reset(second)).status).toBe(200);
  });

  it("rejects an unknown token", async () => {
    const res = await reset("made-up-token");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_reset_token");
  });

  it("signs the user out of every existing session", async () => {
    const signedIn = await client();
    await signedIn.post("/api/auth/login", { email: EMAIL, password: OLD_PASSWORD });
    expect((await signedIn.agent.get("/api/auth/me")).status).toBe(200);

    await reset(await requestResetToken());

    expect((await signedIn.agent.get("/api/auth/me")).status).toBe(401);
    expect(ctx.store.sessions.size).toBe(0);
  });

  it("applies the password rule to the new password", async () => {
    const token = await requestResetToken();

    const res = await reset(token, "weakpass");

    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("password");
    // A rejected attempt doesn't burn the token.
    expect((await reset(token)).status).toBe(200);
  });
});
