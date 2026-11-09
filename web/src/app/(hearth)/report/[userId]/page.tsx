import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportForm } from "@/components/report/ReportForm";
import { Avatar, Window } from "@/components/ui";
import { requireViewer } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/safe-next";
import { getUserById } from "@/lib/queries";
import { parseId } from "@/lib/report/validate";

export const metadata: Metadata = { title: "Report a player | PairADice", robots: { index: false } };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<SP> }) {
  const { userId } = await params;
  const id = parseId(userId);
  if (id === null) notFound();
  const sp = await searchParams;
  const back = safeNext(first(sp.back), "/hearth");
  const session = parseId(first(sp.session));
  const message = parseId(first(sp.message));

  const here = `/report/${id}${session ? `?session=${session}` : ""}`;
  const viewer = await requireViewer(here);
  if (viewer.userId === id) notFound();
  const target = await getUserById(id);
  if (!target) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Report a player</h1>
        <p className="text-lavender">
          Reports go to the moderators, who read every one. The player is not told who reported them.
        </p>
      </header>
      <Window title="The report">
        <div className="mb-5 flex items-center gap-3 rounded-frame bg-ink/30 p-3">
          <Avatar userId={target.user_id} size={32} />
          <div className="min-w-0 leading-tight">
            <p className="font-display text-lg font-semibold [overflow-wrap:anywhere]">{target.display_name}</p>
            <p className="text-[15px] text-lavender [overflow-wrap:anywhere]">@{target.username}</p>
          </div>
        </div>
        <ReportForm
          reportedId={id}
          name={target.display_name}
          session={session ? String(session) : ""}
          message={message ? String(message) : ""}
          back={back}
        />
      </Window>
      <p>
        <Link href={back} className="inline-flex min-h-11 items-center font-semibold text-lavender underline underline-offset-2 hover:text-cream">
          Never mind, go back
        </Link>
      </p>
    </div>
  );
}
