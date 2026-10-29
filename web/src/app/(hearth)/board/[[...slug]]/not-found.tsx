import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/hearth/NotFoundPanel";

export const metadata: Metadata = { title: "Quest board not found | PairADice" };

export default function BoardNotFound() {
  return (
    <NotFoundPanel
      title="No such shelf on the board"
      message="We could not find that game or mode. Pick one from the Game Shelf, or browse every open quest."
    />
  );
}
