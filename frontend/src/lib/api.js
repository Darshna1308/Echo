/*
  The single place the frontend talks to the Echo API.

  API_BASE
    ""  (default)  — same origin. In development Vite proxies /api to the
                     backend; in production Vercel rewrites /api to it.
                     This keeps the session cookie first-party.
    "https://..."  — call a backend on another domain directly
                     (requires COOKIE_SAMESITE=none on the backend).

  The session lives in an httpOnly cookie, so requests use
  credentials: "include" and no token is ever handled in JavaScript.
*/
export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], code = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.code = code;
  }

  fieldErrors() {
    const out = {};
    for (const e of this.errors || []) {
      const key = String(e.field || "").split(".")[0];
      if (key && !out[key]) out[key] = e.message;
    }
    return out;
  }
}

export const SESSION_EXPIRED_EVENT = "echo:session-expired";

/* Turns an API-relative path like "/api/media/1/file" into a loadable URL. */
export function apiUrl(path) {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_BASE}${path}`;
}

async function parse(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return null;
}

function failure(response, data) {
  if (response.status === 401 && data?.code === "SESSION_INVALID") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: data.message }));
  }
  let message = data?.message;
  if (!message) {
    message =
      response.status >= 500 || response.status === 0
        ? "Echo's server isn't responding right now. Please try again in a moment."
        : `The request failed (${response.status}).`;
  }
  return new ApiError(message, { status: response.status, errors: data?.errors, code: data?.code });
}

export async function api(path, { method = "GET", body, signal, query } = {}) {
  let url = `${API_BASE}/api${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("Echo can't reach its server. Check your connection and try again.", { status: 0 });
  }

  const data = await parse(response);
  if (!response.ok || data?.success === false) throw failure(response, data);
  return data;
}

/*
  Uploads one file with progress (fetch can't report upload progress).
  Resolves with the media object from the server.
*/
export function uploadMedia(file, { kind, durationSec, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/media/upload`);
    xhr.withCredentials = true;
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const data = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && data?.success) {
        resolve(data.media);
        return;
      }
      if (xhr.status === 401 && data?.code === "SESSION_INVALID") {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: data.message }));
      }
      reject(
        new ApiError(
          data?.message || (xhr.status === 413 ? "That file is too large." : "The upload failed. Please try again."),
          { status: xhr.status, code: data?.code }
        )
      );
    };
    xhr.onerror = () => reject(new ApiError("The upload was interrupted. Check your connection and try again.", { status: 0 }));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    if (signal) signal.addEventListener("abort", () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append("kind", kind);
    if (durationSec) form.append("durationSec", String(Math.round(durationSec)));
    form.append("file", file, file.name || (kind === "audio" ? "recording.webm" : "photo.jpg"));
    xhr.send(form);
  });
}
