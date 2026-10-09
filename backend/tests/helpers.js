/*
  Shared test setup.

  Each test file runs in its own process (node --test), uses its own
  throwaway database, and drops it at the end. Tests need a MongoDB-compatible
  server; set TEST_MONGO_URI (default mongodb://127.0.0.1:27017).
  The test database name always starts with "echo_test_" and is never your
  development or production database.
*/
const http = require("http");
const path = require("path");

function setupEnv(name, extra = {}) {
  const base = (process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI = `${base}/echo_test_${name}_${process.pid}`;
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-0123456789";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.MEDIA_STORAGE = "gridfs";
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("AI_") && !(key in extra)) delete process.env[key];
  }
  Object.assign(process.env, extra);
}

async function startApp() {
  const mongoose = require("mongoose");
  const { createApp } = require(path.join(__dirname, "..", "app"));
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.db.dropDatabase();
  const app = createApp();
  return {
    app,
    mongoose,
    async close() {
      // Let background work (e.g. embeddings) settle before dropping.
      await new Promise((r) => setTimeout(r, 150));
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    },
  };
}

let counter = 0;
async function newUser(app, name = "Tester") {
  const request = require("supertest");
  const agent = request.agent(app);
  counter += 1;
  const email = `${name.toLowerCase().replace(/\W+/g, "")}${counter}_${Date.now()}@example.com`;
  const res = await agent
    .post("/api/auth/register")
    .send({ name, email, password: "correct horse battery" });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  agent.user = res.body.user;
  agent.email = email;
  return agent;
}

async function makeImage({ width = 640, height = 480, color = { r: 200, g: 139, b: 90 }, withGps = false } = {}) {
  const sharp = require("sharp");
  let img = sharp({ create: { width, height, channels: 3, background: color } }).jpeg();
  if (withGps) {
    img = img.withExif({ IFD0: { Make: "TestCam", ImageDescription: "secret place" } });
  }
  return img.toBuffer();
}

function makeAudio() {
  // A WebM/EBML header followed by filler: enough for Echo's type check.
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]), Buffer.alloc(2048, 7)]);
}

async function uploadImage(agent, opts) {
  const res = await agent
    .post("/api/media/upload")
    .field("kind", "image")
    .attach("file", await makeImage(opts), { filename: "photo.jpg", contentType: "image/jpeg" });
  if (res.status !== 201) throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.media;
}

async function uploadAudio(agent) {
  const res = await agent
    .post("/api/media/upload")
    .field("kind", "audio")
    .field("durationSec", "12")
    .attach("file", makeAudio(), { filename: "voice.webm", contentType: "audio/webm" });
  if (res.status !== 201) throw new Error(`audio upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.media;
}

function memoryBody(overrides = {}) {
  return {
    title: "A quiet evening",
    story: "We sat on the terrace and watched the light change.",
    date: "2023-10-09",
    location: "Jaipur, Rajasthan",
    people: ["Mom"],
    tags: ["family"],
    ...overrides,
  };
}

/*
  A fake OpenAI-compatible provider for testing the AI integration code.
  It records every request so tests can assert what was (and wasn't) sent.
*/
function startMockProvider(handlers = {}) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const body = req.headers["content-type"]?.includes("application/json") ? JSON.parse(raw.toString() || "{}") : raw;
    calls.push({ path: req.url, body, headers: req.headers });

    const handler = handlers[req.url];
    if (handler) {
      const result = await handler(body, req);
      res.writeHead(result.status || 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.json));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end("{}");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = {
  setupEnv,
  startApp,
  newUser,
  makeImage,
  makeAudio,
  uploadImage,
  uploadAudio,
  memoryBody,
  startMockProvider,
};
