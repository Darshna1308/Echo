/*
  Request-level protections that apply to every route.
*/
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { config } = require("../config/env");

/*
  CSRF defence for cookie sessions (in addition to SameSite cookies):
  any state-changing request that carries an Origin header must come from a
  configured frontend origin. Browsers always send Origin on cross-site
  POST/PUT/DELETE, so a malicious site cannot submit requests on a user's
  behalf. Requests with no Origin (curl, server-to-server) carry no cookies
  from a victim's browser and are unaffected.
*/
function originGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();

  const normalized = origin.replace(/\/$/, "");
  const self = `${req.protocol}://${req.get("host")}`;

  if (config.clientOrigins.includes(normalized) || normalized === self) {
    return next();
  }
  return next(AppError.forbidden("This request came from an origin Echo does not trust."));
}

/*
  API responses are private and must never be stored by shared caches
  (including Vercel's CDN when it proxies /api).
*/
function noStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  req.id = crypto.randomUUID();
  res.set("X-Request-Id", req.id);
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    // Path only (no query string: it may contain search text).
    logger.info("http_request", {
      reqId: req.id,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      ms: Math.round(ms),
      user: req.userId ? String(req.userId) : undefined,
    });
  });
  next();
}

function limiter({ windowMs, limit, message, keyByUser = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => config.isTest && !process.env.TEST_RATE_LIMITS,
    keyGenerator: keyByUser
      ? (req) => (req.userId ? `u:${req.userId}` : rateLimit.ipKeyGenerator(req.ip))
      : undefined,
    handler: (req, res, next) => next(new AppError(429, message)),
  });
}

const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: config.rateLimits.authPer15Min,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

const aiLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimits.aiPerHour,
  message: "You've reached the hourly limit for Echo's AI features. Please try again later.",
  keyByUser: true,
});

const uploadLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimits.uploadsPerHour,
  message: "Too many uploads in a short time. Please try again later.",
  keyByUser: true,
});

module.exports = {
  originGuard,
  noStore,
  requestLogger,
  authLimiter,
  aiLimiter,
  uploadLimiter,
};
