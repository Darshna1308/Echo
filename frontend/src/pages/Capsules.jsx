import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";
import { useResource } from "../hooks/useResource";
import { formatDay, formatMoment, formatShortDay, localToday, plural, timeUntil } from "../lib/format";
import CapsuleDoor from "../components/CapsuleDoor";
import { Button, Dialog, EmptyState, ErrorState, Field, PageLoader } from "../components/ui";
import { useToast } from "../components/ui/Toast";
import "./Capsules.css";

function addYears(dateString, years) {
  const [y, m, d] = dateString.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function contentsLabel(capsule) {
  const parts = [];
  if (capsule.hasLetter) parts.push("a letter");
  if (capsule.memoryCount) parts.push(plural(capsule.memoryCount, "memory", "memories"));
  return parts.join(" and ");
}

function NewCapsule({ onCreated, onCancel }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [letter, setLetter] = useState("");
  const [date, setDate] = useState(addYears(localToday(), 1));
  const [time, setTime] = useState("09:00");
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState("");
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const list = useResource("capsule-picker", (signal) => api("/memories", { query: { limit: 60 }, signal }));
  const memories = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = list.data?.memories || [];
    return q ? all.filter((m) => `${m.title} ${m.location} ${m.people.join(" ")}`.toLowerCase().includes(q)) : all;
  }, [list.data, filter]);

  const unlockAt = date && time ? new Date(`${date}T${time}`) : null;

  const check = () => {
    const e = {};
    if (!title.trim()) e.title = "Please name this capsule.";
    if (!letter.trim() && !selected.length) e.letter = "Write a letter or choose at least one memory to seal.";
    if (!unlockAt || Number.isNaN(unlockAt.getTime())) e.date = "Please choose when this capsule opens.";
    else if (unlockAt.getTime() <= Date.now() + 60 * 1000) e.date = "The opening date must be in the future.";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const seal = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await api("/capsules", {
        method: "POST",
        body: { title: title.trim(), letter: letter.trim(), memoryIds: selected, unlockAt: unlockAt.toISOString() },
      });
      toast.show("Sealed. Echo will keep it closed until its date.", { tone: "success" });
      onCreated(data.capsule);
    } catch (e) {
      setError(e.message);
      setErrors(e.fieldErrors?.() || {});
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <section className="capsule-new" aria-labelledby="new-capsule-heading">
      <h2 id="new-capsule-heading" className="section-title">
        Seal a new capsule
      </h2>
      <div className="capsule-new-grid">
        <div className="capsule-new-main">
          <Field label="Name" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={120} placeholder="For me, after graduation" />
          <Field
            label="A letter to open later"
            optional
            multiline
            rows={7}
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            error={errors.letter}
            maxLength={10000}
            placeholder="Dear future me…"
            inputClassName="capsule-letter-input"
          />
          <div className="capsule-row">
            <Field label="Opens on" type="date" value={date} min={localToday()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
            <Field label="At" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="capsule-new-pick">
          <p className="field-label">Memories to seal inside</p>
          <p className="field-hint">They'll leave your archive, search and Ask Echo until the capsule is opened.</p>
          <input className="field-control capsule-filter" placeholder="Filter your memories" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter memories" />
          <div className="capsule-pick-list">
            {list.loading && <p className="field-hint">Loading your memories…</p>}
            {list.data && !memories.length && <p className="field-hint">No memories to choose from.</p>}
            {memories.map((m) => (
              <label key={m.id} className={`capsule-pick${selected.includes(m.id) ? " is-selected" : ""}`}>
                <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
                <span>
                  <strong>{m.title}</strong>
                  <small>{formatShortDay(m.date)}</small>
                </span>
              </label>
            ))}
          </div>
          {selected.length > 0 && <p className="field-hint">{plural(selected.length, "memory", "memories")} selected</p>}
        </div>
      </div>
      {error && (
        <p className="capsule-error" role="alert">
          {error}
        </p>
      )}
      <div className="capsule-new-actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => check() && setConfirming(true)}>Review and seal</Button>
      </div>

      <Dialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title={`Seal until ${unlockAt ? formatDay(date) : ""}?`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Go back
            </Button>
            <Button onClick={seal} busy={busy}>
              Seal capsule
            </Button>
          </>
        }
      >
        <p>
          “{title.trim()}” will hold {letter.trim() ? "your letter" : "no letter"}
          {selected.length ? ` and ${plural(selected.length, "memory", "memories")}` : ""}.
        </p>
        <p>
          Until {unlockAt?.toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}, nobody can read it, including you. The server won't open it early.
          You can still discard the whole capsule, which deletes what's inside.
        </p>
      </Dialog>
    </section>
  );
}

export default function Capsules() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useResource("capsules", (signal) => api("/capsules", { signal }));
  const [creating, setCreating] = useState(false);
  const capsules = data?.capsules || [];

  return (
    <div className="page capsules">
      <header className="page-head capsules-head">
        <div>
          <p className="annotation">Memory capsules</p>
          <h1 className="page-title">Seal something for later.</h1>
          <p className="page-lede">
            A capsule keeps a letter and chosen memories behind closed doors until the date you pick. Echo won't open it early, even for you.
          </p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>Seal a new capsule</Button>}
      </header>

      {creating && (
        <NewCapsule
          onCancel={() => setCreating(false)}
          onCreated={(capsule) => {
            setCreating(false);
            navigate(`/capsules/${capsule.id}`);
          }}
        />
      )}

      {loading && <PageLoader />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !capsules.length && !creating && (
        <EmptyState title="No capsules yet." art="arch">
          <p>Write to your future self, or seal away the memories you want to rediscover on a birthday, an anniversary, a graduation.</p>
        </EmptyState>
      )}

      {capsules.length > 0 && (
        <ul className="capsule-grid">
          {capsules.map((c) => (
            <li key={c.id}>
              <Link to={`/capsules/${c.id}`} className="capsule-card">
                <CapsuleDoor open={!c.sealed} ready={c.canOpen} />
                <span className="capsule-card-title">{c.title}</span>
                <span className="capsule-card-meta">
                  {c.sealed ? (c.canOpen ? "Ready to open" : `${timeUntil(c.unlockAt)}, ${formatMoment(c.unlockAt)}`) : `Opened ${formatMoment(c.openedAt)}`}
                </span>
                <span className="capsule-card-contents">{contentsLabel(c)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
