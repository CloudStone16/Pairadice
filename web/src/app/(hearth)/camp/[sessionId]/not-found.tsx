import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/hearth/NotFoundPanel";

export const metadata: Metadata = { title: "Camp not found | PairADice" };

export default function CampNotFound() {
  return (
    <NotFoundPanel
      title="This camp has packed up"
      message="We could not find that quest. It may never have existed, or it may be private to its party."
    />
  );
}
