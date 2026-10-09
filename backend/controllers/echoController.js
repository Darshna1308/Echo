/*
  Ask Echo — natural-language questions about the user's own archive.

  1. The user is authenticated (protect middleware).
  2. Only that user's visible (unsealed) memories are loaded.
  3. Dates in the question ("October", "2023", "last year") become filters;
     known people and places get a ranking boost.
  4. Memories are ranked by keyword relevance (BM25) and, when an embedding
     provider is configured, by semantic similarity; the two are fused.
  5. If a chat model is configured, it answers using ONLY the retrieved
     memories and must cite them. Otherwise Echo returns the matches
     themselves and says plainly that AI answers are off.
  6. The response lists the exact memories used, so each can be opened.
*/
const Memory = require("../models/Memory");
const ai = require("../services/ai");
const logger = require("../utils/logger");
const { config } = require("../config/env");
const { toCard } = require("../services/memoryPresenter");
const { reindexUser } = require("../services/indexing");
const {
  parseQuestion,
  matchesDateFilters,
  keywordRank,
  cosine,
  fuse,
  snippet,
  normalizeName,
} = require("../services/retrieval");

const MAX_SOURCES = 6;
const FIELDS = "title story date time location people tags photos audioMedia transcript aiSummary aiTags aiMood";

function describeFilters(parsed) {
  const months = parsed.months.map((m) => new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en", { month: "long", timeZone: "UTC" }));
  return {
    months,
    years: parsed.years,
    people: parsed.people,
    places: parsed.locations,
  };
}

async function retrieve(userId, question) {
  const memories = await Memory.find(Memory.visibleTo(userId))
    .select(`${FIELDS} +embedding +embeddingModel`)
    .populate("photos.media", "width height")
    .sort({ date: -1 })
    .limit(5000);

  const known = {
    people: [...new Set(memories.flatMap((m) => m.people || []))],
    locations: [...new Set(memories.map((m) => m.location).filter(Boolean))],
  };
  const parsed = parseQuestion(question, known);
  const pool = memories.filter((m) => matchesDateFilters(m, parsed));

  // Boost terms: names and places mentioned in the question.
  const boostTerms = [...parsed.people, ...parsed.locations];
  const keyword = keywordRank(pool, parsed.terms);

  const rankings = [keyword];
  let usedSemantic = false;

  if (ai.features().embeddings && pool.length) {
    try {
      const [queryVector] = await ai.embed([question]);
      const semantic = pool
        .filter((m) => Array.isArray(m.embedding) && m.embedding.length && m.embeddingModel === config.ai.embedding.model)
        .map((m) => ({ memory: m, score: cosine(queryVector, m.embedding) }))
        .filter((r) => r.score >= config.ai.semanticMinScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);
      rankings.push(semantic);
      usedSemantic = true;
    } catch (error) {
      logger.warn("ask_semantic_failed", { error });
    }
  }

  if (boostTerms.length) {
    const wanted = boostTerms.map(normalizeName);
    const boosted = pool
      .filter((m) =>
        wanted.some(
          (w) =>
            (m.people || []).some((p) => normalizeName(p) === w) ||
            normalizeName(m.location).startsWith(w.split(",")[0])
        )
      )
      .map((m) => ({ memory: m }));
    // Counted twice: an explicit name or place in the question is strong evidence.
    rankings.push(boosted, boosted);
  }

  // A question that is ONLY a date filter ("what happened in October 2023?")
  // returns that period's memories, newest first.
  const dateOnly = !parsed.terms.length && !boostTerms.length && (parsed.months.length || parsed.years.length);
  if (dateOnly) rankings.push(pool.map((m) => ({ memory: m })));

  const fused = fuse(rankings).slice(0, MAX_SOURCES);
  return { parsed, results: fused, usedSemantic, totalSearched: memories.length };
}

function sourceView(memory, index, terms) {
  return {
    n: index + 1,
    ...toCard(memory, { terms }),
    excerpt: snippet(memory.story, terms, 240),
  };
}

// POST /api/echo/ask   { question }
async function ask(req, res) {
  const { question } = req.body;
  const { parsed, results, usedSemantic, totalSearched } = await retrieve(req.userId, question);
  const filters = describeFilters(parsed);
  const sources = results.map((r, i) => sourceView(r.memory, i, parsed.terms));

  const base = {
    success: true,
    question,
    filters,
    retrieval: usedSemantic ? "hybrid" : "keyword",
    searched: totalSearched,
  };

  if (!sources.length) {
    return res.json({
      ...base,
      mode: ai.features().chat ? "ai" : "keyword",
      answer: totalSearched
        ? "I couldn't find anything in your archive about that. Your memories may describe it in different words — try a name, a place or a year."
        : "Your archive is empty so far. Once you preserve a few memories, you can ask Echo about them here.",
      sources: [],
      citations: [],
      insufficient: true,
    });
  }

  if (!ai.features().chat) {
    return res.json({
      ...base,
      mode: "keyword",
      answer: `AI answers aren't switched on for this Echo server, so here ${sources.length === 1 ? "is the memory that best matches" : `are the ${sources.length} memories that best match`} your question.`,
      sources,
      citations: sources.map((s) => s.n),
      insufficient: false,
    });
  }

  const context = results.map((r, i) => {
    const m = r.memory;
    return {
      n: i + 1,
      title: m.title,
      date: m.date.toISOString().slice(0, 10),
      time: m.time || undefined,
      location: m.location || undefined,
      people: m.people?.length ? m.people : undefined,
      tags: m.tags?.length ? m.tags : undefined,
      story: m.story.slice(0, 2500),
      voiceTranscript: m.transcript ? m.transcript.slice(0, 1200) : undefined,
    };
  });

  let reply;
  try {
    reply = await ai.chat(
      [
        {
          role: "system",
          content:
            "You are Echo, a gentle assistant for a person's private memory archive. Answer the user's question using ONLY the numbered memories provided. " +
            "Rules: never invent people, dates, places, feelings or events; if the memories don't contain the answer, say so plainly; " +
            "speak to the user as 'you'; keep it under 120 words; cite memories inline like [1] or [2][3]. " +
            "Reply as JSON: {\"answer\": string, \"citations\": number[], \"insufficient\": boolean}.",
        },
        {
          role: "user",
          content: `Today's date: ${new Date().toISOString().slice(0, 10)}\nQuestion: ${question}\n\nMemories:\n${JSON.stringify(context)}`,
        },
      ],
      { json: true, maxTokens: 500 }
    );
  } catch (error) {
    // Provider failure: still give the user their matching memories.
    return res.json({
      ...base,
      mode: "keyword",
      providerError: error.message || "The AI provider could not be reached.",
      answer: "Echo's AI couldn't answer just now, but these memories match your question.",
      sources,
      citations: sources.map((s) => s.n),
      insufficient: false,
    });
  }

  const parsedReply = ai.parseJsonReply(reply);
  const answer = String(parsedReply?.answer || reply || "").trim();
  const valid = new Set(sources.map((s) => s.n));
  let citations = Array.isArray(parsedReply?.citations) ? parsedReply.citations.map(Number) : [];
  for (const match of answer.matchAll(/\[(\d+)\]/g)) citations.push(Number(match[1]));
  citations = [...new Set(citations.filter((n) => valid.has(n)))];

  res.json({
    ...base,
    mode: "ai",
    answer,
    sources,
    citations,
    insufficient: Boolean(parsedReply?.insufficient) || !citations.length,
  });
}

// POST /api/echo/reindex — builds semantic vectors for memories without one.
async function reindex(req, res) {
  const result = await reindexUser(req.userId);
  res.json({ success: true, ...result });
}

// GET /api/on-this-day?date=YYYY-MM-DD  (the user's local date)
async function onThisDay(req, res) {
  const today = req.validQuery?.date ? new Date(`${req.validQuery.date}T00:00:00Z`) : new Date();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  const year = today.getUTCFullYear();

  const dates = await Memory.find(Memory.visibleTo(req.userId)).select("date").lean();
  const ids = dates
    .filter((m) => {
      const d = new Date(m.date);
      return d.getUTCMonth() === month && d.getUTCDate() === day && d.getUTCFullYear() < year;
    })
    .map((m) => m._id);

  const memories = ids.length
    ? await Memory.find({ _id: { $in: ids }, userId: req.userId })
        .sort({ date: -1 })
        .populate("photos.media", "width height")
    : [];

  res.json({
    success: true,
    date: today.toISOString().slice(0, 10),
    memories: memories.map((m) => ({
      ...toCard(m),
      yearsAgo: year - m.date.getUTCFullYear(),
    })),
  });
}

module.exports = {
  ask,
  reindex,
  onThisDay,
};
