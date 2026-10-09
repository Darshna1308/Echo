/*
  Echo API entry point.
    1. Validate configuration (refuse to start with a broken setup).
    2. Connect to MongoDB.
    3. Start the HTTP server and the hourly cleanup of abandoned uploads.
*/
const mongoose = require("mongoose");

const { config, validateConfig } = require("./config/env");
const logger = require("./utils/logger");
const { createApp } = require("./app");
const { cleanupPendingMedia } = require("./services/memoryMedia");

logger.setLevel(config.logLevel);

async function start() {
  const problems = validateConfig(config);
  if (problems.length) {
    // Printed plainly so they're easy to read in a terminal or hosting log.
    console.error("\nEcho can't start until these settings are fixed:\n");
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error("\nSee backend/.env.example and README.md.\n");
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  } catch (error) {
    logger.error("database_connection_failed", { error });
    console.error("\nCould not connect to MongoDB. Check MONGO_URI and that the database is running / reachable.\n");
    process.exit(1);
  }
  logger.info("database_connected", { host: mongoose.connection.host });

  // Make sure indexes exist (safe: never drops data).
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes().catch((error) => {
    logger.warn("index_creation_failed", { model: model.modelName, error });
  })));

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info("server_started", {
      port: config.port,
      env: config.nodeEnv,
      mediaStorage: config.media.storage,
      aiChat: config.ai.chat.enabled,
      aiEmbeddings: config.ai.embedding.enabled,
      aiSpeechToText: config.ai.transcribe.enabled,
    });
  });

  const cleanup = setInterval(cleanupPendingMedia, 60 * 60 * 1000);
  cleanup.unref();
  setTimeout(cleanupPendingMedia, 30 * 1000).unref();

  const shutdown = (signal) => {
    logger.info("shutdown", { signal });
    server.close(() => {
      mongoose.connection.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
