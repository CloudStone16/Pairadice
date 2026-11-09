import { Sprite } from "@/components/ui";

/** Live region that stays mounted so a message added after submit is announced. */
export function FormAlert({ message }: { message?: string }) {
  return (
    <div role="alert" className={message ? "" : "hidden"}>
      {message ? (
        <p className="flex items-start gap-2 rounded-frame border-2 border-[#8a2621] bg-[#fff1ec] p-3 text-[15px] font-semibold text-[#6e1c18]">
          <Sprite name="icon-warning" className="mt-0.5" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
