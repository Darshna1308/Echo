/*
  Echo's mark: a small cusped arch (jharokha) with a lattice line,
  drawn as an original SVG for this project.
*/
export function ArchMark({ size = 28, className = "" }) {
  return (
    <svg className={className} width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden="true">
      <path
        d="M3 45 V18 C3 16 4 14 5.5 13 C6 9 9 6 12.5 5.5 C14 2.5 17 1 20 1 C23 1 26 2.5 27.5 5.5 C31 6 34 9 34.5 13 C36 14 37 16 37 18 V45"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M11 45 V23 C11 18 15 14 20 14 C25 14 29 18 29 23 V45" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".55" />
      <path d="M11 31 H29 M11 38 H29 M20 14 V45" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <ArchMark className="wordmark-mark" size={24} />
      <span className="wordmark-text">Echo</span>
    </span>
  );
}
