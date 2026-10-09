const mongoose = require("mongoose");

/*
  A photograph inside a memory.

  - `media` points at a Media document (new uploads, stored in GridFS or Cloudinary).
  - `url` is kept for memories created before media storage existed. Those may
    hold an http(s) URL or a base64 data URL. They are still displayed, but are
    never sent to the browser as raw base64 (see services/memoryPresenter.js).
  - `style` is a presentation effect only. The stored image is never altered.
*/
const photoSchema = new mongoose.Schema(
  {
    media: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    url: {
      type: String,
      default: "",
    },
    style: {
      type: String,
      default: "original",
      maxlength: 32,
    },
    caption: {
      type: String,
      default: "",
      maxlength: 300,
    },
  },
  {
    _id: false,
  }
);

const memorySchema = new mongoose.Schema(
  {
    // ==========================================
    // OWNER — always taken from the verified session, never from the client.
    // Memories created before accounts existed have no userId and are never
    // returned by any query until explicitly assigned with
    // scripts/assign-legacy-memories.js.
    // ==========================================
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ==========================================
    // MEMORY CONTENT (user-authored)
    // ==========================================
    title: { type: String, required: true, trim: true, maxlength: 160 },
    story: { type: String, required: true, trim: true, maxlength: 20000 },
    date: { type: Date, required: true },
    // Optional local time "HH:MM". Kept separate from `date` so a calendar
    // day never shifts between time zones.
    time: { type: String, default: "", maxlength: 5 },
    location: { type: String, trim: true, default: "", maxlength: 160 },
    people: { type: [String], default: [] },
    tags: { type: [String], default: [] },

    // ==========================================
    // MEDIA
    // ==========================================
    photos: { type: [photoSchema], default: [] },

    // Legacy field from the first version (unused by new code, preserved).
    audio: { type: String, default: "" },
    audioMedia: { type: mongoose.Schema.Types.ObjectId, ref: "Media", default: null },
    transcript: { type: String, default: "", maxlength: 20000 },

    // ==========================================
    // AI ENRICHMENT — always shown as AI-suggested, always editable,
    // never written into `story`.
    // ==========================================
    aiSummary: { type: String, default: "", maxlength: 2000 },
    aiTags: { type: [String], default: [] },
    aiMood: { type: String, default: "", maxlength: 60 },
    aiThemes: { type: [String], default: [] },
    aiStatus: {
      type: String,
      enum: ["none", "ready", "failed"],
      default: "none",
    },
    aiGeneratedAt: { type: Date, default: null },
    aiModel: { type: String, default: "" },

    // Semantic search vector (only when an embedding provider is configured).
    embedding: { type: [Number], default: undefined, select: false },
    embeddingModel: { type: String, default: "", select: false },

    // ==========================================
    // MEMORY CAPSULES — a sealed memory is invisible everywhere
    // (timeline, detail, search, Ask Echo) until its capsule is opened on
    // or after the unlock date. Enforced on the server.
    // ==========================================
    capsule: { type: mongoose.Schema.Types.ObjectId, ref: "Capsule", default: null },
    sealed: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

memorySchema.index({ userId: 1, date: -1, _id: -1 });
memorySchema.index({ userId: 1, sealed: 1 });
memorySchema.index({ userId: 1, people: 1 });
memorySchema.index({ userId: 1, tags: 1 });

/*
  Filter used by every user-facing read: owned by this user and not sealed.
  (`sealed: {$ne: true}` also matches older documents with no `sealed` field.)
*/
memorySchema.statics.visibleTo = function visibleTo(userId, extra = {}) {
  return { ...extra, userId, sealed: { $ne: true } };
};

module.exports = mongoose.model("Memory", memorySchema);
