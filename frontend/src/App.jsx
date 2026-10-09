import { useState } from "react";
import "./App.css";

import Navbar from "./components/Navbar";
import Auth from "./pages/Auth";
import CreateMemory from "./pages/CreateMemory";
import Timeline from "./pages/Timeline";
import MemoryDetail from "./pages/MemoryDetail";
import EditMemory from "./pages/EditMemory";

import {
  getUser,
  isAuthenticated,
  logout,
} from "./utils/auth";

function App() {
  const [user, setUser] = useState(() =>
    isAuthenticated() ? getUser() : null
  );

  const [currentPage, setCurrentPage] = useState("timeline");
  const [selectedMemoryId, setSelectedMemoryId] = useState(null);

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    setCurrentPage("timeline");
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setSelectedMemoryId(null);
    setCurrentPage("timeline");
  };

  const openMemory = (memoryId) => {
    setSelectedMemoryId(memoryId);
    setCurrentPage("memory");
  };

  const openEditMemory = (memoryId) => {
    setSelectedMemoryId(memoryId);
    setCurrentPage("edit");
  };

  const closeMemory = () => {
    setSelectedMemoryId(null);
    setCurrentPage("timeline");
  };

  const closeEditMemory = () => {
    setCurrentPage("memory");
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="echo-app">
      <div className="beach-background" aria-hidden="true">
        <div className="beach-sun"></div>

        <div className="floating-light light-one"></div>
        <div className="floating-light light-two"></div>
        <div className="floating-light light-three"></div>
        <div className="floating-light light-four"></div>

        <div className="beach-ocean"></div>

        <div className="beach-wave wave-one"></div>
        <div className="beach-wave wave-two"></div>
        <div className="beach-wave wave-three"></div>

        <div className="shoreline"></div>

        <div className="shell shell-one"></div>
        <div className="shell shell-two"></div>
        <div className="shell shell-three"></div>
      </div>

      <Navbar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        user={user}
        onLogout={handleLogout}
      />

      <div className="echo-content">
        {currentPage === "timeline" && (
          <Timeline onOpenMemory={openMemory} />
        )}

        {currentPage === "create" && (
          <CreateMemory />
        )}

        {currentPage === "memory" && selectedMemoryId && (
          <MemoryDetail
            memoryId={selectedMemoryId}
            onBack={closeMemory}
            onEdit={openEditMemory}
          />
        )}

        {currentPage === "edit" && selectedMemoryId && (
          <EditMemory
            memoryId={selectedMemoryId}
            onBack={closeEditMemory}
          />
        )}
      </div>
    </div>
  );
}

export default App;