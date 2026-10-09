import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, apiUrl } from "../lib/api";
import { useFeatures } from "../lib/features";
import { useResource } from "../hooks/useResource";
import { useTilt } from "../hooks/motion";
import { formatDay, formatTime, plural } from "../lib/format";
import PhotoFrame from "../components/PhotoFrame";
import Lightbox from "../components/Lightbox";
import MemoryCard, { MemoryWindow } from "../components/MemoryCard";
import { Button, ButtonLink, Chip, Dialog, ErrorState, PageLoader } from "../components/ui";
import { useToast } from "../components/ui/Toast";
import "./MemoryView.css";

function HeroArch({ memory, onOpen }) {
  const tilt = useTilt();
  const cover = memory.photos[0];
  return (
    <div className="hero-arch" ref={tilt}>
      <div className="hero-arch-frame" aria-hidden="true" />
      <div className="hero-arch-recess">
        {cover ? (
          <button type="button" className="hero-arch-photo" onClick={() => onOpen(0)} aria-label={`Open photo: ${cover.caption || memory.title}`}>
            <PhotoFrame src={cover.src} styleId={cover.style} alt={cover.caption || memory.title} size="main" shape="plain" loading="eager" />
          </button>
        ) : (
          <MemoryWindow memory={{ ...memory, excerpt: memory.story }} />
        )}
      </div>
      <div className="hero-arch-light" aria-hidden="true" />
    </div>
  );
}

function AiNotes({ memory, onMemory }) {
  const features = useFeatures();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ai = memory.ai;
  const hasNotes = ai.summary || ai.mood || ai.tags.length || ai.themes.length;

  if (!hasNotes && !features?.chat) return null;

  const run = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
    } catch (error) {
      toast.show(error.message, { tone: "error" });
    } finally {
      setBusy("");
    }
  };

  const fullBody = (extra) => ({
    title: memory.title,
    story: memory.story,
    date: memory.date,
    time: memory.time,
    location: memory.location,
    people: memory.people,
    tags: memory.tags,
    photos: memory.photos.map((p) => ({ ref: p.ref, style: p.style, caption: p.caption })),
    audio: memory.audio?.ref || null,
    transcript: memory.transcript,
    ...extra,
  });

  const generate = () =>
    run("generate", async () => {
      const data = await api(`/memories/${memory.id}/enrich`, { method: "POST" });
      onMemory(data.memory);
    });

  const clear = () =>
    run("clear", async () => {
      const data = await api(`/memories/${memory.id}/enrichment`, { method: "DELETE" });
      onMemory(data.memory);
    });

  const addTag = (tag) =>
    run(`tag-${tag}`, async () => {
      const data = await api(`/memories/${memory.id}`, {
        method: "PUT",
        body: fullBody({ tags: [...memory.tags, tag], aiTags: ai.tags.filter((t) => t !== tag) }),
      });
      onMemory(data.memory);
      toast.show(`Added #${tag} to your tags.`, { tone: "success" });
    });

  const saveSummary = () =>
    run("summary", async () => {
      const data = await api(`/memories/${memory.id}`, { method: "PUT", body: fullBody({ aiSummary: draft.trim() }) });
      onMemory(data.memory);
      setEditing(false);
    });

  return (
    <section className="ai-notes" aria-labelledby="ai-notes-heading">
      <div className="ai-notes-head">
        <h2 id="ai-notes-heading">Echo's notes</h2>
        <span className="ai-badge">Suggested by AI, separate from your story</span>
      </div>

      {!hasNotes ? (
        <div className="ai-empty">
          <p>Echo can suggest a short summary, a mood and a few tags, using only what you wrote here.</p>
          <Button variant="secondary" size="small" onClick={generate} busy={busy === "generate"}>
            Suggest notes
          </Button>
        </div>
      ) : (
        <>
          {editing ? (
            <div className="ai-edit">
              <label className="visually-hidden" htmlFor="ai-summary">
                Summary
              </label>
              <textarea id="ai-summary" className="field-control" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} />
              <div className="ai-actions">
                <Button size="small" onClick={saveSummary} busy={busy === "summary"}>
                  Save summary
                </Button>
                <Button variant="ghost" size="small" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            ai.summary && <p className="ai-summary">{ai.summary}</p>
          )}

          {(ai.mood || ai.themes.length > 0) && (
            <p className="ai-meta">
              {ai.mood && (
                <>
                  Mood: <strong>{ai.mood}</strong>
                </>
              )}
              {ai.mood && ai.themes.length > 0 && <br />}
              {ai.themes.length > 0 && <>Themes: {ai.themes.join(", ")}</>}
            </p>
          )}

          {ai.tags.length > 0 && (
            <div className="ai-tags">
              <span className="ai-tags-label">Suggested tags</span>
              {ai.tags.map((tag) => (
                <button key={tag} type="button" className="chip chip--ai" onClick={() => addTag(tag)} disabled={Boolean(busy)} title={`Add #${tag} to your tags`}>
                  <span>+ #{tag}</span>
                </button>
              ))}
            </div>
          )}

          <div className="ai-actions">
            {!editing && (
              <Button
                variant="ghost"
                size="small"
                onClick={() => {
                  setDraft(ai.summary);
                  setEditing(true);
                }}
              >
                Edit summary
              </Button>
            )}
            {features?.chat && (
              <Button variant="ghost" size="small" onClick={generate} busy={busy === "generate"}>
                Suggest again
              </Button>
            )}
            <Button variant="ghost" size="small" onClick={clear} busy={busy === "clear"}>
              Remove notes
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function Connections({ id }) {
  const { data, loading } = useResource(`conn-${id}`, (signal) => api(`/memories/${id}/connections`, { signal }));
  if (loading || !data?.connections?.length) return null;
  return (
    <section className="connections" aria-labelledby="conn-heading">
      <h2 id="conn-heading" className="section-title">
        Connected memories
      </h2>
      <p className="section-sub">Linked by the people, places, dates and words you saved.</p>
      <div className="mgrid connections-grid">
        {data.connections.map((c) => (
          <MemoryCard key={c.memory.id} memory={c.memory} showYear reason={c.reasons.map((r) => r.label).join("; ")} />
        ))}
      </div>
    </section>
  );
}

export default function MemoryView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useResource(`memory-${id}`, (signal) => api(`/memories/${id}`, { signal }));
  const [lightbox, setLightbox] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  if (loading) return <PageLoader label="Opening this memory…" />;
  if (error) {
    return (
      <div className="page">
        <ErrorState
          error={error}
          onRetry={error.status === 404 ? undefined : reload}
          title={error.status === 404 ? "This memory isn't in your archive." : "This memory couldn't load."}
        />
        <p style={{ textAlign: "center" }}>
          <Link to="/">Back to your archive</Link>
        </p>
      </div>
    );
  }

  const memory = data.memory;
  const onMemory = (m) => setData({ ...data, memory: m });

  const remove = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/memories/${id}`, { method: "DELETE" });
      toast.show("The memory has been deleted.");
      navigate("/", { replace: true });
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  return (
    <article className="page memory">
      <div className="memory-topbar">
        <Link to="/" className="back-link">
          <span aria-hidden="true">←</span> Archive
        </Link>
        <div className="memory-topbar-actions">
          <ButtonLink to={`/memories/${id}/edit`} variant="secondary" size="small">
            Edit memory
          </ButtonLink>
        </div>
      </div>

      <header className="memory-hero">
        <HeroArch memory={memory} onOpen={setLightbox} />
        <div className="memory-hero-text">
          <p className="memory-date">
            <time dateTime={memory.date}>{formatDay(memory.date, { weekday: true })}</time>
            {memory.time && <span>, {formatTime(memory.time)}</span>}
          </p>
          <h1 className="memory-title">{memory.title}</h1>
          {memory.location && (
            <p className="memory-place">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <Link to={`/?location=${encodeURIComponent(memory.location)}`}>{memory.location}</Link>
            </p>
          )}
          {memory.people.length > 0 && (
            <div className="memory-chips" aria-label="People">
              <span className="memory-chips-label">With</span>
              {memory.people.map((p) => (
                <Chip key={p} as={Link} to={`/?person=${encodeURIComponent(p)}`} tone="person">
                  {p}
                </Chip>
              ))}
            </div>
          )}
          {memory.tags.length > 0 && (
            <div className="memory-chips" aria-label="Tags">
              {memory.tags.map((t) => (
                <Chip key={t} as={Link} to={`/?tag=${encodeURIComponent(t)}`} tone="tag">
                  #{t}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="memory-story" aria-label="Story">
        {memory.story.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </section>

      {memory.photos.length > 1 && (
        <section className="memory-gallery" aria-labelledby="gallery-heading">
          <h2 id="gallery-heading" className="section-title">
            {plural(memory.photos.length, "photograph")}
          </h2>
          <div className="gallery-grid">
            {memory.photos.map((photo, i) => (
              <figure key={photo.ref} className="gallery-item">
                <PhotoFrame src={photo.thumb || photo.src} styleId={photo.style} alt={photo.caption || `${memory.title} — photo ${i + 1}`} caption={photo.caption} size="card" shape="print" onClick={() => setLightbox(i)} />
                {photo.caption && photo.style !== "polaroid" && <figcaption>{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {(memory.audio || memory.transcript) && (
        <section className="memory-voice" aria-labelledby="voice-heading">
          <h2 id="voice-heading" className="section-title">
            Voice note
          </h2>
          {memory.audio && (
            <audio controls preload="metadata" src={apiUrl(memory.audio.src)}>
              Your browser can't play this recording.
            </audio>
          )}
          {memory.transcript && (
            <blockquote className="memory-transcript">
              {memory.transcript.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </blockquote>
          )}
        </section>
      )}

      <AiNotes memory={memory} onMemory={onMemory} />

      <Connections id={id} />

      <footer className="memory-footer">
        <Button variant="danger-quiet" size="small" onClick={() => setConfirmDelete(true)}>
          Delete this memory
        </Button>
      </footer>

      <Dialog
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title="Delete this memory?"
        tone="danger"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove} busy={deleting}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p>
          “{memory.title}” and everything saved with it — {plural(memory.photos.length, "photo")}
          {memory.audio ? " and the voice note" : ""} — will be deleted. This can't be undone.
        </p>
        {deleteError && <p className="field-error">{deleteError}</p>}
      </Dialog>

      {lightbox !== null && <Lightbox photos={memory.photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} title={memory.title} />}
    </article>
  );
}
