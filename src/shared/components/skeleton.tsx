export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-white/10 h-20 w-full" />
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
