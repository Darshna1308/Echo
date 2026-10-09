import { Scene } from "./Coast";

function Navbar({ currentPage, setCurrentPage }) {
  return (
    <>
      <Scene />

      <header className="echo-header">
        <nav className="echo-nav" aria-label="Main navigation">
          <div className="echo-brand">
            <svg className="echo-brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <path
                d="M3 13c3-3.5 5.5-3.5 8.5 0s5.5 3.5 8.5 0 5.5-3.5 9 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M3 20c3-3.5 5.5-3.5 8.5 0s5.5 3.5 8.5 0 5.5-3.5 9 0"
                fill="none"
                stroke="#2A9D8F"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity=".8"
              />
              <circle cx="24" cy="6" r="2" fill="#E9C46A" />
            </svg>
            <strong className="echo-brand-name">Echo</strong>
          </div>

          <div className="echo-nav-links">
            <button
              className={`echo-nav-link ${currentPage === "timeline" ? "is-active" : ""}`}
              aria-current={currentPage === "timeline" ? "page" : undefined}
              onClick={() => setCurrentPage("timeline")}
            >
              Timeline
            </button>

            <button
              className={`echo-nav-link ${currentPage === "create" ? "is-active" : ""}`}
              aria-current={currentPage === "create" ? "page" : undefined}
              onClick={() => setCurrentPage("create")}
            >
              Create Memory
            </button>
          </div>
        </nav>
      </header>
    </>
  );
}

export default Navbar;