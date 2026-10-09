export const MAX_PHOTOS = 12;

let localId = 0;
export const nextKey = () => `p${Date.now().toString(36)}${(localId += 1)}`;

/* Converts photos from the API into photo-editor items. */
export function photosToItems(photos = []) {
  return photos.map((p) => ({
    key: nextKey(),
    ref: p.ref,
    src: p.thumb || p.src,
    style: p.style || "original",
    caption: p.caption || "",
    status: "ready",
    isNew: false,
  }));
}
