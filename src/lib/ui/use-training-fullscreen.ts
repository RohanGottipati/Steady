"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/** Browser fullscreen when allowed; an in-page focus view when it is blocked. */
export function useTrainingFullscreen(containerRef: RefObject<HTMLElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);
  const [focusView, setFocusView] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const update = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      if (active) {
        setFocusView(false);
        setNotice("");
      }
    };
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (!focusView) return;
    // Restyle the existing trainer rather than reparenting/remounting its video
    // or canvas. The parent persists when the workspace switches to replay.
    const container = containerRef.current?.closest<HTMLElement>(".training-product")
      ?? containerRef.current;
    if (!container) return;
    container.setAttribute("data-focus-view", "true");
    return () => { container.removeAttribute("data-focus-view"); };
  }, [containerRef, focusView]);

  const exitFocusView = useCallback(() => {
    setFocusView(false);
    setNotice("");
  }, []);

  const toggle = async () => {
    if (pending) return;
    if (focusView) {
      exitFocusView();
      return;
    }
    setNotice("");
    setPending(true);
    const exiting = Boolean(document.fullscreenElement);
    try {
      if (exiting) {
        await document.exitFullscreen();
      } else {
        if (!document.documentElement.requestFullscreen || document.fullscreenEnabled === false) {
          throw new Error("Browser fullscreen is unavailable");
        }
        // Call directly within the click gesture, before yielding to a promise.
        await document.documentElement.requestFullscreen();
      }
    } catch {
      if (exiting) {
        setNotice("Press Escape to exit browser fullscreen.");
      } else {
        setFocusView(true);
        setNotice("Focus view is open. Browser fullscreen is unavailable here.");
      }
    } finally {
      setPending(false);
    }
  };

  return { fullscreen, focusView, pending, notice, toggle, exitFocusView };
}
