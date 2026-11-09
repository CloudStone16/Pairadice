"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const Announce = createContext<(message: string) => void>(() => undefined);

/** Gives ConfirmRemove a polite status region that outlives the removed row. */
export function RemoveScope({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [flip, setFlip] = useState(false);
  const announce = useCallback((text: string) => {
    setMessage(text);
    setFlip((f) => !f);
  }, []);
  return (
    <Announce.Provider value={announce}>
      {children}
      <p role="status" className="sr-only">
        {message}
        {flip ? " " : ""}
      </p>
    </Announce.Provider>
  );
}

export function useAnnounce(): (message: string) => void {
  return useContext(Announce);
}
