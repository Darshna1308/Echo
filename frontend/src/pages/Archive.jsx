import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useResource } from "../hooks/useResource";
import { localToday, monthName, plural, yearOf } from "../lib/format";
import MemoryCard from "../components/MemoryCard";
import { Button, ButtonLink, EmptyState, ErrorState, PageLoader, Spinner } from "../components/ui";
import "./Archive.css";

const PAGE_SIZE = 24;
const FILTER_KEYS = ["q", "person", "location", "tag", "year"];

function groupByYearMonth(memories) {
  const years = [];
  for (const memory of memories) {
    const [y, m] = memory.date.split("-").map(Number);
    let year = years[years.length - 1];
    if (!year || year.year !== y) {
      year = { year: y, months: [] };
      years.push(year);
    }
    let month = year.months[year.months.length - 1];
    if (!month || month.month !== m) {
      month = { month: m, memories: [] };
      year.months.push(month);
    }
    month.memories.push(memory);
  }
  return years;
}

function OnThisDayBand() {
  const today = localToday();
  const { data } = useResource(`otd-${today}`, (signal) => api("/on-this-day", { query: { date: today }, signal }));
  const memories = data?.memories || [];
  if (!memories.length) return null;
  const years = [...new Set(memories.map((m) => m.yearsAgo))];
  return (
    <Link to="/on-this-day" className="otd-band">
      <span className="otd-band-sun" aria-hidden="true" />
      <span>
        <strong>On this day:</strong> {plural(memories.length, "memory", "memories")} from{" "}
        {years.map((y) => `${y} ${y === 1 ? "year" : "years"}`).join(", ")} ago
      </span>
    </Link>
  );
}

function Filters({ params, setParams, facets }) {
  const [query, setQuery] = useState(params.get("q") || "");
  const [lastQ, setLastQ] = useState(params.get("q") || "");

  // Keep the box in sync when the URL changes (e.g. back button).
  const urlQ = params.get("q") || "";
  if (urlQ !== lastQ) {
    setLastQ(urlQ);
    setQuery(urlQ);
  }

  useEffect(() => {
    if (query === (params.get("q") || "")) return undefined;
    const t = setTimeout(() => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (query.trim()) next.set("q", query.trim());
          else next.delete("q");
          return next;
        },
        { replace: true }
      );
    }, 350);
    return () => clearTimeout(t);
  }, [query, params, setParams]);

  const setFilter = (key, value) => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const active = FILTER_KEYS.some((k) => params.get(k));

  const select = (key, label, options) => (
    <label className="filter">
      <span className="visually-hidden">{label}</span>
      <select value={params.get(key) || ""} onChange={(e) => setFilter(key, e.target.value)} className={params.get(key) ? "is-set" : ""}>
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="archive-tools" role="search">
      <label className="search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="visually-hidden">Search your memories</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stories, people, places…" maxLength={200} />
      </label>
      {facets && (
        <div className="filters">
          {select("person", "Anyone", facets.people.slice(0, 80).map((p) => ({ value: p.value, label: `${p.value} (${p.count})` })))}
          {select("location", "Anywhere", facets.locations.slice(0, 80).map((p) => ({ value: p.value, label: p.value })))}
          {select("tag", "Any tag", facets.tags.slice(0, 80).map((p) => ({ value: p.value, label: `#${p.value}` })))}
          {select("year", "Any year", facets.years.map((y) => ({ value: String(y), label: String(y) })))}
          {active && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                setQuery("");
                setParams(new URLSearchParams());
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Archive() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const f = {};
    for (const k of FILTER_KEYS) if (params.get(k)) f[k] = params.get(k);
    return f;
  }, [params]);
  const filterKey = JSON.stringify(filters);
  const searching = Boolean(filters.q);
  const filtered = Object.keys(filters).length > 0;

  const facets = useResource("facets", (signal) => api("/memories/facets", { signal }));
  const first = useResource(filterKey, (signal) => api("/memories", { query: { ...filters, page: 1, limit: PAGE_SIZE }, signal }));

  const [more, setMore] = useState({ key: null, pages: [], loading: false, error: null });
  const extraPages = more.key === filterKey ? more.pages : [];
  const memories = [...(first.data?.memories || []), ...extraPages.flatMap((p) => p.memories)];
  const last = extraPages[extraPages.length - 1] || first.data;

  const loadMore = async () => {
    const page = (last?.page || 1) + 1;
    setMore((m) => ({ key: filterKey, pages: m.key === filterKey ? m.pages : [], loading: true, error: null }));
    try {
      const data = await api("/memories", { query: { ...filters, page, limit: PAGE_SIZE } });
      setMore((m) => ({ key: filterKey, pages: [...(m.key === filterKey ? m.pages : []), data], loading: false, error: null }));
    } catch (error) {
      setMore((m) => ({ ...m, loading: false, error }));
    }
  };

  const total = first.data?.total ?? 0;
  const archiveSize = facets.data?.total;
  const firstYear = facets.data?.years?.[facets.data.years.length - 1];
  const groups = searching ? null : groupByYearMonth(memories);

  return (
    <div className="page archive">
      <header className="archive-head">
        <div>
          <p className="annotation">{user ? `${user.name.split(" ")[0]}'s archive` : "Your archive"}</p>
          <h1 className="page-title">A life, kept in small moments.</h1>
          {archiveSize > 0 && (
            <p className="archive-count">
              {plural(archiveSize, "memory", "memories")}
              {firstYear ? `, since ${firstYear}` : ""}
            </p>
          )}
        </div>
      </header>

      {!filtered && <OnThisDayBand />}

      {(archiveSize > 0 || filtered) && <Filters params={params} setParams={setParams} facets={facets.data} />}

      {first.loading && <PageLoader label="Gathering your memories…" />}

      {first.error && <ErrorState error={first.error} onRetry={first.reload} title="Your archive couldn't load." />}

      {!first.loading && !first.error && memories.length === 0 && !filtered && (
        <EmptyState
          title="Your first memory is waiting."
          action={
            <ButtonLink to="/new" size="large">
              Preserve a memory
            </ButtonLink>
          }
        >
          <p>Start with something small: a place, a person, a day you don't want to forget.</p>
        </EmptyState>
      )}

      {!first.loading && !first.error && memories.length === 0 && filtered && (
        <EmptyState title="Nothing matches that yet.">
          <p>Try fewer words, another spelling, or clear the filters.</p>
        </EmptyState>
      )}

      {!first.loading && memories.length > 0 && (
        <>
          {filtered && (
            <p className="archive-results" aria-live="polite">
              {searching ? `${plural(total, "memory", "memories")} match “${filters.q}”` : `${plural(total, "memory", "memories")}`}
            </p>
          )}

          {searching ? (
            <div className="mgrid">
              {memories.map((m) => (
                <MemoryCard key={m.id} memory={m} showYear />
              ))}
            </div>
          ) : (
            <div className="years">
              {groups.map((year) => (
                <section key={year.year} className="year" aria-labelledby={`y-${year.year}`}>
                  <h2 id={`y-${year.year}`} className="year-label">
                    {year.year}
                  </h2>
                  <div className="year-months">
                    {year.months.map((month) => (
                      <section key={month.month} className="month" aria-label={`${monthName(month.month - 1)} ${year.year}`}>
                        <h3 className="month-label">
                          <span>{monthName(month.month - 1)}</span>
                        </h3>
                        <div className="mgrid">
                          {month.memories.map((m) => (
                            <MemoryCard key={m.id} memory={m} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="archive-more">
            {(extraPages.length ? last?.hasMore : first.data?.hasMore) ? (
              <Button variant="secondary" onClick={loadMore} busy={more.loading}>
                Show more memories
              </Button>
            ) : (
              !filtered &&
              memories.length > 3 && (
                <p className="archive-end">
                  {memories.length === total ? `That's everything, back to ${yearOf(memories[memories.length - 1].date)}.` : ""}
                </p>
              )
            )}
            {more.error && <p className="field-error">{more.error.message}</p>}
            {more.loading && <Spinner label="Loading more" />}
          </div>
        </>
      )}
    </div>
  );
}
