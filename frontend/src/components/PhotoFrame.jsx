import { useEffect, useRef, useState } from "react";
import { getPhotoStyle } from "./photoStyles";
import "./PhotoStyles.css";

/*
  Displays a photograph with a visual treatment.
  The image source is never altered: styles are CSS filters + overlay layers.
  size: "main" | "thumb" | "card"
  caption / date: shown on the Polaroid's bottom border
  onError: optional, called if the browser cannot decode the image
*/
function PhotoFrame({
  src,
  styleId,
  alt = "",
  caption = "",
  date = "",
  size = "card",
  animate = false,
  onError,
}) {
  const style = getPhotoStyle(styleId);
  const [settling, setSettling] = useState(false);
  const [failed, setFailed] = useState(false);
  const [orient, setOrient] = useState("landscape");
  const previous = useRef(style.id);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  // When the style changes on the main photograph, let it "settle" like a print being set down
  useEffect(() => {
    if (!animate || previous.current === style.id) {
      previous.current = style.id;
      return undefined;
    }
    previous.current = style.id;
    setSettling(true);
    const timer = setTimeout(() => setSettling(false), 1300);
    return () => clearTimeout(timer);
  }, [style.id, animate]);

  if (!src || failed) return null;

  const showPostcardParts = size === "main" || style.id === "postcard";

  const handleLoad = (event) => {
    if (size !== "main") return;
    const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
    if (!w || !h) return;
    const ratio = w / h;
    setOrient(ratio < 0.87 ? "portrait" : ratio < 1.15 ? "square" : "landscape");
  };

  const handleError = () => {
    setFailed(true);
    if (onError) onError();
  };

  return (
    <span
      className={`pf pf--${size}${size === "main" ? ` is-${orient}` : ""} ps-${style.id}${
        settling ? " is-settling" : ""
      }`}
    >
      <span className="pf-image">
        <img
          src={src}
          alt={alt}
          draggable="false"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
        <span className="pf-tint" />
        <span className="pf-wash" />
        <span className="pf-leak" />
        <span className="pf-edge" />
        <span className="pf-vig" />
        <span className="pf-grain" />
      </span>

      {showPostcardParts && (
        <>
          <span className="pf-stamp" aria-hidden="true">
            <svg viewBox="0 0 40 50">
              <rect width="40" height="50" fill="#E8F6F3" />
              <circle cx="28" cy="14" r="5" fill="#E9C46A" />
              <path d="M0 32 Q6 28 12 32 T24 32 T40 32 V50 H0Z" fill="#2A9D8F" opacity=".75" />
              <path d="M0 38 Q6 34 12 38 T24 38 T40 38 V50 H0Z" fill="#176B87" opacity=".8" />
              <rect x=".75" y=".75" width="38.5" height="48.5" fill="none" stroke="#176B87" strokeWidth="1.2" opacity=".5" />
            </svg>
          </span>
          <svg className="pf-postmark" viewBox="0 0 96 44" aria-hidden="true" fill="none" stroke="#176B87" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="22" cy="22" r="17" />
            <circle cx="22" cy="22" r="12" opacity=".6" />
            <path d="M12 22 q5 -4 10 0 t10 0" />
            <path d="M44 14 q6 -4 12 0 t12 0 t12 0" />
            <path d="M44 22 q6 -4 12 0 t12 0 t12 0" />
            <path d="M44 30 q6 -4 12 0 t12 0 t12 0" />
          </svg>
        </>
      )}

      <span className="pf-caption" aria-hidden="true">
        {caption && <span className="pf-cap-text">{caption}</span>}
        {date && <span className="pf-cap-date">{date}</span>}
      </span>
    </span>
  );
}

export default PhotoFrame;