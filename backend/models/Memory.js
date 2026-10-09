const mongoose = require("mongoose");

const photoSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      default: "",
    },

    style: {
      type: String,
      default: "original",
    },

    caption: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  }
);

const memorySchema = new mongoose.Schema(
  {
    // ==========================================
    // OWNER
    // ==========================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },

    // ==========================================
    // MEMORY CONTENT
    // ==========================================

    title: {
      type: String,
      required: true,
      trim: true,
    },

    story: {
      type: String,
      required: true,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    people: {
      type: [String],
      default: [],
    },

    tags: {
      type: [String],
      default: [],
    },

    // ==========================================
    // PHOTOS
    // ==========================================

    photos: {
      type: [photoSchema],
      default: [],
    },

    // ==========================================
    // AUDIO / AI — FUTURE
    // ==========================================

    audio: {
      type: String,
      default: "",
    },

    transcript: {
      type: String,
      default: "",
    },

    aiSummary: {
      type: String,
      default: "",
    },

    aiTags: {
      type: [String],
      default: [],
    },

    aiMood: {
      type: String,
      default: "",
    },
  },

  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Memory",
  memorySchema
);