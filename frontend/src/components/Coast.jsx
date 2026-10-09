import { useEffect, useId } from "react";

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7) % 100,
  size: 2 + (i % 3),
  delay: -(i * 1.7),
  dur: 14 + (i % 5) * 3,
  dx: (i % 2 ? 1 : -1) * (10 + (i % 4) * 8),
}));

/* Fixed environment: sky, sun, distant sea, tide, wet sand, drifting sand */
export function Scene() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      document.documentElement.style.setProperty("--scroll", String(window.scrollY));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-inner">
        <div className="scene-sky" />
        <div className="scene-sun" />
        <div className="scene-sea">
          <div className="scene-glint" />
        </div>
        <div className="scene-tide">
          <div className="scene-foam" />
          <div className="scene-foam scene-foam-2" />
        </div>
        <div className="scene-wet" />
      </div>
      <div className="scene-particles">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            style={{
              "--x": `${p.x}%`,
              "--y": `${p.y}%`,
              "--s": `${p.size}px`,
              "--delay": `${p.delay}s`,
              "--d": `${p.dur}s`,
              "--dx": `${p.dx}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* Wrapper that gives an object parallax + slow float */
export function Obj({ className = "", par = 0, rot = 0, style, children }) {
  return (
    <div
      className={`obj ${className}`}
      style={{ "--par": par, "--rot": `${rot}deg`, ...style }}
      aria-hidden="true"
    >
      <div className="obj-float">{children}</div>
    </div>
  );
}

export function Shell() {
  const id = useId().replace(/:/g, "");
  const tips = [[14, 50], [20, 34], [32, 22], [46, 13], [60, 9], [74, 13], [88, 22], [100, 34], [106, 50]];
  return (
    <svg viewBox="0 0 120 120">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF6EA" />
          <stop offset=".5" stopColor="#F2D3BE" />
          <stop offset="1" stopColor="#D6A387" />
        </linearGradient>
        <radialGradient id={`${id}b`} cx=".35" cy=".25" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}c`}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="64" cy="110" rx="40" ry="6" fill="#17324D" opacity=".2" filter={`url(#${id}c)`} />
      <path
        d="M60 104 C30 98 8 72 14 46 C17 30 28 22 38 20 C42 10 54 6 60 6 C66 6 78 10 82 20 C92 22 103 30 106 46 C112 72 90 98 60 104Z"
        fill={`url(#${id}a)`}
        stroke="#C48E70"
        strokeWidth=".8"
      />
      <g stroke="#B9805F" strokeOpacity=".38" strokeWidth="1.4" strokeLinecap="round" fill="none">
        {tips.map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M60 100 L${x} ${y}`} />
        ))}
        <path d="M24 62 Q60 42 96 62" strokeOpacity=".22" />
        <path d="M32 80 Q60 64 88 80" strokeOpacity=".22" />
      </g>
      <path d="M48 104 Q60 92 72 104 L67 113 Q60 117 53 113Z" fill="#E4BDA0" stroke="#C48E70" strokeWidth=".6" />
      <ellipse cx="42" cy="38" rx="26" ry="18" fill={`url(#${id}b)`} transform="rotate(-24 42 38)" />
    </svg>
  );
}

export function Bottle() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 70 170">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A8DADC" stopOpacity=".55" />
          <stop offset=".5" stopColor="#E8F6F3" stopOpacity=".28" />
          <stop offset="1" stopColor="#A8DADC" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#F4E7C8" />
          <stop offset=".5" stopColor="#FFFBF0" />
          <stop offset="1" stopColor="#E6D5B2" />
        </linearGradient>
        <linearGradient id={`${id}k`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B88A5C" />
          <stop offset="1" stopColor="#8E6A44" />
        </linearGradient>
        <filter id={`${id}s`}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="38" cy="164" rx="28" ry="5" fill="#17324D" opacity=".22" filter={`url(#${id}s)`} />
      <path d="M9 138 Q36 129 61 138 V141 C61 152 55 158 46 158 L24 158 C15 158 9 152 9 141Z" fill="#E8D5AE" opacity=".8" />
      <g transform="rotate(-6 36 108)">
        <rect x="22" y="80" width="28" height="56" rx="6" fill={`url(#${id}p)`} stroke="#CDB98E" strokeWidth=".6" />
        <ellipse cx="36" cy="81" rx="14" ry="4" fill="#EADBBE" stroke="#CDB98E" strokeWidth=".6" />
        <g stroke="#8A6D4B" strokeOpacity=".5" strokeWidth=".8" strokeLinecap="round">
          <path d="M27 92 H45" /><path d="M27 98 H42" /><path d="M27 104 H45" /><path d="M27 110 H38" />
        </g>
        <rect x="22" y="118" width="28" height="3" fill="#E98973" />
      </g>
      <path
        d="M26 40 C26 30 28 26 28 18 L42 18 C42 26 44 30 44 40 C60 48 62 62 62 80 L62 140 C62 152 56 158 46 158 L24 158 C14 158 8 152 8 140 L8 80 C8 62 10 48 26 40Z"
        fill={`url(#${id}g)`}
        stroke="#176B87"
        strokeOpacity=".4"
        strokeWidth="1"
      />
      <path d="M14 84 C13 100 13 124 15 142" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M54 70 C56 82 56 96 55 108" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <rect x="27" y="3" width="16" height="17" rx="2.5" fill={`url(#${id}k)`} />
      <g stroke="#6F4F30" strokeOpacity=".35" strokeWidth=".7">
        <path d="M30 6 V17" /><path d="M35 5 V18" /><path d="M40 6 V17" />
      </g>
    </svg>
  );
}

export function Stone() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 60">
      <defs>
        <radialGradient id={`${id}a`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#F2ECE1" />
          <stop offset=".55" stopColor="#B9AF9D" />
          <stop offset="1" stopColor="#857B6A" />
        </radialGradient>
        <filter id={`${id}b`}>
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <ellipse cx="52" cy="50" rx="38" ry="6" fill="#17324D" opacity=".25" filter={`url(#${id}b)`} />
      <path d="M8 36 C8 16 30 8 52 10 C78 12 94 24 90 38 C86 50 60 52 38 51 C18 50 8 46 8 36Z" fill={`url(#${id}a)`} />
      <path d="M20 30 C38 22 62 24 80 34" stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <ellipse cx="36" cy="20" rx="14" ry="5" fill="#fff" opacity=".35" transform="rotate(-12 36 20)" />
      <g fill="#6B6252" opacity=".45">
        <circle cx="58" cy="38" r=".9" /><circle cx="66" cy="31" r=".7" /><circle cx="46" cy="42" r=".8" /><circle cx="72" cy="40" r=".7" />
      </g>
    </svg>
  );
}

export function Boat() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 90">
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFDF6" />
          <stop offset="1" stopColor="#E9DCBF" />
        </linearGradient>
        <filter id={`${id}s`}>
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <ellipse cx="62" cy="80" rx="42" ry="4" fill="#17324D" opacity=".22" filter={`url(#${id}s)`} />
      <polygon points="60,8 60,56 22,56" fill="#FFF9EF" stroke="#D8C9A6" strokeWidth=".7" />
      <polygon points="60,18 60,56 96,56" fill="#EADFC8" stroke="#D8C9A6" strokeWidth=".7" />
      <polygon points="10,56 110,56 92,74 28,74" fill={`url(#${id}h)`} stroke="#D8C9A6" strokeWidth=".7" />
      <polygon points="10,56 60,56 60,74 28,74" fill="#C9B88F" opacity=".25" />
      <path d="M0 78 C15 71 30 85 45 78 S75 71 90 78 S110 84 120 78" stroke="#2A9D8F" strokeOpacity=".5" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M0 84 C15 78 30 90 45 84 S75 78 90 84 S110 88 120 84" stroke="#A8DADC" strokeOpacity=".7" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Driftwood() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 200 54">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C4A883" />
          <stop offset="1" stopColor="#8C7255" />
        </linearGradient>
        <filter id={`${id}b`}>
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <ellipse cx="100" cy="46" rx="86" ry="5" fill="#17324D" opacity=".2" filter={`url(#${id}b)`} />
      <path d="M4 30 C30 18 60 22 90 20 C130 16 160 8 196 14 C190 22 176 26 150 28 C110 34 70 40 40 40 C20 40 8 38 4 30Z" fill={`url(#${id}a)`} />
      <g stroke="#5E4730" strokeOpacity=".35" strokeWidth="1" fill="none" strokeLinecap="round">
        <path d="M14 30 C50 24 90 26 130 20" />
        <path d="M30 35 C70 32 110 30 160 22" />
        <path d="M50 38 C90 36 120 34 150 27" />
      </g>
      <ellipse cx="72" cy="28" rx="5" ry="3" fill="#6E5539" opacity=".5" />
    </svg>
  );
}

export function Polaroid({ caption }) {
  return (
    <div className="polaroid">
      <div className="polaroid-img" />
      {caption && <span className="polaroid-caption">{caption}</span>}
    </div>
  );
}