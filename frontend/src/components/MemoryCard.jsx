import { Link } from "react-router";
import PhotoFrame from "./PhotoFrame";
import { useTilt } from "../hooks/motion";
import { dayAndMonth, formatShortDay, hashIndex } from "../lib/format";
import "./MemoryCard.css";

const PANEL_TONES = ["indigo", "turquoise", "terracotta", "sandstone"];

/*
  The window into one memory: photographs inside a cusped arch, or —
  when a memory has no photos — a block-printed panel with its opening words.
*/
export function MemoryWindow({ memory, size = "card" }) {
  const photos = memory.photos || [];
  const count = memory.photoCount ?? photos.length;

  if (!photos.length) {
    const tone = PANEL_TONES[hashIndex(memory.id, PANEL_TONES.length)];
    return (
      <div className={`mwin mwin--text mwin--${tone}`}>
        <p className="mwin-words">{(memory.excerpt || memory.story || "").slice(0, 140)}</p>
      </div>
    );
  }

  const shown = photos.slice(0, 3);
  return (
    <div className={`mwin mwin--photos mwin--n${shown.length}`}>
      {shown.map((photo, i) => (
        <div className="mwin-cell" key={photo.ref || i}>
          <PhotoFrame src={photo.thumb || photo.src} styleId={photo.style} alt={photo.caption || memory.title} size={size === "small" ? "thumb" : "card"} shape="plain" />
        </div>
      ))}
      {count > 3 && <span className="mwin-more">+{count - 3}</span>}
    </div>
  );
}

export default function MemoryCard({ memory, showYear = false, reason }) {
  const tilt = useTilt();
  const people = memory.people || [];
  const tags = memory.tags || [];

  return (
    <article className="mcard">
      <Link to={`/memories/${memory.id}`} className="mcard-link" ref={tilt}>
        <div className="mcard-window">
          <MemoryWindow memory={memory} />
          {memory.hasAudio && (
            <span className="mcard-badge" title="Has a voice note">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="visually-hidden">Has a voice note</span>
            </span>
          )}
        </div>
        <div className="mcard-body">
          <p className="mcard-date">
            <time dateTime={memory.date}>{showYear ? formatShortDay(memory.date) : dayAndMonth(memory.date)}</time>
          </p>
          <h3 className="mcard-title">{memory.title}</h3>
          {(memory.location || people.length > 0) && (
            <p className="mcard-meta">
              {memory.location && <span className="mcard-place">{memory.location}</span>}
              {people.length > 0 && (
                <span className="mcard-people">
                  with {people.slice(0, 3).join(", ")}
                  {people.length > 3 ? ` and ${people.length - 3} more` : ""}
                </span>
              )}
            </p>
          )}
          {tags.length > 0 && (
            <p className="mcard-tags">
              {tags.slice(0, 3).map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
          {reason && <p className="mcard-reason">{reason}</p>}
        </div>
      </Link>
    </article>
  );
}
