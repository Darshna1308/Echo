import { api } from "../lib/api";
import { useResource } from "../hooks/useResource";
import { dayAndMonth, localToday } from "../lib/format";
import MemoryCard from "../components/MemoryCard";
import { ButtonLink, EmptyState, ErrorState, PageLoader } from "../components/ui";
import "./OnThisDay.css";

export default function OnThisDay() {
  // The user's own calendar date, so "today" is right in every time zone.
  const today = localToday();
  const { data, error, loading, reload } = useResource(`otd-${today}`, (signal) => api("/on-this-day", { query: { date: today }, signal }));

  const groups = [];
  for (const m of data?.memories || []) {
    const last = groups[groups.length - 1];
    if (last && last.yearsAgo === m.yearsAgo) last.memories.push(m);
    else groups.push({ yearsAgo: m.yearsAgo, memories: [m] });
  }

  return (
    <div className="page otd">
      <header className="otd-head">
        <div className="otd-sun" aria-hidden="true" />
        <p className="annotation">On this day</p>
        <h1 className="page-title">{dayAndMonth(today)}</h1>
        <p className="page-lede">Memories you saved on this date in earlier years.</p>
      </header>

      {loading && <PageLoader />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !groups.length && (
        <EmptyState
          title="Nothing from this date yet."
          action={
            <ButtonLink to="/new" variant="secondary">
              Preserve today's memory
            </ButtonLink>
          }
        >
          <p>What you save today will be waiting here on this date next year.</p>
        </EmptyState>
      )}

      {groups.map((g) => (
        <section key={g.yearsAgo} className="otd-group" aria-labelledby={`otd-${g.yearsAgo}`}>
          <h2 id={`otd-${g.yearsAgo}`} className="otd-years">
            {g.yearsAgo === 1 ? "A year ago" : `${g.yearsAgo} years ago`}
            <span>{Number(today.slice(0, 4)) - g.yearsAgo}</span>
          </h2>
          <div className="mgrid">
            {g.memories.map((m) => (
              <MemoryCard key={m.id} memory={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
