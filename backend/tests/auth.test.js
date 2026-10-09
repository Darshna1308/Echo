const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { setupEnv, startApp, newUser } = require("./helpers");

setupEnv("auth");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

let ctx;
before(async () => {
  ctx = await startApp();
});
after(async () => {
  await ctx.close();
});

function sessionCookie(res) {
  return (res.headers["set-cookie"] || []).find((c) => c.startsWith("echo_session="));
}

describe("registration", () => {
  test("rejects missing and invalid fields with helpful messages", async () => {
    const res = await request(ctx.app).post("/api/auth/register").send({ name: "A", email: "nope", password: "123" });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    const fields = res.body.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ["email", "name", "password"]);
  });

  test("creates an account, hashes the password and sets an httpOnly session cookie", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/register")
      .send({ name: "Darshna", email: "Darshna@Example.com ", password: "a-long-password" });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, "darshna@example.com");
    assert.equal(res.body.user.password, undefined);
    assert.equal(res.body.token, undefined, "token must not be exposed to page JavaScript");

    const cookie = sessionCookie(res);
    assert.ok(cookie, "session cookie set");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);

    const User = ctx.mongoose.model("User");
    const stored = await User.findOne({ email: "darshna@example.com" }).select("+password");
    assert.notEqual(stored.password, "a-long-password");
    assert.ok(await bcrypt.compare("a-long-password", stored.password));
  });

  test("rejects a duplicate email with 409", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/register")
      .send({ name: "Someone", email: "darshna@example.com", password: "another-password" });
    assert.equal(res.status, 409);
  });
});

describe("login and sessions", () => {
  test("rejects a wrong password and an unknown email with the same message", async () => {
    const wrong = await request(ctx.app).post("/api/auth/login").send({ email: "darshna@example.com", password: "wrong-password" });
    const unknown = await request(ctx.app).post("/api/auth/login").send({ email: "nobody@example.com", password: "wrong-password" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
    assert.equal(sessionCookie(wrong), undefined);
  });

  test("logs in, restores the session with /me, and logs out", async () => {
    const agent = request.agent(ctx.app);
    const login = await agent.post("/api/auth/login").send({ email: "DARSHNA@example.com", password: "a-long-password" });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.name, "Darshna");

    const me = await agent.get("/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, "darshna@example.com");

    const out = await agent.post("/api/auth/logout");
    assert.equal(out.status, 200);
    assert.match(sessionCookie(out), /Expires=Thu, 01 Jan 1970/);

    const after = await agent.get("/api/auth/me");
    assert.equal(after.status, 401);
  });

  test("/auth/session reports the user or null without an error status", async () => {
    const anon = await request(ctx.app).get("/api/auth/session");
    assert.equal(anon.status, 200);
    assert.equal(anon.body.user, null);
    const agent = await newUser(ctx.app, "Session");
    const res = await agent.get("/api/auth/session");
    assert.equal(res.body.user.email, agent.email);
    const bad = await request(ctx.app).get("/api/auth/session").set("Cookie", "echo_session=nope");
    assert.equal(bad.status, 200);
    assert.equal(bad.body.user, null);
    assert.ok(sessionCookie(bad), "bad cookie cleared");
  });

  test("existing accounts with older 6-character passwords can still log in", async () => {
    const User = ctx.mongoose.model("User");
    await User.create({ name: "Legacy", email: "legacy@example.com", password: await bcrypt.hash("abc123", 10) });
    const res = await request(ctx.app).post("/api/auth/login").send({ email: "legacy@example.com", password: "abc123" });
    assert.equal(res.status, 200);
  });

  test("requests without a session get 401", async () => {
    for (const [method, url] of [
      ["get", "/api/auth/me"],
      ["get", "/api/memories"],
      ["post", "/api/memories"],
      ["get", "/api/search?q=x"],
      ["post", "/api/echo/ask"],
      ["get", "/api/on-this-day"],
      ["get", "/api/capsules"],
      ["post", "/api/media/upload"],
    ]) {
      const res = await request(ctx.app)[method](url).send({});
      assert.equal(res.status, 401, `${method.toUpperCase()} ${url}`);
    }
  });

  test("expired, forged and tampered tokens are rejected and cleared", async () => {
    const agent = await newUser(ctx.app, "Token");
    const id = agent.user.id;

    const expired = jwt.sign({ sub: id, tv: 0, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
    let res = await request(ctx.app).get("/api/auth/me").set("Cookie", `echo_session=${expired}`);
    assert.equal(res.status, 401);
    assert.match(res.body.message, /expired/i);
    assert.equal(res.body.code, "SESSION_INVALID");
    assert.ok(sessionCookie(res), "invalid cookie is cleared");

    const forged = jwt.sign({ sub: id, tv: 0 }, "not-the-server-secret");
    res = await request(ctx.app).get("/api/auth/me").set("Cookie", `echo_session=${forged}`);
    assert.equal(res.status, 401);

    res = await request(ctx.app).get("/api/auth/me").set("Cookie", "echo_session=garbage.value.here");
    assert.equal(res.status, 401);

    // A Bearer header is not accepted: sessions only come from the httpOnly cookie.
    const valid = jwt.sign({ sub: id, tv: 0 }, process.env.JWT_SECRET);
    res = await request(ctx.app).get("/api/auth/me").set("Authorization", `Bearer ${valid}`);
    assert.equal(res.status, 401);
  });

  test("log out everywhere invalidates every existing session", async () => {
    const agent = await newUser(ctx.app, "Everywhere");
    const second = request.agent(ctx.app);
    await second.post("/api/auth/login").send({ email: agent.email, password: "correct horse battery" });
    assert.equal((await second.get("/api/auth/me")).status, 200);

    const res = await agent.post("/api/auth/logout-all");
    assert.equal(res.status, 200);
    assert.equal((await second.get("/api/auth/me")).status, 401);
    assert.equal((await agent.get("/api/auth/me")).status, 401);
  });
});

describe("request hardening", () => {
  test("state-changing requests from an untrusted Origin are refused", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "darshna@example.com", password: "a-long-password" });
    assert.equal(res.status, 403);
  });

  test("the configured frontend origin is allowed with credentials", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: "darshna@example.com", password: "a-long-password" });
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], "http://localhost:5173");
    assert.equal(res.headers["access-control-allow-credentials"], "true");
  });

  test("API responses are marked no-store and carry security headers", async () => {
    const res = await request(ctx.app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-powered-by"], undefined);
  });

  test("malformed JSON and unknown routes return consistent JSON errors", async () => {
    let res = await request(ctx.app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad json");
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    res = await request(ctx.app).get("/api/nope");
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test("account deletion requires the password and removes the account", async () => {
    const agent = await newUser(ctx.app, "Leaving");
    let res = await agent.delete("/api/auth/account").send({ password: "wrong" });
    assert.equal(res.status, 401);
    res = await agent.delete("/api/auth/account").send({ password: "correct horse battery" });
    assert.equal(res.status, 200);
    assert.equal((await agent.get("/api/auth/me")).status, 401);
    const login = await request(ctx.app).post("/api/auth/login").send({ email: agent.email, password: "correct horse battery" });
    assert.equal(login.status, 401);
  });
});
