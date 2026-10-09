/*
  End-to-end browser journey for Echo (smoke test).

  Drives a real Chromium through the main user journeys against a running
  frontend + backend, takes screenshots, and fails on console errors,
  failed requests or horizontal overflow.

  Usage:
    BASE_URL=http://localhost:5173 \
    CHROME_PATH=/path/to/chrome \
    FIXTURES=./e2e/fixtures \
    SHOTS=./screenshots \
    node e2e/journey.mjs

  FIXTURES must contain: dusk.jpg courtyard.jpg lake.jpg lamps.jpg portrait.jpg voice.wav not-an-image.jpg
  (generate them with: node e2e/make-fixtures.cjs, run from the backend folder's node_modules — see README).
*/
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const FIX = process.env.FIXTURES || "./e2e/fixtures";
const SHOTS = process.env.SHOTS || "./screenshots";
const CHROME = process.env.CHROME_PATH;
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const problems = [];
const fixture = (name) => path.join(FIX, name);

function step(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function expectVisible(page, locator, name, timeout = 8000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    step(name, true);
    return true;
  } catch {
    step(name, false, "not visible");
    await page.screenshot({ path: path.join(SHOTS, `FAIL-${name.replace(/\W+/g, "-")}.png`), fullPage: true });
    return false;
  }
}

function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location()?.url || "";
    // Requests the journey makes on purpose to prove something is refused.
    if (where.includes("expected-fail") || (where.endsWith("/api/media/upload") && m.text().includes("400")) || (where.endsWith("/api/auth/login") && m.text().includes("401"))) return;
    problems.push(`[${label}] console: ${m.text()} ${where}`);
  });
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on("response", (r) => {
    const url = r.request().url();
    const expected = url.includes("expected-fail") || (url.endsWith("/api/media/upload") && r.status() === 400) || (url.endsWith("/api/auth/login") && r.status() === 401);
    if (r.status() >= 400 && !expected) problems.push(`[${label}] HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

const launchArgs = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const browser = await chromium.launch({ executablePath: CHROME, args: launchArgs });

try {
  // ------------------------------------------------------------ desktop journey
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  watch(page, "desktop");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  step("unauthenticated visit redirects to /welcome", page.url().includes("/welcome"));
  await expectVisible(page, page.getByRole("heading", { name: "Welcome back." }), "login form visible immediately");
  await page.waitForTimeout(2500);
  const mode = await page.locator(".haveli").getAttribute("class");
  step("3D haveli scene renders with WebGL", mode.includes("haveli--webgl"), mode);
  await page.screenshot({ path: path.join(SHOTS, "01-welcome.png") });

  // Wrong password
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Open my archive" }).click();
  await expectVisible(page, page.getByText("don't match an Echo account"), "wrong credentials show an error");

  // Register
  await page.getByRole("tab", { name: "Create account" }).click();
  const email = `e2e${Date.now()}@example.com`;
  await page.getByLabel("Your name").fill("Darshna Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create my archive" }).click();
  await expectVisible(page, page.getByText("at least 8 characters"), "client-side validation message");
  await page.getByLabel("Password", { exact: true }).fill("a-good-long-password");
  await page.getByRole("button", { name: "Create my archive" }).click();
  await expectVisible(page, page.getByText("Your first memory is waiting."), "registration lands on empty archive");
  await page.screenshot({ path: path.join(SHOTS, "02-archive-empty.png") });

  // Session survives a reload
  await page.reload({ waitUntil: "networkidle" });
  await expectVisible(page, page.getByText("Your first memory is waiting."), "session persists after reload");

  // ------------------------------------------------------------ create memory
  await page.getByRole("link", { name: "Preserve a memory" }).first().click();
  await expectVisible(page, page.getByRole("heading", { name: "Preserve a memory." }), "create page opens");
  await page.getByLabel("Title").fill("Garba night at the haveli");
  await page.getByLabel("Date").fill("2024-10-09");
  await page.getByLabel("The story").fill("We danced garba in the courtyard until two in the morning. Riya taught Nani a new step and everyone laughed.\n\nThe lamps along the jharokhas stayed lit all night.");
  await page.getByLabel("Place").fill("Jaipur, Rajasthan");
  const people = page.getByLabel("People");
  await people.fill("Riya");
  await people.press("Enter");
  await people.fill("Nani, Papa");
  await page.getByLabel("Tags").fill("navratri");
  await page.getByLabel("Tags").press("Enter");

  await page.locator('input[type=file][accept^="image"]').setInputFiles([fixture("dusk.jpg"), fixture("courtyard.jpg"), fixture("lamps.jpg")]);
  await page.waitForFunction(() => document.querySelectorAll(".photo-item.is-ready").length === 3, null, { timeout: 20000 });
  step("three photos uploaded with progress", true);

  // Wrong file type is refused
  await page.locator('input[type=file][accept^="image"]').setInputFiles([fixture("not-an-image.jpg")]);
  await page.waitForTimeout(1500);
  const rejected = await page.locator(".photo-item.is-error").count();
  step("a fake image is rejected by the server", rejected === 1);
  if (rejected) await page.locator(".photo-item.is-error").getByRole("button", { name: /Remove photo/ }).click();

  // Style + caption + reorder
  await page.getByRole("button", { name: /^Style:/ }).nth(1).click();
  await page.getByRole("radio", { name: "Haveli" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Caption for photo 2").fill("The courtyard before everyone arrived");
  await page.getByRole("button", { name: "Move photo 2 earlier" }).click();

  // Voice note (file upload; recording needs a microphone)
  await page.locator('input[type=file][accept="audio/*"]').setInputFiles(fixture("voice.wav"));
  await page.waitForFunction(() => !document.querySelector(".voice-clip .photo-status"), null, { timeout: 15000 });
  await page.getByLabel("Transcript").fill("Nani laughing as Riya shows her the step.");
  await page.screenshot({ path: path.join(SHOTS, "03-create-filled.png"), fullPage: true });

  // Unsaved-changes guard
  await page.locator(".shell-nav").getByRole("link", { name: "Archive" }).click();
  await expectVisible(page, page.getByRole("heading", { name: "Leave without saving?" }), "unsaved changes are protected");
  await page.getByRole("button", { name: "Keep editing" }).click();

  await page.getByRole("button", { name: "Preserve this memory" }).click();
  await expectVisible(page, page.getByText("Preserved."), "wax-seal moment after saving");
  await page.waitForURL(/\/memories\/[a-f0-9]{24}$/, { timeout: 10000 });
  await expectVisible(page, page.getByRole("heading", { name: "Garba night at the haveli" }), "memory detail opens");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, "04-detail.png"), fullPage: true });
  const memoryUrl = page.url();

  const galleryCount = await page.locator(".gallery-item").count();
  step("detail shows all three photos", galleryCount === 3, `${galleryCount}`);
  const firstCaption = await page.locator(".gallery-item figcaption").first().textContent();
  step("reordered photo is first with its caption", firstCaption?.includes("courtyard"), firstCaption || "");
  await expectVisible(page, page.locator(".memory-voice audio"), "voice note player present");

  // Lightbox
  await page.locator(".gallery-item .pf--clickable").first().click();
  await expectVisible(page, page.locator("dialog.lightbox[open]"), "lightbox opens");
  await page.keyboard.press("ArrowRight");
  const count = await page.locator(".lightbox-count").textContent();
  step("lightbox keyboard navigation", count?.startsWith("2 of 3"), count || "");
  await page.keyboard.press("Escape");

  // ------------------------------------------------------------ edit memory
  await page.getByRole("link", { name: "Edit memory" }).click();
  await expectVisible(page, page.getByRole("heading", { name: "Garba night at the haveli" }), "edit page loads memory");
  await page.getByRole("button", { name: "Remove photo 3" }).click();
  await page.getByLabel("Title").fill("Garba night at the haveli, 2024");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(memoryUrl, { timeout: 10000 });
  await expectVisible(page, page.getByRole("heading", { name: "Garba night at the haveli, 2024" }), "edit saved and shown");
  await page.reload({ waitUntil: "networkidle" });
  const afterEdit = await page.locator(".gallery-item").count();
  step("removed photo stays removed after refresh", afterEdit === 2, `${afterEdit}`);

  // ------------------------------------------------------------ more memories (via the API)
  const seeds = await page.evaluate(async () => {
    const made = [];
    const post = (body) =>
      fetch("/api/memories", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    const today = new Date();
    const lastYearToday = `${today.getFullYear() - 1}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    made.push(await post({ title: "Ujjain at dawn", story: "Mahakal aarti with the family. Nani held my hand through the crowd.", date: "2023-10-12", location: "Ujjain, Madhya Pradesh", people: ["Nani", "Papa"], tags: ["travel", "family"] }));
    made.push(await post({ title: "First college fest", story: "I hosted the cultural night at our first college event and forgot half my lines.", date: "2022-09-20", location: "Indore", people: ["Riya", "Aman"], tags: ["college"] }));
    made.push(await post({ title: "A year ago today", story: "Chai on the terrace while the monsoon finally broke.", date: lastYearToday, location: "Home", people: ["Mom"], tags: ["monsoon"] }));
    return made.map((m) => m.memory?.id);
  });
  step("additional memories created", seeds.every(Boolean));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await expectVisible(page, page.locator(".year-label"), "archive grouped by year");
  await expectVisible(page, page.locator(".otd-band"), "On this day band shows a memory from a year ago");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, "05-archive.png"), fullPage: true });
  step("archive has no horizontal overflow (desktop)", (await overflow(page)) <= 0);

  // Search and filter
  await page.getByPlaceholder("Search stories, people, places…").fill("college");
  await expectVisible(page, page.getByText("1 memory match “college”"), "keyword search");
  await page.getByPlaceholder("Search stories, people, places…").fill("");
  await page.waitForTimeout(600);
  await page.locator(".filter select").first().selectOption("Riya");
  await expectVisible(page, page.getByText("2 memories", { exact: true }), "person filter");
  await page.getByRole("button", { name: "Clear" }).click();

  // ------------------------------------------------------------ Ask Echo
  await page.locator(".shell-nav").getByRole("link", { name: "Ask Echo" }).click();
  await page.getByLabel("Your question").fill("When did I visit Ujjain with my family?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expectVisible(page, page.locator(".source-title", { hasText: "Ujjain at dawn" }), "Ask Echo returns the right memory as a source");
  await page.screenshot({ path: path.join(SHOTS, "06-ask.png"), fullPage: true });
  await page.locator(".source-link", { hasText: "Ujjain at dawn" }).click();
  await expectVisible(page, page.getByRole("heading", { name: "Ujjain at dawn" }), "source opens the memory");

  // ------------------------------------------------------------ On this day
  await page.goto(`${BASE}/on-this-day`, { waitUntil: "networkidle" });
  await expectVisible(page, page.getByText("A year ago today"), "On this day page");
  await page.screenshot({ path: path.join(SHOTS, "07-on-this-day.png"), fullPage: true });

  // ------------------------------------------------------------ Capsules
  await page.goto(`${BASE}/capsules`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Seal a new capsule" }).click();
  await page.getByLabel("Name").fill("For after graduation");
  await page.getByLabel("A letter to open later").fill("Dear future me, I hope you still dance at every garba.");
  await page.locator(".capsule-pick", { hasText: "First college fest" }).click();
  await page.getByRole("button", { name: "Review and seal" }).click();
  await expectVisible(page, page.getByRole("heading", { name: /Seal until/ }), "capsule confirmation explains what happens");
  await page.getByRole("button", { name: "Seal capsule" }).click();
  await page.waitForURL(/\/capsules\/[a-f0-9]{24}$/);
  await expectVisible(page, page.getByRole("button", { name: "Still sealed" }), "sealed capsule cannot be opened early");
  const letterHidden = (await page.getByText("Dear future me").count()) === 0;
  step("sealed letter is not shown", letterHidden);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(SHOTS, "08-capsule-sealed.png"), fullPage: true });
  const sealedMemory = await page.evaluate(async (id) => (await fetch(`/api/memories/${id}?expected-fail=1`, { credentials: "include" })).status, seeds[1]);
  step("sealed memory is hidden from the archive API (404)", sealedMemory === 404);
  await page.goto(`${BASE}/capsules`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "09-capsules.png"), fullPage: true });

  // ------------------------------------------------------------ Settings
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await expectVisible(page, page.getByText(email), "settings shows account");
  await page.screenshot({ path: path.join(SHOTS, "10-settings.png"), fullPage: true });

  // ------------------------------------------------------------ Delete a memory
  await page.goto(`${BASE}/memories/${seeds[0]}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Delete this memory" }).click();
  await expectVisible(page, page.getByRole("heading", { name: "Delete this memory?" }), "delete asks for confirmation");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL(`${BASE}/`);
  const gone = await page.evaluate(async (id) => (await fetch(`/api/memories/${id}?expected-fail=1`, { credentials: "include" })).status, seeds[0]);
  step("deleted memory is gone (404)", gone === 404);

  // ------------------------------------------------------------ Mobile
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const m = await mobile.newPage();
  watch(m, "mobile");
  for (const [route, name] of [["/", "11-mobile-archive"], [memoryUrl.replace(BASE, ""), "12-mobile-detail"], ["/new", "13-mobile-create"], ["/ask", "14-mobile-ask"], ["/capsules", "15-mobile-capsules"]]) {
    await m.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await m.waitForTimeout(500);
    await m.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
    step(`no horizontal overflow on mobile ${route}`, (await overflow(m)) <= 0);
  }
  await expectVisible(m, m.locator(".tabbar"), "mobile tab bar visible");

  // Tablet
  const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 }, storageState: await ctx.storageState() });
  const t = await tablet.newPage();
  watch(t, "tablet");
  for (const route of ["/", memoryUrl.replace(BASE, ""), "/new"]) {
    await t.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    step(`no horizontal overflow on tablet ${route}`, (await overflow(t)) <= 0);
  }
  await t.screenshot({ path: path.join(SHOTS, "16-tablet-create.png"), fullPage: true });

  // ------------------------------------------------------------ Log out
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator(".account-trigger").click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.waitForURL(/\/welcome/);
  step("log out returns to welcome", true);
  const after = await page.evaluate(async () => (await fetch("/api/auth/session", { credentials: "include" })).json());
  step("session is cleared after logout", after.user === null);

  // ------------------------------------------------------------ fallbacks
  const rm = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const r = await rm.newPage();
  watch(r, "reduced-motion");
  await r.goto(`${BASE}/welcome`, { waitUntil: "networkidle" });
  await r.waitForTimeout(1500);
  await r.screenshot({ path: path.join(SHOTS, "17-welcome-reduced-motion.png") });
  step("reduced motion: welcome renders", (await r.locator(".haveli").getAttribute("class")).includes("haveli"));

  await browser.close();
  const noGl = await chromium.launch({ executablePath: CHROME, args: ["--disable-gpu", "--disable-webgl", "--disable-3d-apis"] });
  const ng = await (await noGl.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  watch(ng, "no-webgl");
  await ng.goto(`${BASE}/welcome`, { waitUntil: "networkidle" });
  await ng.waitForTimeout(2000);
  await ng.screenshot({ path: path.join(SHOTS, "18-welcome-no-webgl.png") });
  const ngMode = await ng.locator(".haveli").getAttribute("class");
  step("without WebGL the CSS illustration is used", ngMode.includes("haveli--fallback"), ngMode);
  await expectVisible(ng, ng.getByRole("button", { name: "Open my archive" }), "login still works without WebGL");
  await noGl.close();
} catch (error) {
  step("journey crashed", false, error.message);
  try {
    await browser.close();
  } catch {
    /* already closed */
  }
}

const unexpected = problems;
step("no unexpected console errors or failed requests", unexpected.length === 0, unexpected.join("\n   "));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
