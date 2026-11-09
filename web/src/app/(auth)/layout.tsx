import type { ReactNode } from "react";
import { NightSky } from "@/components/auth/TitleHeader";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-screen flex-1 flex-col overflow-x-hidden">
      <NightSky />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-stretch justify-center gap-8 px-4 py-10">
        {children}
      </main>
    </div>
  );
}
