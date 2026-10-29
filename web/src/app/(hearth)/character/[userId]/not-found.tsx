import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/hearth/NotFoundPanel";

export const metadata: Metadata = { title: "Character not found | PairADice" };

export default function CharacterNotFound() {
  return (
    <NotFoundPanel
      title="No adventurer by that name"
      message="We could not find that character. They may have left the camp, or the link may be mistyped."
      href="/friends"
      cta="Back to Friends"
    />
  );
}
