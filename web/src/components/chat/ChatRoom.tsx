"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, Chip } from "@/components/ui";
import { UserLink } from "@/components/hearth/UserLink";
import { sendDm, sendSessionMessage } from "@/app/(hearth)/chat/actions";
import { formatStamp } from "@/lib/format";
import { backoffMs, isLineLike, mergeLines, ROOM_MAX_LINES } from "@/lib/chat/lines";
import { CHAT_LIMITS } from "@/lib/chat/types";
import { reportHref } from "@/lib/report/validate";
import { Composer } from "./Composer";
import { DeleteLineForm } from "./DeleteLineForm";
import { EmoteText } from "./EmoteText";

/** One line as the room shows it, for both camp chat and DMs. */
export interface RoomLine {
  messageId: number;
  senderId: number;
  name: string;
  content: string | null;
  isDeleted: boolean;
  sentAt: string; // ISO UTC
  edited: boolean;
}

/** Composer state decided on the server. */
export type RoomComposer = { mode: "ready" } | { mode: "note"; text: string };

interface RawLine {
  messageId: number;
  senderId: number;
  sentAt: string;
  content?: string | null;
  isDeleted?: boolean;
  displayName?: string;
  username?: string;
  editedAt?: string | null;
}

export function toRoomLine(raw: RawLine, names: Record<number, string>): RoomLine {
  return {
    messageId: raw.messageId,
    senderId: raw.senderId,
    name: raw.displayName ?? raw.username ?? names[raw.senderId] ?? "Player",
    content: raw.content ?? null,
    isDeleted: raw.isDeleted === true,
    sentAt: raw.sentAt,
    edited: !!raw.editedAt,
  };
}

const NEAR_BOTTOM_PX = 48;

function sameLines(a: RoomLine[], b: RoomLine[]): boolean {
  return (
    a.length === b.length &&
    a.every((l, i) => {
      const o = b[i];
      return l.messageId === o.messageId && l.content === o.content && l.isDeleted === o.isDeleted && l.edited === o.edited;
    })
  );
}

export function ChatRoom({
  kind,
  targetId,
  sessionIdForReport,
  viewerId,
  hostId,
  initial,
  names,
  composer,
  timeZone,
  back,
  emptyTitle,
  emptyText,
}: {
  kind: "session" | "dm";
  /** Session id (kind session) or the other player's id (kind dm). */
  targetId: number;
  sessionIdForReport?: number;
  viewerId: number;
  hostId?: number;
  initial: RoomLine[];
  /** Display names by user id, for DM lines (which carry ids only). */
  names: Record<number, string>;
  composer: RoomComposer;
  timeZone: string;
  back: string;
  emptyTitle: string;
  emptyText: ReactNode;
}) {
  const [lines, setLines] = useState<RoomLine[]>(initial);
  const [seenInitial, setSeenInitial] = useState(initial);
  const [announce, setAnnounce] = useState("");
  const [trouble, setTrouble] = useState<string | null>(null);
  // a server refresh (e.g. after Delete) hands down new initial lines: take them
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setLines(initial);
  }

  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastId = useRef(0);
  const pollNow = useRef<() => void>(() => {});
  const namesRef = useRef(names);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);

  useEffect(() => {
    lastId.current = lines.reduce((m, l) => Math.max(m, l.messageId), 0);
  }, [lines]);

  // keep the reader at the bottom only if they were already there
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;
    let inFlight = false;
    let polls = 0;
    let failures = 0;
    const url = kind === "session" ? `/api/chat/${targetId}` : `/api/dm/${targetId}`;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (stopped || inFlight) return;
      if (document.visibilityState !== "visible") return schedule(CHAT_LIMITS.pollMs);
      inFlight = true;
      polls += 1;
      // every 5th poll re-reads the latest page, so late commits and removed lines reach an open room
      const full = polls % 5 === 0;
      ctrl = new AbortController();
      try {
        const res = await fetch(`${url}?after=${full ? "" : lastId.current}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: ctrl.signal,
        });
        if (res.status === 401 || res.status === 403) {
          setTrouble(
            res.status === 401
              ? "You were signed out. Sign in again to keep chatting."
              : "You can no longer read this chat.",
          );
          return; // stop polling
        }
        if (!res.ok) throw new Error("poll failed");
        const body: unknown = await res.json();
        const raw = (body as { lines?: unknown }).lines;
        if (!Array.isArray(raw) || !raw.every(isLineLike)) throw new Error("bad shape");
        failures = 0;
        setTrouble(null);
        const fresh = (raw as RawLine[]).map((r) => toRoomLine(r, namesRef.current));
        if (fresh.length > 0) {
          setLines((prev) => {
            const next = mergeLines(prev, fresh, ROOM_MAX_LINES);
            const have = new Set(prev.map((l) => l.messageId));
            const others = fresh.filter((l) => !have.has(l.messageId) && l.senderId !== viewerId);
            if (others.length === 1) setAnnounce(`${others[0].name} says: ${others[0].content ?? "message removed"}`);
            else if (others.length > 1) setAnnounce(`${others.length} new messages`);
            return sameLines(prev, next) ? prev : next;
          });
        }
        schedule(!full && fresh.length >= CHAT_LIMITS.historyPage ? 250 : CHAT_LIMITS.pollMs);
      } catch (err) {
        if (stopped || (err instanceof DOMException && err.name === "AbortError")) return;
        failures += 1;
        setTrouble("Having trouble refreshing. Trying again shortly.");
        schedule(backoffMs(failures));
      } finally {
        inFlight = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    pollNow.current = () => schedule(0);
    document.addEventListener("visibilitychange", onVisible);
    schedule(CHAT_LIMITS.pollMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [kind, targetId, viewerId]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  return (
    <div>
      {lines.length === 0 ? (
        <div className="rounded-frame bg-ink/30 px-4 py-6 text-center">
          <p className="font-display text-lg font-semibold">{emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-prose text-lavender">{emptyText}</p>
        </div>
      ) : (
        <div
          ref={scroller}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={kind === "session" ? "Chat history" : "Conversation"}
          className="max-h-[60vh] overflow-y-auto overscroll-contain rounded-frame pr-1"
        >
          <ol role="list" className="space-y-4">
            {lines.map((m) => {
              const mine = m.senderId === viewerId;
              return (
                <li key={m.messageId} className={`flex items-start gap-3 ${mine ? "sm:flex-row-reverse" : ""}`}>
                  <Avatar userId={m.senderId} size={32} />
                  <div className="min-w-0 max-w-full flex-1 rounded-window bg-ink/60 px-4 py-3 ring-2 ring-inset ring-lavender/40">
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-display text-sm font-semibold">
                        <UserLink userId={m.senderId}>{mine ? "You" : m.name}</UserLink>
                      </span>
                      {kind === "session" && m.senderId === hostId ? <Chip tone="ember">Host</Chip> : null}
                      <time dateTime={m.sentAt} className="ml-auto text-sm text-lavender">
                        {formatStamp(m.sentAt, timeZone)}
                      </time>
                    </div>
                    {m.isDeleted || m.content === null ? (
                      <p className="italic text-lavender">message removed</p>
                    ) : (
                      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                        <EmoteText text={m.content} />
                        {m.edited ? <span className="ml-2 text-sm text-lavender">(edited)</span> : null}
                      </p>
                    )}
                    {!m.isDeleted && m.content !== null ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {mine ? (
                          <DeleteLineForm messageId={m.messageId} back={back} />
                        ) : (
                          <Link
                            href={reportHref(m.senderId, back, kind === "session" ? sessionIdForReport : undefined, m.messageId)}
                            aria-label={`Report this message from ${m.name}`}
                            className="inline-flex min-h-9 items-center rounded-pill px-3 text-sm font-semibold text-lavender underline underline-offset-2 hover:bg-plum-2 hover:text-cream"
                          >
                            Report
                          </Link>
                        )}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {trouble ? (
        <p className="mt-3 text-sm font-semibold" role="note">
          {trouble}
        </p>
      ) : null}

      {composer.mode === "ready" ? (
        <Composer
          action={kind === "session" ? sendSessionMessage : sendDm}
          idField={kind === "session" ? "sessionId" : "receiverId"}
          idValue={targetId}
          label={kind === "session" ? "Say something to the party" : "Write a message"}
          onSent={() => {
            pinned.current = true;
            pollNow.current();
          }}
        />
      ) : (
        <p className="mt-4 rounded-frame bg-ink/40 px-4 py-3 text-lavender ring-1 ring-inset ring-lavender/30">
          {composer.text}
        </p>
      )}
    </div>
  );
}
