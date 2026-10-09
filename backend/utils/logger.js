/*
  Tiny structured logger.

  Privacy policy enforced here:
  - Logs are single-line JSON with an event name and small metadata.
  - Request bodies, passwords, tokens, cookies, memory stories, transcripts
    and AI prompts are NEVER passed to the logger.
  - Any key that looks sensitive is redacted as a safety net.
*/
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const SENSITIVE = /pass|token|secret|authorization|cookie|story|transcript|letter|prompt|apikey|api_key/i;

let threshold =
  LEVELS[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === "test" ? LEVELS.silent : LEVELS.info);

function setLevel(level) {
  threshold = LEVELS[level] ?? LEVELS.info;
}

function scrub(meta) {
  if (!meta || typeof meta !== "object") return meta;
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE.test(key)) {
      out[key] = "[redacted]";
    } else if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message };
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(level, event, meta) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...scrub(meta),
  });
  if (level === "error" || level === "warn") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

module.exports = {
  setLevel,
  debug: (event, meta) => write("debug", event, meta),
  info: (event, meta) => write("info", event, meta),
  warn: (event, meta) => write("warn", event, meta),
  error: (event, meta) => write("error", event, meta),
};
