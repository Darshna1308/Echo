const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { setupEnv, startApp, newUser, uploadImage, uploadAudio, memoryBody, makeImage } = require("./helpers");

setupEnv("memories");

let ctx;
let user;

before(async () => {
  ctx = await startApp();
  user = await newUser(ctx.app, "Mira");
});
after(async () => {
  await ctx.close();
});

describe("create, read, update, delete", () => {
  let memoryId;
  let photos;

  test("validates required fields and dates", async () => {
    let res = await user.post("/api/memories").send({ story: "x", date: "2024-01-01" });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some((e) => e.field === "title"));

    res = await user.post("/api/memories").send(memoryBody({ date: "2999-01-01" }));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /future/);

    res = await user.post("/api/memories").send(memoryBody({ date: "2024-02-31" }));
    assert.equal(res.status, 400);

    res = await user.post("/api/memories").send(memoryBody({ time: "25:00" }));
    assert.equal(res.status, 400);
  });

  test("creates a memory with several photos, captions, styles and a voice note", async () => {
    photos = [await uploadImage(user, { color: { r: 10, g: 60, b: 140 } }), await uploadImage(user), await uploadImage(user, { width: 300, height: 600 })];
    const audio = await uploadAudio(user);
    const res = await user.post("/api/memories").send(
      memoryBody({
        title: "Teej at the haveli",
        time: "18:30",
        people: "Nani, Mom, nani",
        tags: "#festival, family, Family",
        photos: photos.map((p, i) => ({ ref: p.id, style: ["original", "haveli", "polaroid"][i], caption: `Photo ${i + 1}` })),
        audio: audio.id,
        transcript: "Nani singing.",
      })
    );
    assert.equal(res.status, 201);
    const m = res.body.memory;
    memoryId = m.id;
    assert.deepEqual(m.people, ["Nani", "Mom"], "people de-duplicated case-insensitively");
    assert.deepEqual(m.tags, ["festival", "family"], "# stripped, duplicates removed");
    assert.equal(m.time, "18:30");
    assert.equal(m.photos.length, 3);
    assert.equal(m.photos[1].style, "haveli");
    assert.equal(m.photos[2].caption, "Photo 3");
    assert.equal(m.photos[2].width, 300);
    assert.ok(m.audio.src.endsWith(`/api/media/${audio.id}/file`));
    assert.equal(m.transcript, "Nani singing.");

    const Media = ctx.mongoose.model("Media");
    const attached = await Media.find({ _id: { $in: photos.map((p) => p.id) } });
    assert.ok(attached.every((x) => x.status === "attached" && String(x.memory) === memoryId));
  });

  test("serves photos and thumbnails, with metadata stripped", async () => {
    const res = await user.get(`/api/media/${photos[0].id}/file`).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers["content-type"], "image/jpeg");
    assert.match(res.headers["cache-control"], /private/);
    const meta = await sharp(res.body).metadata();
    assert.equal(meta.width, 640);
    assert.equal(meta.exif, undefined, "EXIF (incl. GPS) removed");

    const thumb = await user.get(`/api/media/${photos[0].id}/file?variant=thumb`);
    assert.equal(thumb.status, 200);
    assert.equal(thumb.headers["content-type"], "image/webp");
  });

  test("strips camera metadata from uploads that contain it", async () => {
    const buf = await makeImage({ withGps: true });
    assert.ok((await sharp(buf).metadata()).exif, "fixture has EXIF");
    const up = await user.post("/api/media/upload").field("kind", "image").attach("file", buf, "gps.jpg");
    const file = await user.get(`/api/media/${up.body.media.id}/file`).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal((await sharp(file.body).metadata()).exif, undefined);
  });

  test("edits: reorders, removes a photo (its file is deleted) and adds a new one", async () => {
    const added = await uploadImage(user, { color: { r: 78, g: 154, b: 153 } });
    const res = await user.put(`/api/memories/${memoryId}`).send(
      memoryBody({
        title: "Teej at the haveli (edited)",
        photos: [
          { ref: photos[2].id, style: "noir", caption: "Now first" },
          { ref: added.id, style: "original", caption: "New" },
          { ref: photos[0].id },
        ],
      })
    );
    assert.equal(res.status, 200);
    const m = res.body.memory;
    assert.equal(m.title, "Teej at the haveli (edited)");
    assert.deepEqual(m.photos.map((p) => p.ref), [photos[2].id, added.id, photos[0].id]);
    assert.equal(m.photos[0].style, "noir");
    assert.equal(m.audio, null, "audio removed because it was not sent");

    assert.equal((await user.get(`/api/media/${photos[1].id}/file`)).status, 404, "removed photo deleted");

    const again = await user.get(`/api/memories/${memoryId}`);
    assert.equal(again.body.memory.photos.length, 3, "persisted");
  });

  test("rejects unknown media references", async () => {
    const res = await user.put(`/api/memories/${memoryId}`).send(memoryBody({ photos: [{ ref: "64b7f0000000000000000000" }] }));
    assert.equal(res.status, 400);
    const unchanged = await user.get(`/api/memories/${memoryId}`);
    assert.equal(unchanged.body.memory.photos.length, 3, "failed edit changes nothing");
  });

  test("pending uploads can be discarded, saved ones cannot be deleted directly", async () => {
    const pending = await uploadImage(user);
    assert.equal((await user.delete(`/api/media/${pending.id}`)).status, 200);
    assert.equal((await user.get(`/api/media/${pending.id}/file`)).status, 404);
    assert.equal((await user.delete(`/api/media/${photos[0].id}`)).status, 409);
  });

  test("deleting a memory deletes its photos and recording", async () => {
    const res = await user.delete(`/api/memories/${memoryId}`);
    assert.equal(res.status, 200);
    assert.equal((await user.get(`/api/memories/${memoryId}`)).status, 404);
    assert.equal((await user.get(`/api/media/${photos[0].id}/file`)).status, 404);
    const Media = ctx.mongoose.model("Media");
    assert.equal(await Media.countDocuments({ memory: memoryId }), 0);
  });
});

describe("uploads are validated", () => {
  test("rejects files that are not really images or audio", async () => {
    let res = await user.post("/api/media/upload").field("kind", "image").attach("file", Buffer.from("<script>alert(1)</script>"), { filename: "x.jpg", contentType: "image/jpeg" });
    assert.equal(res.status, 400);
    res = await user.post("/api/media/upload").field("kind", "audio").attach("file", await makeImage(), { filename: "x.webm", contentType: "audio/webm" });
    assert.equal(res.status, 400);
    res = await user.post("/api/media/upload").attach("file", await makeImage(), "x.jpg");
    assert.equal(res.status, 400, "kind is required");
    res = await user.post("/api/media/upload").field("kind", "image");
    assert.equal(res.status, 400, "file is required");
  });

  test("rejects a truncated image", async () => {
    const full = await makeImage();
    const res = await user.post("/api/media/upload").field("kind", "image").attach("file", full.subarray(0, 200), "broken.jpg");
    assert.equal(res.status, 400);
  });
});

describe("timeline, filters and search", () => {
  before(async () => {
    const items = [
      ["Ujjain at dawn", "Mahakal aarti with the family. Nani held my hand.", "2023-10-12", "Ujjain, Madhya Pradesh", ["Nani", "Papa"], ["travel", "family"]],
      ["First college fest", "I hosted the cultural night at our first college event.", "2022-09-20", "Indore", ["Riya", "Aman"], ["college"]],
      ["Chai on the terrace", "Rain, chai and long conversations.", "2024-07-03", "Home", ["Mom"], ["monsoon"]],
      ["Garba night", "We danced garba until 2am with Riya.", "2024-10-09", "Indore", ["Riya"], ["navratri", "friends"]],
      ["Jaisalmer fort", "Golden sandstone walls at sunset.", "2021-12-28", "Jaisalmer, Rajasthan", ["Papa"], ["travel"]],
    ];
    for (const [title, story, date, location, people, tags] of items) {
      const res = await user.post("/api/memories").send({ title, story, date, location, people, tags });
      assert.equal(res.status, 201);
    }
  });

  test("lists newest first with pagination", async () => {
    const page1 = await user.get("/api/memories?limit=2&page=1");
    assert.equal(page1.body.total, 5);
    assert.equal(page1.body.hasMore, true);
    assert.deepEqual(page1.body.memories.map((m) => m.date), ["2024-10-09", "2024-07-03"]);
    const page3 = await user.get("/api/memories?limit=2&page=3");
    assert.equal(page3.body.memories.length, 1);
    assert.equal(page3.body.hasMore, false);
  });

  test("filters by person, tag, place and year/month", async () => {
    assert.equal((await user.get("/api/memories?person=riya")).body.total, 2);
    assert.equal((await user.get("/api/memories?tag=%23travel")).body.total, 2);
    assert.equal((await user.get("/api/memories?location=indore")).body.total, 2);
    assert.equal((await user.get("/api/memories?year=2024")).body.total, 2);
    assert.equal((await user.get("/api/memories?year=2024&month=10")).body.total, 1);
  });

  test("keyword search ranks relevant memories", async () => {
    const res = await user.get("/api/search?q=college event");
    assert.equal(res.body.memories[0].title, "First college fest");
    const none = await user.get("/api/search?q=zzzunknownword");
    assert.equal(none.body.total, 0);
    const special = await user.get(`/api/search?q=${encodeURIComponent("(.*")}`);
    assert.equal(special.status, 200, "regex characters are safe");
  });

  test("facets list people, tags, places and years", async () => {
    const res = await user.get("/api/memories/facets");
    assert.equal(res.body.people.find((p) => p.value === "Riya").count, 2);
    assert.deepEqual(res.body.years, [2024, 2023, 2022, 2021]);
  });

  test("On This Day returns earlier years for the client's local date", async () => {
    const res = await user.get("/api/on-this-day?date=2026-10-09");
    assert.equal(res.body.memories.length, 1);
    assert.equal(res.body.memories[0].title, "Garba night");
    assert.equal(res.body.memories[0].yearsAgo, 2);
    const none = await user.get("/api/on-this-day?date=2026-01-01");
    assert.equal(none.body.memories.length, 0);
  });

  test("connections explain shared people, places and dates", async () => {
    const list = await user.get("/api/memories?limit=10");
    const garba = list.body.memories.find((m) => m.title === "Garba night");
    const res = await user.get(`/api/memories/${garba.id}/connections`);
    assert.equal(res.status, 200);
    const college = res.body.connections.find((c) => c.memory.title === "First college fest");
    assert.ok(college, "connected via Riya and Indore");
    const labels = college.reasons.map((r) => r.label);
    assert.ok(labels.includes("Also with Riya"));
    assert.ok(labels.includes("Also at Indore"));
    assert.ok(!res.body.connections.some((c) => c.memory.title === "Chai on the terrace"), "no arbitrary connections");
  });
});

describe("legacy memories from the first version", () => {
  test("base64 photos are served as images and survive an edit", async () => {
    const Memory = ctx.mongoose.model("Memory");
    const jpeg = await makeImage({ width: 40, height: 30 });
    const doc = await Memory.create({
      userId: user.user.id,
      title: "Old memory",
      story: "Saved with the first version of Echo.",
      date: new Date("2020-05-05"),
      photos: [{ url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, style: "old-memory", caption: "" }],
    });

    const detail = await user.get(`/api/memories/${doc._id}`);
    const photo = detail.body.memory.photos[0];
    assert.equal(photo.ref, "legacy:0");
    assert.ok(!JSON.stringify(detail.body).includes("base64"), "no base64 in JSON");

    const img = await user.get(photo.src);
    assert.equal(img.status, 200);
    assert.equal(img.headers["content-type"], "image/jpeg");

    const edited = await user.put(`/api/memories/${doc._id}`).send({
      title: "Old memory",
      story: "Edited.",
      date: "2020-05-05",
      photos: [{ ref: "legacy:0", style: "noir", caption: "Still here" }],
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.memory.photos[0].caption, "Still here");
    const raw = await Memory.findById(doc._id);
    assert.ok(raw.photos[0].url.startsWith("data:image/jpeg;base64,"), "original image data preserved");
  });
});
