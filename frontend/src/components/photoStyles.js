/*
  Photo presentation styles.

  A style is ONLY a visual treatment (CSS filters and overlay layers in
  PhotoStyles.css). The stored photograph is never modified, so a style can
  be changed at any time. Every id from the first version of Echo is kept
  so saved memories look the way they were chosen.
*/
export const PHOTO_STYLES = [
  { id: "original", name: "Original", blurb: "Just as it happened." },
  { id: "haveli", name: "Haveli", blurb: "Late sun on sandstone walls." },
  { id: "miniature", name: "Miniature", blurb: "Rich colour, painted margins." },
  { id: "neel", name: "Neel", blurb: "Blue pottery and indigo dye." },
  { id: "vintage", name: "Vintage", blurb: "Like a memory from another year." },
  { id: "polaroid", name: "Polaroid", blurb: "Found in a drawer, years later." },
  { id: "warm", name: "Warm", blurb: "Golden, familiar, close." },
  { id: "fade", name: "Fade", blurb: "Soft around the edges." },
  { id: "film", name: "Film", blurb: "Caught on an old roll." },
  { id: "noir", name: "Noir", blurb: "Some memories live in shadow." },
  { id: "sunset", name: "Sunset", blurb: "Kept in the last light of the day." },
  { id: "beach", name: "Seaside", blurb: "Salt air and pale blue." },
  { id: "dreamy", name: "Dreamy", blurb: "Soft enough to feel again." },
  { id: "postcard", name: "Postcard", blurb: "A moment worth sending home." },
  { id: "old-memory", name: "Old memory", blurb: "Faded, but never forgotten." },
];

export const DEFAULT_PHOTO_STYLE = "original";

export function getPhotoStyle(styleId = DEFAULT_PHOTO_STYLE) {
  return PHOTO_STYLES.find((s) => s.id === styleId) || PHOTO_STYLES[0];
}
