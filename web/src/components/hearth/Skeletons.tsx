function Block({ className = "" }: { className?: string }) {
  // opaque on purpose: translucent skeletons read as faded content
  return <div className={`motion-safe:animate-pulse rounded-window bg-plum ring-1 ring-lavender/30 ${className}`} />;
}

export function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-6">
      <Block className="h-24" />
      <div className="grid gap-6 md:grid-cols-2">
        <Block className="h-48" />
        <Block className="h-48" />
      </div>
      <span className="sr-only">Loading&hellip;</span>
    </div>
  );
}

/** Stand-in for the Game Shelf while its data loads. */
export function ShelfSkeleton() {
  return (
    <div role="status" aria-label="Loading the game shelf">
      <Block className="h-20 lg:h-72" />
      <span className="sr-only">Loading games&hellip;</span>
    </div>
  );
}

/** Stand-in for the Campfire column while friends and picks load. */
export function CampfireSkeleton() {
  return (
    <div role="status" aria-label="Stoking the campfire" className="flex flex-col gap-8">
      <Block className="h-80" />
      <Block className="h-48" />
      <span className="sr-only">Loading friends and quick picks&hellip;</span>
    </div>
  );
}
