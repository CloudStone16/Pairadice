"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/FormAlert";

interface Result {
  ok: boolean;
  message: string;
}
type Report = (r: Result) => void;

interface Store {
  report: Report;
  subscribe: (l: () => void) => () => void;
  get: () => Result | null;
}

function createStore(): Store {
  let current: Result | null = null;
  const listeners = new Set<() => void>();
  return {
    report: (r) => {
      current = r;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    get: () => current,
  };
}

const Ctx = createContext<Report>(() => {});

export const useSocialReport = (): Report => useContext(Ctx);

/**
 * One persistent pair of live regions for every control below it. A control disappears when its action
 * succeeds (the lists re-render), so the result is announced from here, which stays mounted. Results go
 * through an external store, so reporting from inside an action never sets this component's state.
 */
export function SocialStatus({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  const state = useSyncExternalStore(store.subscribe, store.get, () => null);
  return (
    <Ctx.Provider value={store.report}>
      <div className="flex flex-col gap-2">
        <FormAlert message={state && !state.ok ? state.message : undefined} />
        <p role="status" className={state?.ok ? "text-sm font-semibold text-cream" : "sr-only"}>
          {state?.ok ? state.message : ""}
        </p>
      </div>
      {children}
    </Ctx.Provider>
  );
}
