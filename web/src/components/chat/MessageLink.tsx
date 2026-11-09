import Link from "next/link";
import { Sprite } from "@/components/ui";

/** "Message" link to /messages/<id> (24 px+ target). */
export function MessageLink({ userId, name, className = "" }: { userId: number; name: string; className?: string }) {
  return (
    <Link
      href={`/messages/${userId}`}
      aria-label={`Message ${name}`}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-semibold text-lavender underline-offset-2 hover:bg-plum-2 hover:text-cream hover:underline ${className}`}
    >
      <Sprite name="icon-chat" />
      Message
    </Link>
  );
}
