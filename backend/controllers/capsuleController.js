/*
  Memory Capsules.

  Sealing rules (enforced here, on the server):
  - Only the owner's own, currently visible memories can be sealed.
  - While sealed, those memories are hidden from every other endpoint
    (Memory.visibleTo filters out `sealed: true`).
  - The letter and the memories are never returned before opening.
  - Opening is refused until the server's clock passes `unlockAt`.
*/
const Capsule = require("../models/Capsule");
const Memory = require("../models/Memory");
const AppError = require("../utils/AppError");
const { toCard } = require("../services/memoryPresenter");
const { deleteMedia, mediaIdsOf } = require("../services/memoryMedia");

function summary(capsule) {
  const sealed = !capsule.openedAt;
  return {
    id: String(capsule._id),
    title: capsule.title,
    unlockAt: capsule.unlockAt,
    createdAt: capsule.createdAt,
    openedAt: capsule.openedAt,
    sealed,
    canOpen: sealed && Date.now() >= capsule.unlockAt.getTime(),
    memoryCount: capsule.memories.length,
    hasLetter: Boolean(capsule.letter),
  };
}

async function loadOwned(req) {
  const capsule = await Capsule.findOne({ _id: req.params.id, userId: req.userId });
  if (!capsule) throw AppError.notFound("This capsule could not be found.");
  return capsule;
}

async function opened(capsule) {
  const memories = await Memory.find({ _id: { $in: capsule.memories }, userId: capsule.userId, sealed: { $ne: true } })
    .sort({ date: -1 })
    .populate("photos.media", "width height");
  return {
    ...summary(capsule),
    letter: capsule.letter,
    memories: memories.map((m) => toCard(m)),
  };
}

// POST /api/capsules
async function create(req, res) {
  const { title, letter, memoryIds, unlockAt } = req.body;
  const unique = [...new Set(memoryIds)];

  const memories = unique.length ? await Memory.find(Memory.visibleTo(req.userId, { _id: { $in: unique } })).select("_id") : [];
  if (memories.length !== unique.length) {
    throw AppError.badRequest("Some of those memories can't be sealed. They may already be in a capsule.");
  }

  const capsule = await Capsule.create({
    userId: req.userId,
    title,
    letter,
    memories: unique,
    unlockAt,
  });

  if (unique.length) {
    // Only seal memories that are still unsealed (guards against a race).
    const { modifiedCount } = await Memory.updateMany(
      { _id: { $in: unique }, userId: req.userId, sealed: { $ne: true } },
      { $set: { sealed: true, capsule: capsule._id } }
    );
    if (modifiedCount !== unique.length) {
      await Memory.updateMany({ capsule: capsule._id, userId: req.userId }, { $set: { sealed: false, capsule: null } });
      await Capsule.deleteOne({ _id: capsule._id });
      throw AppError.conflict("Some of those memories were sealed elsewhere just now. Please try again.");
    }
  }

  res.status(201).json({ success: true, message: "Your capsule has been sealed.", capsule: summary(capsule) });
}

// GET /api/capsules
async function list(req, res) {
  const capsules = await Capsule.find({ userId: req.userId }).sort({ unlockAt: 1 });
  res.json({ success: true, capsules: capsules.map(summary), serverTime: new Date().toISOString() });
}

// GET /api/capsules/:id — contents only once opened.
async function getOne(req, res) {
  const capsule = await loadOwned(req);
  if (!capsule.openedAt) {
    return res.json({ success: true, capsule: summary(capsule), serverTime: new Date().toISOString() });
  }
  return res.json({ success: true, capsule: await opened(capsule) });
}

// POST /api/capsules/:id/unlock
async function unlock(req, res) {
  const capsule = await loadOwned(req);

  if (!capsule.openedAt) {
    if (Date.now() < capsule.unlockAt.getTime()) {
      throw new AppError(423, "This capsule is still sealed. It can be opened on its unlock date.", {
        code: "CAPSULE_SEALED",
      });
    }
    capsule.openedAt = new Date();
    await capsule.save();
    await Memory.updateMany({ capsule: capsule._id, userId: req.userId }, { $set: { sealed: false } });
  }

  res.json({ success: true, message: "Your capsule is open.", capsule: await opened(capsule) });
}

// DELETE /api/capsules/:id
// Sealed: the capsule AND its sealed memories are destroyed unseen.
// Opened: only the capsule is removed; its memories stay in the archive.
async function remove(req, res) {
  const capsule = await loadOwned(req);
  let deletedMemories = 0;

  if (!capsule.openedAt) {
    const sealedMemories = await Memory.find({ capsule: capsule._id, userId: req.userId, sealed: true });
    const mediaIds = sealedMemories.flatMap(mediaIdsOf);
    if (mediaIds.length) await deleteMedia({ _id: { $in: mediaIds }, userId: req.userId });
    ({ deletedCount: deletedMemories } = await Memory.deleteMany({ capsule: capsule._id, userId: req.userId, sealed: true }));
  } else {
    await Memory.updateMany({ capsule: capsule._id, userId: req.userId }, { $set: { capsule: null } });
  }

  await Capsule.deleteOne({ _id: capsule._id });
  res.json({ success: true, message: "The capsule has been deleted.", deletedMemories });
}

module.exports = {
  create,
  list,
  getOne,
  unlock,
  remove,
};
