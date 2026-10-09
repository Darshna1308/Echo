
import { useRef } from "react";
import {
  PHOTO_STYLES,
  DEFAULT_PHOTO_STYLE,
} from "./photoStyles";

function PhotoUploader({
  photos = [],
  maxPhotos = 10,
  onStyleChange,
  onSelectFiles,
  onRemove,
  onClear,
  title = "",
  caption = "",
  date = "",
}) {
  const inputRef = useRef(null);

  const canAddMore = photos.length < maxPhotos;

  const openFilePicker = () => {
    if (!canAddMore) {
      return;
    }

    inputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const files = Array.from(
      event.target.files || []
    );

    if (!files.length) {
      return;
    }

    const imageFiles = files.filter((file) =>
      file.type.startsWith("image/")
    );

    if (imageFiles.length) {
      onSelectFiles?.(imageFiles);
    }

    /*
      Reset the input so the same photo can be
      selected again after being removed.
    */
    event.target.value = "";
  };

  return (
    <section className="photo-uploader photo-uploader-multiple">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        onChange={handleFileChange}
        multiple
        hidden
      />

      <div className="photo-uploader-header">
        <div>
          <p className="photo-style-label">
            Photographs
          </p>

          <p className="photo-upload-subtitle">
            Keep the moments that belong together.
          </p>
        </div>

        <span className="photo-count">
          {photos.length} / {maxPhotos}
        </span>
      </div>

      {photos.length === 0 ? (
        <button
          type="button"
          className="photo-upload-empty"
          onClick={openFilePicker}
        >
          <span
            className="photo-upload-icon"
            aria-hidden="true"
          >
            +
          </span>

          <span className="photo-upload-title">
            Add photographs
          </span>

          <span className="photo-upload-subtitle">
            Up to {maxPhotos} photographs can live
            inside one memory.
          </span>
        </button>
      ) : (
        <>
          <div className="photo-upload-grid">
            {photos.map((photo, index) => (
              <article
                key={photo.id}
                className="photo-upload-card"
              >
                <div
                  className={`photo-frame photo-style-${photo.style}`}
                >
                  <img
                    src={photo.previewUrl}
                    alt={
                      title
                        ? `${title} photograph ${index + 1}`
                        : `Memory photograph ${index + 1}`
                    }
                    className="uploaded-photo"
                  />

                  <span className="photo-number">
                    {index + 1}
                  </span>

                  <button
                    type="button"
                    className="photo-card-remove"
                    onClick={() =>
                      onRemove?.(photo.id)
                    }
                    aria-label={`Remove photograph ${
                      index + 1
                    }`}
                  >
                    ×
                  </button>
                </div>

                <div className="photo-upload-caption">
                  {title && (
                    <strong>{title}</strong>
                  )}

                  {caption && (
                    <span>{caption}</span>
                  )}

                  {date && (
                    <span>{date}</span>
                  )}
                </div>

                <div className="photo-style-picker">
                  <p className="photo-style-label">
                    Choose a feeling
                  </p>

                  <div className="photo-style-options">
                    {PHOTO_STYLES.map(
                      (photoStyle) => (
                        <button
                          key={photoStyle.id}
                          type="button"
                          className={`photo-style-option ${
                            photo.style ===
                            photoStyle.id
                              ? "is-selected"
                              : ""
                          }`}
                          onClick={() =>
                            onStyleChange?.(
                              photo.id,
                              photoStyle.id
                            )
                          }
                        >
                          {photoStyle.name}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </article>
            ))}

            {canAddMore && (
              <button
                type="button"
                className="photo-add-more"
                onClick={openFilePicker}
              >
                <span
                  className="photo-add-more-icon"
                  aria-hidden="true"
                >
                  +
                </span>

                <span>Add more</span>

                <small>
                  {maxPhotos - photos.length}{" "}
                  {maxPhotos - photos.length === 1
                    ? "space"
                    : "spaces"}{" "}
                  left
                </small>
              </button>
            )}
          </div>

          <div className="photo-upload-footer">
            <span>
              {photos.length}{" "}
              {photos.length === 1
                ? "photograph"
                : "photographs"}{" "}
              selected
            </span>

            <button
              type="button"
              className="photo-action-button photo-remove-button"
              onClick={onClear}
            >
              Remove all
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default PhotoUploader;
