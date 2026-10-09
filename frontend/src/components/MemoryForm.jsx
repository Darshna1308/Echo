import { useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { localToday } from "../lib/format";
import { useResource } from "../hooks/useResource";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import PhotoEditor from "./PhotoEditor";
import { photosToItems } from "../lib/photoItems";
import TagInput from "./TagInput";
import VoiceNote from "./VoiceNote";
import { Button, Dialog, Field } from "./ui";
import "./MemoryForm.css";

function initialState(memory) {
  return {
    title: memory?.title || "",
    story: memory?.story || "",
    date: memory?.date || localToday(),
    time: memory?.time || "",
    location: memory?.location || "",
    people: memory?.people || [],
    tags: memory?.tags || [],
    transcript: memory?.transcript || "",
  };
}

function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = "Please give this memory a title.";
  if (!form.story.trim()) errors.story = "Please write the story of this memory — even a sentence.";
  if (!form.date) errors.date = "Please choose a date.";
  else if (form.date > localToday()) errors.date = "A memory's date can't be in the future.";
  return errors;
}

/*
  Shared by "Preserve a memory" and "Edit memory".
  onSave(payload) must return a promise; errors from it are shown in place
  without losing anything the user typed.
*/
export default function MemoryForm({ memory, onSave, submitLabel, busyLabel, onCancel }) {
  const initial = useMemo(() => initialState(memory), [memory]);
  const initialPhotos = useMemo(() => photosToItems(memory?.photos), [memory]);
  const [form, setForm] = useState(initial);
  const [photos, setPhotos] = useState(initialPhotos);
  const [voice, setVoice] = useState(memory?.audio ? { ref: memory.audio.ref, src: memory.audio.src, status: "ready", isNew: false } : null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const errorRef = useRef(null);

  const facets = useResource("facets", (signal) => api("/memories/facets", { signal }));

  const dirty =
    !saved &&
    (JSON.stringify(form) !== JSON.stringify(initial) ||
      JSON.stringify(photos.map((p) => [p.ref, p.style, p.caption, p.key])) !== JSON.stringify(initialPhotos.map((p) => [p.ref, p.style, p.caption, p.key])) ||
      (voice?.ref || null) !== (memory?.audio?.ref || null));
  const blocker = useUnsavedChanges(dirty);

  const uploading = photos.some((p) => p.status === "uploading") || voice?.status === "uploading";
  const failedUploads = photos.filter((p) => p.status === "error").length + (voice?.status === "error" ? 1 : 0);

  const set = (name) => (event) => {
    const value = event?.target ? event.target.value : event;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`mf-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    if (uploading) {
      setFormError("Please wait for uploads to finish.");
      return;
    }
    if (failedUploads) {
      setFormError("Some uploads failed. Retry or remove them before saving.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      story: form.story.trim(),
      date: form.date,
      time: form.time,
      location: form.location.trim(),
      people: form.people,
      tags: form.tags,
      photos: photos.map((p) => ({ ref: p.ref, style: p.style, caption: p.caption.trim() })),
      audio: voice?.ref || null,
      transcript: form.transcript.trim(),
    };

    setSaving(true);
    try {
      setSaved(true);
      await onSave(payload);
    } catch (error) {
      setSaved(false);
      setSaving(false);
      const fieldErrors = error.fieldErrors?.() || {};
      setErrors(fieldErrors);
      setFormError(error.message);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  };

  return (
    <form className="mform" onSubmit={submit} noValidate>
      <div className="mform-leaf">
        <div className="mform-main">
          <Field
            id="mf-title"
            label="Title"
            name="title"
            value={form.title}
            onChange={set("title")}
            error={errors.title}
            maxLength={160}
            placeholder="The evening the lights came on at Nahargarh"
            inputClassName="mform-title"
            autoComplete="off"
          />

          <div className="mform-row">
            <Field id="mf-date" label="Date" type="date" value={form.date} onChange={set("date")} error={errors.date} max={localToday()} min="1800-01-01" />
            <Field id="mf-time" label="Time" optional type="time" value={form.time} onChange={set("time")} error={errors.time} />
          </div>

          <Field
            id="mf-story"
            label="The story"
            multiline
            rows={10}
            value={form.story}
            onChange={set("story")}
            error={errors.story}
            maxLength={20000}
            placeholder="What happened? Who said what? What do you want to remember about how it felt?"
            inputClassName="mform-story"
          />

          <Field
            id="mf-location"
            label="Place"
            optional
            value={form.location}
            onChange={set("location")}
            error={errors.location}
            maxLength={160}
            placeholder="A city, a home, a corner of a courtyard"
            autoComplete="off"
          />

          <TagInput
            label="People"
            value={form.people}
            onChange={set("people")}
            placeholder="Type a name, then press Enter"
            suggestions={facets.data?.people.map((p) => p.value) || []}
            tone="person"
            hint="Only names you add here are linked to this memory."
            error={errors.people}
          />

          <TagInput
            label="Tags"
            value={form.tags}
            onChange={set("tags")}
            placeholder="family, travel, college…"
            suggestions={facets.data?.tags.map((t) => t.value) || []}
            maxLength={40}
            prefix="#"
            error={errors.tags}
          />
        </div>

        <aside className="mform-side">
          <PhotoEditor items={photos} setItems={setPhotos} title={form.title} />
          <VoiceNote value={voice} onChange={setVoice} transcript={form.transcript} onTranscript={set("transcript")} />
        </aside>
      </div>

      <div className="mform-bar">
        {formError && (
          <p className="mform-error" role="alert" tabIndex={-1} ref={errorRef}>
            {formError}
          </p>
        )}
        <div className="mform-bar-actions">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
          <Button type="submit" size="large" busy={saving} disabled={uploading}>
            {saving ? busyLabel : uploading ? "Waiting for uploads…" : submitLabel}
          </Button>
        </div>
      </div>

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        actions={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
          </>
        }
      >
        <p>You have changes that haven't been saved. If you leave now, they'll be lost.</p>
      </Dialog>
    </form>
  );
}
