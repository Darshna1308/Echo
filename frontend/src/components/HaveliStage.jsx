import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/motion";
import "./HaveliStage.css";

/*
  Hosts the 3D welcome scene. Three.js is loaded only after the page (and
  its login form) has rendered, so the scene never delays signing in.
  A CSS illustration is shown first and stays if WebGL is unavailable.
*/
export default function HaveliStage({ children }) {
  const hostRef = useRef(null);
  const reduced = useReducedMotion();
  const [mode, setMode] = useState("fallback"); // fallback | webgl

  useEffect(() => {
    let dispose = null;
    let cancelled = false;
    const host = hostRef.current;

    const start = async () => {
      try {
        const { createHaveliScene, webglAvailable } = await import("../three/haveliScene.js");
        if (cancelled || !host || !webglAvailable()) return;
        dispose = createHaveliScene(host, {
          reducedMotion: reduced,
          onReady: () => !cancelled && setMode("webgl"),
        });
      } catch {
        // Any failure keeps the CSS illustration — the page still works.
        if (!cancelled) setMode("fallback");
      }
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 1200 })
      : window.setTimeout(start, 200);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback && typeof idle === "number") window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      dispose?.();
    };
  }, [reduced]);

  return (
    <div className={`haveli haveli--${mode}`}>
      <div className="haveli-fallback" aria-hidden="true">
        <div className="hf-wall">
          <div className="hf-frame">
            <div className="hf-window" />
          </div>
          <div className="hf-niche hf-niche--l" />
          <div className="hf-niche hf-niche--r" />
        </div>
        <div className="hf-floor">
          <div className="hf-light" />
        </div>
      </div>
      <div className="haveli-host" ref={hostRef} data-testid="haveli-host" />
      <div className="haveli-scrim" aria-hidden="true" />
      <div className="haveli-content">{children}</div>
    </div>
  );
}
