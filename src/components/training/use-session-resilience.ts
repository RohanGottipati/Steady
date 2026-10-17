"use client";

import { useEffect, useState } from "react";
import { isRecoverableRejection } from "@/lib/reliability/failures";

const OFFLINE_MESSAGE = "Network is unavailable. This attempt stays on this device. You can keep training and dismiss this message.";

export function useSessionResilience() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const showOffline = () => setMessage(OFFLINE_MESSAGE);
    const clearOnline = () => setMessage(current => current === OFFLINE_MESSAGE ? null : current);
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isRecoverableRejection(event.reason)) return;
      event.preventDefault();
      setMessage("A network request failed. Training and replay stay on this device.");
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) showOffline();
    window.addEventListener("offline", showOffline);
    window.addEventListener("online", clearOnline);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("offline", showOffline);
      window.removeEventListener("online", clearOnline);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return { message, dismiss: () => setMessage(null) };
}
