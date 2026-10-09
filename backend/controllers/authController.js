const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Memory = require("../models/Memory");
const Capsule = require("../models/Capsule");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { setSessionCookie, clearSessionCookie } = require("../middleware/auth");
const { deleteMedia } = require("../services/memoryMedia");
const { toDetail } = require("../services/memoryPresenter");

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync("echo-timing-equaliser", 10);

// POST /api/auth/register
async function register(req, res) {
  const { name, email, password } = req.body;

  const existing = await User.exists({ email });
  if (existing) {
    throw AppError.conflict("An account with this email already exists. Try logging in instead.");
  }

  const user = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 12),
  });

  setSessionCookie(res, user);
  logger.info("user_registered", { userId: String(user._id) });

  res.status(201).json({
    success: true,
    message: "Your Echo account has been created.",
    user: user.toPublic(),
  });
}

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  const ok = await bcrypt.compare(password, user?.password || DUMMY_HASH);

  if (!user || !ok) {
    throw AppError.unauthorized("That email and password don't match an Echo account.");
  }

  setSessionCookie(res, user);

  res.json({
    success: true,
    message: "Welcome back to Echo.",
    user: user.toPublic(),
  });
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ success: true, user: req.user.toPublic() });
}

// POST /api/auth/logout
async function logout(req, res) {
  clearSessionCookie(res);
  res.json({ success: true, message: "You have been logged out." });
}

// POST /api/auth/logout-all — invalidates every session for this account.
async function logoutAll(req, res) {
  await User.updateOne({ _id: req.userId }, { $inc: { tokenVersion: 1 } });
  clearSessionCookie(res);
  res.json({ success: true, message: "You have been logged out on every device." });
}

// GET /api/auth/export — a copy of everything the user wrote (no media bytes).
async function exportData(req, res) {
  const memories = await Memory.find({ userId: req.userId, sealed: { $ne: true } })
    .sort({ date: -1 })
    .populate("photos.media audioMedia");
  const capsules = await Capsule.find({ userId: req.userId }).sort({ unlockAt: 1 });

  res.set("Content-Disposition", `attachment; filename="echo-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    success: true,
    exportedAt: new Date().toISOString(),
    account: req.user.toPublic(),
    memories: memories.map(toDetail),
    capsules: capsules.map((c) => ({
      id: String(c._id),
      title: c.title,
      unlockAt: c.unlockAt,
      opened: Boolean(c.openedAt),
      // Sealed capsule contents stay sealed, even in exports.
      letter: c.openedAt ? c.letter : null,
      memoryCount: c.memories.length,
    })),
    note: "Photos and recordings are referenced by URL and require you to be logged in to download.",
  });
}

// DELETE /api/auth/account — permanently deletes the account and all content.
async function deleteAccount(req, res) {
  const user = await User.findById(req.userId).select("+password");
  const ok = user && (await bcrypt.compare(req.body.password, user.password));
  if (!ok) throw AppError.unauthorized("That password is not correct.");

  const mediaCount = await deleteMedia({ userId: user._id });
  const { deletedCount: memoryCount } = await Memory.deleteMany({ userId: user._id });
  await Capsule.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });

  clearSessionCookie(res);
  logger.info("account_deleted", { userId: String(user._id), memoryCount, mediaCount });

  res.json({ success: true, message: "Your account and everything in it has been deleted." });
}

module.exports = {
  register,
  login,
  me,
  logout,
  logoutAll,
  exportData,
  deleteAccount,
};
