import PhotoFrame from "./PhotoFrame";
import { PHOTO_STYLES, getPhotoStyle } from "./photoStyles";

/*
  Shows the uploaded photograph large, then "How does this memory feel?"
  and the twelve styles, each rendered from the SAME photograph.
  Props
    photoUrl   blob: URL of the chosen photograph
    value      selected style id
    onChange   (styleId) => void
    onError    () => void   called if the image cannot be decoded
    title, caption, date    shown above / on the Polaroid frame
*/
function PhotoStylePicker({
  photoUrl,
  value,
  onChange,
  onError,
  title = "",
  caption = "",
  date = "",
}) {
  const current = getPhotoStyle(value);
  const heading = title.trim() || "Your memory";
  const cap = caption.trim() || title.trim();

  return (
    <section className="psp psp--inline" aria-label="Photograph style">
      <div className="psp-stage">
        <p className="psp-memtitle">{heading}</p>

        <div className="psp-photo" key={photoUrl}>
          <PhotoFrame
            src={photoUrl}
            styleId={current.id}
            size="main"
            caption={cap}
            date={date}
            alt={`Your photograph for ${heading}, in the ${current.name} style`}
            animate
            onError={onError}
          />
        </div>

        <div aria-live="polite">
          <p className="psp-status" key={`s-${current.id}`}>
            <span>{current.name}</span> style selected
          </p>
          <p className="psp-line" key={`l-${current.id}`}>
            “{current.blurb}”
          </p>
        </div>
      </div>

      <header className="psp-head psp-head--center">
        <h2 className="psp-title" id="psp-heading">
          How does this memory feel?
        </h2>
        <p className="psp-sub">Choose the way you want to remember it.</p>
      </header>

      <div className="psp-table">
        <div className="psp-grid" role="group" aria-labelledby="psp-heading">
          {PHOTO_STYLES.map((style) => {
            const selected = style.id === current.id;
            return (
              <button
                type="button"
                key={style.id}
                className={`psp-print${selected ? " is-selected" : ""}`}
                aria-pressed={selected}
                onClick={() => onChange(style.id)}
              >
                <span className="psp-mark" aria-hidden="true">
                  chosen
                </span>
                <PhotoFrame
                  src={photoUrl}
                  styleId={style.id}
                  size="thumb"
                  caption={cap}
                  date={date}
                />
                <span className="psp-slip">
                  <span className="psp-name">{style.name}</span>
                  <span className="psp-desc">{style.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PhotoStylePicker;