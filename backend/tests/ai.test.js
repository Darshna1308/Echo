/*
  AI integration tests against a local fake OpenAI-compatible provider.
  These verify Echo's integration code (what is sent, how replies are
  validated, how failures fall back). They do not call a real AI service.
*/
const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { setupEnv, startApp, newUser, uploadAudio, memoryBody, startMockProvider } = require("./helpers");

let mock;
let ctx;
let user;
let other;
const behaviour = { chatFails: false, chatReply: null };

// A deterministic "embedding": counts of a few topic words.
const VOCAB = ["ujjain", "temple", "family", "college", "event", "chai", "rain", "grandmother", "nani", "garba"];
function fakeEmbed(text) {
  const lower = String(text).toLowerCase();
  return VOCAB.map((w) => (lower.includes(w) ? 1 : 0) + 0.01);
}

before(async () => {
  mock = await startMockProvider({
    "/v1/chat/completions": (body) => {
      if (behaviour.chatFails) return { status: 500, json: { error: "boom" } };
      const system = body.messages[0].content;
      if (system.includes("organise their private memory journal")) {
        return {
          json: { choices: [{ message: { content: JSON.stringify({ summary: "An evening of aarti with Nani in Ujjain.", suggestedTags: ["pilgrimage", "family", "#dawn"], mood: "peaceful", themes: ["devotion"] }) } }] },
        };
      }
      const reply = behaviour.chatReply || { answer: "You visited Ujjain with your family in October 2023 [1]. Also [9].", citations: [1, 9], insufficient: false };
      return { json: { choices: [{ message: { content: JSON.stringify(reply) } }] } };
    },
    "/v1/embeddings": (body) => ({
      json: { data: body.input.map((t, i) => ({ index: i, embedding: fakeEmbed(t) })) },
    }),
    "/v1/audio/transcriptions": () => ({ json: { text: " Nani is singing the aarti. " } }),
  });

  setupEnv("ai", {
    AI_CHAT_BASE_URL: `${mock.url}/v1`,
    AI_CHAT_API_KEY: "test-key-123",
    AI_CHAT_MODEL: "mock-chat",
    AI_EMBEDDING_BASE_URL: `${mock.url}/v1`,
    AI_EMBEDDING_MODEL: "mock-embed",
    AI_TRANSCRIBE_BASE_URL: `${mock.url}/v1`,
    AI_TRANSCRIBE_MODEL: "mock-whisper",
  });
  ctx = await startApp();
  user = await newUser(ctx.app, "Asha");
  other = await newUser(ctx.app, "Other");

  for (const m of [
    memoryBody({ title: "Ujjain at dawn", story: "Mahakal temple aarti with the family. Nani held my hand.", date: "2023-10-12", location: "Ujjain", people: ["Nani", "Papa"], tags: ["travel"] }),
    memoryBody({ title: "First college event", story: "I hosted the cultural night at our first college event.", date: "2022-09-20", location: "Indore", people: ["Riya"], tags: ["college"] }),
    memoryBody({ title: "Monsoon chai", story: "Rain and chai on the terrace.", date: "2024-07-03", location: "Home", people: ["Mom"], tags: ["monsoon"] }),
  ]) {
    assert.equal((await user.post("/api/memories").send(m)).status, 201);
  }
  await other.post("/api/memories").send(memoryBody({ title: "Other's Ujjain trip", story: "Ujjain temple family secret of another user.", date: "2023-10-10" }));
  // Let background embedding finish.
  await new Promise((r) => setTimeout(r, 400));
});

after(async () => {
  await ctx.close();
  await mock.close();
});

describe("features endpoint", () => {
  test("reports enabled capabilities without exposing keys", async () => {
    const res = await user.get("/api/features");
    assert.deepEqual(
      { chat: res.body.features.chat, embeddings: res.body.features.embeddings, transcription: res.body.features.transcription },
      { chat: true, embeddings: true, transcription: true }
    );
    assert.ok(!JSON.stringify(res.body).includes("test-key-123"));
  });
});

describe("Ask Echo with a configured model", () => {
  test("answers from retrieved memories only and drops invalid citations", async () => {
    mock.calls.length = 0;
    const res = await user.post("/api/echo/ask").send({ question: "When did I visit Ujjain with my family?" });
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "ai");
    assert.equal(res.body.retrieval, "hybrid");
    assert.equal(res.body.sources[0].title, "Ujjain at dawn");
    assert.deepEqual(res.body.citations, [1], "citation [9] does not exist and is dropped");

    const chatCall = mock.calls.find((c) => c.path === "/v1/chat/completions");
    assert.equal(chatCall.headers.authorization, "Bearer test-key-123");
    const sent = JSON.stringify(chatCall.body);
    assert.ok(sent.includes("Ujjain at dawn"));
    assert.ok(!sent.includes("another user"), "other users' memories are never sent to the model");
    assert.ok(chatCall.body.messages[0].content.includes("ONLY the numbered memories"));
  });

  test("date words become filters", async () => {
    const res = await user.post("/api/echo/ask").send({ question: "What happened in September 2022?" });
    assert.deepEqual(res.body.filters.months, ["September"]);
    assert.deepEqual(res.body.filters.years, [2022]);
    assert.deepEqual(res.body.sources.map((s) => s.title), ["First college event"]);
  });

  test("does not call the model when nothing relevant is found", async () => {
    mock.calls.length = 0;
    const res = await user.post("/api/echo/ask").send({ question: "What did I write about skiing in Switzerland in 1999?" });
    assert.equal(res.body.sources.length, 0);
    assert.equal(res.body.insufficient, true);
    assert.ok(!mock.calls.some((c) => c.path === "/v1/chat/completions"));
  });

  test("an answer with no valid citations is flagged as insufficient", async () => {
    behaviour.chatReply = { answer: "Your archive doesn't say.", citations: [], insufficient: true };
    const res = await user.post("/api/echo/ask").send({ question: "What did Nani cook at the temple?" });
    behaviour.chatReply = null;
    assert.equal(res.body.insufficient, true);
    assert.deepEqual(res.body.citations, []);
  });

  test("falls back to matching memories when the provider fails", async () => {
    behaviour.chatFails = true;
    const res = await user.post("/api/echo/ask").send({ question: "college event" });
    behaviour.chatFails = false;
    assert.equal(res.status, 200);
    assert.equal(res.body.mode, "keyword");
    assert.ok(res.body.providerError);
    assert.equal(res.body.sources[0].title, "First college event");
  });
});

describe("enrichment", () => {
  test("stores AI suggestions separately, never touching the story", async () => {
    const list = await user.get("/api/search?q=ujjain");
    const id = list.body.memories[0].id;
    const before = (await user.get(`/api/memories/${id}`)).body.memory;

    const res = await user.post(`/api/memories/${id}/enrich`);
    assert.equal(res.status, 200);
    const m = res.body.memory;
    assert.equal(m.story, before.story);
    assert.equal(m.ai.status, "ready");
    assert.equal(m.ai.summary, "An evening of aarti with Nani in Ujjain.");
    assert.deepEqual(m.ai.tags, ["pilgrimage", "family", "dawn"]);
    assert.equal(m.ai.mood, "peaceful");
    assert.equal(m.ai.model, "mock-chat");

    // Editable by the user...
    const body = { title: m.title, story: m.story, date: m.date, location: m.location, people: m.people, tags: m.tags, aiSummary: "My own words." };
    const edited = await user.put(`/api/memories/${id}`).send(body);
    assert.equal(edited.body.memory.ai.summary, "My own words.");

    // ...and removable.
    const cleared = await user.delete(`/api/memories/${id}/enrichment`);
    assert.equal(cleared.body.memory.ai.status, "none");
    assert.equal(cleared.body.memory.ai.summary, "");
  });

  test("another user cannot enrich someone else's memory", async () => {
    const list = await user.get("/api/search?q=ujjain");
    const res = await other.post(`/api/memories/${list.body.memories[0].id}/enrich`);
    assert.equal(res.status, 404);
  });
});

describe("embeddings and transcription", () => {
  test("memories are embedded in the background and can be reindexed", async () => {
    const Memory = ctx.mongoose.model("Memory");
    const docs = await Memory.find({ userId: user.user.id }).select("+embedding +embeddingModel");
    assert.ok(docs.every((d) => d.embedding?.length === VOCAB.length && d.embeddingModel === "mock-embed"));
    const res = await user.post("/api/echo/reindex");
    assert.equal(res.body.remaining, 0);
  });

  test("transcribes the owner's recording and returns it for review", async () => {
    const audio = await uploadAudio(user);
    const res = await user.post(`/api/media/${audio.id}/transcribe`);
    assert.equal(res.status, 200);
    assert.equal(res.body.transcript, "Nani is singing the aarti.");
    assert.equal((await other.post(`/api/media/${audio.id}/transcribe`)).status, 404);
  });
});
