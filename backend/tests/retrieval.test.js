/* Unit tests for the pure retrieval helpers (no database). */
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
const { parseQuestion, keywordRank, tokenize, cosine, fuse, snippet } = require("../services/retrieval");
const { validateConfig, buildConfig } = require("../config/env");

const NOW = new Date("2026-10-09T12:00:00Z");

test("parses months, years and relative years", () => {
  const p = parseQuestion("What happened in Oct 2023 and last year?", {}, NOW);
  assert.deepEqual(p.months, [10]);
  assert.deepEqual(p.years.sort(), [2023, 2025]);
});

test("treats 'may' as a month only in date context", () => {
  assert.deepEqual(parseQuestion("What may I have forgotten?", {}, NOW).months, []);
  assert.deepEqual(parseQuestion("memories from May 2024", {}, NOW).months, [5]);
});

test("recognises known people and places", () => {
  const p = parseQuestion("When was I with Riya in Indore?", { people: ["Riya", "Ri"], locations: ["Indore, MP", "Home"] }, NOW);
  assert.deepEqual(p.people, ["Riya"]);
  assert.deepEqual(p.locations, ["Indore, MP"]);
});

test("tokenizer drops stop words and stems", () => {
  assert.deepEqual(tokenize("Find the memories where I was dancing with friends"), ["danc", "friend"]);
});

test("BM25 ranks title and tag matches above passing mentions", () => {
  const memories = [
    { _id: 1, title: "Lunch", story: "We talked about the college fest briefly.", tags: [], people: [] },
    { _id: 2, title: "College fest", story: "Hosting the fest.", tags: ["college"], people: [] },
    { _id: 3, title: "Rain", story: "Nothing relevant.", tags: [], people: [] },
  ];
  const ranked = keywordRank(memories, tokenize("college fest"));
  assert.deepEqual(ranked.map((r) => r.memory._id), [2, 1]);
});

test("cosine and fusion behave", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1], [1, 2]), 0);
  const a = { memory: { _id: "a" } };
  const b = { memory: { _id: "b" } };
  const fused = fuse([[a, b], [b]]);
  assert.equal(fused[0].memory._id, "b");
});

test("snippet centres on a matching term", () => {
  const text = `${"x ".repeat(200)}the garba night ${"y ".repeat(200)}`;
  assert.match(snippet(text, ["garba"]), /garba/);
});

test("config validation catches unsafe production settings", () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "production",
    MONGO_URI: "mongodb://127.0.0.1:27017/echo",
    JWT_SECRET: "short",
    CLIENT_ORIGIN: "",
    MEDIA_STORAGE: "cloudinary",
    COOKIE_SAMESITE: "none",
    COOKIE_SECURE: "false",
    AI_CHAT_BASE_URL: "https://api.example.com/v1",
    AI_CHAT_MODEL: "",
  });
  const problems = validateConfig(buildConfig()).join("\n");
  process.env = saved;
  assert.match(problems, /local database/);
  assert.match(problems, /at least 32/);
  assert.match(problems, /CLIENT_ORIGIN/);
  assert.match(problems, /CLOUDINARY_CLOUD_NAME/);
  assert.match(problems, /COOKIE_SECURE/);
  assert.match(problems, /AI_CHAT_BASE_URL and AI_CHAT_MODEL/);
});
