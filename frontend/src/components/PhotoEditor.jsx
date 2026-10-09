import { useRef, useState } from "react";
import { api, uploadMedia } from "../lib/api";
import { ACCEPTED_IMAGES, preparePhoto } from "../lib/media";
import PhotoFrame from "./PhotoFrame";
import { PHOTO_STYLES, getPhotoStyle } from "./photoStyles";
import { Button, Dialog } from "./ui";
import { useToast } from "./ui/Toast";

import { MAX_PHOTOS, nextKey } from "../lib/photoItems";

function StylePicker({ item, onPick, onClose }) {
  const [hover, setHover] = useState(item.style);
  const current = getPhotoStyle(hover);
  return (
    <Dialog
      open
      onClose={onClose}
      title="How does this photo feel?"
      actions={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="sp-help">The photo itself is never changed. You can switch styles any time.</p>
      <div className="sp-grid" role="radiogroup" aria-label="Photo style">
        {PHOTO_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={item.style === style.id}
            className={`sp-option${item.style === style.id ? " is-selected" : ""}`}
            onClick={() => onPick(style.id)}
            onMouseEnter={() => setHover(style.id)}
            onFocus={() => setHover(style.id)}
          >
            <PhotoFrame src={item.src} styleId={style.id} size="thumb" shape="print" alt="" />
            <span className="sp-name">{style.name}</span>
          </button>
        ))}
      </div>
      <p className="sp-blurb" aria-live="polite">
        <strong>{current.name}.</strong> {current.blurb}
      </p>
    </Dialog>
  );
}

/*
  Photos inside the memory editor. Each new photo is prepared and uploaded
  immediately (with progress) so saving the memory is quick. Uploaded-but-
  unsaved photos are discarded by the server after a day if never saved.
*/
export default function PhotoEditor({ items, setItems, title }) {
  const inputRef = useRef(null);
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [picking, setPicking] = useState(null);
  const controllers = useRef(new Map());

  const update = (key, patch) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const upload = async (key, file) => {
    const controller = new AbortController();
    controllers.current.set(key, controller);
    update(key, { status: "uploading", progress: 0, error: "" });
    try {
      const prepared = await preparePhoto(file);
      const media = await uploadMedia(prepared, {
        kind: "image",
        signal: controller.signal,
        onProgress: (p) => update(key, { progress: p }),
      });
      update(key, { status: "ready", ref: media.id, progress: 1 });
    } catch (error) {
      if (error.name === "AbortError") return;
      update(key, { status: "error", error: error.message });
    } finally {
      controllers.current.delete(key);
    }
  };

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = MAX_PHOTOS - items.length;
    if (room <= 0) {
      toast.show(`A memory can hold up to ${MAX_PHOTOS} photographs.`, { tone: "error" });
      return;
    }
    const accepted = files.filter((f) => f.type.startsWith("image/"));
    if (accepted.length < files.length) toast.show("Some files weren't photos and were skipped.", { tone: "error" });
    if (accepted.length > room) toast.show(`Only ${room} more ${room === 1 ? "photo fits" : "photos fit"} in this memory.`, { tone: "error" });

    const added = accepted.slice(0, room).map((file) => ({
      key: nextKey(),
      ref: null,
      file,
      src: URL.createObjectURL(file),
      style: "original",
      caption: "",
      status: "uploading",
      progress: 0,
      isNew: true,
    }));
    setItems((list) => [...list, ...added]);
    added.forEach((item) => upload(item.key, item.file));
  };

  const remove = (item) => {
    controllers.current.get(item.key)?.abort();
    if (item.isNew && item.ref) {
      // Discard the unsaved upload right away (best effort).
      api(`/media/${item.ref}`, { method: "DELETE" }).catch(() => {});
    }
    if (item.src?.startsWith("blob:")) URL.revokeObjectURL(item.src);
    setItems((list) => list.filter((it) => it.key !== item.key));
  };

  const move = (index, delta) => {
    setItems((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <section className="photos" aria-labelledby="photos-heading">
      <div className="panel-head">
        <h2 id="photos-heading" className="panel-title">
          Photographs
        </h2>
        <span className="panel-count">
          {items.length} / {MAX_PHOTOS}
        </span>
      </div>

      {items.length > 0 && (
        <ol className="photo-list">
          {items.map((item, index) => (
            <li key={item.key} className={`photo-item is-${item.status}`}>
              <div className="photo-thumb">
                <PhotoFrame src={item.src} styleId={item.style} size="thumb" shape="print" alt={item.caption || `${title || "Memory"} photo ${index + 1}`} />
                {item.status === "uploading" && (
                  <span className="photo-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((item.progress || 0) * 100)} aria-label="Uploading">
                    <span style={{ width: `${Math.round((item.progress || 0) * 100)}%` }} />
                  </span>
                )}
                {index === 0 && <span className="photo-cover">Cover</span>}
              </div>
              <div className="photo-fields">
                <label className="visually-hidden" htmlFor={`cap-${item.key}`}>
                  Caption for photo {index + 1}
                </label>
                <input
                  id={`cap-${item.key}`}
                  className="photo-caption"
                  value={item.caption}
                  maxLength={300}
                  placeholder="Add a caption"
                  onChange={(e) => update(item.key, { caption: e.target.value })}
                />
                {item.status === "error" ? (
                  <p className="photo-error" role="alert">
                    {item.error}{" "}
                    {item.file && (
                      <button type="button" className="link-button" onClick={() => upload(item.key, item.file)}>
                        Try again
                      </button>
                    )}
                  </p>
                ) : (
                  <div className="photo-actions">
                    <button type="button" className="link-button" onClick={() => setPicking(item.key)} disabled={item.status !== "ready" && !item.src}>
                      Style: {getPhotoStyle(item.style).name}
                    </button>
                    {item.status === "uploading" && <span className="photo-status">Uploading…</span>}
                  </div>
                )}
              </div>
              <div className="photo-order">
                <button type="button" className="icon-button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move photo ${index + 1} earlier`}>
                  ↑
                </button>
                <button type="button" className="icon-button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move photo ${index + 1} later`}>
                  ↓
                </button>
                <button type="button" className="icon-button icon-button--danger" onClick={() => remove(item)} aria-label={`Remove photo ${index + 1}`}>
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {items.length < MAX_PHOTOS && (
        <div
          className={`dropzone${dragOver ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGES}
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            {items.length ? "Add more photos" : "Add photos"}
          </Button>
          <p className="dropzone-hint">or drop them here — JPEG, PNG, WebP, GIF or AVIF.</p>
        </div>
      )}

      {picking && (
        <StylePicker
          item={items.find((i) => i.key === picking)}
          onPick={(style) => update(picking, { style })}
          onClose={() => setPicking(null)}
        />
      )}
    </section>
  );
}
