import { useEffect, useRef, useState } from "react";
import { authFetch } from "../utils/auth";

import {
  Obj,
  Shell,
  Stone,
  Driftwood,
  Bottle,
} from "../components/Coast";

import PhotoFrame from "../components/PhotoFrame";
import { normalizePhotos } from "../components/photoStyles";

const API_URL = "http://localhost:5000/api/memories";

const PHOTO_LAYOUTS = [
  "journal",
  "floating",
  "pinned",
  "wide",
];

function formatDate(dateValue) {
  if (!dateValue) {
    return {
      day: "",
      rest: "",
    };
  }

  const date = new Date(dateValue);

  return {
    day: date.toLocaleDateString("en-US", {
      day: "2-digit",
    }),
    rest: date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    }),
  };
}

function MemoryEntry({ memory, index, onOpen }) {
  const entryRef = useRef(null);
  const [visible, setVisible] = useState(false);

  const photos = normalizePhotos(memory?.photos);

  const layout =
    PHOTO_LAYOUTS[index % PHOTO_LAYOUTS.length];

  const date = formatDate(memory?.date);

  useEffect(() => {
    const element = entryRef.current;

    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.15,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleOpen = () => {
    if (typeof onOpen !== "function") {
      console.error(
        "MemoryEntry: onOpen callback is missing."
      );
      return;
    }

    onOpen(memory._id);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <article
      ref={entryRef}
      className={`memory-entry memory-${layout} ${
        visible ? "is-visible" : ""
      }`}
    >
      <div className="memory-date">
        <span className="d-day">{date.day}</span>
        <span className="d-rest">{date.rest}</span>
      </div>

      <div className="memory-marker">
        <span></span>
      </div>

      <div
        className="memory-card"
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
      >
        <div className="memory-card-top">
          <div>
            {memory.location && (
              <p className="memory-location">
                {memory.location}
              </p>
            )}

            <h2 className="memory-title">
              {memory.title}
            </h2>
          </div>

          <span className="memory-open">
            ↗
          </span>
        </div>

        {photos.length > 0 && (
          <div className="memory-photos">
            {photos.slice(0, 3).map(
              (photo, photoIndex) => (
                <div
                  className="pf-slot"
                  key={
                    photo.id ||
                    photo._id ||
                    `photo-${photoIndex}`
                  }
                >
                  <PhotoFrame
                    photo={photo}
                    size="card"
                    index={photoIndex}
                    total={Math.min(photos.length, 3)}
                  />
                </div>
              )
            )}

            {photos.length > 3 && (
              <span className="memory-photo-count">
                +{photos.length - 3}
              </span>
            )}
          </div>
        )}

        <p className="memory-story">
          {memory.story}
        </p>

        <div className="memory-foot">
          {memory.location && (
            <div className="memory-location">
              <span>⌖</span>
              {memory.location}
            </div>
          )}

          {Array.isArray(memory.people) &&
            memory.people.length > 0 && (
              <div className="memory-people">
                <span>with</span>

                {memory.people
                  .slice(0, 4)
                  .map((person, personIndex) => (
                    <span
                      key={`${person}-${personIndex}`}
                    >
                      {person}
                    </span>
                  ))}

                {memory.people.length > 4 && (
                  <span>
                    +{memory.people.length - 4}
                  </span>
                )}
              </div>
            )}

          {Array.isArray(memory.tags) &&
            memory.tags.length > 0 && (
              <div className="memory-tags">
                {memory.tags
                  .slice(0, 4)
                  .map((tag, tagIndex) => (
                    <span
                      className="memory-tag"
                      key={`${tag}-${tagIndex}`}
                    >
                      #{tag}
                    </span>
                  ))}
              </div>
            )}
        </div>
      </div>
    </article>
  );
}

function Timeline({ onOpenMemory }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMemories = async () => {
    try {
      setLoading(true);
      setError("");

      /*
       * IMPORTANT:
       * This used to be normal fetch().
       * authFetch() automatically adds:
       *
       * Authorization: Bearer <JWT>
       *
       * which the protected backend route requires.
       */
      const response = await authFetch(API_URL);

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
          data.message || "Failed to fetch memories."
        );
      }

      setMemories(data.memories || []);
    } catch (error) {
      console.error(
        "Fetch memories error:",
        error
      );

      setError(
        error.message ||
          "Unable to load your memories."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const groupedMemories = memories.reduce(
    (groups, memory) => {
      const year = new Date(
        memory.date
      ).getFullYear();

      if (!groups[year]) {
        groups[year] = [];
      }

      groups[year].push(memory);

      return groups;
    },
    {}
  );

  const years = Object.keys(groupedMemories).sort(
    (a, b) => Number(b) - Number(a)
  );

  return (
    <main className="timeline-page">
      <section className="timeline-hero">
        <div className="timeline-hero-copy">
          <p className="timeline-kicker">
            Your story, kept close
          </p>

          <h1>
            A life made of little moments.
          </h1>

          <p className="timeline-description">
            Some memories deserve more than a camera
            roll. Echo gives them a place to stay.
          </p>
        </div>

        <div className="timeline-hero-object">
          <Obj />
        </div>
      </section>

      {loading && (
        <section className="timeline-loading">
          <div className="timeline-loading-object">
            <Bottle />
          </div>

          <p>
            Gathering your memories...
          </p>
        </section>
      )}

      {!loading && error && (
        <section className="timeline-error">
          <div className="timeline-error-object">
            <Shell />
          </div>

          <h2>
            Echo couldn't reach your memories.
          </h2>

          <p>{error}</p>

          <button
            type="button"
            onClick={fetchMemories}
          >
            Try again
          </button>
        </section>
      )}

      {!loading &&
        !error &&
        memories.length === 0 && (
          <section className="timeline-empty">
            <div className="timeline-empty-object">
              <Driftwood />
            </div>

            <div>
              <p className="timeline-empty-kicker">
                The shore is quiet.
              </p>

              <h2>
                Your first memory is waiting.
              </h2>

              <p>
                Start with something small.
                A place, a person, a day you don't
                want to forget.
              </p>
            </div>

            <div className="timeline-empty-stone">
              <Stone />
            </div>
          </section>
        )}

      {!loading &&
        !error &&
        memories.length > 0 && (
          <section className="timeline">
            <div className="timeline-line"></div>

            <div className="timeline-years">
              {years.map((year) => (
                <section
                  className="timeline-year"
                  key={year}
                >
                  <div className="timeline-year-heading">
                    <span>
                      {year}
                    </span>

                    <div></div>
                  </div>

                  <div className="timeline-list">
                    {groupedMemories[year].map(
                      (memory, memoryIndex) => (
                        <MemoryEntry
                          key={memory._id}
                          memory={memory}
                          index={memoryIndex}
                          onOpen={onOpenMemory}
                        />
                      )
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}

      {!loading &&
        !error &&
        memories.length > 0 && (
          <section className="timeline-ending">
            <div className="timeline-ending-object">
              <Shell />
            </div>

            <p>
              More moments will find their way here.
            </p>

            <span>
              Keep living. Echo will keep them.
            </span>
          </section>
        )}
    </main>
  );
}

export default Timeline;