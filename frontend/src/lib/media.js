/*
  Client-side preparation of photos before upload: very large camera images
  are scaled to at most 2400px and re-encoded as JPEG, which keeps uploads
  fast and within hosting limits. The server re-checks and processes every
  file anyway, so this is a convenience, not a security measure.
*/
const MAX_EDGE = 2400;
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;
export const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/gif,image/avif";

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo couldn't be opened. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

export async function preparePhoto(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`“${file.name}” isn't a photo.`);
  }
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    throw new Error(`“${file.name}” is a HEIC photo. Please export it as JPEG first.`);
  }
  if (file.type === "image/gif" || file.size < SKIP_BELOW_BYTES) return file;

  const { img, url } = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Best audio container this browser can record. */
export function recorderMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}
