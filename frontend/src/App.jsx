import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router";

import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./components/ui/Toast";
import { PageLoader } from "./components/ui";
import AppShell from "./components/AppShell";
import Archive from "./pages/Archive";

// Pages other than the archive are loaded on demand to keep the first load small.
const Welcome = lazy(() => import("./pages/Welcome"));
const MemoryNew = lazy(() => import("./pages/MemoryNew"));
const MemoryEdit = lazy(() => import("./pages/MemoryEdit"));
const MemoryView = lazy(() => import("./pages/MemoryView"));
const Ask = lazy(() => import("./pages/Ask"));
const OnThisDay = lazy(() => import("./pages/OnThisDay"));
const Capsules = lazy(() => import("./pages/Capsules"));
const CapsuleView = lazy(() => import("./pages/CapsuleView"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

function Page({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

function RequireAuth() {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "checking") return <PageLoader label="Opening your archive…" />;
  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={next === "/" ? "/welcome" : `/welcome?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

function PublicOnly() {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "checking") return <PageLoader label="Opening Echo…" />;
  if (user) {
    const next = new URLSearchParams(location.search).get("next");
    // Only allow internal paths as a redirect target.
    return <Navigate to={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} replace />;
  }
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [{ path: "/welcome", element: <Page><Welcome /></Page> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Archive /> },
          { path: "new", element: <Page><MemoryNew /></Page> },
          { path: "memories/:id", element: <Page><MemoryView /></Page> },
          { path: "memories/:id/edit", element: <Page><MemoryEdit /></Page> },
          { path: "ask", element: <Page><Ask /></Page> },
          { path: "on-this-day", element: <Page><OnThisDay /></Page> },
          { path: "capsules", element: <Page><Capsules /></Page> },
          { path: "capsules/:id", element: <Page><CapsuleView /></Page> },
          { path: "settings", element: <Page><Settings /></Page> },
          { path: "*", element: <Page><NotFound /></Page> },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  );
}
