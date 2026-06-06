import { cn } from "@/lib/utils";

export function Badge({
  className,
  color,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
      style={color ? { borderColor: color, color } : undefined}
      {...props}
    />
  );
}
