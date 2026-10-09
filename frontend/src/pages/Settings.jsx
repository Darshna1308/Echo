import { useState } from "react";
import { useNavigate } from "react-router";
import { api, apiUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFeatures } from "../lib/features";
import { formatMoment } from "../lib/format";
import { Button, Dialog, Field } from "../components/ui";
import { useToast } from "../components/ui/Toast";
import "./Settings.css";

export default function Settings() {
  const { user, logout, forget } = useAuth();
  const features = useFeatures();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const logoutEverywhere = async () => {
    setSigningOut(true);
    try {
      await logout({ everywhere: true });
      toast.show("You've been logged out on every device.");
      navigate("/welcome", { replace: true });
    } catch (e) {
      toast.show(e.message, { tone: "error" });
      setSigningOut(false);
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const r = await api("/echo/reindex", { method: "POST" });
      toast.show(r.remaining ? `Indexed ${r.indexed}. Run again to index the remaining ${r.remaining}.` : `Search index is up to date (${r.indexed} indexed now).`, { tone: "success" });
    } catch (e) {
      toast.show(e.message, { tone: "error" });
    } finally {
      setReindexing(false);
    }
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    setDeleting(true);
    setDeleteError("");
    try {
      await api("/auth/account", { method: "DELETE", body: { password } });
      forget();
      navigate("/welcome", { replace: true });
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  const on = (flag) => (flag ? "On" : "Off");

  return (
    <div className="page page--reading settings">
      <header className="page-head">
        <p className="annotation">Settings &amp; privacy</p>
        <h1 className="page-title">Your account</h1>
      </header>

      <section className="settings-block">
        <h2>Account</h2>
        <dl className="settings-list">
          <div>
            <dt>Name</dt>
            <dd>{user?.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
          </div>
          {user?.createdAt && (
            <div>
              <dt>Member since</dt>
              <dd>{formatMoment(user.createdAt)}</dd>
            </div>
          )}
        </dl>
        <div className="settings-actions">
          <Button variant="secondary" onClick={logoutEverywhere} busy={signingOut}>
            Log out on every device
          </Button>
        </div>
      </section>

      <section className="settings-block">
        <h2>Your data</h2>
        <p>
          Your memories are private to your account. Each request for a memory, photo or recording is checked against your signed-in session. Echo does not
          use end-to-end encryption: the people who run this Echo server and its database could technically access stored data.
        </p>
        <div className="settings-actions">
          <a className="btn btn--secondary" href={apiUrl("/api/auth/export")} download>
            Download a copy (JSON)
          </a>
        </div>
        <p className="settings-note">The export includes everything you wrote. Sealed capsules stay sealed in the export.</p>
      </section>

      <section className="settings-block">
        <h2>AI features</h2>
        <dl className="settings-list">
          <div>
            <dt>AI answers and suggestions</dt>
            <dd>{on(features?.chat)}</dd>
          </div>
          <div>
            <dt>Semantic search</dt>
            <dd>{on(features?.embeddings)}</dd>
          </div>
          <div>
            <dt>Voice transcription</dt>
            <dd>{on(features?.transcription)}</dd>
          </div>
        </dl>
        <p>
          When these are on, Echo sends only what each feature needs to the AI provider chosen by whoever runs this server: the memories relevant to your
          question in Ask Echo, a memory's text when you ask for suggestions, and a recording when you press Transcribe. Photos are never sent to an AI
          service, and AI never identifies people in photos.
        </p>
        {features?.embeddings && (
          <div className="settings-actions">
            <Button variant="secondary" onClick={reindex} busy={reindexing}>
              Rebuild search index
            </Button>
          </div>
        )}
      </section>

      <section className="settings-block settings-danger">
        <h2>Delete account</h2>
        <p>Permanently deletes your account, every memory, photo, recording and capsule. This can't be undone. Download a copy first if you want to keep anything.</p>
        <div className="settings-actions">
          <Button variant="danger-quiet" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </div>
      </section>

      <Dialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete your account and archive?"
        tone="danger"
      >
        <form onSubmit={deleteAccount} className="settings-delete-form">
          <p>Everything in your archive will be permanently deleted. Enter your password to confirm.</p>
          <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={deleteError} />
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Keep my account
            </Button>
            <Button type="submit" variant="danger" busy={deleting} disabled={!password}>
              Delete everything
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
