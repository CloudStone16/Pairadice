import { Chip, Sprite } from "@/components/ui";
import type { Relation } from "@/lib/queries-social";
import { SocialAction } from "./SocialAction";
import { SocialStatus } from "./SocialStatus";

/** Friend / block controls on another player's character sheet. */
export function RelationshipBar({
  userId,
  name,
  relation,
  error,
}: {
  userId: number;
  name: string;
  relation: Relation;
  /** Set when the viewer cannot act (e.g. suspended): shown instead of buttons. */
  error?: string;
}) {
  if (error) {
    return (
      <p role="alert" className="flex max-w-xs items-start gap-2 text-left text-sm font-semibold">
        <Sprite name="icon-warning" className="mt-0.5" />
        <span>{error}</span>
      </p>
    );
  }
  const act = (kind: Parameters<typeof SocialAction>[0]["kind"]) => (
    <SocialAction kind={kind} userId={userId} name={name} />
  );
  return (
    <SocialStatus>
      <div role="group" aria-label={`Friendship with ${name}`} className="flex flex-col items-center gap-3">
        {relation === "friend" ? (
          <Chip tone="green" icon={<Sprite name="icon-user-check" />}>
            Friends
          </Chip>
        ) : null}
        {relation === "incoming" ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sprite name="icon-mail-incoming" />
            {name} sent you a friend request
          </p>
        ) : null}
        {relation === "outgoing" ? (
          <Chip tone="lavender" icon={<Sprite name="icon-mail-incoming" />}>
            Request sent
          </Chip>
        ) : null}
        {relation === "blocked" ? (
          <Chip tone="red" icon={<Sprite name="icon-block" />}>
            Blocked
          </Chip>
        ) : null}
        <div className="flex flex-wrap items-start justify-center gap-2">
          {relation === "none" ? act("send") : null}
          {relation === "outgoing" ? act("cancel") : null}
          {relation === "incoming" ? (
            <>
              {act("accept")}
              {act("decline")}
            </>
          ) : null}
          {relation === "friend" ? act("remove") : null}
          {relation === "blocked" ? act("unblock") : act("block")}
        </div>
      </div>
    </SocialStatus>
  );
}
