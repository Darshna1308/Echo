/* Rate limits are skipped in other tests; this file switches them on. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupEnv, startApp } = require("./helpers");

setupEnv("ratelimit", { TEST_RATE_LIMITS: "1", RATE_LIMIT_AUTH: "3" });
const request = require("supertest");

let ctx;
before(async () => {
  ctx = await startApp();
});
after(async () => {
  await ctx.close();
});

test("repeated login attempts are throttled with 429", async () => {
  const statuses = [];
  for (let i = 0; i < 5; i += 1) {
    const res = await request(ctx.app).post("/api/auth/login").send({ email: "x@example.com", password: "wrong-password" });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

test("the limit is per account, so another email from the same network still works", async () => {
  const res = await request(ctx.app).post("/api/auth/login").send({ email: "someone-else@example.com", password: "wrong-password" });
  assert.equal(res.status, 401);
});

test("a per-IP ceiling still stops spraying many accounts", async () => {
  let last;
  for (let i = 0; i < 50; i += 1) {
    last = await request(ctx.app).post("/api/auth/login").send({ email: `spray${i}@example.com`, password: "wrong-password" });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
});
