import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampBanner, type ViewerRole } from "@/components/hearth/CampBanner";
import { CampRules, LookingFor } from "@/components/hearth/CampRules";
import { CampPaused } from "@/components/hearth/CampPaused";
import { DialogueLog } from "@/components/hearth/DialogueLog";
import { CampActions } from "@/components/hearth/CampActions";
import { PartySeats } from "@/components/hearth/PartySeats";
import { SignInGate } from "@/components/hearth/SignInGate";
import { InviteBox } from "@/components/camp/InviteBox";
import { getViewer, hasRole } from "@/lib/auth/guards";
import { markRecommendationOutcome } from "@/lib/recommend";
import {
  getCamp,
  getCurrentUser,
  getJoinRoles,
  getMyPlatformAccounts,
  getRoster,
  getSessionChat,
  getSessionLanguages,
  getSessionTags,
  getSlotNeeds,
  isCampMember,
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
    const user = await getCurrentUser();
    if (!user) return { title: "Camp | PairADice" };
    camp = await getCamp(id, user.user_id);
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

  const user = await getCurrentUser();
  if (!user) return <SignInGate />;

  // Resolve existence first (a real 404 must happen before anything streams), then fetch the
  // rest in one round trip. getRoster and getSessionChat enforce visibility and membership themselves.
  const camp = await getCamp(id, user.user_id);
  if (!camp) notFound();
  // a suspended or banned host pauses the camp: nothing else about it is fetched or rendered
  if (isPaused(camp.host_status)) return <CampPaused />;

  const viewer = await getViewer();
  // best effort and not awaited: logging a view must never slow or fail the page
  if (viewer) void markRecommendationOutcome(viewer, id, "viewed");

  const [roster, needs, languages, tags, chat, isMember] = await Promise.all([
    getRoster(id, user.user_id),
    getSlotNeeds(id),
    getSessionLanguages(id),
    getSessionTags(id),
    getSessionChat(id, user.user_id),
    isCampMember(id, user.user_id),
  ]);
  const role: ViewerRole =
    camp.host_id === user.user_id
      ? "host"
      : isMember
        ? "member"
        : roster.some((r) => r.user_id === user.user_id && r.status === "requested")
          ? "knocking"
          : "none";
  const canJoin = role === "none" && camp.status === "open";
  const [joinRoles, accounts] = canJoin && viewer
    ? await Promise.all([getJoinRoles(id), getMyPlatformAccounts(viewer, id)])
    : [[], []];
  const canManage = role === "host" || (viewer !== null && hasRole(viewer, "moderator"));
  const invite =
    isMember && camp.discord_invite_url && /^https?:\/\//i.test(camp.discord_invite_url)
      ? camp.discord_invite_url
      : null;

  return (
    <div className="flex flex-col gap-10">
      <CampBanner
        camp={camp}
        role={role}
        timeZone={user.timezone}
        actions={
          <CampActions
            sessionId={id}
            status={camp.status}
            role={role}
            roles={joinRoles}
            accounts={accounts}
            auto={camp.join_policy === "auto"}
          />
        }
      />

      <div className="grid gap-10 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PartySeats
          camp={camp}
          roster={roster}
          viewerId={user.user_id}
          canSeePrivate={isMember}
          canManage={canManage}
          timeZone={user.timezone}
        />
        <div className="flex flex-col gap-10">
          <LookingFor needs={needs} />
          <CampRules camp={camp} languages={languages} tags={tags} />
          {invite ? <InviteBox url={invite} /> : null}
        </div>
      </div>

      <DialogueLog messages={chat} hostId={camp.host_id} status={camp.status} timeZone={user.timezone} />
    </div>
  );
}
