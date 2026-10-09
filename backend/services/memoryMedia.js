/*
  Connects uploaded Media to memories, and cleans media up when it is no
  longer used. Ownership is checked for every media id the client sends.
*/
const mongoose = require("mongoose");

const Media = require("../models/Media");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { providerFor } = require("./storage");

const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

function mediaIdsOf(memory) {
  const ids = (memory?.photos || []).map((p) => p.media && String(p.media._id || p.media)).filter(Boolean);
  if (memory?.audioMedia) ids.push(String(memory.audioMedia._id || memory.audioMedia));
  return ids;
}

/*
  Validates the photo list and audio reference sent by the client and
  returns the values to store on the memory.
*/
async function resolveMedia(userId, { photos = [], audio = null }, existing = null) {
  const seen = new Set();
  const wantedIds = [];

  for (const photo of photos) {
    if (seen.has(photo.ref)) throw AppError.badRequest("The same photograph was added twice.");
    seen.add(photo.ref);
    if (!photo.ref.startsWith("legacy:")) {
      if (!mongoose.isValidObjectId(photo.ref)) throw AppError.badRequest("A photograph reference is not valid.");
      wantedIds.push(photo.ref);
    }
  }
  if (audio) wantedIds.push(audio);

  const media = wantedIds.length
    ? await Media.find({ _id: { $in: wantedIds }, userId })
    : [];
  const byId = new Map(media.map((m) => [String(m._id), m]));

  function usable(id, kind) {
    const m = byId.get(String(id));
    if (!m || m.kind !== kind) return null;
    if (m.status === "pending") return m;
    if (existing && m.memory && String(m.memory) === String(existing._id)) return m;
    return null;
  }

  const storedPhotos = photos.map((photo) => {
    if (photo.ref.startsWith("legacy:")) {
      const index = Number(photo.ref.slice(7));
      const old = existing?.photos?.[index];
      const url = typeof old === "string" ? old : old?.url;
      if (!Number.isInteger(index) || !url || old?.media) {
        throw AppError.badRequest("One of the existing photographs could not be found.");
      }
      return { media: null, url, style: photo.style, caption: photo.caption };
    }
    if (!usable(photo.ref, "image")) {
      throw AppError.badRequest("One of the photographs is not available. Please upload it again.");
    }
    return { media: photo.ref, url: "", style: photo.style, caption: photo.caption };
  });

  let audioMedia = null;
  if (audio) {
    if (!usable(audio, "audio")) throw AppError.badRequest("The voice recording is not available. Please record or upload it again.");
    audioMedia = audio;
  }

  return { photos: storedPhotos, audioMedia };
}

/* After a memory is saved: mark its media attached, delete media it dropped. */
async function syncAttachments(memory, previousIds = []) {
  const current = mediaIdsOf(memory);
  if (current.length) {
    await Media.updateMany(
      { _id: { $in: current }, userId: memory.userId },
      { $set: { status: "attached", memory: memory._id } }
    );
  }
  const dropped = previousIds.filter((id) => !current.includes(id));
  if (dropped.length) await deleteMedia({ _id: { $in: dropped }, userId: memory.userId });
}

/* Deletes stored bytes and Media documents matching the filter. */
async function deleteMedia(filter) {
  const docs = await Media.find(filter);
  for (const doc of docs) {
    await providerFor(doc).remove(doc);
  }
  if (docs.length) await Media.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
  return docs.length;
}

/* Removes uploads that were never saved into a memory (abandoned drafts). */
async function cleanupPendingMedia() {
  try {
    const count = await deleteMedia({ status: "pending", createdAt: { $lt: new Date(Date.now() - PENDING_TTL_MS) } });
    if (count) logger.info("pending_media_cleaned", { count });
  } catch (error) {
    logger.warn("pending_media_cleanup_failed", { error });
  }
}

module.exports = {
  resolveMedia,
  syncAttachments,
  deleteMedia,
  cleanupPendingMedia,
  mediaIdsOf,
};
