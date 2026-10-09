const crypto = require("crypto");

const Media = require("../models/Media");
const AppError = require("../utils/AppError");
const ai = require("../services/ai");
const { config } = require("../config/env");
const { activeProvider, providerFor } = require("../services/storage");
const { processImage, checkAudio } = require("../services/fileChecks");
const { deleteMedia } = require("../services/memoryMedia");

async function loadOwnedMedia(req) {
  const media = await Media.findOne({ _id: req.params.id, userId: req.userId });
  if (!media) throw AppError.notFound("This file could not be found.");
  return media;
}

// POST /api/media/upload   multipart: file=<binary>, kind=image|audio, durationSec?
async function upload(req, res) {
  const file = req.file;
  const kind = req.body?.kind === "audio" ? "audio" : req.body?.kind === "image" ? "image" : null;
  if (!kind) throw AppError.badRequest("Please say whether this is an image or audio upload.");
  if (!file || !file.buffer?.length) throw AppError.badRequest("Please choose a file to upload.");

  const provider = activeProvider();
  const name = crypto.randomBytes(12).toString("hex");
  let doc;

  if (kind === "image") {
    if (file.size > config.media.maxImageBytes) {
      throw new AppError(413, `Photos can be up to ${Math.round(config.media.maxImageBytes / 1048576)} MB.`);
    }
    const processed = await processImage(file.buffer);
    const key = await provider.put(processed.original, { filename: `${name}.jpg`, contentType: processed.mimeType, kind });
    let thumbKey = "";
    if (provider.name === "gridfs") {
      thumbKey = await provider.put(processed.thumb, { filename: `${name}-thumb.webp`, contentType: "image/webp", kind });
    }
    doc = await Media.create({
      userId: req.userId,
      kind,
      provider: provider.name,
      key,
      thumbKey,
      mimeType: processed.mimeType,
      size: processed.original.length,
      width: processed.width,
      height: processed.height,
    });
  } else {
    if (file.size > config.media.maxAudioBytes) {
      throw new AppError(413, `Recordings can be up to ${Math.round(config.media.maxAudioBytes / 1048576)} MB.`);
    }
    const mimeType = checkAudio(file.buffer);
    const key = await provider.put(file.buffer, { filename: `${name}.audio`, contentType: mimeType, kind });
    const duration = Number(req.body?.durationSec);
    doc = await Media.create({
      userId: req.userId,
      kind,
      provider: provider.name,
      key,
      mimeType,
      size: file.size,
      durationSec: Number.isFinite(duration) && duration > 0 ? Math.min(Math.round(duration), 6 * 3600) : 0,
    });
  }

  res.status(201).json({ success: true, media: doc.toPublic() });
}

// GET /api/media/:id/file?variant=thumb
async function serveFile(req, res) {
  const media = await loadOwnedMedia(req);
  const variant = req.query.variant === "thumb" ? "thumb" : "original";
  const opened = await providerFor(media).open(media, variant);
  if (!opened) throw AppError.notFound("This file could not be found.");

  // Private to this user: browsers may cache it, shared caches/CDNs may not.
  res.set("Cache-Control", "private, max-age=3600");
  res.set("X-Content-Type-Options", "nosniff");

  if (opened.redirect) {
    return res.redirect(302, opened.redirect);
  }

  res.set("Content-Type", opened.contentType);
  if (opened.length) res.set("Content-Length", String(opened.length));
  opened.stream.on("error", () => {
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  });
  return opened.stream.pipe(res);
}

// DELETE /api/media/:id — only for uploads not yet saved in a memory.
async function remove(req, res) {
  const media = await loadOwnedMedia(req);
  if (media.status === "attached") {
    throw AppError.conflict("This file belongs to a saved memory. Remove it from the memory and save instead.");
  }
  await deleteMedia({ _id: media._id, userId: req.userId });
  res.json({ success: true, message: "File removed." });
}

// POST /api/media/:id/transcribe — returns a transcript for the user to review.
async function transcribe(req, res) {
  if (!ai.features().transcription) {
    throw new AppError(503, "Transcription is not configured on this server. You can type a transcript instead.", { code: "AI_DISABLED" });
  }
  const media = await loadOwnedMedia(req);
  if (media.kind !== "audio") throw AppError.badRequest("Only voice recordings can be transcribed.");
  const buffer = await providerFor(media).readBuffer(media);
  const transcript = await ai.transcribe(buffer, media.mimeType);
  res.json({ success: true, transcript });
}

module.exports = {
  upload,
  serveFile,
  remove,
  transcribe,
};
