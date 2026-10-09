const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    // bcrypt hash — never the plain password. Excluded from queries by default.
    password: {
      type: String,
      required: true,
      select: false,
    },

    /*
      Incremented by "log out of all devices" and account deletion.
      Every session token carries the version it was issued with; a token
      whose version no longer matches is rejected.
    */
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", userSchema);
