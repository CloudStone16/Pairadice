import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AboutSection } from "@/components/character/AboutSection";
import { AccountsSection } from "@/components/character/AccountsSection";
import { AvailabilityGrid } from "@/components/character/AvailabilityGrid";
import { GamesSection } from "@/components/character/GamesSection";
import { LanguagesSection } from "@/components/character/LanguagesSection";
import { TagsSection } from "@/components/character/TagsSection";
import { ButtonLink, Sprite, Window } from "@/components/ui";
import { getViewer } from "@/lib/auth/viewer";
import { getProfileEditData } from "@/lib/queries-profile";

export const metadata: Metadata = { title: "Edit character | PairADice" };

const JUMPS = [
  { id: "about", label: "About you" },
  { id: "languages", label: "Languages" },
  { id: "tags", label: "Vibe tags" },
  { id: "accounts", label: "Platform accounts" },
  { id: "games", label: "Games" },
  { id: "availability", label: "Availability" },
];

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28">
      <Window title={title} variant="parchment" landmark>
        {intro ? <p className="mb-5 text-base text-wood-dark">{intro}</p> : null}
        {children}
      </Window>
    </div>
  );
}

export default async function EditCharacterPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=%2Fcharacter%2Fedit");
  const data = await getProfileEditData(viewer);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight [text-shadow:0_2px_0_var(--color-ink)]">
            Edit your character
          </h1>
          <p className="mt-1 text-base text-lavender">
            Each part saves on its own, so take your time and change only what you like.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/character" variant="ghost" size="sm">
            <Sprite name="icon-character" />
            Back to your sheet
          </ButtonLink>
        </div>
        <nav aria-label="Sections of this page">
          <ul role="list" className="flex flex-wrap gap-2">
            {JUMPS.map((j) => (
              <li key={j.id}>
                <a
                  href={`#${j.id}`}
                  className="inline-flex min-h-11 items-center rounded-pill bg-plum px-4 py-1 text-[15px] font-semibold text-cream ring-1 ring-inset ring-lavender/50 hover:bg-plum-2"
                >
                  {j.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section id="about" title="About you">
        <AboutSection data={{ about: data.about, countries: data.countries, regions: data.regions }} />
      </Section>
      <Section id="languages" title="Languages">
        <LanguagesSection data={{ languages: data.languages }} />
      </Section>
      <Section id="tags" title="Vibe tags">
        <TagsSection data={{ tags: data.tags }} />
      </Section>
      <Section
        id="accounts"
        title="Platform accounts"
        intro="The gamertags you play under. Up to 8 of them, and none are shown to strangers by default."
      >
        <AccountsSection data={{ accounts: data.accounts, platforms: data.platforms }} />
      </Section>
      <Section id="games" title="Games" intro="Your rank, modes and favourite roles for each game. Matching uses these.">
        <GamesSection
          data={{ games: data.games, gameProfiles: data.gameProfiles, accounts: data.accounts, platforms: data.platforms }}
        />
      </Section>
      <Section id="availability" title="Availability" intro="When you are usually around, in your own local time.">
        <AvailabilityGrid initial={data.availability} timezone={data.about.timezone} />
      </Section>
    </div>
  );
}
