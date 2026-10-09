/*
  Data-backed connections between memories.

  A connection is only shown when there is a concrete, explainable reason:
    - shared people (exact names the user typed)
    - the same place
    - shared tags
    - the same calendar date in a different year, or within the same week
    - similar topic: either embedding similarity (when configured) or
      distinctive words both stories use
  Each reason is returned so the UI can say *why* two memories connect.
*/
const { cosine, tokenize, normalizeName } = require("./retrieval");
const { config } = require("../config/env");

const DAY = 24 * 60 * 60 * 1000;

function placeKey(location) {
  return normalizeName(String(location || "").split(",")[0]);
}

function sharedValues(a = [], b = []) {
  const set = new Map(b.map((v) => [normalizeName(v), v]));
  return a.filter((v) => set.has(normalizeName(v)));
}

function distinctiveTerms(memory) {
  return new Set(tokenize(`${memory.title} ${memory.story}`).filter((t) => t.length > 3));
}

/* Maps each stemmed word back to how the user actually wrote it, for display. */
function surfaceWords(memory) {
  const map = new Map();
  const words = `${memory.title} ${memory.story}`.match(/[\p{L}\p{N}]+/gu) || [];
  for (const word of words) {
    const [stemmed] = tokenize(word);
    if (stemmed && !map.has(stemmed)) map.set(stemmed, word.toLowerCase());
  }
  return map;
}

function findConnections(target, others, { limit = 6 } = {}) {
  const targetTerms = distinctiveTerms(target);
  const targetSurface = surfaceWords(target);
  const targetPlace = placeKey(target.location);
  const targetDate = new Date(target.date);
  const useVectors =
    Array.isArray(target.embedding) && target.embedding.length && target.embeddingModel === config.ai.embedding.model;

  // How common each word is across the archive, so we only highlight rare shared words.
  const docFreq = new Map();
  const otherTerms = new Map();
  for (const other of others) {
    const terms = distinctiveTerms(other);
    otherTerms.set(String(other._id), terms);
    for (const t of terms) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  }
  const rareLimit = Math.max(2, Math.ceil(others.length * 0.15));

  const results = [];
  for (const other of others) {
    const reasons = [];
    let score = 0;

    const people = sharedValues(target.people, other.people);
    if (people.length) {
      reasons.push({ type: "people", label: `Also with ${people.join(", ")}`, values: people });
      score += 3 * people.length;
    }

    if (targetPlace && targetPlace === placeKey(other.location)) {
      reasons.push({ type: "place", label: `Also at ${other.location.split(",")[0].trim()}`, values: [other.location] });
      score += 3;
    }

    const tags = sharedValues(target.tags, other.tags);
    if (tags.length) {
      reasons.push({ type: "tags", label: `Both tagged ${tags.map((t) => `#${t}`).join(" ")}`, values: tags });
      score += 1.5 * tags.length;
    }

    const otherDate = new Date(other.date);
    const sameDay =
      otherDate.getUTCMonth() === targetDate.getUTCMonth() &&
      otherDate.getUTCDate() === targetDate.getUTCDate() &&
      otherDate.getUTCFullYear() !== targetDate.getUTCFullYear();
    if (sameDay) {
      const years = Math.abs(otherDate.getUTCFullYear() - targetDate.getUTCFullYear());
      reasons.push({ type: "date", label: `Same date, ${years} ${years === 1 ? "year" : "years"} apart` });
      score += 2;
    } else if (Math.abs(otherDate - targetDate) <= 3 * DAY) {
      reasons.push({ type: "date", label: "From the same few days" });
      score += 1.5;
    }

    if (useVectors && Array.isArray(other.embedding) && other.embeddingModel === target.embeddingModel) {
      const similarity = cosine(target.embedding, other.embedding);
      if (similarity >= 0.78) {
        reasons.push({ type: "topic", label: "Similar story", similarity: Number(similarity.toFixed(3)) });
        score += 2 * similarity;
      }
    } else {
      const shared = [...(otherTerms.get(String(other._id)) || [])].filter(
        (t) => targetTerms.has(t) && (docFreq.get(t) || 0) <= rareLimit
      );
      if (shared.length >= 2) {
        const words = shared.slice(0, 3).map((t) => targetSurface.get(t) || t);
        reasons.push({ type: "topic", label: `Both mention “${words.join("”, “")}”`, values: words });
        score += Math.min(shared.length, 5) * 0.6;
      }
    }

    if (reasons.length) results.push({ memory: other, reasons, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = {
  findConnections,
};
