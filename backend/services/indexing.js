/*
  Keeps semantic-search vectors up to date (only when an embedding provider
  is configured). Runs in the background after a memory is saved so saving
  is never blocked or broken by the AI provider.
*/
const Memory = require("../models/Memory");
const ai = require("./ai");
const logger = require("../utils/logger");
const { config } = require("../config/env");
const { embeddingText } = require("./retrieval");

async function indexMemory(memoryId) {
  if (!ai.features().embeddings) return false;
  try {
    const memory = await Memory.findById(memoryId);
    if (!memory) return false;
    const [vector] = await ai.embed([embeddingText(memory)]);
    await Memory.updateOne(
      { _id: memory._id, userId: memory.userId },
      { $set: { embedding: vector, embeddingModel: config.ai.embedding.model } }
    );
    return true;
  } catch (error) {
    logger.warn("embedding_failed", { memoryId: String(memoryId), error });
    return false;
  }
}

function indexInBackground(memoryId) {
  if (!ai.features().embeddings) return;
  setImmediate(() => {
    indexMemory(memoryId);
  });
}

/* Embeds this user's memories that have no vector for the current model. */
async function reindexUser(userId, limit = 100) {
  if (!ai.features().embeddings) return { indexed: 0, remaining: 0 };
  const model = config.ai.embedding.model;
  const filter = Memory.visibleTo(userId, { embeddingModel: { $ne: model } });
  const batch = await Memory.find(filter).sort({ date: -1 }).limit(limit);

  let indexed = 0;
  for (let i = 0; i < batch.length; i += 16) {
    const slice = batch.slice(i, i + 16);
    const vectors = await ai.embed(slice.map(embeddingText));
    await Promise.all(
      slice.map((memory, j) =>
        Memory.updateOne({ _id: memory._id, userId }, { $set: { embedding: vectors[j], embeddingModel: model } })
      )
    );
    indexed += slice.length;
  }
  const remaining = await Memory.countDocuments(filter);
  return { indexed, remaining };
}

module.exports = {
  indexMemory,
  indexInBackground,
  reindexUser,
};
