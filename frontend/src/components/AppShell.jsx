import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useToast } from "./ui/Toast";
import { Wordmark } from "./Brand";
import "./AppShell.css";

const NAV = [
  { to: "/", label: "Archive", end: true, icon: "archive" },
  { to: "/ask", label: "Ask Echo", icon: "ask" },
  { to: "/new", label: "Preserve", icon: "plus", primary: true },
  { to: "/on-this-day", label: "On this day", icon: "sun" },
  { to: "/capsules", label: "Capsules", icon: "seal" },
];

function Icon({ name }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "archive":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M4 21V10a8 8 0 0 1 16 0v11M4 21h16M9 21v-6a3 3 0 0 1 6 0v6" />
        </svg>
      );
    case "ask":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5L5 18.5ZM9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.7-.9 1.2M12 14.2v.1" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M12 5v14M5 12h14" />
        </svg>
      );
    case "sun":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M3 18h18M7 18a5 5 0 0 1 10 0M12 4v3M4.9 9.9l2 1.4M19.1 9.9l-2 1.4" />
        </svg>
      );
    case "seal":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M12 3.5 14 5l2.4-.2.8 2.3 2.1 1.2-.5 2.4.9 2.3-1.8 1.6-.4 2.4-2.4.3L12 19l-2.1-1.7-2.4-.3-.4-2.4L5.3 13l.9-2.3-.5-2.4 2.1-1.2.8-2.3L11 5Z" />
          <circle {...common} cx="12" cy="11.3" r="2.6" />
        </svg>
      );
    default:
      return null;
  }
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const [lastPath, setLastPath] = useState(location.pathname);

  // Close the menu when the route changes.
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();

  const handleLogout = async () => {
    setOpen(false);
    await logout().catch(() => {});
    toast.show("You've logged out. Your archive is safe.");
    navigate("/welcome", { replace: true });
  };

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="account-initial" aria-hidden="true">
          {initial}
        </span>
        <span className="account-name">{user?.name}</span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <p className="account-email">{user?.email}</p>
          <Link role="menuitem" to="/settings" className="account-item">
            Settings &amp; privacy
          </Link>
          <button role="menuitem" type="button" className="account-item" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <div className="shell-header-inner">
          <Link to="/" className="shell-brand" aria-label="Echo — your archive">
            <Wordmark />
          </Link>
          <nav className="shell-nav" aria-label="Main">
            {NAV.filter((n) => !n.primary).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="shell-link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="shell-actions">
            <NavLink to="/new" className="btn btn--primary btn--small shell-preserve">
              Preserve a memory
            </NavLink>
            <AccountMenu />
          </div>
        </div>
        <div className="shell-jaali" aria-hidden="true" />
      </header>

      <main id="main" className="shell-main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={`tabbar-link${item.primary ? " tabbar-link--primary" : ""}`}>
            <span className="tabbar-icon">
              <Icon name={item.icon} />
            </span>
            <span className="tabbar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
