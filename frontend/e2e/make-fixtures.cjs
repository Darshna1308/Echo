/*
  Generates the test images and audio used by e2e/journey.mjs.
  Uses `sharp` from the backend's dependencies (run `npm install` in backend/ first).
    node e2e/make-fixtures.cjs
  These are simple generated illustrations for testing only, not real memories.
*/
const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "..", "..", "backend", "node_modules", "sharp"));

const out = path.join(__dirname, "fixtures");
fs.mkdirSync(out, { recursive: true });

const scenes = [
  ["dusk", 1000, 700, ["#20365b", "#c86a4c", "#f2c48a"], '<circle cx="620" cy="420" r="70" fill="#ffe2b3"/><rect y="470" width="1000" height="230" fill="#5c3a24"/>'],
  ["courtyard", 1000, 700, ["#f6d9a6", "#e6c29d", "#c88b5a"], '<path d="M380 700V330a120 120 0 0 1 240 0v370" fill="#7a5236"/><rect y="620" width="1000" height="80" fill="#9c6438"/>'],
  ["lake", 1000, 700, ["#9cc5d6", "#dcecea", "#4e9a99"], '<ellipse cx="500" cy="560" rx="600" ry="90" fill="#315d91" opacity=".7"/><rect x="420" y="300" width="160" height="200" fill="#efe3d0"/>'],
  ["lamps", 1000, 700, ["#29251f", "#6b4c33", "#b08d57"], '<circle cx="300" cy="380" r="40" fill="#ffbf73"/><circle cx="500" cy="340" r="40" fill="#ffbf73"/><circle cx="700" cy="380" r="40" fill="#ffbf73"/>'],
  ["portrait", 800, 1000, ["#efe3d0", "#d9c8b1", "#a94f36"], '<circle cx="400" cy="300" r="110" fill="#7a5236"/><rect x="260" y="420" width="280" height="400" rx="120" fill="#a94f36"/>'],
];

(async () => {
  for (const [name, w, h, c, extra] of scenes) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".6" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${extra}</svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(path.join(out, `${name}.jpg`));
  }

  // Two-second 440 Hz tone as a WAV file.
  const rate = 16000;
  const samples = rate * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    wav.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000 * Math.min(1, (samples - i) / 2000)), 44 + i * 2);
  }
  fs.writeFileSync(path.join(out, "voice.wav"), wav);
  fs.writeFileSync(path.join(out, "not-an-image.jpg"), "this is text, not an image");
  console.log(`Fixtures written to ${out}`);
})();
