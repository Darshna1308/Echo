/*
  File type checks based on the file's actual bytes ("magic numbers"),
  not on the name or the Content-Type the browser claims.
*/
const sharp = require("sharp");
const AppError = require("../utils/AppError");

const ORIGINAL_MAX_EDGE = 2400;
const THUMB_MAX_EDGE = 720;

function startsWith(buffer, bytes, offset = 0) {
  return bytes.every((b, i) => buffer[offset + i] === b);
}

function sniffImage(buffer) {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (/^hei|^mif1|^heix/.test(brand)) return "image/heic";
  }
  return null;
}

function sniffAudio(buffer) {
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (startsWith(buffer, [0x4f, 0x67, 0x67, 0x53])) return "audio/ogg";
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x41, 0x56, 0x45], 8)) return "audio/wav";
  if (startsWith(buffer, [0x49, 0x44, 0x33]) || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) return "audio/mp4";
  if (startsWith(buffer, [0x66, 0x4c, 0x61, 0x43])) return "audio/flac";
  return null;
}

/*
  Decodes the image (which also proves it is a real image), applies the
  camera's rotation, strips all metadata (including GPS location), and
  produces a web-friendly original plus a small thumbnail.
*/
async function processImage(buffer) {
  const type = sniffImage(buffer);
  if (!type) {
    throw AppError.badRequest("That file isn't a supported image. Please use JPEG, PNG, WebP, GIF or AVIF.");
  }
  if (type === "image/heic") {
    throw AppError.badRequest("HEIC photos aren't supported yet. Please export the photo as JPEG and try again.");
  }

  try {
    const base = sharp(buffer, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
    const original = await base
      .clone()
      .resize({ width: ORIGINAL_MAX_EDGE, height: ORIGINAL_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const thumb = await base
      .clone()
      .resize({ width: THUMB_MAX_EDGE, height: THUMB_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return {
      original: original.data,
      thumb,
      width: original.info.width,
      height: original.info.height,
      mimeType: "image/jpeg",
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest("That image could not be read. It may be damaged — please try another file.");
  }
}

function checkAudio(buffer) {
  const type = sniffAudio(buffer);
  if (!type) {
    throw AppError.badRequest("That file isn't a supported audio recording. Please use WebM, Ogg, MP3, M4A, WAV or FLAC.");
  }
  return type;
}

module.exports = {
  processImage,
  checkAudio,
  sniffImage,
  sniffAudio,
};
