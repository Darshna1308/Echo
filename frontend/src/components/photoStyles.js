// src/components/photoStyles.js

export const PHOTO_STYLES = [
  {
    id: "original",
    name: "Original",
    description: "Just as it happened.",
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Like a memory from another year.",
  },
  {
    id: "polaroid",
    name: "Polaroid",
    description: "Like something you found in a drawer.",
  },
  {
    id: "warm",
    name: "Warm",
    description: "Golden, familiar, close.",
  },
  {
    id: "fade",
    name: "Fade",
    description: "Soft around the edges.",
  },
  {
    id: "film",
    name: "Film",
    description: "Captured like an old frame.",
  },
  {
    id: "noir",
    name: "Noir",
    description: "Some memories live in shadows.",
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Kept in the last light of the day.",
  },
  {
    id: "beach",
    name: "Beach",
    description: "Like the ocean kept it for you.",
  },
  {
    id: "dreamy",
    name: "Dreamy",
    description: "Soft enough to feel again.",
  },
  {
    id: "postcard",
    name: "Postcard",
    description: "A moment worth sending home.",
  },
  {
    id: "old-memory",
    name: "Old Memory",
    description: "Faded, but never forgotten.",
  },
];

export const DEFAULT_PHOTO_STYLE = "original";

export function getPhotoStyle(
  styleId = DEFAULT_PHOTO_STYLE
) {
  return (
    PHOTO_STYLES.find(
      (photoStyle) =>
        photoStyle.id === styleId
    ) || PHOTO_STYLES[0]
  );
}

/*
  Normalizes photos coming from MongoDB.

  Supported formats:

  1. ["image-url"]

  2. [
       {
         url: "image-url",
         style: "vintage",
         caption: "Birthday"
       }
     ]

  This keeps Timeline and MemoryDetail
  compatible with both old and new memories.
*/
export function normalizePhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos
    .filter(Boolean)
    .map((photo, index) => {
      // Old format:
      // photos: ["image-url"]
      if (typeof photo === "string") {
        return {
          id: `photo-${index}`,
          url: photo,
          previewUrl: photo,
          style: DEFAULT_PHOTO_STYLE,
          caption: "",
        };
      }

      // New format:
      // photos: [{ url, style, caption }]
      return {
        id:
          photo.id ||
          photo._id ||
          `photo-${index}`,

        url:
          photo.url ||
          photo.src ||
          photo.previewUrl ||
          "",

        previewUrl:
          photo.previewUrl ||
          photo.url ||
          photo.src ||
          "",

        style:
          photo.style ||
          DEFAULT_PHOTO_STYLE,

        caption:
          photo.caption ||
          "",
      };
    })
    .filter(
      (photo) =>
        photo.url ||
        photo.previewUrl
    );
}