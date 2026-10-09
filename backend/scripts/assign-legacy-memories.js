#!/usr/bin/env node
/*
  Assign memories created before accounts existed (no userId) to ONE account
  that you choose explicitly. Nothing is ever assigned automatically.

  Usage (from backend/):
    node scripts/assign-legacy-memories.js --email you@example.com            # dry run: shows what would change
    node scripts/assign-legacy-memories.js --email you@example.com --confirm  # actually assigns

  Uses MONGO_URI from backend/.env (or the environment).
*/
const mongoose = require("mongoose");
const { config } = require("../config/env");

async function main() {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf("--email");
  const email = emailIndex >= 0 ? String(args[emailIndex + 1] || "").trim().toLowerCase() : "";
  const confirm = args.includes("--confirm");

  if (!email) {
    console.error("Please pass --email <account email>.");
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  const users = mongoose.connection.collection("users");
  const memories = mongoose.connection.collection("memories");

  const user = await users.findOne({ email });
  if (!user) {
    console.error(`No Echo account with email ${email}. Register it in the app first.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const filter = { $or: [{ userId: { $exists: false } }, { userId: null }] };
  const legacy = await memories.find(filter, { projection: { title: 1, date: 1 } }).toArray();

  console.log(`Found ${legacy.length} memories without an owner.`);
  for (const m of legacy.slice(0, 50)) {
    console.log(`  - ${m.date ? new Date(m.date).toISOString().slice(0, 10) : "????-??-??"}  ${m.title}`);
  }
  if (legacy.length > 50) console.log(`  ... and ${legacy.length - 50} more`);

  if (!confirm) {
    console.log(`\nDry run only. Re-run with --confirm to assign them to ${user.name} <${email}>.`);
  } else if (legacy.length) {
    const result = await memories.updateMany(filter, { $set: { userId: user._id } });
    console.log(`\nAssigned ${result.modifiedCount} memories to ${user.name} <${email}>.`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
