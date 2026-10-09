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
