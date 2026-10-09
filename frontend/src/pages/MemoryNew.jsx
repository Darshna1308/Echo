import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import MemoryForm from "../components/MemoryForm";
import SealMoment from "../components/SealMoment";

export default function MemoryNew() {
  const navigate = useNavigate();
  const [sealed, setSealed] = useState(null);

  const save = async (payload) => {
    const data = await api("/memories", { method: "POST", body: payload });
    setSealed(data.memory);
  };

  const done = useCallback(() => navigate(`/memories/${sealed.id}`, { replace: true }), [navigate, sealed]);

  return (
    <div className="page">
      <header className="page-head">
        <p className="annotation">A new page in your archive</p>
        <h1 className="page-title">Preserve a memory.</h1>
        <p className="page-lede">Some moments deserve more than a timestamp. Write it the way you'd tell it.</p>
      </header>
      <MemoryForm onSave={save} submitLabel="Preserve this memory" busyLabel="Preserving…" />
      {sealed && <SealMoment title={sealed.title} onDone={done} />}
    </div>
  );
}
