import "./CapsuleDoor.css";

/*
  A pair of carved haveli doors under an arch. Closed while the capsule is
  sealed; the leaves swing open (in 3D) once it has been opened.
*/
export default function CapsuleDoor({ open = false, ready = false, size = "card" }) {
  return (
    <div className={`door door--${size}${open ? " is-open" : ""}${ready ? " is-ready" : ""}`} aria-hidden="true">
      <div className="door-inner">
        <div className="door-glow" />
        <div className="door-leaf door-leaf--l">
          <span className="door-panel" />
          <span className="door-panel" />
        </div>
        <div className="door-leaf door-leaf--r">
          <span className="door-panel" />
          <span className="door-panel" />
        </div>
        {!open && <span className="door-lock" />}
      </div>
    </div>
  );
}
