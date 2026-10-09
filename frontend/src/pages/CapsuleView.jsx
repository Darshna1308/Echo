import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../lib/api";
import { useResource } from "../hooks/useResource";
import { formatMoment, plural, timeUntil } from "../lib/format";
import CapsuleDoor from "../components/CapsuleDoor";
import MemoryCard from "../components/MemoryCard";
import { Button, Dialog, ErrorState, PageLoader } from "../components/ui";
import { useToast } from "../components/ui/Toast";
import "./Capsules.css";

function fullMoment(value) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" });
}

export default function CapsuleView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useResource(`capsule-${id}`, (signal) => api(`/capsules/${id}`, { signal }));
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // If the page is open when the unlock time arrives, ask the server again.
  const unlockAt = data?.capsule?.sealed && !data.capsule.canOpen ? data.capsule.unlockAt : null;
  useEffect(() => {
    if (!unlockAt) return undefined;
    const ms = new Date(unlockAt).getTime() - Date.now() + 1500;
    if (ms > 2 ** 31 - 1) return undefined;
    const t = setTimeout(reload, Math.max(ms, 1000));
    return () => clearTimeout(t);
  }, [unlockAt, reload]);

  if (loading) return <PageLoader />;
  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} title={error.status === 404 ? "This capsule isn't in your archive." : "This capsule couldn't load."} onRetry={error.status === 404 ? undefined : reload} />
        <p style={{ textAlign: "center" }}>
          <Link to="/capsules">All capsules</Link>
        </p>
      </div>
    );
  }

  const capsule = data.capsule;
  const sealed = capsule.sealed;
  // The server decides when a capsule may open (its clock, not the device's).
  const ready = sealed && capsule.canOpen;

  const open = async () => {
    setOpening(true);
    setOpenError("");
    try {
      const result = await api(`/capsules/${id}/unlock`, { method: "POST" });
      setData({ capsule: result.capsule });
    } catch (e) {
      setOpenError(e.message);
    } finally {
      setOpening(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/capsules/${id}`, { method: "DELETE" });
      toast.show(sealed ? "The capsule and everything sealed inside were deleted." : "The capsule was removed. Its memories are still in your archive.");
      navigate("/capsules", { replace: true });
    } catch (e) {
      toast.show(e.message, { tone: "error" });
      setDeleting(false);
    }
  };

  return (
    <div className="page capsule-view">
      <Link to="/capsules" className="back-link">
        <span aria-hidden="true">←</span> Capsules
      </Link>

      <header className="capsule-hero">
        <CapsuleDoor open={!sealed} ready={ready} size="large" />
        <div className="capsule-hero-text">
          <p className="capsule-when">
            {sealed ? (ready ? "Ready to open" : timeUntil(capsule.unlockAt)) : `Opened on ${formatMoment(capsule.openedAt)}`}
          </p>
          <h1 className="page-title">{capsule.title}</h1>
          {sealed ? (
            <>
              <p className="capsule-explain">
                Sealed on {formatMoment(capsule.createdAt)} with {capsule.hasLetter ? "a letter" : "no letter"}
                {capsule.memoryCount ? ` and ${plural(capsule.memoryCount, "memory", "memories")}` : ""}. It opens on {fullMoment(capsule.unlockAt)}.
              </p>
              {!ready && (
                <p className="capsule-explain">Until then its contents stay hidden everywhere in Echo, and the server will refuse to open it early.</p>
              )}
              <div className="capsule-actions">
                <Button onClick={open} busy={opening} disabled={!ready}>
                  {ready ? "Open the capsule" : "Still sealed"}
                </Button>
                <Button variant="danger-quiet" onClick={() => setConfirmDelete(true)}>
                  Discard capsule
                </Button>
              </div>
              {openError && (
                <p className="capsule-error" role="alert">
                  {openError}
                </p>
              )}
            </>
          ) : (
            <div className="capsule-actions">
              <Button variant="danger-quiet" size="small" onClick={() => setConfirmDelete(true)}>
                Remove capsule
              </Button>
            </div>
          )}
        </div>
      </header>

      {!sealed && capsule.letter && (
        <section aria-label="Letter">
          <div className="capsule-letter">{capsule.letter}</div>
        </section>
      )}

      {!sealed && capsule.memories?.length > 0 && (
        <section aria-labelledby="capsule-memories">
          <h2 id="capsule-memories" className="section-title" style={{ marginBottom: "var(--space-4)" }}>
            What you sealed inside
          </h2>
          <div className="mgrid">
            {capsule.memories.map((m) => (
              <MemoryCard key={m.id} memory={m} showYear />
            ))}
          </div>
        </section>
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        title={sealed ? "Discard this sealed capsule?" : "Remove this capsule?"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove} busy={deleting}>
              {sealed ? "Discard and delete contents" : "Remove capsule"}
            </Button>
          </>
        }
      >
        {sealed ? (
          <p>
            The capsule will be deleted without being opened. Its letter
            {capsule.memoryCount ? ` and the ${plural(capsule.memoryCount, "memory", "memories")} sealed inside` : ""} will be permanently deleted. This can't be undone.
          </p>
        ) : (
          <p>The capsule and its letter will be removed. The memories that were inside stay in your archive.</p>
        )}
      </Dialog>
    </div>
  );
}
