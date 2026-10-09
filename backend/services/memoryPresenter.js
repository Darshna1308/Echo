/*
  Turns Memory documents into the JSON the frontend receives.

  Photos always come out as URLs the browser can load:
    - uploaded media        -> /api/media/:mediaId/file (owner-checked)
    - legacy http(s) URL    -> passed through unchanged
    - legacy base64 data    -> /api/memories/:id/legacy-photos/:index
                               (decoded on the server, never shipped as base64 JSON)
  Each photo carries a `ref` the editor sends back to keep that photo.
*/
const { snippet } = require("./retrieval");

function photoView(memory, photo, index) {
  if (!photo) return null;
  if (typeof photo === "string") photo = { url: photo };

  const style = photo.style || "original";
  const caption = photo.caption || "";

  if (photo.media) {
    const media = photo.media;
    const id = String(media._id || media);
    return {
      ref: id,
      src: `/api/media/${id}/file`,
      thumb: `/api/media/${id}/file?variant=thumb`,
      width: media.width || 0,
      height: media.height || 0,
      style,
      caption,
    };
  }

  const url = photo.url || "";
  if (!url) return null;

  if (/^https?:\/\//i.test(url)) {
    return { ref: `legacy:${index}`, src: url, thumb: url, width: 0, height: 0, style, caption, legacy: true };
  }

  if (url.startsWith("data:image/")) {
    const path = `/api/memories/${memory._id}/legacy-photos/${index}`;
    return { ref: `legacy:${index}`, src: path, thumb: path, width: 0, height: 0, style, caption, legacy: true };
  }

  return null;
}

function photosOf(memory) {
  return (memory.photos || []).map((p, i) => photoView(memory, p, i)).filter(Boolean);
}

function dateOnly(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

function audioView(memory) {
  if (!memory.audioMedia) return null;
  const media = memory.audioMedia;
  const id = String(media._id || media);
  return {
    ref: id,
    src: `/api/media/${id}/file`,
    mimeType: media.mimeType || "",
    durationSec: media.durationSec || 0,
  };
}

function aiView(memory) {
  const hasAny = memory.aiSummary || memory.aiMood || memory.aiTags?.length || memory.aiThemes?.length;
  return {
    status: memory.aiStatus || (hasAny ? "ready" : "none"),
    summary: memory.aiSummary || "",
    tags: memory.aiTags || [],
    mood: memory.aiMood || "",
    themes: memory.aiThemes || [],
    generatedAt: memory.aiGeneratedAt || null,
    model: memory.aiModel || "",
  };
}

/* Compact shape for timeline cards and search results. */
function toCard(memory, { terms } = {}) {
  const photos = photosOf(memory);
  return {
    id: String(memory._id),
    title: memory.title,
    date: dateOnly(memory.date),
    time: memory.time || "",
    location: memory.location || "",
    people: memory.people || [],
    tags: memory.tags || [],
    excerpt: snippet(memory.story, terms, 260),
    photos: photos.slice(0, 4),
    photoCount: photos.length,
    hasAudio: Boolean(memory.audioMedia),
    mood: memory.aiMood || "",
  };
}

/* Full shape for the detail and edit pages. */
function toDetail(memory) {
  return {
    id: String(memory._id),
    title: memory.title,
    story: memory.story,
    date: dateOnly(memory.date),
    time: memory.time || "",
    location: memory.location || "",
    people: memory.people || [],
    tags: memory.tags || [],
    photos: photosOf(memory),
    audio: audioView(memory),
    transcript: memory.transcript || "",
    ai: aiView(memory),
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

module.exports = {
  toCard,
  toDetail,
  dateOnly,
};
