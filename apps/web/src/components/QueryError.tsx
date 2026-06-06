import { Button } from "@/components/ui/button";

/** Inline error panel with a retry affordance for failed list queries. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : "request failed";
  return (
    <div className="flex items-center gap-3 rounded-md border border-destructive p-3">
      <p className="min-w-0 flex-1 truncate text-sm text-destructive">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
