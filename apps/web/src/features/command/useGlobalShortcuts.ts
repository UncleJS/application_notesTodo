import { useEffect } from "react";
import { useCreateAction } from "./CreateActionContext";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

/**
 * Global shortcuts:
 *  - Cmd/Ctrl+K → command palette
 *  - n (outside inputs) → new item on the current page
 * (Ctrl+N is reserved by browsers, hence the single-key style.)
 */
export function useGlobalShortcuts(openPalette: () => void) {
  const { trigger } = useCreateAction();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        trigger();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette, trigger]);
}
