import { Fragment, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { useFeatures } from "../lib/features";
import { useResource } from "../hooks/useResource";
import { formatShortDay } from "../lib/format";
import { Button, Chip } from "../components/ui";
import "./Ask.css";

function examplesFrom(facets) {
  const out = [];
  const person = facets?.people?.[0]?.value;
  const place = facets?.locations?.[0]?.value?.split(",")[0];
  const year = facets?.years?.[1] || facets?.years?.[0];
  if (place) out.push(`When did I go to ${place}?`);
  if (person) out.push(`Which memories mention ${person}?`);
  if (year) out.push(`What did I save in ${year}?`);
  out.push("What were the happiest moments I saved last year?");
  if (out.length < 4) out.push("Find the memories where I was with my closest friends.");
  return out.slice(0, 4);
}

/* Renders the answer, turning [1] style citations into links to the memory. */
function AnswerText({ text, sources }) {
  const parts = String(text).split(/(\[\d+\])/g);
  return (
    <p className="answer-text">
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        const source = match && sources.find((s) => s.n === Number(match[1]));
        if (!source) return <Fragment key={i}>{part}</Fragment>;
        return (
          <Link key={i} to={`/memories/${source.id}`} className="cite" aria-label={`Source ${source.n}: ${source.title}`}>
            {source.n}
          </Link>
        );
      })}
    </p>
  );
}

function Answer({ entry }) {
  const { question, result, error } = entry;
  const f = result?.filters;
  const understood = f ? [...f.months, ...f.years.map(String), ...f.people, ...f.places] : [];
  return (
    <article className="answer" aria-label={`Answer to: ${question}`}>
      <p className="answer-q">{question}</p>
      {error && (
        <p className="answer-error" role="alert">
          {error}
        </p>
      )}
      {!result && !error && (
        <p className="answer-thinking" role="status">
          Looking through your archive…
        </p>
      )}
      {result && (
        <div className="answer-body">
          <p className={`answer-mode answer-mode--${result.mode}`}>
            {result.mode === "ai" ? (result.citations.length ? `AI answer, citing ${result.citations.length === 1 ? "1 memory" : `${result.citations.length} memories`} from your archive` : "AI answer") : "Matching memories"}
            {result.providerError ? " (the AI provider couldn't be reached)" : ""}
          </p>
          <AnswerText text={result.answer} sources={result.sources} />
          {understood.length > 0 && (
            <div className="answer-filters">
              <span>Looked for:</span>
              {understood.map((u) => (
                <Chip key={u}>{u}</Chip>
              ))}
            </div>
          )}
          {result.sources.length > 0 && (
            <ol className="sources" aria-label="Memories used">
              {result.sources.map((s) => (
                <li key={s.id} className={`source${result.citations.includes(s.n) ? " is-cited" : ""}`}>
                  <Link to={`/memories/${s.id}`} className="source-link">
                    <span className="source-n">{s.n}</span>
                    <span className="source-text">
                      <span className="source-title">{s.title}</span>
                      <span className="source-meta">
                        {formatShortDay(s.date)}
                        {s.location ? `, ${s.location}` : ""}
                      </span>
                      {s.excerpt && <span className="source-excerpt">{s.excerpt}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

export default function Ask() {
  const features = useFeatures();
  const facets = useResource("facets", (signal) => api("/memories/facets", { signal }));
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const empty = facets.data && facets.data.total === 0;

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (q.length < 2 || busy) return;
    const id = Date.now();
    setEntries((list) => [{ id, question: q }, ...list]);
    setQuestion("");
    setBusy(true);
    try {
      const result = await api("/echo/ask", { method: "POST", body: { question: q } });
      setEntries((list) => list.map((e) => (e.id === id ? { ...e, result } : e)));
    } catch (error) {
      setEntries((list) => list.map((e) => (e.id === id ? { ...e, error: error.message } : e)));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="page page--reading ask">
      <header className="page-head">
        <p className="annotation">Ask Echo</p>
        <h1 className="page-title">What would you like to remember?</h1>
        <p className="page-lede">Ask about people, places and times in your archive. Echo answers only from what you've saved, and shows you where each answer came from.</p>
      </header>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <label htmlFor="ask-input" className="visually-hidden">
          Your question
        </label>
        <textarea
          id="ask-input"
          ref={inputRef}
          className="ask-input"
          rows={2}
          maxLength={500}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder="When did I visit Ujjain with my family?"
        />
        <Button type="submit" busy={busy} disabled={question.trim().length < 2}>
          Ask
        </Button>
      </form>

      {features && !features.chat && (
        <p className="ask-note">AI answers aren't switched on for this server, so Echo will show the memories that best match your question.</p>
      )}

      {empty && (
        <p className="ask-note">
          Your archive is empty so far. <Link to="/new">Preserve a memory</Link> and you can ask about it here.
        </p>
      )}

      {!entries.length && !empty && (
        <div className="ask-examples">
          <p>Try asking</p>
          <ul>
            {examplesFrom(facets.data).map((ex) => (
              <li key={ex}>
                <button type="button" className="example" onClick={() => ask(ex)} disabled={busy}>
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="answers" aria-live="polite">
        {entries.map((entry) => (
          <Answer key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
