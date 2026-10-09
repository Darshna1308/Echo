/*
  Session authentication.

  Echo keeps the session JWT in an httpOnly cookie, so JavaScript running in
  the page (including any injected script) cannot read it. The browser sends
  it automatically with same-origin requests (`credentials: "include"`).

  The token carries the user id (`sub`) and a token version (`tv`). Every
  request re-checks the user still exists and that `tv` matches, so
  "log out everywhere" and account deletion take effect immediately.
*/
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const AppError = require("../utils/AppError");
const { config } = require("../config/env");

function signSession(user) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0 }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function cookieOptions() {
  const decoded = jwt.decode(jwt.sign({}, "x", { expiresIn: config.jwtExpiresIn }));
  const maxAge = (decoded.exp - decoded.iat) * 1000;
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: "/",
    maxAge,
  };
}

function setSessionCookie(res, user) {
  res.cookie(config.cookie.name, signSession(user), cookieOptions());
}

function clearSessionCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(config.cookie.name, options);
}

function readToken(req) {
  const fromCookie = req.cookies?.[config.cookie.name];
  if (fromCookie) return fromCookie;
  return null;
}

/*
  Resolves the session to a user. Returns { user } or { error } and clears
  a bad cookie. Never throws for an invalid token.
*/
async function resolveSession(req, res) {
  const token = readToken(req);
  if (!token) return { error: AppError.unauthorized("Please log in to continue.") };

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (error) {
    clearSessionCookie(res);
    const message =
      error.name === "TokenExpiredError"
        ? "Your session has expired. Please log in again."
        : "Your session is no longer valid. Please log in again.";
    return { error: new AppError(401, message, { code: "SESSION_INVALID" }) };
  }

  if (!payload?.sub || !mongoose.isValidObjectId(payload.sub)) {
    clearSessionCookie(res);
    return { error: new AppError(401, "Your session is no longer valid. Please log in again.", { code: "SESSION_INVALID" }) };
  }

  const user = await User.findById(payload.sub).select("name email tokenVersion createdAt");
  if (!user || (user.tokenVersion || 0) !== (payload.tv || 0)) {
    clearSessionCookie(res);
    return { error: new AppError(401, "Your session has ended. Please log in again.", { code: "SESSION_INVALID" }) };
  }
  return { user };
}

async function protect(req, res, next) {
  const { user, error } = await resolveSession(req, res);
  if (error) return next(error);
  req.user = user;
  req.userId = user._id;
  return next();
}

/* For the app's start-up check: 200 with user or null, never a 401. */
async function currentSession(req, res) {
  const { user } = await resolveSession(req, res);
  res.json({ success: true, user: user ? user.toPublic() : null });
}

module.exports = {
  protect,
  currentSession,
  setSessionCookie,
  clearSessionCookie,
};
