import { useEffect, useRef, useState } from "react";
import { api, apiUrl, uploadMedia } from "../lib/api";
import { recorderMimeType } from "../lib/media";
import { useFeatures } from "../lib/features";
import { Button, Field } from "./ui";

const MAX_SECONDS = 10 * 60;

function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/*
  Voice note: record in the browser (or choose an audio file), upload it,
  optionally transcribe it, and let the user review/edit the transcript.
  value = { ref, src, status, progress, error } | null
*/
export default function VoiceNote({ value, onChange, transcript, onTranscript }) {
  const features = useFeatures();
  const [recState, setRecState] = useState("idle"); // idle | asking | recording
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const started = useRef(0);
  const fileRef = useRef(null);
  const supported = typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && recorderMimeType() !== null;

  useEffect(
    () => () => {
      clearInterval(timer.current);
      recorder.current?.stream?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const upload = async (blob, durationSec) => {
    const src = URL.createObjectURL(blob);
    onChange({ ref: null, src, status: "uploading", progress: 0, isNew: true });
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : blob.type.includes("mpeg") ? "mp3" : "webm";
      const file = blob instanceof File ? blob : new File([blob], `voice-note.${ext}`, { type: blob.type });
      const media = await uploadMedia(file, {
        kind: "audio",
        durationSec,
        onProgress: (progress) => onChange((v) => (v && v.src === src ? { ...v, progress } : v)),
      });
      onChange((v) => (v && v.src === src ? { ...v, ref: media.id, status: "ready", progress: 1 } : v));
    } catch (error) {
      onChange((v) => (v && v.src === src ? { ...v, status: "error", error: error.message, blob, durationSec } : v));
    }
  };

  const start = async () => {
    setProblem("");
    setRecState("asking");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setRecState("idle");
      setProblem(
        error.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser's site settings, or choose an audio file instead."
          : "No microphone could be used. You can choose an audio file instead."
      );
      return;
    }
    const mimeType = recorderMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      const duration = (Date.now() - started.current) / 1000;
      setRecState("idle");
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || "audio/webm" });
      if (blob.size) upload(blob, duration);
    };
    recorder.current = rec;
    rec.start(1000);
    started.current = Date.now();
    setSeconds(0);
    setRecState("recording");
    timer.current = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) rec.state === "recording" && rec.stop();
    }, 250);
  };

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();

  const remove = () => {
    if (value?.isNew && value.ref) api(`/media/${value.ref}`, { method: "DELETE" }).catch(() => {});
    if (value?.src?.startsWith("blob:")) URL.revokeObjectURL(value.src);
    onChange(null);
  };

  const transcribe = async () => {
    setTranscribing(true);
    setProblem("");
    try {
      const data = await api(`/media/${value.ref}/transcribe`, { method: "POST" });
      if (!data.transcript) setProblem("No speech was recognised in this recording.");
      else onTranscript(transcript ? `${transcript}\n\n${data.transcript}` : data.transcript);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <section className="voice" aria-labelledby="voice-heading">
      <div className="panel-head">
        <h2 id="voice-heading" className="panel-title">
          Voice note
        </h2>
      </div>

      {!value && recState !== "recording" && (
        <div className="voice-start">
          {supported && (
            <Button variant="secondary" onClick={start} busy={recState === "asking"}>
              <span className="rec-dot" aria-hidden="true" /> Record
            </Button>
          )}
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            Choose an audio file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file, 0);
            }}
          />
          {!supported && <p className="field-hint">This browser can't record audio, but you can choose a recording.</p>}
        </div>
      )}

      {recState === "recording" && (
        <div className="voice-recording" role="status">
          <span className="rec-dot is-live" aria-hidden="true" />
          <span className="voice-clock">{clock(seconds)}</span>
          <span className="voice-limit">of {clock(MAX_SECONDS)}</span>
          <Button variant="primary" size="small" onClick={stop}>
            Stop recording
          </Button>
        </div>
      )}

      {value && (
        <div className="voice-clip">
          <audio controls preload="metadata" src={apiUrl(value.src)}>
            Your browser can't play this recording.
          </audio>
          <div className="voice-clip-row">
            {value.status === "uploading" && <span className="photo-status">Uploading… {Math.round((value.progress || 0) * 100)}%</span>}
            {value.status === "error" && (
              <span className="photo-error">
                {value.error}{" "}
                {value.blob && (
                  <button type="button" className="link-button" onClick={() => upload(value.blob, value.durationSec)}>
                    Try again
                  </button>
                )}
              </span>
            )}
            {value.status === "ready" && features?.transcription && (
              <Button variant="secondary" size="small" onClick={transcribe} busy={transcribing}>
                {transcript ? "Transcribe again" : "Transcribe"}
              </Button>
            )}
            <Button variant="danger-quiet" size="small" onClick={remove}>
              Remove recording
            </Button>
          </div>
          {value.status === "ready" && features && !features.transcription && (
            <p className="field-hint">Automatic transcription isn't switched on for this server — you can type what was said below.</p>
          )}
        </div>
      )}

      {problem && (
        <p className="photo-error" role="alert">
          {problem}
        </p>
      )}

      <Field
        label="Transcript"
        optional
        multiline
        rows={4}
        value={transcript}
        onChange={(e) => onTranscript(e.target.value)}
        maxLength={20000}
        placeholder="What was said, in your words or the recording's."
        hint={transcript ? "Edit freely — this is saved with the memory." : undefined}
      />
    </section>
  );
}
