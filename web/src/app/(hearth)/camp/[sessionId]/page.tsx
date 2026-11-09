import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampBanner, type ViewerRole } from "@/components/hearth/CampBanner";
import { CampRules, LookingFor } from "@/components/hearth/CampRules";
import { CampPaused } from "@/components/hearth/CampPaused";
import { DialogueLog } from "@/components/hearth/DialogueLog";
import { PartySeats } from "@/components/hearth/PartySeats";
import { Sprite, buttonClasses } from "@/components/ui";
import { dbRoleFor, getViewer } from "@/lib/auth/guards";
import {
  getCamp,
  getRoster,
  getSessionChat,
  getSessionLanguages,
  getSessionTags,
  getSlotNeeds,
  isCampMember,
  getUserById,
} from "@/lib/queries";

type Params = { sessionId: string };

function parseId(sessionId: string): number | null {
  if (!/^\d{1,15}$/.test(sessionId)) return null;
  const id = Number(sessionId);
  return Number.isSafeInteger(id) ? id : null;
}

const isPaused = (hostStatus: string) => hostStatus === "suspended" || hostStatus === "banned";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { sessionId } = await params;
  const id = parseId(sessionId);
  if (id === null) notFound();
  let camp = null;
  try {
    const viewer = await getViewer();
    camp = await getCamp(id, viewer?.userId ?? null, dbRoleFor(viewer));
  } catch {
    // the page itself reports the real error; use the generic title meanwhile
    return { title: "Camp | PairADice" };
  }
  if (!camp) notFound();
  // a paused camp must not leak its title
  return { title: isPaused(camp.host_status) ? "Camp paused | PairADice" : `${camp.title} | PairADice` };
}

export default async function CampPage({ params }: { params: Promise<Params> }) {
  const { sessionId } = await params;
  const id = parseId(sessionId);
  if (id === null) notFound();

  const viewer = await getViewer();
  const viewerId = viewer?.userId ?? null;
  const dbRole = dbRoleFor(viewer);
  const user = viewer ? await getUserById(viewer.userId, dbRole) : null;
  const timeZone = user?.timezone ?? "UTC";

  // Resolve existence first (a real 404 must happen before anything streams), then fetch the
  // rest in one round trip. getRoster and getSessionChat enforce visibility and membership themselves.
  const camp = await getCamp(id, viewerId, dbRole);
  if (!camp) notFound();
  // a suspended or banned host pauses the camp: nothing else about it is fetched or rendered
  if (isPaused(camp.host_status)) return <CampPaused />;

  const [roster, needs, languages, tags, chat, isMember] = await Promise.all([
    getRoster(id, viewerId, dbRole),
    getSlotNeeds(id),
    getSessionLanguages(id),
    getSessionTags(id),
    getSessionChat(id, viewerId, dbRole),
    isCampMember(id, viewerId, dbRole),
  ]);
  const role: ViewerRole =
    viewerId !== null && camp.host_id === viewerId
      ? "host"
      : isMember
        ? "member"
        : roster.some((r) => r.user_id === viewerId && r.status === "requested")
          ? "knocking"
          : "none";
  const invite =
    isMember && camp.discord_invite_url && /^https?:\/\//i.test(camp.discord_invite_url)
      ? camp.discord_invite_url
      : null;

  return (
    <div className="flex flex-col gap-10">
      <CampBanner camp={camp} role={role} timeZone={timeZone} />

      <div className="grid gap-10 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PartySeats
          camp={camp}
          roster={roster}
          viewerId={viewerId ?? 0}
          canSeePrivate={isMember}
          timeZone={timeZone}
        />
        <div className="flex flex-col gap-10">
          <LookingFor needs={needs} />
          <CampRules camp={camp} languages={languages} tags={tags} />
          {invite ? (
            <a
              href={invite}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("blue", "md", "self-start")}
            >
              <Sprite name="icon-chat" />
              Join the Discord
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>

      <DialogueLog messages={chat} hostId={camp.host_id} status={camp.status} timeZone={timeZone} />
    </div>
  );
}
