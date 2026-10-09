import { useEffect, useState } from "react";

import PhotoUploader from "../components/PhotoUploader";

import {
  DEFAULT_PHOTO_STYLE,
} from "../components/photoStyles";

const API_URL = "http://localhost:5000/api/memories";
const MAX_PHOTOS = 10;

function formatInputDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function formatCaptionDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const MAX_SIZE = 1600;

        let width = image.width;
        let height = image.height;

        if (width > MAX_SIZE || height > MAX_SIZE) {
          const scale = Math.min(
            MAX_SIZE / width,
            MAX_SIZE / height
          );

          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(
            new Error("Could not process the image.")
          );
          return;
        }

        context.drawImage(
          image,
          0,
          0,
          width,
          height
        );

        const compressedImage = canvas.toDataURL(
          "image/jpeg",
          0.82
        );

        resolve(compressedImage);
      };

      image.onerror = () => {
        reject(
          new Error("Could not process the selected image.")
        );
      };

      image.src = reader.result;
    };

    reader.onerror = () => {
      reject(
        new Error("Could not read the selected image.")
      );
    };

    reader.readAsDataURL(file);
  });
}

function EditMemory({
  memoryId,
  onBack,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [photos, setPhotos] = useState([]);

  const [formData, setFormData] = useState({
    title: "",
    story: "",
    date: "",
    location: "",
    people: "",
    tags: "",
  });

  // ==========================================
  // LOAD MEMORY
  // ==========================================

  useEffect(() => {
    const loadMemory = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/${memoryId}`
        );

        const contentType =
          response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
          const text = await response.text();

          throw new Error(
            `Server returned ${response.status}. ${text.slice(
              0,
              200
            )}`
          );
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              "Failed to load memory."
          );
        }

        const memory = data.memory;

        setFormData({
          title: memory.title || "",
          story: memory.story || "",
          date: formatInputDate(memory.date),
          location: memory.location || "",

          people: Array.isArray(memory.people)
            ? memory.people.join(", ")
            : "",

          tags: Array.isArray(memory.tags)
            ? memory.tags.join(", ")
            : "",
        });

        const existingPhotos =
          Array.isArray(memory.photos)
            ? memory.photos
            : [];

        const loadedPhotos = existingPhotos
          .filter(
            (photo) =>
              photo &&
              photo.url
          )
          .slice(0, MAX_PHOTOS)
          .map((photo, index) => ({
            id:
              photo._id ||
              `existing-${index}-${Date.now()}`,

            file: null,

            previewUrl: photo.url,

            existingUrl: photo.url,

            style:
              photo.style ||
              DEFAULT_PHOTO_STYLE,

            caption:
              photo.caption || "",
          }));

        setPhotos(loadedPhotos);
      } catch (err) {
        console.error(
          "Load memory error:",
          err
        );

        setError(
          err.message ||
            "Could not load this memory."
        );
      } finally {
        setLoading(false);
      }
    };

    if (memoryId) {
      loadMemory();
    }
  }, [memoryId]);

  // ==========================================
  // FORM
  // ==========================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ==========================================
  // PHOTOS
  // ==========================================

  const choosePhotos = (fileList) => {
    const files = Array.from(
      fileList || []
    ).filter(
      (file) =>
        file &&
        file.type &&
        file.type.startsWith("image/")
    );

    if (!files.length) {
      return;
    }

    setPhotos((previous) => {
      const remaining =
        MAX_PHOTOS - previous.length;

      if (remaining <= 0) {
        return previous;
      }

      const selectedFiles = files
        .slice(0, remaining)
        .map((file, index) => ({
          id:
            `new-${Date.now()}-${index}-${Math.random()
              .toString(36)
              .slice(2)}`,

          file,

          previewUrl:
            URL.createObjectURL(file),

          existingUrl: "",

          style:
            DEFAULT_PHOTO_STYLE,

          caption: "",
        }));

      return [
        ...previous,
        ...selectedFiles,
      ];
    });
  };

  const chooseStyle = (
    photoId,
    styleId
  ) => {
    setPhotos((previous) =>
      previous.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              style: styleId,
            }
          : photo
      )
    );
  };

  const removePhoto = (photoId) => {
    setPhotos((previous) => {
      const photoToRemove =
        previous.find(
          (photo) =>
            photo.id === photoId
        );

      if (
        photoToRemove?.file &&
        photoToRemove.previewUrl?.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          photoToRemove.previewUrl
        );
      }

      return previous.filter(
        (photo) =>
          photo.id !== photoId
      );
    });
  };

  const clearPhotos = () => {
    photos.forEach((photo) => {
      if (
        photo.file &&
        photo.previewUrl?.startsWith(
          "blob:"
        )
      ) {
        URL.revokeObjectURL(
          photo.previewUrl
        );
      }
    });

    setPhotos([]);
  };

  // ==========================================
  // SAVE
  // ==========================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.title.trim()) {
      setError(
        "Please enter a memory title."
      );
      return;
    }

    if (!formData.story.trim()) {
      setError(
        "Please write the memory story."
      );
      return;
    }

    if (!formData.date) {
      setError(
        "Please select a date."
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const photoPayload = [];

      for (const photo of photos) {
        // Existing photo
        if (
          photo.existingUrl &&
          !photo.file
        ) {
          photoPayload.push({
            url: photo.existingUrl,

            style:
              photo.style ||
              DEFAULT_PHOTO_STYLE,

            caption:
              photo.caption ||
              formData.title.trim(),
          });

          continue;
        }

        // New photo
        if (photo.file) {
          const dataUrl =
            await fileToDataUrl(
              photo.file
            );

          photoPayload.push({
            url: dataUrl,

            style:
              photo.style ||
              DEFAULT_PHOTO_STYLE,

            caption:
              photo.caption ||
              formData.title.trim(),
          });
        }
      }

      const payload = {
        title:
          formData.title.trim(),

        story:
          formData.story.trim(),

        date:
          formData.date,

        location:
          formData.location.trim(),

        people:
          formData.people
            .split(",")
            .map((person) =>
              person.trim()
            )
            .filter(Boolean),

        tags:
          formData.tags
            .split(",")
            .map((tag) =>
              tag.trim()
            )
            .filter(Boolean),

        photos:
          photoPayload,
      };

      console.log(
        "Updating memory:",
        memoryId
      );

      const response = await fetch(
        `${API_URL}/${memoryId}`,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(
            payload
          ),
        }
      );

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      // Prevent <!DOCTYPE html> JSON error
      if (
        !contentType.includes(
          "application/json"
        )
      ) {
        const text =
          await response.text();

        console.error(
          "Non-JSON server response:",
          text
        );

        throw new Error(
          `Server returned ${response.status} instead of JSON.`
        );
      }

      const data =
        await response.json();

      console.log(
        "Update response:",
        data
      );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ||
            "Failed to update memory."
        );
      }

      setSuccess(
        "Memory updated successfully."
      );

      setTimeout(() => {
        if (
          typeof onBack ===
          "function"
        ) {
          onBack();
        }
      }, 900);
    } catch (err) {
      console.error(
        "Update memory error:",
        err
      );

      setError(
        err.message ||
          "Could not update memory."
      );
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <div className="page-wrap">
        <div className="page">
          <div className="page-head">
            <p className="page-kicker">
              Echo · Memory
            </p>

            <h1 className="page-title">
              Opening your memory…
            </h1>

            <p className="page-subtitle">
              Bringing the moment back.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // LOADING ERROR
  // ==========================================

  if (
    error &&
    !formData.title
  ) {
    return (
      <div className="page-wrap">
        <div className="page">
          <div className="page-head">
            <p className="page-kicker">
              Echo
            </p>

            <h1 className="page-title">
              Something went wrong.
            </h1>

            <p className="page-subtitle">
              {error}
            </p>
          </div>

          <div className="journal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onBack}
            >
              ← Back to timeline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="page-wrap">
      <div className="page page-create">

        <div className="page-head">

          <p className="page-kicker">
            Echo · Edit Memory
          </p>

          <h1 className="page-title">
            Bring the moment back.
          </h1>

          <p className="page-subtitle">
            Change the details while keeping
            the memory intact.
          </p>

        </div>

        <form
          className="create-form"
          onSubmit={handleSubmit}
        >

          {/* ==============================
              MEMORY DETAILS
          =============================== */}

          <div className="journal-wrap">
            <div className="journal">

              <div className="field">

                <label htmlFor="title">
                  Memory title
                </label>

                <input
                  id="title"
                  name="title"
                  type="text"
                  className="input-title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Give this memory a name…"
                  maxLength={120}
                />

              </div>

              <div className="field">

                <label htmlFor="story">
                  Your story
                </label>

                <textarea
                  id="story"
                  name="story"
                  className="input-story"
                  value={formData.story}
                  onChange={handleChange}
                  placeholder="What happened? What do you remember most?"
                  rows={9}
                />

              </div>

              <div className="field-row">

                <div className="field">

                  <label htmlFor="date">
                    Date
                  </label>

                  <input
                    id="date"
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleChange}
                  />

                </div>

                <div className="field">

                  <label htmlFor="location">
                    Where were you?
                  </label>

                  <input
                    id="location"
                    name="location"
                    type="text"
                    value={
                      formData.location
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="A place, city, or home"
                  />

                </div>

              </div>

              <div className="field-row">

                <div className="field">

                  <label htmlFor="people">
                    People
                  </label>

                  <input
                    id="people"
                    name="people"
                    type="text"
                    value={
                      formData.people
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="Mumma, Papa, Jiji…"
                  />

                  <small>
                    Separate names with commas.
                  </small>

                </div>

                <div className="field">

                  <label htmlFor="tags">
                    Tags
                  </label>

                  <input
                    id="tags"
                    name="tags"
                    type="text"
                    value={
                      formData.tags
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="college, trip, family…"
                  />

                  <small>
                    Separate tags with commas.
                  </small>

                </div>

              </div>

            </div>
          </div>

          {/* ==============================
              PHOTOS
          =============================== */}

          <PhotoUploader
            photos={photos}
            maxPhotos={MAX_PHOTOS}
            onSelectFiles={
              choosePhotos
            }
            onStyleChange={
              chooseStyle
            }
            onRemove={
              removePhoto
            }
            onClear={
              clearPhotos
            }
            title={
              formData.title
            }
            caption={
              formData.location
            }
            date={formatCaptionDate(
              formData.date
            )}
          />

          {/* ==============================
              ERROR
          =============================== */}

          {error && (
            <div
              className="form-message form-message-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* ==============================
              SUCCESS
          =============================== */}

          {success && (
            <div
              className="form-message form-message-success"
              role="status"
            >
              {success}
            </div>
          )}

          {/* ==============================
              BUTTONS
          =============================== */}

          <div className="journal-actions">

            <button
              type="button"
              className="secondary-button"
              onClick={onBack}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="seal-button"
              disabled={saving}
            >
              {saving
                ? "Saving memory…"
                : "Save changes"}
            </button>

          </div>

        </form>
      </div>
    </div>
  );
}

export default EditMemory;