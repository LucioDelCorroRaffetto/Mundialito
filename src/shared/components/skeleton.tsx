/**
 * Theme-aware skeleton placeholder. Uses the elevated surface token so the
 * pulse is visible in both dark mode (subtle white tint) and light mode
 * (subtle black tint), instead of vanishing on white backgrounds.
 */
export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl h-20 w-full bg-black/10 dark:bg-white/10" />
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
