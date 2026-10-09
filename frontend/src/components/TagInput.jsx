import { useId, useState } from "react";
import { Chip } from "./ui";

/*
  Chip-style list input for people and tags.
  Enter or comma adds; Backspace on an empty box removes the last chip.
  Pasting "a, b, c" adds all three.
*/
export default function TagInput({ label, value, onChange, placeholder, suggestions = [], max = 30, maxLength = 80, prefix = "", tone, hint, error }) {
  const id = useId();
  const [draft, setDraft] = useState("");

  const add = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((p) => p.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, maxLength))
      .filter(Boolean);
    if (!parts.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) {
      if (!lower.has(p.toLowerCase()) && next.length < max) {
        next.push(p);
        lower.add(p.toLowerCase());
      }
    }
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === ",") {
      if (draft.trim()) {
        event.preventDefault();
        add(draft);
      } else if (event.key === ",") {
        event.preventDefault();
      }
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const listId = `${id}-list`;
  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div className={`field taginput ${error ? "has-error" : ""}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="taginput-box">
        {value.map((item) => (
          <Chip key={item} tone={tone} onRemove={() => onChange(value.filter((v) => v !== item))}>
            {prefix}
            {item}
          </Chip>
        ))}
        <input
          id={id}
          className="taginput-input"
          value={draft}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "" : placeholder}
          list={remaining.length ? listId : undefined}
          maxLength={maxLength}
          disabled={value.length >= max}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        {remaining.length > 0 && (
          <datalist id={listId}>
            {remaining.slice(0, 50).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
