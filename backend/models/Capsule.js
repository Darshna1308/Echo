const mongoose = require("mongoose");

/*
  A Memory Capsule seals a letter and/or a set of memories until `unlockAt`.

  The server never returns the letter or the sealed memories before the
  unlock time. Opening (`POST /api/capsules/:id/unlock`) is only accepted
  once the server clock has passed `unlockAt`.
*/
const capsuleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    letter: { type: String, default: "", maxlength: 10000 },
    memories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Memory" }],
    unlockAt: { type: Date, required: true },
    openedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

capsuleSchema.virtual("isSealed").get(function isSealed() {
  return !this.openedAt;
});

module.exports = mongoose.model("Capsule", capsuleSchema);
