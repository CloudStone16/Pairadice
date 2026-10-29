import type { Quest } from "@/lib/types";
import { QuestCard } from "./QuestCard";

const SCREWS = ["left-1.5 top-1.5", "right-1.5 top-1.5", "bottom-1.5 left-1.5", "bottom-1.5 right-1.5"] as const;

/** A wood-framed cork board with the quest cards pinned to it. */
export function QuestGrid({ quests, timeZone }: { quests: Quest[]; timeZone: string }) {
  return (
    <div className="relative rounded-window bg-plank p-3 shadow-window ring-2 ring-ink sm:p-4">
      {SCREWS.map((pos) => (
        <span
          key={pos}
          aria-hidden="true"
          className={`absolute ${pos} h-2 w-2 rounded-full bg-brass ring-1 ring-ink`}
        />
      ))}
      <ul
        role="list"
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-x-6 gap-y-8 rounded-[8px] bg-cork-board p-5 pt-7 shadow-[inset_0_4px_0_rgb(18_14_31/0.45),inset_0_0_0_2px_rgb(18_14_31/0.5)]"
      >
        {quests.map((q, i) => (
          <li key={q.session_id} className="grid min-w-0">
            <QuestCard quest={q} timeZone={timeZone} index={i} />
          </li>
        ))}
      </ul>
    </div>
  );
}
