import { useEffect, useRef } from "react";
import { apiUrl } from "../lib/api";
import { getPhotoStyle } from "./photoStyles";
import "./Lightbox.css";

/* Full-screen photo viewer. Arrow keys move between photos; Esc closes. */
export default function Lightbox({ photos, index, onIndex, onClose, title }) {
  const ref = useRef(null);
  const photo = photos[index];

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex]);

  if (!photo) return null;

  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label={`Photo ${index + 1} of ${photos.length}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="lightbox-inner">
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <figure className={`lightbox-figure pf ps-${getPhotoStyle(photo.style).id}`}>
          <span className="pf-image lightbox-image">
            <img src={apiUrl(photo.src)} alt={photo.caption || `${title} — photo ${index + 1}`} />
            <span className="pf-tint" />
            <span className="pf-wash" />
            <span className="pf-leak" />
            <span className="pf-edge" />
            <span className="pf-vig" />
          </span>
          <figcaption>
            {photo.caption && <span className="lightbox-caption">{photo.caption}</span>}
            <span className="lightbox-count">
              {index + 1} of {photos.length}
            </span>
          </figcaption>
        </figure>
        {photos.length > 1 && (
          <>
            <button type="button" className="lightbox-nav lightbox-prev" onClick={() => onIndex((index - 1 + photos.length) % photos.length)} aria-label="Previous photo">
              ‹
            </button>
            <button type="button" className="lightbox-nav lightbox-next" onClick={() => onIndex((index + 1) % photos.length)} aria-label="Next photo">
              ›
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}
