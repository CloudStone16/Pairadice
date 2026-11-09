import type { Metadata } from "next";
import { StaffAccess } from "../_staff-access";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Guild Hall | PairADice" };

export default async function ModPage() {
  const session = await requireRole("moderator", "/mod");
  return (
    <StaffAccess
      title="Guild Hall"
      intro="Where moderators keep the camp fair."
      coming={["Report queue", "Sanctions: warn, mute, suspend, ban", "Audit log"]}
      session={session}
    />
  );
}
