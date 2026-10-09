/*
  The welcome scene: standing inside a haveli room, looking at a carved
  jharokha window. Desert sunlight passes through the jaali screen and
  throws its lattice across the floor; the light drifts slowly, as it
  would over an afternoon.

  All geometry and textures are generated in code (no downloaded assets).
  Performance rules:
    - renders at ~30 fps, and only while the scene is on screen and the tab
      is visible; with reduced motion it renders a single still frame
    - device pixel ratio capped at 1.5, one shadow-casting light
    - everything is disposed when the page unmounts
*/
import * as THREE from "three";

const SANDSTONE = new THREE.Color("#c88b5a");

/* ---------- procedural textures ---------- */

function canvasTexture(size, draw, { srgb = true, repeat = [1, 1] } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx, size, count, colors, maxR) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.05 + Math.random() * 0.12;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, Math.random() * maxR + 0.5, Math.random() * maxR + 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* Sandstone floor slabs. */
function floorTexture() {
  return canvasTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = "#c4936a";
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 2600, ["#a8744c", "#e0b88f", "#b98257", "#d9a679"], 3);
      ctx.strokeStyle = "rgba(92, 58, 32, 0.38)";
      ctx.lineWidth = 2;
      const slab = s / 2;
      for (let y = 0; y <= s; y += slab) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y);
        ctx.stroke();
      }
      for (let row = 0; row < 2; row += 1) {
        const off = row % 2 ? slab / 2 : 0;
        for (let x = off; x <= s; x += slab) {
          ctx.beginPath();
          ctx.moveTo(x, row * slab);
          ctx.lineTo(x, (row + 1) * slab);
          ctx.stroke();
        }
      }
    },
    { repeat: [3, 3] }
  );
}

/* Lime-plastered walls. */
function plasterTexture() {
  return canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = "#e3cdb0";
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 900, ["#cdb08c", "#f0dfc6", "#d6bb97"], 6);
    },
    { repeat: [3, 2] }
  );
}

/*
  Jaali alpha map: white = stone, black = holes. One tile holds a
  quatrefoil (four-petal) opening with small diamonds at the corners.
*/
function jaaliAlpha() {
  return canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = "#000";
      const c = s / 2;
      const r = s * 0.13;
      const d = s * 0.14;
      for (const [dx, dy] of [[0, -d], [0, d], [-d, 0], [d, 0]]) {
        ctx.beginPath();
        ctx.arc(c + dx, c + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const k = s * 0.07;
      for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) {
        ctx.beginPath();
        ctx.moveTo(x, y - k);
        ctx.lineTo(x + k, y);
        ctx.lineTo(x, y + k);
        ctx.lineTo(x - k, y);
        ctx.closePath();
        ctx.fill();
      }
    },
    { srgb: false }
  );
}

function skyTexture() {
  return canvasTexture(
    64,
    (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "#f6d9a6");
      g.addColorStop(0.55, "#fbe9c8");
      g.addColorStop(1, "#fff6e4");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    },
    { repeat: [1, 1] }
  );
}

/* ---------- geometry ---------- */

/*
  A cusped (multifoil) arch outline, as a THREE.Path, centred at x=0 with
  its sill at y=0. Lobes bulge outward between cusp points.
*/
function archPath(path, width, springY, rise, lobes = 9) {
  const half = width / 2;
  path.moveTo(-half, 0);
  path.lineTo(-half, springY);
  let prev = [-half, springY];
  for (let i = 1; i <= lobes; i += 1) {
    const phi = Math.PI * (1 - i / lobes);
    const x = half * Math.cos(phi);
    const y = springY + rise * Math.sin(phi) + 0.06 * rise * Math.pow(Math.sin(phi), 14);
    const mx = (prev[0] + x) / 2;
    const my = (prev[1] + y) / 2;
    // Control point pushed outward from the arch centre makes the lobe.
    const nx = mx;
    const ny = my - springY;
    const len = Math.hypot(nx, ny) || 1;
    const bulge = Math.hypot(x - prev[0], y - prev[1]) * 0.42;
    path.quadraticCurveTo(mx + (nx / len) * bulge, my + (ny / len) * bulge, x, y);
    prev = [x, y];
  }
  path.lineTo(half, 0);
  path.lineTo(-half, 0);
  return path;
}

function archShape(width, springY, rise) {
  return archPath(new THREE.Shape(), width, springY, rise);
}

function archHole(width, springY, rise, offsetX = 0, offsetY = 0) {
  const p = archPath(new THREE.Path(), width, springY, rise);
  if (offsetX || offsetY) {
    const pts = p.getPoints(12).map((v) => new THREE.Vector2(v.x + offsetX, v.y + offsetY));
    return new THREE.Path(pts.reverse());
  }
  return p;
}

/* ---------- scene ---------- */

export function createHaveliScene(container, { reducedMotion = false, onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = reducedMotion ? 1.05 : 0.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.className = "haveli-canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2a2119");
  scene.fog = new THREE.Fog("#2a2119", 9, 18);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
  const lookAt = new THREE.Vector3(0, 1.55, -4);
  let frames = 0;

  const disposables = [];
  const track = (thing) => {
    disposables.push(thing);
    return thing;
  };

  // Textures
  const floorMap = track(floorTexture());
  const plasterMap = track(plasterTexture());
  const jaaliMap = track(jaaliAlpha());
  jaaliMap.repeat.set(1 / 0.24, 1 / 0.24);
  const skyMap = track(skyTexture());

  // Materials
  const floorMat = track(new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.92, metalness: 0 }));
  const wallMat = track(new THREE.MeshStandardMaterial({ map: plasterMap, roughness: 0.96, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }));
  const stoneMat = track(new THREE.MeshStandardMaterial({ color: SANDSTONE, roughness: 0.82 }));
  const jaaliMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d9a676"),
      roughness: 0.85,
      alphaMap: jaaliMap,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    })
  );
  const jaaliDepth = track(
    new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: jaaliMap, alphaTest: 0.5, side: THREE.DoubleSide })
  );

  // Floor
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(14, 14)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall with the jharokha opening and two small niches.
  const WIN_W = 2.5;
  const SILL = 0.55;
  const SPRING = 2.35;
  const RISE = 1.05;
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-7, 0);
  wallShape.lineTo(7, 0);
  wallShape.lineTo(7, 6);
  wallShape.lineTo(-7, 6);
  wallShape.lineTo(-7, 0);
  wallShape.holes.push(archHole(WIN_W, SPRING, RISE, 0, SILL));
  const backWall = new THREE.Mesh(track(new THREE.ShapeGeometry(wallShape, 24)), wallMat);
  backWall.position.z = -4;
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  scene.add(backWall);

  // Carved frame around the window: an extruded arch ring with depth.
  const frameShape = archShape(WIN_W + 0.56, SPRING + 0.1, RISE + 0.34);
  frameShape.holes.push(archHole(WIN_W, SPRING, RISE, 0, 0.02));
  const frameGeo = track(new THREE.ExtrudeGeometry(frameShape, { depth: 0.42, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 16 }));
  const frame = new THREE.Mesh(frameGeo, stoneMat);
  frame.position.set(0, SILL, -4.2);
  frame.castShadow = true;
  frame.receiveShadow = true;
  scene.add(frame);

  // Projecting sill / balcony ledge with brackets.
  const ledge = new THREE.Mesh(track(new THREE.BoxGeometry(WIN_W + 1.1, 0.16, 0.9)), stoneMat);
  ledge.position.set(0, SILL - 0.08, -3.75);
  ledge.castShadow = true;
  ledge.receiveShadow = true;
  scene.add(ledge);
  const bracketGeo = track(new THREE.BoxGeometry(0.18, 0.3, 0.55));
  for (const x of [-WIN_W / 2 - 0.15, WIN_W / 2 + 0.15]) {
    const bracket = new THREE.Mesh(bracketGeo, stoneMat);
    bracket.position.set(x, SILL - 0.3, -3.78);
    bracket.castShadow = true;
    scene.add(bracket);
  }

  // Chhajja: a sloping stone eave above the arch.
  const eave = new THREE.Mesh(track(new THREE.BoxGeometry(WIN_W + 1.3, 0.12, 0.85)), stoneMat);
  eave.position.set(0, SILL + SPRING + RISE + 0.5, -3.7);
  eave.rotation.x = 0.18;
  eave.castShadow = true;
  scene.add(eave);

  // The jaali screen fills the arch.
  const jaali = new THREE.Mesh(track(new THREE.ShapeGeometry(archShape(WIN_W, SPRING, RISE), 24)), jaaliMat);
  jaali.position.set(0, SILL, -4.05);
  jaali.castShadow = true;
  jaali.customDepthMaterial = jaaliDepth;
  scene.add(jaali);

  // Bright desert sky beyond the window.
  const sky = new THREE.Mesh(track(new THREE.PlaneGeometry(16, 9)), track(new THREE.MeshBasicMaterial({ map: skyMap, toneMapped: false, fog: false })));
  sky.position.set(0, 2.5, -7);
  scene.add(sky);

  // Side walls (catch some bounce light, frame the view).
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(track(new THREE.PlaneGeometry(10, 6)), wallMat);
    wall.position.set(side * 4.2, 3, 0.5);
    wall.rotation.y = -side * Math.PI / 2;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  // A small arched niche (taak) holding a lamp-lit keepsake.
  const nicheBackMat = track(new THREE.MeshStandardMaterial({ color: "#7a5236", roughness: 1 }));
  const keepsakeMat = track(new THREE.MeshStandardMaterial({ color: "#fff3dc", emissive: new THREE.Color("#ffbf73"), emissiveIntensity: 0.55, roughness: 0.6 }));
  const keepsakes = [];
  for (const side of [1]) {
    const niche = new THREE.Mesh(track(new THREE.ShapeGeometry(archShape(0.62, 0.55, 0.28), 12)), nicheBackMat);
    niche.position.set(side * 1.95, 1.55, -3.985);
    scene.add(niche);
    const card = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.34, 0.02)), keepsakeMat);
    card.position.set(side * 1.95, 1.78, -3.95);
    card.rotation.z = side * 0.08;
    scene.add(card);
    keepsakes.push(card);
    const glow = new THREE.PointLight("#ffb766", 0.9, 1.6, 2);
    glow.position.set(side * 1.95, 1.85, -3.7);
    scene.add(glow);
  }

  // Lighting: a warm low sun outside, a dim indigo/sand bounce inside.
  const hemi = new THREE.HemisphereLight("#8a97b8", "#b0743f", 0.8);
  scene.add(hemi);
  // Soft fill from the room side so the carved frame reads.
  const fill = new THREE.DirectionalLight("#ffcf9a", 0.45);
  fill.position.set(-2, 3, 6);
  scene.add(fill);
  // Warm bounce from the sunlit floor onto the walls.
  const bounce = new THREE.PointLight("#ffb978", 4, 9, 1.6);
  bounce.position.set(0, 0.6, 0.6);
  scene.add(bounce);
  const sun = new THREE.DirectionalLight("#ffd6a0", 6.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  const sc = sun.shadow.camera;
  sc.left = -5;
  sc.right = 5;
  sc.top = 6;
  sc.bottom = -4;
  sc.near = 1;
  sc.far = 30;
  sun.target.position.set(0, 0, 1.2);
  scene.add(sun, sun.target);

  // Dust drifting in the light.
  const DUST = 90;
  const dustPositions = new Float32Array(DUST * 3);
  const dustSeeds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i += 1) {
    // Inside the slanting shaft of light between the window and the floor.
    const along = Math.random();
    dustPositions[i * 3] = (Math.random() - 0.5) * 2.2;
    dustPositions[i * 3 + 1] = 0.3 + (1 - along) * 2.8 + (Math.random() - 0.5) * 0.9;
    dustPositions[i * 3 + 2] = -3.7 + along * 4.6;
    dustSeeds[i] = Math.random() * Math.PI * 2;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeo,
    track(new THREE.PointsMaterial({ color: "#ffe2b3", size: 0.016, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }))
  );
  scene.add(dust);

  // ---------- animation ----------
  let width = 1;
  let height = 1;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const start = performance.now();
  let raf = 0;
  let lastFrame = 0;
  let visible = true;
  let pageVisible = !document.hidden;
  let disposed = false;

  function placeSun(t) {
    // Swings slowly across the window over ~70 seconds.
    const swing = reducedMotion ? 0.35 : Math.sin(t * 0.09) * 0.9;
    sun.position.set(swing * 6, 7.2, -13);
  }

  function placeCamera() {
    // Wide stages: the window sits right of centre, leaving the wall on the
    // left for the headline. Narrow (phone) stages: centred and lower.
    const narrow = width / height < 0.9;
    const offsetX = narrow ? 0 : -1.25;
    const baseZ = narrow ? 6.6 : 5.2;
    lookAt.set(offsetX, narrow ? 1.9 : 1.75, -4);
    camera.position.set(offsetX * 0.6 + pointer.x * 0.45, 1.6 + pointer.y * -0.22, baseZ);
    camera.lookAt(lookAt);
  }

  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width / height < 0.9 ? 54 : 46;
    camera.updateProjectionMatrix();
    placeCamera();
    if (reducedMotion || !raf) renderer.render(scene, camera);
  }

  function frameLoop(now) {
    raf = 0;
    if (disposed || !visible || !pageVisible) return;
    raf = requestAnimationFrame(frameLoop);
    if (now - lastFrame < 32) return; // ~30 fps is plenty for slow light
    lastFrame = now;
    const t = (now - start) / 1000;

    // Opening: light "enters" the room over the first ~1.6s.
    renderer.toneMappingExposure = Math.min(1.05, 0.15 + (t / 1.6) * 0.9);

    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    placeSun(t);
    placeCamera();

    const pos = dustGeo.attributes.position;
    for (let i = 0; i < DUST; i += 1) {
      const seed = dustSeeds[i];
      pos.array[i * 3 + 1] += Math.sin(t * 0.3 + seed) * 0.0009 + 0.0006;
      pos.array[i * 3] += Math.cos(t * 0.2 + seed) * 0.0007;
      if (pos.array[i * 3 + 1] > 3.4) pos.array[i * 3 + 1] = 0.3;
    }
    pos.needsUpdate = true;
    keepsakes.forEach((k, i) => {
      k.material.emissiveIntensity = 0.5 + Math.sin(t * 1.3 + i * 2) * 0.06;
    });

    renderer.render(scene, camera);
    frames += 1;
    container.dataset.frames = String(frames);
  }

  function play() {
    if (reducedMotion || disposed) {
      renderer.render(scene, camera);
      return;
    }
    if (!raf && visible && pageVisible) raf = requestAnimationFrame(frameLoop);
  }

  const onPointer = (event) => {
    const rect = container.getBoundingClientRect();
    pointer.tx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  };
  const onVisibility = () => {
    pageVisible = !document.hidden;
    play();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    play();
  });
  io.observe(container);
  if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);

  placeSun(0);
  resize();
  renderer.render(scene, camera);
  onReady?.();
  play();

  return function dispose() {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", onVisibility);
    disposables.forEach((d) => d.dispose?.());
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  };
}

export function webglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(window.WebGL2RenderingContext && canvas.getContext("webgl2")) || Boolean(canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
