import type { Metadata } from "next";
import { StaffAccess } from "../_staff-access";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Admin | PairADice" };

export default async function AdminPage() {
  const session = await requireRole("admin", "/admin");
  return (
    <StaffAccess
      title="Admin"
      intro="The keys to the whole lodge."
      coming={["Role management", "Catalogue: games, modes, badges", "Vector lab"]}
      session={session}
    />
  );
}
