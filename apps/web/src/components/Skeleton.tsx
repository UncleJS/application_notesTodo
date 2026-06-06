import type { CSSProperties } from "react";

/** Loading placeholders — animate-pulse over the secondary surface (dark-theme safe). */

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-md bg-secondary ${className}`} style={style} />;
}

/** Row placeholders matching list layouts (todos, calendar list). */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 py-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-1">
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className="h-4" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
          <Skeleton className="h-4 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Card placeholders matching grid layouts (notes). */
export function SkeletonGrid({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
