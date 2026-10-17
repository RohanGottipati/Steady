import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DegradedNotice } from "@/components/training/degraded-notice";
import { SessionBoundary } from "@/components/training/session-boundary";
import { useSessionResilience } from "@/components/training/use-session-resilience";

function NoticeProbe() {
  const resilience = useSessionResilience();
  return <DegradedNotice message={resilience.message} onDismiss={resilience.dismiss} />;
}

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("missing provider");
  return <p>ready</p>;
}

describe("S3 recoverable session UI", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.restoreAllMocks();
  });

  it("shows a dismissible notice when the network drops after load", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => { root!.render(<NoticeProbe />); });
    expect(container.textContent).not.toContain("Network is unavailable");
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(container.querySelector("[data-testid='degraded-notice']")).not.toBeNull();
    act(() => { container!.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(container.querySelector("[data-testid='degraded-notice']")).toBeNull();
  });

  it("recovers from a render crash instead of leaving the screen blank", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    let explode = true;
    const render = () => act(() => { root!.render(<SessionBoundary><Boom explode={explode} /></SessionBoundary>); });
    render();
    expect(container.querySelector("[data-testid='session-recovery']")).not.toBeNull();
    expect(container.textContent).toContain("missing provider");
    explode = false;
    act(() => { root!.render(<SessionBoundary><Boom explode={false} /></SessionBoundary>); });
    act(() => { container!.querySelector("button")!.click(); });
    expect(container.textContent).toContain("ready");
  });
});
