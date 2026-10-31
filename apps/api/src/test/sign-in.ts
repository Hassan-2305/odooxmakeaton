import type { UserRole } from "@brightloop/shared";
import type { Express } from "express";
import request from "supertest";
import { CSRF_HEADER } from "../middleware/csrf.js";
import type { createFakeAuthStore } from "./fakes.js";
import { testHasher } from "./test-app.js";

const PASSWORD = "Test!passw0rd";

/**
 * A supertest agent signed in as a new user with `role`, sending the session's
 * CSRF token on every mutating request. Pass role `null` for a signed-out client.
 */
export async function signInAs(
  app: Express,
  store: ReturnType<typeof createFakeAuthStore>,
  role: UserRole | null,
) {
  const agent = request.agent(app);
  let csrf: string = (await agent.get("/api/auth/csrf")).body.csrfToken;
  let user = undefined as ReturnType<typeof store.addUser> | undefined;

  if (role) {
    user = store.addUser(role, `${role}.${store.users.size}@brightloop.in`, await testHasher.hash(PASSWORD));
    const res = await agent.post("/api/auth/login").set(CSRF_HEADER, csrf).send({ email: user.email, password: PASSWORD });
    csrf = res.body.csrfToken;
  }

  return {
    user,
    get: (path: string) => agent.get(path),
    post: (path: string, body?: object) => agent.post(path).set(CSRF_HEADER, csrf).send(body),
    patch: (path: string, body?: object) => agent.patch(path).set(CSRF_HEADER, csrf).send(body),
    delete: (path: string) => agent.delete(path).set(CSRF_HEADER, csrf),
  };
}
