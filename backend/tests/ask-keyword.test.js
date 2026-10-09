/*
  Ask Echo and AI features when NO AI provider is configured (the default).
  Echo must stay useful and honest: keyword retrieval, clear messaging,
  and AI-only endpoints that say they're unavailable.
*/
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupEnv, startApp, newUser, uploadAudio, memoryBody } = require("./helpers");

setupEnv("askkeyword");

let ctx;
let user;
before(async () => {
  ctx = await startApp();
  user = await newUser(ctx.app, "Noor");
  for (const m of [
    memoryBody({ title: "Ujjain at dawn", story: "Mahakal temple aarti with the family.", date: "2023-10-12", location: "Ujjain", people: ["Nani"] }),
    memoryBody({ title: "Grandmother's kitchen", story: "Nani taught me to roll rotis in October.", date: "2021-10-02", location: "Bhopal", people: ["Nani"] }),
    memoryBody({ title: "Exam week", story: "Too much coffee.", date: "2024-03-02", location: "Hostel", people: [] }),
  ]) {
    await user.post("/api/memories").send(m);
  }
});
after(async () => {
  await ctx.close();
});

test("returns real matching memories and says AI answers are off", async () => {
  const res = await user.post("/api/echo/ask").send({ question: "Show me memories from October that mention Nani" });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, "keyword");
  assert.equal(res.body.retrieval, "keyword");
  assert.match(res.body.answer, /AI answers aren't switched on/);
  assert.deepEqual(res.body.filters.months, ["October"]);
  assert.deepEqual(res.body.filters.people, ["Nani"]);
  assert.deepEqual(res.body.sources.map((s) => s.title).sort(), ["Grandmother's kitchen", "Ujjain at dawn"]);
  assert.ok(res.body.sources.every((s) => s.id && s.date));
});

test("handles no results and an empty archive honestly", async () => {
  const res = await user.post("/api/echo/ask").send({ question: "skiing holiday" });
  assert.equal(res.body.sources.length, 0);
  assert.equal(res.body.insufficient, true);

  const fresh = await newUser(ctx.app, "Empty");
  const empty = await fresh.post("/api/echo/ask").send({ question: "anything at all" });
  assert.match(empty.body.answer, /archive is empty/);
});

test("validates the question", async () => {
  assert.equal((await user.post("/api/echo/ask").send({ question: "" })).status, 400);
  assert.equal((await user.post("/api/echo/ask").send({ question: "x".repeat(501) })).status, 400);
});

test("AI-only endpoints explain they are not configured", async () => {
  const list = await user.get("/api/memories");
  const enrich = await user.post(`/api/memories/${list.body.memories[0].id}/enrich`);
  assert.equal(enrich.status, 503);
  assert.equal(enrich.body.code, "AI_DISABLED");

  const audio = await uploadAudio(user);
  const tr = await user.post(`/api/media/${audio.id}/transcribe`);
  assert.equal(tr.status, 503);
  assert.match(tr.body.message, /type a transcript/);

  const reindex = await user.post("/api/echo/reindex");
  assert.equal(reindex.body.indexed, 0);
});
