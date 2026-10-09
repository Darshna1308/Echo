const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupEnv, startApp, newUser, uploadImage, memoryBody } = require("./helpers");

setupEnv("capsules");

let ctx;
let user;
before(async () => {
  ctx = await startApp();
  user = await newUser(ctx.app, "Kavya");
});
after(async () => {
  await ctx.close();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("validates capsule input", async () => {
  let res = await user.post("/api/capsules").send({ title: "Past", letter: "hi", unlockAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(res.status, 400);
  res = await user.post("/api/capsules").send({ title: "Empty", unlockAt: new Date(Date.now() + 60000).toISOString() });
  assert.equal(res.status, 400, "needs a letter or a memory");
});

test("a sealed capsule hides its letter and memories until the unlock time, then opens", async () => {
  const photo = await uploadImage(user);
  const created = await user.post("/api/memories").send(
    memoryBody({ title: "Graduation day secret", story: "Something to read in five years.", photos: [{ ref: photo.id }] })
  );
  const memoryId = created.body.memory.id;

  const unlockAt = new Date(Date.now() + 2500);
  const cap = await user.post("/api/capsules").send({
    title: "To me, later",
    letter: "Dear future me, I hope you kept dancing.",
    memoryIds: [memoryId],
    unlockAt: unlockAt.toISOString(),
  });
  assert.equal(cap.status, 201);
  const id = cap.body.capsule.id;
  assert.equal(cap.body.capsule.sealed, true);
  assert.equal(cap.body.capsule.canOpen, false);

  // Sealed memory is invisible everywhere.
  assert.equal((await user.get(`/api/memories/${memoryId}`)).status, 404);
  assert.equal((await user.put(`/api/memories/${memoryId}`).send(memoryBody())).status, 404);
  assert.equal((await user.delete(`/api/memories/${memoryId}`)).status, 404);
  assert.ok(!(await user.get("/api/memories")).body.memories.some((m) => m.id === memoryId));
  assert.equal((await user.get("/api/search?q=graduation")).body.total, 0);
  const ask = await user.post("/api/echo/ask").send({ question: "What did I write about graduation?" });
  assert.equal(ask.body.sources.length, 0);
  const exported = await user.get("/api/auth/export");
  assert.ok(!JSON.stringify(exported.body).includes("Dear future me"));

  // Capsule contents are withheld.
  const sealed = await user.get(`/api/capsules/${id}`);
  assert.equal(sealed.status, 200);
  assert.equal(sealed.body.capsule.sealed, true);
  assert.equal(sealed.body.capsule.letter, undefined);
  assert.equal(sealed.body.capsule.memories, undefined);
  assert.equal(sealed.body.capsule.memoryCount, 1);

  // Early opening is refused by the server.
  const early = await user.post(`/api/capsules/${id}/unlock`);
  assert.equal(early.status, 423);
  assert.equal(early.body.code, "CAPSULE_SEALED");

  // A memory can't be sealed twice.
  const twice = await user.post("/api/capsules").send({ title: "Again", memoryIds: [memoryId], unlockAt: new Date(Date.now() + 60000).toISOString() });
  assert.equal(twice.status, 400);

  await wait(unlockAt.getTime() - Date.now() + 300);

  const listed = await user.get("/api/capsules");
  assert.equal(listed.body.capsules[0].canOpen, true);

  const opened = await user.post(`/api/capsules/${id}/unlock`);
  assert.equal(opened.status, 200);
  assert.equal(opened.body.capsule.letter, "Dear future me, I hope you kept dancing.");
  assert.equal(opened.body.capsule.memories[0].title, "Graduation day secret");
  assert.equal(opened.body.capsule.sealed, false);

  // The memory is back in the archive.
  assert.equal((await user.get(`/api/memories/${memoryId}`)).status, 200);
  assert.equal((await user.get("/api/search?q=graduation")).body.total, 1);

  // Opening again is idempotent.
  assert.equal((await user.post(`/api/capsules/${id}/unlock`)).status, 200);
});

test("deleting a sealed capsule destroys its memories unseen; an opened one keeps them", async () => {
  const m1 = await user.post("/api/memories").send(memoryBody({ title: "Sealed and discarded" }));
  const sealed = await user.post("/api/capsules").send({
    title: "Never mind",
    memoryIds: [m1.body.memory.id],
    unlockAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const del = await user.delete(`/api/capsules/${sealed.body.capsule.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.deletedMemories, 1);
  const Memory = ctx.mongoose.model("Memory");
  assert.equal(await Memory.countDocuments({ _id: m1.body.memory.id }), 0);

  const m2 = await user.post("/api/memories").send(memoryBody({ title: "Kept after opening" }));
  const soon = await user.post("/api/capsules").send({
    title: "Short wait",
    memoryIds: [m2.body.memory.id],
    unlockAt: new Date(Date.now() + 800).toISOString(),
  });
  await wait(1100);
  await user.post(`/api/capsules/${soon.body.capsule.id}/unlock`);
  await user.delete(`/api/capsules/${soon.body.capsule.id}`);
  assert.equal((await user.get(`/api/memories/${m2.body.memory.id}`)).status, 200);
});

test("a letter-only capsule works", async () => {
  const res = await user.post("/api/capsules").send({ title: "Just words", letter: "Hello", unlockAt: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(res.status, 201);
  assert.equal(res.body.capsule.hasLetter, true);
  assert.equal(res.body.capsule.memoryCount, 0);
});
