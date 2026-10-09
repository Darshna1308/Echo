import { useEffect, useState } from "react";

import PhotoFrame from "../components/PhotoFrame";
import { normalizePhotos } from "../components/photoStyles";

import "./MemoryDetail.css";

const API_URL = "http://localhost:5000/api/memories";

function formatFullDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(value) {
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

function MemoryDetail({
  memoryId,
  onBack,
  onEdit,
}) {
  const [memory, setMemory] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] =
    useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
          throw new Error(
            `Server returned ${response.status} instead of JSON.`
          );
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              "Could not open this memory."
          );
        }

        setMemory(data.memory);
      } catch (err) {
        console.error(
          "Memory detail error:",
          err
        );

        setError(
          err.message ||
            "Something went wrong while opening this memory."
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
  // DELETE MEMORY
  // ==========================================

  const handleDelete = async () => {
    if (!memoryId || deleting) {
      return;
    }

    try {
      setDeleting(true);
      setDeleteError("");

      const response = await fetch(
        `${API_URL}/${memoryId}`,
        {
          method: "DELETE",
        }
      );

      const contentType =
        response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          `Server returned ${response.status} instead of JSON.`
        );
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            "Could not delete this memory."
        );
      }

      if (typeof onBack === "function") {
        onBack();
      }
    } catch (err) {
      console.error(
        "Delete memory error:",
        err
      );

      setDeleteError(
        err.message ||
          "Something went wrong while deleting this memory."
      );

      setDeleting(false);
    }
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="memory-detail-page memory-detail-loading">
        <div className="memory-loading-content">
          <div className="memory-loading-wave">
            ≋
          </div>

          <p>
            Opening this memory...
          </p>
        </div>
      </main>
    );
  }

  // ==========================================
  // ERROR
  // ==========================================

  if (error || !memory) {
    return (
      <main className="memory-detail-page">
        <div className="memory-error-content">

          <p className="memory-detail-kicker">
            The tide moved this page
          </p>

          <h1>
            This memory could not be opened.
          </h1>

          <p>
            {error ||
              "The memory may no longer exist."}
          </p>

          <button
            type="button"
            className="memory-back-button"
            onClick={onBack}
          >
            ← Back to timeline
          </button>

        </div>
      </main>
    );
  }

  // ==========================================
  // DATA
  // ==========================================

  const photos = normalizePhotos(
    memory.photos
  );

  const photoCount = photos.length;

  const people = Array.isArray(
    memory.people
  )
    ? memory.people
    : [];

  const tags = Array.isArray(
    memory.tags
  )
    ? memory.tags
    : [];

  const fullDate = formatFullDate(
    memory.date
  );

  const shortDate = formatShortDate(
    memory.date
  );

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <main className="memory-detail-page">

      {/* ======================================
          TOP BAR
      ======================================= */}

      <div className="memory-detail-container">

        <div className="memory-detail-topbar">

          <button
            type="button"
            className="memory-back-button"
            onClick={onBack}
          >
            <span aria-hidden="true">
              ←
            </span>

            <span>
              Back to timeline
            </span>
          </button>

          <button
            type="button"
            className="memory-edit-button"
            onClick={() =>
              onEdit?.(memoryId)
            }
          >
            <span aria-hidden="true">
              ✎
            </span>

            Edit memory
          </button>

        </div>

        {/* ======================================
            HERO
        ======================================= */}

        <section className="memory-hero">

          <div className="memory-hero-inner">

            <p className="memory-hero-kicker">
              A memory from the shore
            </p>

            <p className="memory-hero-date">
              {fullDate}
            </p>

            <h1 className="memory-hero-title">
              {memory.title}
            </h1>

            <div className="memory-hero-meta">

              {memory.location && (
                <span>
                  <span aria-hidden="true">
                    ◌
                  </span>

                  {memory.location}
                </span>
              )}

              {people.length > 0 && (
                <span>
                  <span aria-hidden="true">
                    ♡
                  </span>

                  With{" "}
                  {people.join(", ")}
                </span>
              )}

            </div>

            <div
              className="memory-hero-wave"
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>

          </div>

        </section>

        {/* ======================================
            PHOTOGRAPHS
        ======================================= */}

        {photoCount > 0 && (
          <section className="memory-gallery-section">

            <div className="memory-section-heading">

              <div>
                <p className="memory-section-kicker">
                  Kept in photographs
                </p>

                <h2>
                  Moments that stayed.
                </h2>
              </div>

              <span className="memory-photo-count">
                {photoCount}{" "}
                {photoCount === 1
                  ? "photograph"
                  : "photographs"}
              </span>

            </div>

            <div
              className={`memory-gallery memory-gallery-${Math.min(
                photoCount,
                10
              )}`}
            >

              {photos.map(
                (photo, index) => (
                  <article
                    className={`memory-photo-card memory-photo-${index + 1}`}
                    key={
                      photo.id ||
                      `${photo.url}-${index}`
                    }
                  >

                    <div className="memory-photo-frame">

                      <PhotoFrame
                        src={
                          photo.url ||
                          photo.previewUrl
                        }
                        styleId={
                          photo.style
                        }
                        alt={
                          `${memory.title} photograph ${
                            index + 1
                          }`
                        }
                        caption=""
                        date=""
                        size="main"
                        animate
                      />

                    </div>

                    <div className="memory-photo-footer">

                      <span className="memory-photo-number">
                        {String(
                          index + 1
                        ).padStart(2, "0")}
                      </span>

                      <span>
                        {photo.caption ||
                          memory.title}
                      </span>

                    </div>

                  </article>
                )
              )}

            </div>

          </section>
        )}

        {/* ======================================
            STORY
        ======================================= */}

        <section className="memory-story-section">

          <div className="memory-story-inner">

            <div className="memory-story-heading">

              <p className="memory-section-kicker">
                What I remember
              </p>

              <h2>
                the story
              </h2>

            </div>

            <div className="memory-story-paper">

              <span
                className="memory-story-quote"
                aria-hidden="true"
              >
                “
              </span>

              <p className="memory-story-text">
                {memory.story}
              </p>

              <div className="memory-story-line" />

              <p className="memory-story-signature">
                remembered on{" "}
                {shortDate}
              </p>

            </div>

          </div>

        </section>

        {/* ======================================
            DETAILS
        ======================================= */}

        <section className="memory-details-section">

          <div className="memory-details-heading">

            <p className="memory-section-kicker">
              The little details
            </p>

            <h2>
              Things worth keeping.
            </h2>

          </div>

          <div className="memory-details-grid">

            <article className="memory-detail-card">

              <span className="memory-detail-label">
                Where
              </span>

              <h3>
                {memory.location ||
                  "Somewhere special"}
              </h3>

            </article>

            <article className="memory-detail-card">

              <span className="memory-detail-label">
                With
              </span>

              {people.length > 0 ? (
                <div className="memory-detail-tags">
                  {people.map(
                    (person, index) => (
                      <span
                        key={`${person}-${index}`}
                      >
                        {person}
                      </span>
                    )
                  )}
                </div>
              ) : (
                <h3>
                  Just me
                </h3>
              )}

            </article>

            <article className="memory-detail-card">

              <span className="memory-detail-label">
                Kept as
              </span>

              {tags.length > 0 ? (
                <div className="memory-detail-tags">
                  {tags.map(
                    (tag, index) => (
                      <span
                        key={`${tag}-${index}`}
                      >
                        #{tag}
                      </span>
                    )
                  )}
                </div>
              ) : (
                <h3>
                  A quiet memory
                </h3>
              )}

            </article>

          </div>

        </section>

        {/* ======================================
            CLOSING
        ======================================= */}

        <section className="memory-closing-section">

          <div
            className="memory-closing-wave"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </div>

          <p>
            Some moments end.
          </p>

          <h2>
            Some simply become
            <em> memories.</em>
          </h2>

          <span>
            Kept here, where the tide
            can't take them.
          </span>

        </section>

        {/* ======================================
            DELETE
        ======================================= */}

        <section className="memory-delete-section">

          {!showDeleteConfirm ? (
            <>

              <p className="memory-delete-note">
                Some memories are meant to stay.
                Others are meant to be released.
              </p>

              <button
                type="button"
                className="memory-delete-trigger"
                onClick={() => {
                  setDeleteError("");
                  setShowDeleteConfirm(true);
                }}
              >
                Let this memory go
              </button>

            </>
          ) : (
            <div className="memory-delete-confirm">

              <div
                className="memory-delete-wave"
                aria-hidden="true"
              >
                ~
              </div>

              <p className="memory-delete-question">
                Let this memory go?
              </p>

              <p className="memory-delete-description">
                This memory and everything
                saved with it will be
                permanently deleted.
              </p>

              {deleteError && (
                <p className="memory-delete-error">
                  {deleteError}
                </p>
              )}

              <div className="memory-delete-actions">

                <button
                  type="button"
                  className="memory-keep-button"
                  onClick={() => {
                    setShowDeleteConfirm(
                      false
                    );
                    setDeleteError("");
                  }}
                  disabled={deleting}
                >
                  Keep memory
                </button>

                <button
                  type="button"
                  className="memory-confirm-delete-button"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting
                    ? "Letting go..."
                    : "Delete memory"}
                </button>

              </div>

            </div>
          )}

        </section>

      </div>

    </main>
  );
}

export default MemoryDetail;