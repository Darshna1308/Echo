import { useEffect } from "react";
import { useReducedMotion } from "../hooks/motion";
import "./SealMoment.css";

/*
  The moment a memory is preserved: a wax seal (mohar) is pressed onto the
  page, then Echo opens the saved memory. Skipped for reduced motion.
*/
export default function SealMoment({ title, onDone }) {
  const reduced = useReducedMotion();

  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 50 : 1500);
    return () => clearTimeout(t);
  }, [onDone, reduced]);

  return (
    <div className="seal-moment" role="status" aria-live="assertive">
      <div className="seal-stage">
        <div className="seal-wax" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <defs>
              <radialGradient id="wax" cx="40%" cy="35%" r="70%">
                <stop offset="0" stopColor="#c86a4c" />
                <stop offset=".6" stopColor="#a94f36" />
                <stop offset="1" stopColor="#7c3522" />
              </radialGradient>
            </defs>
            <path
              d="M60 6c7 0 9 6 15 8s12-2 16 4 0 11 3 17 9 8 8 15-7 8-8 14 4 11-1 16-11 3-16 6-7 9-14 10-9-5-15-6-11 3-15-2-1-11-5-16-10-7-9-14 6-9 6-15-4-11 1-15 11-1 15-5 6-11 12-12 8 4 13 3z"
              fill="url(#wax)"
            />
            <circle cx="60" cy="60" r="33" fill="none" stroke="#7c3522" strokeWidth="2" opacity=".55" />
            <path
              d="M44 84V58c0-3 1-5 3-6 0-5 4-9 8-9 1-3 3-5 5-5s4 2 5 5c4 0 8 4 8 9 2 1 3 3 3 6v26"
              fill="none"
              stroke="#f3cdb8"
              strokeWidth="3"
              strokeLinejoin="round"
              opacity=".9"
            />
          </svg>
        </div>
        <p className="seal-text">Preserved.</p>
        <p className="seal-title">{title}</p>
      </div>
    </div>
  );
}
