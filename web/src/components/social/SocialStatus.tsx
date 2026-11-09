"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/FormAlert";

type Report = (r: { ok: boolean; message: string }) => void;

const Ctx = createContext<Report>(() => {});

export const useSocialReport = (): Report => useContext(Ctx);

/**
 * One persistent pair of live regions for every control below it. A control disappears when its action
 * succeeds (the lists re-render), so the result is announced from here, which stays mounted.
 */
export function SocialStatus({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const report = useCallback<Report>((r) => setState({ ok: r.ok, message: r.message }), []);
  const value = useMemo(() => report, [report]);
  return (
    <Ctx.Provider value={value}>
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
