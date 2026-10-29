import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/hearth/NotFoundPanel";

export const metadata: Metadata = { title: "Page not found | PairADice" };

export default function HearthNotFound() {
  return (
    <NotFoundPanel
      title="Nothing here but crickets"
      message="That page is not on our map. Let's get you back to the board."
    />
  );
}
