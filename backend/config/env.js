/*
  Central configuration.

  Every environment variable Echo reads is listed here, validated once at
  startup, and exported as a plain object. If something required is missing
  the server refuses to start and prints exactly what to fix (never the
  secret values themselves).
*/
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});

function bool(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function list(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function trimSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function aiBlock(prefix) {
  const baseUrl = trimSlash(process.env[`${prefix}_BASE_URL`]);
  const model = (process.env[`${prefix}_MODEL`] || "").trim();
  return {
    baseUrl,
    apiKey: (process.env[`${prefix}_API_KEY`] || "").trim(),
    model,
    enabled: Boolean(baseUrl && model),
  };
}

function buildConfig() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test";

  const config = {
    nodeEnv,
    isProduction,
    isTest,
    port: int(process.env.PORT, 5000),
    mongoUri: (process.env.MONGO_URI || "").trim(),
    jwtSecret: process.env.JWT_SECRET || "",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    clientOrigins: list(process.env.CLIENT_ORIGIN || (isProduction ? "" : "http://localhost:5173")),
    trustProxy: int(process.env.TRUST_PROXY, isProduction ? 1 : 0),
    cookie: {
      name: "echo_session",
      sameSite: (process.env.COOKIE_SAMESITE || "lax").toLowerCase(),
      secure: bool(process.env.COOKIE_SECURE, isProduction),
    },
    media: {
      storage: (process.env.MEDIA_STORAGE || "gridfs").toLowerCase(),
      maxImageBytes: int(process.env.MAX_IMAGE_MB, 12) * 1024 * 1024,
      maxAudioBytes: int(process.env.MAX_AUDIO_MB, 15) * 1024 * 1024,
      cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
        apiKey: process.env.CLOUDINARY_API_KEY || "",
        apiSecret: process.env.CLOUDINARY_API_SECRET || "",
        folder: process.env.CLOUDINARY_FOLDER || "echo",
      },
    },
    ai: {
      chat: aiBlock("AI_CHAT"),
      embedding: aiBlock("AI_EMBEDDING"),
      transcribe: aiBlock("AI_TRANSCRIBE"),
      timeoutMs: int(process.env.AI_TIMEOUT_MS, 45000),
      semanticMinScore: Number(process.env.AI_SEMANTIC_MIN_SCORE || 0.3),
    },
    rateLimits: {
      authPer15Min: int(process.env.RATE_LIMIT_AUTH, 20),
      aiPerHour: int(process.env.RATE_LIMIT_AI, 60),
      uploadsPerHour: int(process.env.RATE_LIMIT_UPLOADS, 300),
    },
    logLevel: process.env.LOG_LEVEL || (isTest ? "silent" : "info"),
  };

  return config;
}

/*
  Returns a list of human-readable problems. Empty list = good to go.
*/
function validateConfig(config) {
  const problems = [];

  if (!config.mongoUri) {
    problems.push("MONGO_URI is required (e.g. mongodb://127.0.0.1:27017/echo for local development).");
  } else if (!/^mongodb(\+srv)?:\/\//.test(config.mongoUri)) {
    problems.push("MONGO_URI must start with mongodb:// or mongodb+srv://.");
  }

  if (!config.jwtSecret) {
    problems.push("JWT_SECRET is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  } else if (config.isProduction && config.jwtSecret.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters in production.");
  }

  if (config.isProduction) {
    if (/127\.0\.0\.1|localhost/.test(config.mongoUri)) {
      problems.push("MONGO_URI points at a local database. Production must use a hosted database such as MongoDB Atlas.");
    }
    if (!config.clientOrigins.length) {
      problems.push("CLIENT_ORIGIN is required in production (your deployed frontend URL, e.g. https://echo.vercel.app).");
    }
  }

  if (!["lax", "strict", "none"].includes(config.cookie.sameSite)) {
    problems.push("COOKIE_SAMESITE must be lax, strict or none.");
  }
  if (config.cookie.sameSite === "none" && !config.cookie.secure) {
    problems.push("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise).");
  }

  if (!["gridfs", "cloudinary"].includes(config.media.storage)) {
    problems.push("MEDIA_STORAGE must be gridfs or cloudinary.");
  }
  if (config.media.storage === "cloudinary") {
    const c = config.media.cloudinary;
    if (!c.cloudName || !c.apiKey || !c.apiSecret) {
      problems.push("MEDIA_STORAGE=cloudinary needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
    }
  }

  for (const [name, block] of Object.entries(config.ai)) {
    if (!block || typeof block !== "object" || !("baseUrl" in block)) continue;
    const prefix = `AI_${name.toUpperCase()}`;
    if (Boolean(block.baseUrl) !== Boolean(block.model)) {
      problems.push(`${prefix}_BASE_URL and ${prefix}_MODEL must be set together (or both left empty to disable).`);
    }
  }

  return problems;
}

const config = buildConfig();

module.exports = {
  config,
  buildConfig,
  validateConfig,
};
