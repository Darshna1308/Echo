/*
  User isolation: two real accounts. Every way of reaching User A's data
  from User B's session must fail, including guessing/changing ids.
*/
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { setupEnv, startApp, newUser, uploadImage, uploadAudio, memoryBody } = require("./helpers");

setupEnv("isolation");

let ctx;
let alice;
let bob;
let aliceMemory;
let alicePhoto;
let aliceAudio;
let aliceCapsule;

before(async () => {
  ctx = await startApp();
  alice = await newUser(ctx.app, "Alice");
  bob = await newUser(ctx.app, "Bob");

  alicePhoto = await uploadImage(alice);
  aliceAudio = await uploadAudio(alice);
  const res = await alice.post("/api/memories").send(
    memoryBody({
      title: "Ujjain with family",
      story: "Alice's private story about the Mahakal temple at dawn.",
      people: ["Nani"],
      photos: [{ ref: alicePhoto.id, style: "warm", caption: "Ghats" }],
      audio: aliceAudio.id,
    })
  );
  assert.equal(res.status, 201);
  aliceMemory = res.body.memory;

  const sealedRes = await alice.post("/api/memories").send(memoryBody({ title: "For later", story: "Sealed words." }));
  const cap = await alice.post("/api/capsules").send({
    title: "Alice's capsule",
    letter: "Dear future Alice",
    memoryIds: [sealedRes.body.memory.id],
    unlockAt: new Date(Date.now() - 1000 + 3600 * 1000).toISOString(),
  });
  assert.equal(cap.status, 201);
  aliceCapsule = cap.body.capsule;
});

after(async () => {
  await ctx.close();
});

test("Bob cannot read, edit or delete Alice's memory by id", async () => {
  const id = aliceMemory.id;
  assert.equal((await bob.get(`/api/memories/${id}`)).status, 404);
  assert.equal((await bob.put(`/api/memories/${id}`).send(memoryBody({ title: "hijacked" }))).status, 404);
  assert.equal((await bob.delete(`/api/memories/${id}`)).status, 404);
  assert.equal((await bob.get(`/api/memories/${id}/connections`)).status, 404);
  assert.equal((await bob.post(`/api/memories/${id}/enrich`)).status, 503, "AI disabled is checked first, never leaks");
  assert.equal((await bob.delete(`/api/memories/${id}/enrichment`)).status, 404);
  assert.equal((await bob.get(`/api/memories/${id}/legacy-photos/0`)).status, 404);

  const still = await alice.get(`/api/memories/${id}`);
  assert.equal(still.status, 200);
  assert.equal(still.body.memory.title, "Ujjain with family");
});

test("Bob's lists, search, facets, Ask Echo and On This Day never include Alice's memories", async () => {
  const list = await bob.get("/api/memories");
  assert.equal(list.body.total, 0);

  const search = await bob.get("/api/search?q=mahakal");
  assert.equal(search.body.total, 0);

  const facets = await bob.get("/api/memories/facets");
  assert.deepEqual(facets.body.people, []);

  const ask = await bob.post("/api/echo/ask").send({ question: "When did I visit Ujjain with my family?" });
  assert.equal(ask.status, 200);
  assert.equal(ask.body.sources.length, 0);

  const otd = await bob.get("/api/on-this-day?date=2026-10-09");
  assert.equal(otd.body.memories.length, 0);

  // ...while Alice does see her own.
  const aliceSearch = await alice.get("/api/search?q=mahakal");
  assert.equal(aliceSearch.body.total, 1);
});

test("Bob cannot load, delete or transcribe Alice's media", async () => {
  assert.equal((await bob.get(`/api/media/${alicePhoto.id}/file`)).status, 404);
  assert.equal((await bob.get(`/api/media/${alicePhoto.id}/file?variant=thumb`)).status, 404);
  assert.equal((await bob.delete(`/api/media/${aliceAudio.id}`)).status, 404);
  assert.equal((await alice.get(`/api/media/${alicePhoto.id}/file`)).status, 200);
});

test("Bob cannot attach Alice's uploaded media to his own memory", async () => {
  const stray = await uploadImage(alice);
  const res = await bob.post("/api/memories").send(memoryBody({ photos: [{ ref: stray.id }] }));
  assert.equal(res.status, 400);
  const audio = await bob.post("/api/memories").send(memoryBody({ audio: aliceAudio.id }));
  assert.equal(audio.status, 400);
});

test("a client-supplied userId is rejected, and ownership comes from the session", async () => {
  const res = await bob.post("/api/memories").send({ ...memoryBody(), userId: alice.user.id });
  assert.equal(res.status, 400);
  const own = await bob.post("/api/memories").send(memoryBody({ title: "Bob's own" }));
  assert.equal(own.status, 201);
  const Memory = ctx.mongoose.model("Memory");
  const stored = await Memory.findById(own.body.memory.id);
  assert.equal(String(stored.userId), bob.user.id);
});

test("Bob cannot see, open or delete Alice's capsule", async () => {
  const id = aliceCapsule.id;
  assert.equal((await bob.get(`/api/capsules/${id}`)).status, 404);
  assert.equal((await bob.post(`/api/capsules/${id}/unlock`)).status, 404);
  assert.equal((await bob.delete(`/api/capsules/${id}`)).status, 404);
  const list = await bob.get("/api/capsules");
  assert.equal(list.body.capsules.length, 0);
});

test("Bob cannot seal Alice's memory into his own capsule", async () => {
  const res = await bob.post("/api/capsules").send({
    title: "Stolen",
    memoryIds: [aliceMemory.id],
    unlockAt: new Date(Date.now() + 60000).toISOString(),
  });
  assert.equal(res.status, 400);
});

test("malformed and non-existent ids return 404, not errors", async () => {
  assert.equal((await alice.get("/api/memories/not-an-id")).status, 404);
  assert.equal((await alice.get("/api/memories/000000000000000000000000")).status, 404);
  assert.equal((await alice.get("/api/media/zzz/file")).status, 404);
});

test("legacy memories without an owner are never shown or auto-claimed", async () => {
  const Memory = ctx.mongoose.model("Memory");
  // Insert like the very first version of Echo did: no userId.
  const { insertedId } = await Memory.collection.insertOne({
    title: "Old unowned memory",
    story: "Created before accounts existed",
    date: new Date("2022-01-01"),
    photos: [],
  });

  for (const agent of [alice, bob]) {
    const list = await agent.get("/api/memories");
    assert.ok(!list.body.memories.some((m) => m.title === "Old unowned memory"));
    assert.equal((await agent.get(`/api/memories/${insertedId}`)).status, 404);
  }

  const raw = await Memory.collection.findOne({ _id: insertedId });
  assert.equal(raw.userId, undefined, "the old memory still has no owner");
});

test("account deletion only removes the deleting user's content", async () => {
  const carol = await newUser(ctx.app, "Carol");
  const photo = await uploadImage(carol);
  await carol.post("/api/memories").send(memoryBody({ photos: [{ ref: photo.id }] }));
  const res = await carol.delete("/api/auth/account").send({ password: "correct horse battery" });
  assert.equal(res.status, 200);

  const Memory = ctx.mongoose.model("Memory");
  const Media = ctx.mongoose.model("Media");
  assert.equal(await Memory.countDocuments({ userId: carol.user.id }), 0);
  assert.equal(await Media.countDocuments({ userId: carol.user.id }), 0);
  assert.equal((await alice.get(`/api/memories/${aliceMemory.id}`)).status, 200);
  assert.equal((await alice.get(`/api/media/${alicePhoto.id}/file`)).status, 200);
});
