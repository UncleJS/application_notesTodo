import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/**
 * Lets the active page register its "create new item" action so global
 * shortcuts (n) and the command palette can trigger it. When a palette
 * command navigates first, the create fires once the target page registers.
 */
interface CreateActionState {
  current: (() => void) | null;
  pending: boolean;
}

const CreateActionContext = createContext<CreateActionState | null>(null);

export function CreateActionProvider({ children }: { children: ReactNode }) {
  const state = useRef<CreateActionState>({ current: null, pending: false });
  return <CreateActionContext.Provider value={state.current}>{children}</CreateActionContext.Provider>;
}

/** Pages call this with their "open create dialog" callback. */
export function useRegisterCreateAction(fn: () => void) {
  const state = useContext(CreateActionContext);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!state) return;
    state.current = () => fnRef.current();
    if (state.pending) {
      state.pending = false;
      state.current();
    }
    return () => {
      state.current = null;
    };
  }, [state]);
}

/** Returns trigger(immediate): fires the page's create action, or defers it across a navigation. */
export function useCreateAction() {
  const state = useContext(CreateActionContext);
  return {
    trigger: () => {
      if (state?.current) state.current();
    },
    /** call before navigate() when the target page owns the create action */
    defer: () => {
      if (state) state.pending = true;
    },
  };
}
