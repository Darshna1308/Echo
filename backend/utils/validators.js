/*
  Input schemas (zod). Every write endpoint validates its body here before
  anything touches the database.
*/
const { z } = require("zod");
const mongoose = require("mongoose");

const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v) && v.length === 24, "Invalid id.");

// Accepts ["a", "b"] or "a, b" and returns a clean, de-duplicated list.
function nameList({ maxItems, maxLength, label, stripHash = false }) {
  return z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((value) => {
      const raw = Array.isArray(value) ? value : String(value || "").split(",");
      const seen = new Set();
      const out = [];
      for (let item of raw) {
        item = String(item).replace(/\s+/g, " ").trim();
        if (stripHash) item = item.replace(/^#+/, "").trim();
        if (!item) continue;
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
      return out;
    })
    .refine((items) => items.length <= maxItems, `You can add up to ${maxItems} ${label}.`)
    .refine((items) => items.every((i) => i.length <= maxLength), `Each of the ${label} can be at most ${maxLength} characters.`);
}

const dateOnly = z
  .string({ error: "Please choose a date." })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a valid date.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Please choose a valid date.")
  .refine((v) => Number(v.slice(0, 4)) >= 1800, "Please choose a date after 1800.")
  .refine((v) => new Date(`${v}T00:00:00.000Z`).getTime() <= Date.now() + 36 * 3600 * 1000, "A memory's date can't be in the future.");

const photoInput = z.object({
  ref: z.string().trim().min(1).max(40),
  style: z.string().trim().max(32).regex(/^[a-z0-9-]*$/, "Unknown photo style.").optional().default("original"),
  caption: z.string().trim().max(300, "Captions can be at most 300 characters.").optional().default(""),
});

const memoryFields = {
  title: z.string({ error: "Please give this memory a title." }).trim().min(1, "Please give this memory a title.").max(160, "Titles can be at most 160 characters."),
  story: z.string({ error: "Please write the story of this memory." }).trim().min(1, "Please write the story of this memory.").max(20000, "Stories can be at most 20,000 characters."),
  date: dateOnly,
  time: z
    .string()
    .trim()
    .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Time must look like 18:30.")
    .optional()
    .default(""),
  location: z.string().trim().max(160, "Locations can be at most 160 characters.").optional().default(""),
  people: nameList({ maxItems: 30, maxLength: 80, label: "people" }),
  tags: nameList({ maxItems: 30, maxLength: 40, label: "tags", stripHash: true }),
  photos: z.array(photoInput).max(12, "A memory can hold up to 12 photographs.").optional().default([]),
  audio: objectId.nullable().optional().default(null),
  transcript: z.string().trim().max(20000, "Transcripts can be at most 20,000 characters.").optional().default(""),
};

const createMemorySchema = z.object(memoryFields).strict();

const updateMemorySchema = z
  .object({
    ...memoryFields,
    // AI suggestions are editable (or clearable) by the user.
    aiSummary: z.string().trim().max(2000).optional(),
    aiTags: nameList({ maxItems: 20, maxLength: 40, label: "suggested tags", stripHash: true }).optional(),
    aiMood: z.string().trim().max(60).optional(),
    aiThemes: nameList({ maxItems: 10, maxLength: 60, label: "themes" }).optional(),
  })
  .strict();

const registerSchema = z
  .object({
    name: z.string({ error: "Please tell us your name." }).trim().min(2, "Your name needs at least 2 characters.").max(80, "Names can be at most 80 characters."),
    email: z.string({ error: "Please enter your email." }).trim().toLowerCase().max(254).email("Please enter a valid email address."),
    password: z
      .string({ error: "Please choose a password." })
      .min(8, "Your password needs at least 8 characters.")
      .max(128, "Passwords can be at most 128 characters."),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string({ error: "Please enter your email." }).trim().toLowerCase().max(254).email("Please enter a valid email address."),
    password: z.string({ error: "Please enter your password." }).min(1, "Please enter your password.").max(128),
  })
  .strict();

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Please confirm with your password.").max(128),
});

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  person: z.string().trim().max(80).optional().default(""),
  tag: z.string().trim().max(40).optional().default(""),
  location: z.string().trim().max(160).optional().default(""),
  year: z.coerce.number().int().min(1800).max(3000).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(60).optional().default(20),
});

const askSchema = z.object({
  question: z.string({ error: "Please ask a question." }).trim().min(2, "Please ask a longer question.").max(500, "Questions can be at most 500 characters."),
});

const capsuleSchema = z
  .object({
    title: z.string({ error: "Please name this capsule." }).trim().min(1, "Please name this capsule.").max(120),
    letter: z.string().trim().max(10000, "Letters can be at most 10,000 characters.").optional().default(""),
    memoryIds: z.array(objectId).max(50, "A capsule can hold up to 50 memories.").optional().default([]),
    unlockAt: z
      .string({ error: "Please choose when this capsule opens." })
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "Please choose a valid unlock date.")
      .transform((v) => new Date(v))
      .refine((d) => d.getTime() > Date.now(), "The unlock date must be in the future.")
      .refine((d) => d.getTime() < Date.now() + 100 * 365.25 * 24 * 3600 * 1000, "Please choose an unlock date within 100 years."),
  })
  .strict()
  .refine((c) => c.letter.length > 0 || c.memoryIds.length > 0, {
    message: "Add a letter or at least one memory to seal.",
    path: ["letter"],
  });

const onThisDaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

module.exports = {
  objectId,
  createMemorySchema,
  updateMemorySchema,
  registerSchema,
  loginSchema,
  deleteAccountSchema,
  listQuerySchema,
  askSchema,
  capsuleSchema,
  onThisDaySchema,
};
