#!/usr/bin/env node
/*
  OPTIONAL: move photos stored as base64 text inside memory documents (the
  first version of Echo) into proper media storage (GridFS or Cloudinary,
  whichever MEDIA_STORAGE selects).

  You don't have to run this — old photos keep working. Running it makes the
  memory documents much smaller and lets old photos get thumbnails.

  Usage (from backend/):
    node scripts/migrate-legacy-photos.js            # dry run: counts only
    node scripts/migrate-legacy-photos.js --confirm  # migrate

  Safety:
  - Only memories that HAVE an owner are migrated (the media belongs to them).
  - Each memory is updated only after its new files are stored successfully.
  - A memory whose photo can't be processed is left unchanged and reported.
  - Back up your database first (Atlas: take a snapshot; local: mongodump).
*/
const mongoose = require("mongoose");
const { config } = require("../config/env");
const Memory = require("../models/Memory");
const Media = require("../models/Media");
const { activeProvider } = require("../services/storage");
const { processImage } = require("../services/fileChecks");

async function main() {
  const confirm = process.argv.includes("--confirm");
  await mongoose.connect(config.mongoUri);
  const provider = activeProvider();

  const candidates = await Memory.find({
    userId: { $exists: true, $ne: null },
    "photos.url": { $regex: "^data:image/" },
  });

  console.log(`${candidates.length} memories have base64 photos. Storage: ${provider.name}.`);
  if (!confirm) {
    console.log("Dry run only. Re-run with --confirm to migrate.");
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let failed = 0;
  for (const memory of candidates) {
    const created = [];
    try {
      const photos = [];
      for (const photo of memory.photos) {
        const match = /^data:image\/[a-z]+;base64,(.+)$/s.exec(photo.url || "");
        if (!match || photo.media) {
          photos.push(photo.toObject ? photo.toObject() : photo);
          continue;
        }
        const processed = await processImage(Buffer.from(match[1], "base64"));
        const name = `legacy-${memory._id}-${photos.length}`;
        const key = await provider.put(processed.original, { filename: `${name}.jpg`, contentType: processed.mimeType, kind: "image" });
        const thumbKey = provider.name === "gridfs"
          ? await provider.put(processed.thumb, { filename: `${name}-thumb.webp`, contentType: "image/webp", kind: "image" })
          : "";
        const media = await Media.create({
          userId: memory.userId,
          kind: "image",
          provider: provider.name,
          key,
          thumbKey,
          mimeType: processed.mimeType,
          size: processed.original.length,
          width: processed.width,
          height: processed.height,
          status: "attached",
          memory: memory._id,
        });
        created.push(media);
        photos.push({ media: media._id, url: "", style: photo.style, caption: photo.caption });
      }
      await Memory.updateOne({ _id: memory._id }, { $set: { photos } });
      migrated += 1;
      console.log(`  ✓ ${memory.title}`);
    } catch (error) {
      failed += 1;
      console.log(`  ✗ ${memory.title} — left unchanged (${error.message})`);
      for (const media of created) {
        await provider.remove(media);
        await Media.deleteOne({ _id: media._id });
      }
    }
  }

  console.log(`\nMigrated ${migrated}, unchanged ${failed}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
