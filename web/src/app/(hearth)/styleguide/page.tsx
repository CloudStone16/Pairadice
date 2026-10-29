import { notFound } from "next/navigation";
import { Avatar, Button, Chip, Meter, Sprite, Tooltip, Window } from "@/components/ui";

export const metadata = { title: "Style guide | PairADice" };

export default function StyleGuide() {
  // a developer reference, not part of the product
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="flex flex-1 items-center justify-center py-4">
      <Window title="PairADice" className="w-full max-w-xl">
        <div className="flex items-center gap-4">
          <Sprite name="dice-32" scale={2} className="motion-safe:animate-float" />
          <div>
            <h1 className="font-display text-3xl font-bold">Find your party.</h1>
            <p className="text-lavender">Pull up a log by the fire and roll for a squad.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Chip tone="lavender">Chill</Chip>
          <Chip tone="ember">Evenings</Chip>
          <Chip tone="green">Open seats</Chip>
          <Chip tone="blue">Voice</Chip>
          <Chip tone="red">Ranked</Chip>
          <Chip tone="yellow">Casual</Chip>
          <Chip tone="parchment">Co-op</Chip>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="red">Host</Button>
          <Button variant="yellow">Join</Button>
          <Button variant="green">Ready</Button>
          <Button variant="blue" size="sm">Browse</Button>
          <Button variant="ghost" size="sm">Later</Button>
          <Button variant="yellow" disabled>Full</Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Meter value={82} label="Compatibility" />
          <Meter value={48} label="Party fill" />
          <Meter value={20} label="Reliability" />
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Tooltip content="Online"><Avatar userId={1} size={64} status="online" /></Tooltip>
          <Avatar userId={2} size={64} status="ingame" />
          <Avatar userId={3} size={32} status="idle" />
          <Avatar userId={4} size={32} status="away" />
          <Avatar userId={5} size={16} status="suspended" />
        </div>

        <Window variant="parchment" title="Notice board" className="mt-8">
          <p>No quests posted yet. Check back after supper.</p>
        </Window>
      </Window>
    </div>
  );
}
