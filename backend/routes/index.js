/*
  All API routes. Every route except register/login/health/features
  requires a valid session (protect).
*/
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");

const { protect } = require("../middleware/auth");
const { validate, validId } = require("../middleware/validate");
const { authLimiter, aiLimiter, uploadLimiter } = require("../middleware/security");
const v = require("../utils/validators");
const { config } = require("../config/env");
const ai = require("../services/ai");

const auth = require("../controllers/authController");
const memories = require("../controllers/memoryController");
const media = require("../controllers/mediaController");
const echo = require("../controllers/echoController");
const capsules = require("../controllers/capsuleController");

const router = express.Router();

const uploadParser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(config.media.maxImageBytes, config.media.maxAudioBytes),
    files: 1,
    fields: 5,
  },
}).single("file");

// ---------------------------------------------------------------- health
router.get("/health", (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    status: dbUp ? "ok" : "degraded",
    database: dbUp ? "connected" : "disconnected",
    uptimeSec: Math.round(process.uptime()),
  });
});

// Which optional features this server has switched on (no secrets).
router.get("/features", (req, res) => {
  res.json({
    success: true,
    features: {
      ...ai.features(),
      mediaStorage: config.media.storage,
      maxImageMb: Math.round(config.media.maxImageBytes / 1048576),
      maxAudioMb: Math.round(config.media.maxAudioBytes / 1048576),
    },
  });
});

// ---------------------------------------------------------------- auth
router.post("/auth/register", authLimiter, validate(v.registerSchema), auth.register);
router.post("/auth/login", authLimiter, validate(v.loginSchema), auth.login);
router.post("/auth/logout", auth.logout);
router.get("/auth/me", protect, auth.me);
router.post("/auth/logout-all", protect, auth.logoutAll);
router.get("/auth/export", protect, auth.exportData);
router.delete("/auth/account", authLimiter, protect, validate(v.deleteAccountSchema), auth.deleteAccount);

// ---------------------------------------------------------------- memories
router.get("/memories", protect, validate(v.listQuerySchema, "query"), memories.listMemories);
router.get("/memories/facets", protect, memories.facets);
router.post("/memories", protect, validate(v.createMemorySchema), memories.createMemory);
router.get("/memories/:id", protect, validId(), memories.getMemory);
router.put("/memories/:id", protect, validId(), validate(v.updateMemorySchema), memories.updateMemory);
router.delete("/memories/:id", protect, validId(), memories.deleteMemory);
router.get("/memories/:id/legacy-photos/:index", protect, validId(), memories.legacyPhoto);
router.get("/memories/:id/connections", protect, validId(), memories.connections);
router.post("/memories/:id/enrich", protect, aiLimiter, validId(), memories.enrichMemory);
router.delete("/memories/:id/enrichment", protect, validId(), memories.clearEnrichment);

// ---------------------------------------------------------------- search & AI
router.get("/search", protect, validate(v.listQuerySchema, "query"), memories.listMemories);
router.post("/echo/ask", protect, aiLimiter, validate(v.askSchema), echo.ask);
router.post("/echo/reindex", protect, aiLimiter, echo.reindex);
router.get("/on-this-day", protect, validate(v.onThisDaySchema, "query"), echo.onThisDay);

// ---------------------------------------------------------------- media
router.post("/media/upload", protect, uploadLimiter, uploadParser, media.upload);
router.get("/media/:id/file", protect, validId(), media.serveFile);
router.delete("/media/:id", protect, validId(), media.remove);
router.post("/media/:id/transcribe", protect, aiLimiter, validId(), media.transcribe);

// ---------------------------------------------------------------- capsules
router.post("/capsules", protect, validate(v.capsuleSchema), capsules.create);
router.get("/capsules", protect, capsules.list);
router.get("/capsules/:id", protect, validId(), capsules.getOne);
router.post("/capsules/:id/unlock", protect, validId(), capsules.unlock);
router.delete("/capsules/:id", protect, validId(), capsules.remove);

module.exports = router;
