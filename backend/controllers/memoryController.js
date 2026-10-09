const Memory = require("../models/Memory");
const AppError = require("../utils/AppError");
const ai = require("../services/ai");
const { config } = require("../config/env");
const { toCard, toDetail } = require("../services/memoryPresenter");
const { resolveMedia, syncAttachments, deleteMedia, mediaIdsOf } = require("../services/memoryMedia");
const { indexInBackground } = require("../services/indexing");
const { keywordRank, tokenize, escapeRegExp } = require("../services/retrieval");
const { findConnections } = require("../services/connections");

function toDate(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function loadOwned(req, { populate = true } = {}) {
  const query = Memory.findOne(Memory.visibleTo(req.userId, { _id: req.params.id }));
  if (populate) query.populate("photos.media audioMedia");
  const memory = await query;
  // 404 (not 403) for someone else's memory: don't reveal that it exists.
  if (!memory) throw AppError.notFound("This memory could not be found.");
  return memory;
}

function buildFilter(userId, q) {
  const filter = Memory.visibleTo(userId);
  if (q.person) filter.people = { $regex: `^${escapeRegExp(q.person)}$`, $options: "i" };
  if (q.tag) filter.tags = { $regex: `^${escapeRegExp(q.tag.replace(/^#/, ""))}$`, $options: "i" };
  if (q.location) filter.location = { $regex: escapeRegExp(q.location), $options: "i" };
  if (q.year) {
    const from = q.month ? Date.UTC(q.year, q.month - 1, 1) : Date.UTC(q.year, 0, 1);
    const to = q.month ? Date.UTC(q.year, q.month, 1) : Date.UTC(q.year + 1, 0, 1);
    filter.date = { $gte: new Date(from), $lt: new Date(to) };
  }
  return filter;
}

const CARD_FIELDS = "title story date time location people tags photos audioMedia aiMood createdAt";
const SEARCH_FIELDS = `${CARD_FIELDS} transcript aiSummary aiTags`;

// GET /api/memories?page&limit&person&tag&location&year&month&q
// GET /api/search uses the same handler.
async function listMemories(req, res) {
  const q = req.validQuery;
  const filter = buildFilter(req.userId, q);
  const skip = (q.page - 1) * q.limit;

  if (q.q) {
    // Keyword search: rank this user's matching memories with BM25.
    const terms = tokenize(q.q);
    const candidates = await Memory.find(filter).select(SEARCH_FIELDS).populate("photos.media", "width height");
    const ranked = terms.length ? keywordRank(candidates, terms) : [];
    const page = ranked.slice(skip, skip + q.limit);
    return res.json({
      success: true,
      memories: page.map((r) => toCard(r.memory, { terms })),
      page: q.page,
      total: ranked.length,
      hasMore: skip + q.limit < ranked.length,
      query: q.q,
    });
  }

  const [memories, total] = await Promise.all([
    Memory.find(filter)
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(q.limit)
      .select(CARD_FIELDS)
      .populate("photos.media", "width height"),
    Memory.countDocuments(filter),
  ]);

  res.json({
    success: true,
    memories: memories.map((m) => toCard(m)),
    page: q.page,
    total,
    hasMore: skip + memories.length < total,
  });
}

// GET /api/memories/facets — the user's people, tags, places and years for filters.
async function facets(req, res) {
  const memories = await Memory.find(Memory.visibleTo(req.userId)).select("people tags location date").lean();
  const count = (values) => {
    const map = new Map();
    for (const v of values) {
      if (!v) continue;
      const key = v.toLowerCase();
      const entry = map.get(key) || { value: v, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  res.json({
    success: true,
    total: memories.length,
    people: count(memories.flatMap((m) => m.people || [])),
    tags: count(memories.flatMap((m) => m.tags || [])),
    locations: count(memories.map((m) => m.location)),
    years: [...new Set(memories.map((m) => new Date(m.date).getUTCFullYear()))].sort((a, b) => b - a),
  });
}

// POST /api/memories
async function createMemory(req, res) {
  const body = req.body;
  const media = await resolveMedia(req.userId, body);

  const memory = await Memory.create({
    userId: req.userId,
    title: body.title,
    story: body.story,
    date: toDate(body.date),
    time: body.time,
    location: body.location,
    people: body.people,
    tags: body.tags,
    photos: media.photos,
    audioMedia: media.audioMedia,
    transcript: body.transcript,
  });

  await syncAttachments(memory);
  indexInBackground(memory._id);

  await memory.populate("photos.media audioMedia");
  res.status(201).json({
    success: true,
    message: "Your memory has been preserved.",
    memory: toDetail(memory),
  });
}

// GET /api/memories/:id
async function getMemory(req, res) {
  const memory = await loadOwned(req);
  res.json({ success: true, memory: toDetail(memory) });
}

// PUT /api/memories/:id
async function updateMemory(req, res) {
  const memory = await loadOwned(req, { populate: false });
  const previousIds = mediaIdsOf(memory);
  const body = req.body;

  const media = await resolveMedia(req.userId, body, memory);

  memory.set({
    title: body.title,
    story: body.story,
    date: toDate(body.date),
    time: body.time,
    location: body.location,
    people: body.people,
    tags: body.tags,
    photos: media.photos,
    audioMedia: media.audioMedia,
    transcript: body.transcript,
  });

  for (const field of ["aiSummary", "aiTags", "aiMood", "aiThemes"]) {
    if (body[field] !== undefined) memory.set(field, body[field]);
  }
  if (body.aiSummary !== undefined || body.aiTags !== undefined) {
    const empty = !memory.aiSummary && !memory.aiMood && !memory.aiTags.length && !memory.aiThemes.length;
    if (empty) memory.aiStatus = "none";
  }

  await memory.save();
  await syncAttachments(memory, previousIds);
  indexInBackground(memory._id);

  await memory.populate("photos.media audioMedia");
  res.json({
    success: true,
    message: "Memory updated.",
    memory: toDetail(memory),
  });
}

// DELETE /api/memories/:id — deletes the memory and its photos/recording.
async function deleteMemory(req, res) {
  const memory = await loadOwned(req, { populate: false });
  await deleteMedia({ _id: { $in: mediaIdsOf(memory) }, userId: req.userId });
  await Memory.deleteOne({ _id: memory._id, userId: req.userId });
  res.json({ success: true, message: "The memory has been deleted." });
}

// GET /api/memories/:id/legacy-photos/:index — decodes old base64 photos.
async function legacyPhoto(req, res) {
  const memory = await loadOwned(req, { populate: false });
  const index = Number.parseInt(req.params.index, 10);
  const photo = memory.photos?.[index];
  const url = typeof photo === "string" ? photo : photo?.url;
  const match = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/s.exec(url || "");
  if (!match) throw AppError.notFound("Photo not found.");
  const buffer = Buffer.from(match[2], "base64");
  res.set({
    "Content-Type": match[1] === "image/jpg" ? "image/jpeg" : match[1],
    "Content-Length": buffer.length,
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(buffer);
}

// POST /api/memories/:id/enrich — AI summary, suggested tags, mood and themes.
async function enrichMemory(req, res) {
  if (!ai.features().chat) {
    throw new AppError(503, "AI suggestions are not configured on this server.", { code: "AI_DISABLED" });
  }
  const memory = await loadOwned(req, { populate: false });

  const facts = {
    title: memory.title,
    date: memory.date.toISOString().slice(0, 10),
    location: memory.location || null,
    people: memory.people,
    tags: memory.tags,
    story: memory.story.slice(0, 8000),
    voiceTranscript: memory.transcript ? memory.transcript.slice(0, 4000) : null,
    photoCaptions: memory.photos.map((p) => p.caption).filter(Boolean),
  };

  const reply = await ai.chat(
    [
      {
        role: "system",
        content:
          "You help a person organise their private memory journal. Use ONLY the facts provided. " +
          "Never invent people, places, dates or events. Never guess who someone is. " +
          "Reply with a JSON object: {\"summary\": string (1-2 sentences, third person avoided, plain and warm), " +
          "\"suggestedTags\": string[] (2-6 short lowercase tags not already in tags), " +
          "\"mood\": string (one or two words), \"themes\": string[] (1-3 short themes)}.",
      },
      { role: "user", content: JSON.stringify(facts) },
    ],
    { json: true, maxTokens: 400 }
  );

  const parsed = ai.parseJsonReply(reply);
  if (!parsed || typeof parsed.summary !== "string") {
    memory.aiStatus = "failed";
    await memory.save();
    throw new AppError(502, "The AI provider returned something Echo couldn't use. Please try again.");
  }

  const existingTags = new Set(memory.tags.map((t) => t.toLowerCase()));
  const clean = (list, max, len) =>
    (Array.isArray(list) ? list : [])
      .map((t) => String(t).replace(/^#/, "").trim())
      .filter((t) => t && t.length <= len)
      .slice(0, max);

  memory.aiSummary = parsed.summary.trim().slice(0, 2000);
  memory.aiTags = clean(parsed.suggestedTags, 8, 40).filter((t) => !existingTags.has(t.toLowerCase()));
  memory.aiMood = String(parsed.mood || "").trim().slice(0, 60);
  memory.aiThemes = clean(parsed.themes, 3, 60);
  memory.aiStatus = "ready";
  memory.aiGeneratedAt = new Date();
  memory.aiModel = config.ai.chat.model;
  await memory.save();

  await memory.populate("photos.media audioMedia");
  res.json({ success: true, memory: toDetail(memory) });
}

// DELETE /api/memories/:id/enrichment — removes all AI suggestions.
async function clearEnrichment(req, res) {
  const memory = await loadOwned(req, { populate: false });
  memory.set({ aiSummary: "", aiTags: [], aiMood: "", aiThemes: [], aiStatus: "none", aiGeneratedAt: null, aiModel: "" });
  await memory.save();
  await memory.populate("photos.media audioMedia");
  res.json({ success: true, memory: toDetail(memory) });
}

// GET /api/memories/:id/connections
async function connections(req, res) {
  const memory = await Memory.findOne(Memory.visibleTo(req.userId, { _id: req.params.id })).select("+embedding +embeddingModel");
  if (!memory) throw AppError.notFound("This memory could not be found.");
  const others = await Memory.find(Memory.visibleTo(req.userId, { _id: { $ne: memory._id } }))
    .select(`${CARD_FIELDS} +embedding +embeddingModel`)
    .populate("photos.media", "width height");
  const found = findConnections(memory, others);
  res.json({
    success: true,
    connections: found.map((c) => ({ memory: toCard(c.memory), reasons: c.reasons })),
  });
}

module.exports = {
  listMemories,
  facets,
  createMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  legacyPhoto,
  enrichMemory,
  clearEnrichment,
  connections,
};
