import { ButtonLink, EmptyState } from "../components/ui";

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState
        title="There's no page here."
        action={
          <ButtonLink to="/" variant="secondary">
            Back to your archive
          </ButtonLink>
        }
      >
        <p>The link may be mistyped, or the memory it pointed to was deleted.</p>
      </EmptyState>
    </div>
  );
}
