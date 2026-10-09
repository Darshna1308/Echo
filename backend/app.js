/*
  Builds the Express application (without starting it), so tests can use it
  directly with supertest.
*/
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { config } = require("./config/env");
const { originGuard, noStore, requestLogger } = require("./middleware/security");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const apiRoutes = require("./routes");

function createApp() {
  const app = express();

  // Render, Vercel and most hosts sit behind a proxy; this lets rate limiting
  // see the visitor's IP instead of the proxy's. See TRUST_PROXY in README.
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");

  app.use(
    helmet({
      // Media is protected by the session check, and may be loaded by the
      // frontend from another origin in direct (non-proxied) deployments.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser requests have no Origin header.
        if (!origin || config.clientOrigins.includes(origin.replace(/\/$/, ""))) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type"],
      maxAge: 600,
    })
  );

  app.use(requestLogger);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/", (req, res) => {
    res.json({ success: true, message: "Echo API is running. See /api/health." });
  });

  app.use("/api", noStore, originGuard, apiRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
