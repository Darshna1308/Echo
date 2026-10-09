const mongoose = require("mongoose");

/*
  Metadata for an uploaded file. The bytes live in the storage provider
  (MongoDB GridFS or Cloudinary); this document records who owns them,
  what they are and which memory uses them.

  Lifecycle:
    upload           -> status "pending"  (owned by the user, not yet in a memory)
    memory saved     -> status "attached" (memory field set)
    removed / memory deleted -> bytes and document deleted
    pending for >24h -> cleaned up automatically (abandoned drafts)
*/
const mediaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["image", "audio"],
      required: true,
    },
    provider: {
      type: String,
      enum: ["gridfs", "cloudinary"],
      required: true,
    },
    // Provider-specific identifiers for the original and the thumbnail.
    key: { type: String, required: true },
    thumbKey: { type: String, default: "" },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    durationSec: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "attached"],
      default: "pending",
      index: true,
    },
    memory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Memory",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

mediaSchema.methods.toPublic = function toPublic(apiPrefix = "/api") {
  const base = `${apiPrefix}/media/${this._id}/file`;
  return {
    id: this._id,
    kind: this.kind,
    mimeType: this.mimeType,
    size: this.size,
    width: this.width,
    height: this.height,
    status: this.status,
    src: base,
    thumb: this.kind === "image" ? `${base}?variant=thumb` : "",
  };
};

module.exports = mongoose.model("Media", mediaSchema);
