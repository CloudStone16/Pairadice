import type { ReactNode } from "react";
import { getViewer, hasRole } from "@/lib/auth/guards";
import { ModNav } from "@/components/mod/ModNav";

/**
 * Sub-navigation for the Guild Hall. The nav is drawn only for staff: a player who opens /mod gets the 404
 * page, which must not reveal that these sections exist.
 */
export default async function ModLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  const staff = viewer !== null && hasRole(viewer, "moderator");
  return (
    <>
      {staff ? <ModNav /> : null}
      {children}
    </>
  );
}
