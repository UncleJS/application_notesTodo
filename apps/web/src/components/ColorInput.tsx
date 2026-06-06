import { cn } from "@/lib/utils";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Color picker for optional color fields: native swatch picker plus a clear
 * control ("" = no color). Values are #rrggbb hex strings.
 */
export function ColorInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <input
        type="color"
        value={HEX_RE.test(value) ? value : "#888888"}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Pick color"
        className="h-8 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
      />
      {value ? (
        <span className="inline-flex items-center gap-1 font-mono text-xs text-foreground">
          {value}
          <button
            type="button"
            title="Clear color"
            className="text-foreground hover:opacity-70"
            onClick={() => onChange("")}
          >
            ×
          </button>
        </span>
      ) : (
        <span className="text-xs text-foreground/70">no color</span>
      )}
    </div>
  );
}
