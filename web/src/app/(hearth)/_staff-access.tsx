import { Chip, Window } from "@/components/ui";
import type { Session } from "@/lib/auth/session";

/** Placeholder for the staff areas: what is coming, plus the viewer's roles and permissions (proof RBAC works). */
export function StaffAccess({
  title,
  intro,
  coming,
  session,
}: {
  title: string;
  intro: string;
  coming: string[];
  session: Session;
}) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">{title}</h1>
        <p className="text-lavender">{intro}</p>
      </header>
      <Window title="Coming soon" titleAs="h2">
        <ul role="list" className="list-disc space-y-1 pl-5">
          {coming.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Window>
      <Window title="Your access" titleAs="h2">
        <dl className="flex flex-col gap-4">
          <div>
            <dt className="font-display font-semibold">Roles</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {session.roles.map((r) => (
                <Chip key={r} tone="ember">
                  {r}
                </Chip>
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-display font-semibold">Permissions ({session.permissions.length})</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {session.permissions.length === 0 ? (
                <span className="text-lavender">None</span>
              ) : (
                session.permissions.map((p) => (
                  <Chip key={p} tone="lavender">
                    {p}
                  </Chip>
                ))
              )}
            </dd>
          </div>
        </dl>
      </Window>
    </div>
  );
}
