import { useNavigate, useParams } from "react-router";
import { api } from "../lib/api";
import { useResource } from "../hooks/useResource";
import MemoryForm from "../components/MemoryForm";
import { ErrorState, PageLoader } from "../components/ui";
import { useToast } from "../components/ui/Toast";

export default function MemoryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useResource(`memory-${id}`, (signal) => api(`/memories/${id}`, { signal }));

  if (loading) return <PageLoader label="Opening this memory…" />;
  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} title={error.status === 404 ? "This memory isn't in your archive." : "This memory couldn't load."} />
      </div>
    );
  }

  const memory = data.memory;

  const save = async (payload) => {
    // Keep any AI notes the user has (they're edited on the memory page).
    await api(`/memories/${id}`, { method: "PUT", body: payload });
    toast.show("Changes saved.", { tone: "success" });
    navigate(`/memories/${id}`, { replace: true });
  };

  return (
    <div className="page">
      <header className="page-head">
        <p className="annotation">Editing</p>
        <h1 className="page-title">{memory.title}</h1>
      </header>
      <MemoryForm key={memory.id} memory={memory} onSave={save} submitLabel="Save changes" busyLabel="Saving…" onCancel={() => navigate(`/memories/${id}`)} />
    </div>
  );
}
