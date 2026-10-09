import { useEffect, useState } from "react";
import { api } from "./api";

let cached = null;
let pending = null;

const FALLBACK = { chat: false, embeddings: false, transcription: false, maxImageMb: 12, maxAudioMb: 15 };

/* Which optional server features (AI, transcription) are switched on. */
export function useFeatures() {
  const [features, setFeatures] = useState(cached);

  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    pending ||= api("/features")
      .then((d) => (cached = d.features))
      .catch(() => {
        pending = null;
        return FALLBACK;
      });
    pending.then((f) => alive && setFeatures(f));
    return () => {
      alive = false;
    };
  }, []);

  return features;
}
