/*
  Retrieval for search, Ask Echo and memory connections.

  Everything here works on memories that have ALREADY been filtered to the
  authenticated user's visible (unsealed) archive. Nothing in this file
  queries the database, so it cannot leak another user's data.

  Pieces:
    tokenize()      lowercase words, minus common stop words, lightly stemmed
    parseQuestion() pulls dates (months, years, "last year") and known
                    people / places out of a natural-language question
    keywordRank()   BM25 scoring across weighted memory fields
    cosine()        similarity between two embedding vectors
    fuse()          reciprocal-rank fusion of keyword and semantic rankings
*/

const STOP_WORDS = new Set(
  `a about above after again all also am an and any are as at be been before being below between both but by can could
  did do does doing down during each echo few find for from further had has have having he her here hers herself him
  himself his how i if in into is it its itself just me memories memory more most my myself no nor not now of off on
  once only or other our ours ourselves out over own same she should show so some such tell than that the their theirs
  them themselves then there these they this those through to too under until up very was we were what when where which
  while who whom why will with would you your yours yourself yourselves did saved save wrote write written remember
  remembered moments moment time times ever every`
    .split(/\s+/)
    .filter(Boolean)
);

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

function stem(word) {
  if (word.length <= 4) return word;
  if (word.endsWith("ies") && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 6) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("es") && word.length > 5) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokenize(text, { keepStopWords = false } = {}) {
  const words = String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[\p{L}\p{N}]+/gu);
  if (!words) return [];
  return words.filter((w) => keepStopWords || (!STOP_WORDS.has(w) && w.length > 1)).map(stem);
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function utcYear(date) {
  return new Date(date).getUTCFullYear();
}
function utcMonth(date) {
  return new Date(date).getUTCMonth() + 1;
}

/*
  parseQuestion("Show me memories from October that mention my grandmother",
                { people: [...], locations: [...] }, now)
  -> { months: [10], years: [], people: [], locations: [], terms: [...] }
*/
function parseQuestion(question, known = {}, now = new Date()) {
  const lower = ` ${String(question || "").toLowerCase()} `;
  const months = new Set();
  const years = new Set();

  MONTHS.forEach((month, index) => {
    const short = MONTH_SHORT[index];
    // "may" is also a common verb — only treat it as a month next to a date-ish word.
    if (month === "may") {
      if (/\b(in|during|of|from|last|this|since)\s+may\b|\bmay\s+\d{4}\b/.test(lower)) months.add(5);
      return;
    }
    if (new RegExp(`\\b(${month}|${short})\\b`).test(lower)) months.add(index + 1);
  });

  for (const match of lower.matchAll(/\b(18|19|20)\d{2}\b/g)) years.add(Number(match[0]));

  const thisYear = now.getUTCFullYear();
  if (/\blast year\b/.test(lower)) years.add(thisYear - 1);
  if (/\bthis year\b/.test(lower)) years.add(thisYear);
  if (/\blast month\b/.test(lower)) {
    const d = new Date(Date.UTC(thisYear, now.getUTCMonth() - 1, 1));
    months.add(d.getUTCMonth() + 1);
    years.add(d.getUTCFullYear());
  }

  const people = (known.people || []).filter((name) => {
    const n = normalizeName(name);
    return n.length > 1 && new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(lower);
  });
  const locations = (known.locations || []).filter((place) => {
    const n = normalizeName(place);
    if (n.length < 3) return false;
    const head = n.split(",")[0].trim();
    return new RegExp(`\\b${escapeRegExp(head)}\\b`, "i").test(lower);
  });

  const terms = tokenize(question).filter(
    (t) => !MONTHS.includes(t) && !MONTH_SHORT.includes(t) && !/^\d+$/.test(t) && !["last", "year", "month"].includes(t)
  );

  return { months: [...months], years: [...years], people, locations, terms };
}

function matchesDateFilters(memory, parsed) {
  if (parsed.years.length && !parsed.years.includes(utcYear(memory.date))) return false;
  if (parsed.months.length && !parsed.months.includes(utcMonth(memory.date))) return false;
  return true;
}

const FIELD_WEIGHTS = {
  title: 3,
  tags: 2.5,
  people: 2.5,
  location: 2,
  aiTags: 1.5,
  aiSummary: 1.2,
  aiMood: 1.5,
  story: 1,
  transcript: 1,
  captions: 1,
};

function fieldText(memory, field) {
  switch (field) {
    case "tags":
    case "people":
    case "aiTags":
      return (memory[field] || []).join(" ");
    case "captions":
      return (memory.photos || []).map((p) => p.caption || "").join(" ");
    default:
      return memory[field] || "";
  }
}

/*
  BM25 over a weighted bag of words. Returns [{ memory, score, matched }]
  sorted by score, only for memories with at least one matching term.
*/
function keywordRank(memories, terms) {
  const queryTerms = [...new Set(terms)];
  if (!queryTerms.length || !memories.length) return [];

  const docs = memories.map((memory) => {
    const tf = new Map();
    let length = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      for (const token of tokenize(fieldText(memory, field))) {
        tf.set(token, (tf.get(token) || 0) + weight);
        length += weight;
      }
    }
    return { memory, tf, length };
  });

  const avgLength = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;
  const df = new Map();
  for (const term of queryTerms) {
    df.set(term, docs.filter((d) => d.tf.has(term)).length);
  }

  const k1 = 1.4;
  const b = 0.7;
  const N = docs.length;

  return docs
    .map(({ memory, tf, length }) => {
      let score = 0;
      const matched = [];
      for (const term of queryTerms) {
        const f = tf.get(term);
        if (!f) continue;
        matched.push(term);
        const n = df.get(term);
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * length) / avgLength)));
      }
      return { memory, score, matched };
    })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/* Reciprocal-rank fusion: combines several rankings without tuning score scales. */
function fuse(rankings, k = 60) {
  const scores = new Map();
  for (const ranking of rankings) {
    ranking.forEach((item, index) => {
      const id = String(item.memory._id);
      const entry = scores.get(id) || { memory: item.memory, score: 0 };
      entry.score += 1 / (k + index + 1);
      scores.set(id, entry);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score);
}

/* Short snippet of the story around the first matching term. */
function snippet(text, terms, length = 220) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (source.length <= length) return source;
  const lower = source.toLowerCase();
  let index = -1;
  for (const term of terms || []) {
    index = lower.indexOf(term);
    if (index >= 0) break;
  }
  const start = Math.max(0, index < 0 ? 0 : index - 60);
  const piece = source.slice(start, start + length);
  return `${start > 0 ? "…" : ""}${piece}${start + length < source.length ? "…" : ""}`;
}

/* Text used to build a memory's embedding. Only user-supplied content. */
function embeddingText(memory) {
  const parts = [
    memory.title,
    memory.location && `Place: ${memory.location}`,
    memory.people?.length && `People: ${memory.people.join(", ")}`,
    memory.tags?.length && `Tags: ${memory.tags.join(", ")}`,
    memory.story,
    memory.transcript && `Voice note: ${memory.transcript}`,
  ];
  return parts.filter(Boolean).join("\n").slice(0, 6000);
}

module.exports = {
  tokenize,
  parseQuestion,
  matchesDateFilters,
  keywordRank,
  cosine,
  fuse,
  snippet,
  embeddingText,
  normalizeName,
  escapeRegExp,
  MONTHS,
};
