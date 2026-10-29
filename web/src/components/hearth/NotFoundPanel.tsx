import { ButtonLink } from "@/components/ui";
import { EmptyState } from "./EmptyState";

export function NotFoundPanel({
  title,
  message,
  href = "/board",
  cta = "Back to the Quest Board",
}: {
  title: string;
  message: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        as="h1"
        title={title}
        sprite="icon-scroll"
        action={
          <ButtonLink href={href} variant="yellow" size="sm">
            {cta}
          </ButtonLink>
        }
      >
        {message}
      </EmptyState>
    </div>
  );
}
