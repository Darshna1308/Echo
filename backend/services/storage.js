/*
  Media storage providers.

  gridfs      (default) Files are stored in your MongoDB database using GridFS
              (chunked binary storage — not base64 inside memory documents).
              No extra account needed. Good for development and small archives.
              Note: MongoDB Atlas' free M0 tier has 512 MB of storage in total.

  cloudinary  Files are uploaded to Cloudinary as "authenticated" assets,
              which cannot be fetched without a signed URL. Echo only creates a
              signed URL after checking that the requester owns the media.
              Recommended for production archives with many photos.

  Both providers are used through the same small interface:
    put(buffer, { filename, contentType, kind })  -> key
    open(media, variant) -> { stream, contentType, length } | { redirect }
    readBuffer(media)    -> Buffer
    remove(media)
*/
const crypto = require("crypto");
const { Readable } = require("stream");
const mongoose = require("mongoose");

const { config } = require("../config/env");
const logger = require("../utils/logger");

// --------------------------------------------------------------------------
// GridFS
// --------------------------------------------------------------------------
let bucket = null;
function getBucket() {
  if (!bucket || bucket.s?.db !== mongoose.connection.db) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "media" });
  }
  return bucket;
}

const gridfs = {
  name: "gridfs",

  async put(buffer, { filename, contentType }) {
    const upload = getBucket().openUploadStream(filename, { metadata: { contentType } });
    await new Promise((resolve, reject) => {
      Readable.from(buffer).pipe(upload).on("error", reject).on("finish", resolve);
    });
    return String(upload.id);
  },

  async open(media, variant) {
    const key = variant === "thumb" && media.thumbKey ? media.thumbKey : media.key;
    const id = new mongoose.Types.ObjectId(key);
    const files = await getBucket().find({ _id: id }).limit(1).toArray();
    if (!files.length) return null;
    const file = files[0];
    return {
      stream: getBucket().openDownloadStream(id),
      contentType: file.metadata?.contentType || media.mimeType,
      length: file.length,
    };
  },

  async readBuffer(media) {
    const opened = await this.open(media, "original");
    if (!opened) throw new Error("Stored file is missing.");
    const chunks = [];
    for await (const chunk of opened.stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  },

  async remove(media) {
    for (const key of [media.key, media.thumbKey].filter(Boolean)) {
      try {
        await getBucket().delete(new mongoose.Types.ObjectId(key));
      } catch (error) {
        // Already gone is fine; anything else is logged, not fatal.
        if (!/not found/i.test(error.message)) {
          logger.warn("gridfs_delete_failed", { mediaId: String(media._id), error });
        }
      }
    }
  },
};

// --------------------------------------------------------------------------
// Cloudinary
// --------------------------------------------------------------------------
let cloudinaryClient = null;
function getCloudinary() {
  if (!cloudinaryClient) {
    // Loaded lazily so the SDK is only required when this provider is used.
    // eslint-disable-next-line global-require
    cloudinaryClient = require("cloudinary").v2;
    const c = config.media.cloudinary;
    cloudinaryClient.config({
      cloud_name: c.cloudName,
      api_key: c.apiKey,
      api_secret: c.apiSecret,
      secure: true,
    });
  }
  return cloudinaryClient;
}

function resourceType(kind) {
  // Cloudinary files audio under the "video" resource type.
  return kind === "audio" ? "video" : "image";
}

const cloudinary = {
  name: "cloudinary",

  async put(buffer, { kind }) {
    const client = getCloudinary();
    const publicId = crypto.randomBytes(16).toString("hex");
    const result = await new Promise((resolve, reject) => {
      const stream = client.uploader.upload_stream(
        {
          resource_type: resourceType(kind),
          type: "authenticated",
          folder: config.media.cloudinary.folder,
          public_id: publicId,
          overwrite: false,
        },
        (error, uploaded) => (error ? reject(error) : resolve(uploaded))
      );
      Readable.from(buffer).pipe(stream);
    });
    return result.public_id;
  },

  async open(media, variant) {
    const client = getCloudinary();
    const transformation =
      media.kind === "image"
        ? variant === "thumb"
          ? [{ width: 720, crop: "limit", quality: "auto", fetch_format: "auto" }]
          : [{ quality: "auto", fetch_format: "auto" }]
        : undefined;
    const url = client.url(media.key, {
      resource_type: resourceType(media.kind),
      type: "authenticated",
      sign_url: true,
      secure: true,
      transformation,
    });
    return { redirect: url };
  },

  async readBuffer(media) {
    const client = getCloudinary();
    const url = client.url(media.key, {
      resource_type: resourceType(media.kind),
      type: "authenticated",
      sign_url: true,
      secure: true,
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cloudinary download failed (${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  },

  async remove(media) {
    try {
      await getCloudinary().uploader.destroy(media.key, {
        resource_type: resourceType(media.kind),
        type: "authenticated",
        invalidate: true,
      });
    } catch (error) {
      logger.warn("cloudinary_delete_failed", { mediaId: String(media._id), error });
    }
  },
};

const providers = { gridfs, cloudinary };

function activeProvider() {
  return providers[config.media.storage] || gridfs;
}

function providerFor(media) {
  return providers[media.provider] || gridfs;
}

module.exports = {
  activeProvider,
  providerFor,
};
