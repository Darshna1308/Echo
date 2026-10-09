
import { useState } from "react";
import { Obj, Bottle, Shell, Boat, Polaroid } from "../components/Coast";
import PhotoUploader from "../components/PhotoUploader";
import { DEFAULT_PHOTO_STYLE } from "../components/photoStyles";

const MAX_PHOTOS = 10;

function captionDate(value) {
  const d = value ? new Date(`${value}T00:00:00`) : new Date();

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/*
  Converts an image into a compressed data URL.

  Large images are resized before being sent to MongoDB.
  This is important because one memory can now contain
  up to 10 photographs.
*/
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const MAX_WIDTH = 1600;
        const MAX_HEIGHT = 1600;

        let width = image.width;
        let height = image.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const scale = Math.min(
            MAX_WIDTH / width,
            MAX_HEIGHT / height
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
            new Error("Could not process the selected photo.")
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

        const compressed = canvas.toDataURL(
          "image/jpeg",
          0.82
        );

        resolve(compressed);
      };

      image.onerror = () => {
        reject(
          new Error("Could not process the selected photo.")
        );
      };

      image.src = reader.result;
    };

    reader.onerror = () => {
      reject(
        new Error("Could not read the selected photo.")
      );
    };

    reader.readAsDataURL(file);
  });
}

function CreateMemory() {
  const [formData, setFormData] = useState({
    title: "",
    story: "",
    date: "",
    location: "",
    people: "",
    tags: "",
  });

  const [photos, setPhotos] = useState([]);

  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const [pulse, setPulse] = useState(0);

  const choosePhotos = (files) => {
    const incomingFiles = Array.isArray(files)
      ? files
      : files
        ? [files]
        : [];

    if (!incomingFiles.length) {
      return;
    }

    setPhotos((previous) => {
      const remainingSlots =
        MAX_PHOTOS - previous.length;

      if (remainingSlots <= 0) {
        return previous;
      }

      const filesToAdd = incomingFiles
        .filter((file) =>
          file?.type?.startsWith("image/")
        )
        .slice(0, remainingSlots);

      const newPhotos = filesToAdd.map((file) => ({
        id:
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`,

        file,

        style: DEFAULT_PHOTO_STYLE,

        previewUrl: URL.createObjectURL(file),
      }));

      return [...previous, ...newPhotos];
    });
  };

  const chooseStyle = (photoId, styleId) => {
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
      const photoToRemove = previous.find(
        (photo) => photo.id === photoId
      );

      if (
        photoToRemove?.previewUrl &&
        photoToRemove.previewUrl.startsWith("blob:")
      ) {
        URL.revokeObjectURL(
          photoToRemove.previewUrl
        );
      }

      return previous.filter(
        (photo) => photo.id !== photoId
      );
    });
  };

  const clearPhotos = () => {
    photos.forEach((photo) => {
      if (
        photo.previewUrl &&
        photo.previewUrl.startsWith("blob:")
      ) {
        URL.revokeObjectURL(
          photo.previewUrl
        );
      }
    });

    setPhotos([]);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setPulse((p) => p + 1);
    setStatus("saving");
    setMessage("Preserving your memory...");

    try {
      const photoData = [];

      for (const photo of photos) {
        const dataUrl = await fileToDataUrl(
          photo.file
        );

        if (dataUrl) {
          photoData.push({
            url: dataUrl,
            style: photo.style,
            caption: formData.title,
          });
        }
      }

      const response = await fetch(
        "http://localhost:5000/api/memories",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            title: formData.title,
            story: formData.story,
            date: formData.date,
            location: formData.location,

            people: formData.people
              .split(",")
              .map((person) => person.trim())
              .filter(Boolean),

            tags: formData.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),

            photos: photoData,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to create memory"
        );
      }

      setStatus("success");
      setMessage(
        "Your memory has found its place."
      );

      setFormData({
        title: "",
        story: "",
        date: "",
        location: "",
        people: "",
        tags: "",
      });

      clearPhotos();
    } catch (error) {
      console.error(
        "Create memory error:",
        error
      );

      setStatus("error");
      setMessage(error.message);
    }
  };

  return (
    <div className="page-wrap">
      <main className="page page-create">
        <header className="page-head">
          <p className="page-kicker">
            A new page
          </p>

          <h1 className="page-title reveal-hand">
            Preserve a moment.
          </h1>

          <p className="page-subtitle">
            Some moments deserve more than a timestamp.
          </p>
        </header>

        <PhotoUploader
          photos={photos}
          maxPhotos={MAX_PHOTOS}
          onSelectFiles={choosePhotos}
          onStyleChange={chooseStyle}
          onRemove={removePhoto}
          onClear={clearPhotos}
          title={formData.title}
          caption={formData.location}
          date={captionDate(formData.date)}
        />

        <form
          className="create-form"
          onSubmit={handleSubmit}
        >
          <div className="journal-wrap">
            <Obj
              className="obj-polaroid"
              par={-0.04}
              rot={-7}
              style={{ "--fdur": "11s" }}
            >
              <Polaroid caption="low tide" />
            </Obj>

            <Obj
              className="obj-bottle"
              par={-0.06}
              rot={14}
              style={{ "--fdur": "9s" }}
            >
              <Bottle />
            </Obj>

            <Obj
              className="obj-shell-low"
              par={-0.03}
              rot={18}
              style={{ "--fdur": "12s" }}
            >
              <Shell />
            </Obj>

            <Obj
              className="obj-boat"
              par={-0.05}
              rot={-4}
              style={{ "--fdur": "8s" }}
            >
              <Boat />
            </Obj>

            <div className="journal">
              {status === "success" && (
                <div
                  className="journal-wash-clip"
                  aria-hidden="true"
                >
                  <div
                    className="journal-wash"
                    key={pulse}
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="title">
                  Memory Title
                </label>

                <input
                  id="title"
                  className="input-title"
                  type="text"
                  name="title"
                  placeholder="e.g. The day Echo began"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="story">
                  Story
                </label>

                <textarea
                  id="story"
                  className="input-story"
                  name="story"
                  placeholder="Tell the story behind this memory..."
                  value={formData.story}
                  onChange={handleChange}
                  rows="8"
                  required
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="date">
                    Date
                  </label>

                  <input
                    id="date"
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="location">
                    Location
                  </label>

                  <input
                    id="location"
                    type="text"
                    name="location"
                    placeholder="Where did it happen?"
                    value={formData.location}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="people">
                    People
                    <span className="field-hint">
                      separate with commas
                    </span>
                  </label>

                  <input
                    id="people"
                    type="text"
                    name="people"
                    placeholder="e.g. Mom, Dad, Ananya"
                    value={formData.people}
                    onChange={handleChange}
                  />
                </div>

                <div className="field">
                  <label htmlFor="tags">
                    Tags
                    <span className="field-hint">
                      separate with commas
                    </span>
                  </label>

                  <input
                    id="tags"
                    type="text"
                    name="tags"
                    placeholder="e.g. Family, Travel, College"
                    value={formData.tags}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="journal-actions">
            <button
              type="submit"
              className="seal-button"
              disabled={status === "saving"}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M2 10c2.5-3 4.5-3 7 0s4.5 3 7 0 4-2.5 6-.5" />

                <path
                  d="M2 16c2.5-3 4.5-3 7 0s4.5 3 7 0 4-2.5 6-.5"
                  opacity=".6"
                />
              </svg>

              {status === "saving"
                ? "Preserving..."
                : "Preserve this memory"}
            </button>

            {message && (
              <div
                key={`${pulse}-${status}`}
                className={`form-message is-${status}`}
                role="status"
              >
                {status === "success" && (
                  <div
                    className="success-mark"
                    aria-hidden="true"
                  >
                    <span />
                    <span />
                    <span />

                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </div>
                )}

                <p>{message}</p>
              </div>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

export default CreateMemory;
