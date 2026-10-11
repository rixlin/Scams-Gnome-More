"use client";

import { useEffect, useState } from "react";
import { BACKEND_URL_CHANGED_EVENT } from "../lib/api";

// Bumps whenever the backend URLs are saved in Settings (in this tab or another one).
// Put it in a WebSocket effect's deps so the socket reconnects to the new backend.
export function useBackendUrlVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "gnome_ws_url" || e.key === "gnome_backend_url") bump();
    };
    window.addEventListener(BACKEND_URL_CHANGED_EVENT, bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BACKEND_URL_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return version;
}
