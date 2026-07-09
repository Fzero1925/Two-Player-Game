import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./pages/Layout.js";
import Lobby from "./pages/Lobby.js";
import RoomScreen from "./pages/RoomScreen.js";
import PracticeScreen from "./pages/PracticeScreen.js";

/**
 * Route map. Every game screen renders through Layout (shared header/footer).
 * See PROJECT_GUIDE.md — adding a new game never requires touching this file.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Lobby />} />
        <Route path="/room/:roomCode" element={<RoomScreen />} />
        <Route path="/practice/:gameType" element={<PracticeScreen />} />
        <Route path="*" element={<Lobby />} />
      </Route>
    </Routes>
  );
}
