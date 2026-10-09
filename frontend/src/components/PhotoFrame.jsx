import { useState } from "react";
import { apiUrl } from "../lib/api";
import { getPhotoStyle } from "./photoStyles";
import "./PhotoStyles.css";

/*
  Displays a photograph with its presentation style.
  The image itself is never altered: styles are CSS filters + overlay layers.

  size: "main" | "card" | "thumb"
  shape: "print" (paper print with border) | "arch" (cusped jharokha window)
  If the image fails to load, a quiet placeholder is shown instead of a
  broken-image icon.
*/
function PhotoFrame({
  src,
  styleId,
  alt = "",
  caption = "",
  size = "card",
  shape = "print",
  loading = "lazy",
  onClick,
}) {
  const style = getPhotoStyle(styleId);
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = failedSrc === src;
  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`pf pf--${size} pf--${shape} ps-${style.id}${onClick ? " pf--clickable" : ""}`}
      aria-label={onClick ? `Open photograph: ${alt}` : undefined}
    >
      <span className="pf-image">
        {src && !failed ? (
          <img src={apiUrl(src)} alt={onClick ? "" : alt} draggable="false" decoding="async" loading={loading} onError={() => setFailedSrc(src)} />
        ) : (
          <span className="pf-missing" role="img" aria-label={alt ? `${alt} (unavailable)` : "Photo unavailable"}>
            <span>Photo unavailable</span>
          </span>
        )}
        <span className="pf-tint" />
        <span className="pf-wash" />
        <span className="pf-leak" />
        <span className="pf-edge" />
        <span className="pf-vig" />
        <span className="pf-grain" />
      </span>

      {style.id === "postcard" && (
        <span className="pf-stamp" aria-hidden="true">
          <svg viewBox="0 0 40 50">
            <rect width="40" height="50" fill="#dfe7f1" />
            <path d="M8 50 V24 A12 12 0 0 1 32 24 V50 Z" fill="#315d91" opacity=".85" />
            <circle cx="20" cy="15" r="3.5" fill="#c88b5a" />
          </svg>
        </span>
      )}

      {style.id === "polaroid" && caption && (
        <span className="pf-caption" aria-hidden="true">
          {caption}
        </span>
      )}
    </Tag>
  );
}

export default PhotoFrame;
