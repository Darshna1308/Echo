import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted fonts (SIL Open Font License) — no third-party font requests.
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource-variable/dm-sans";
import "@fontsource/kalam/400.css";

import "./styles/tokens.css";
import "./styles/base.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
