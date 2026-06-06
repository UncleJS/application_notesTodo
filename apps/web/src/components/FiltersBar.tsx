import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * Filter controls render inline on md+ screens; on small screens they
 * collapse behind a "Filters" button into a popover (stacked vertically).
 * Children are controlled by the parent, so rendering them in either slot
 * shares the same state.
 */
export function FiltersBar({
  children,
  badge,
  align = "end",
}: {
  children: ReactNode;
  badge?: number;
  align?: "start" | "end";
}) {
  const auto = align === "end" ? "ml-auto " : "";
  return (
    <>
      <div className={`${auto}hidden flex-wrap items-center gap-2 md:flex`}>{children}</div>
      <div className={`${auto}md:hidden`}>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Filters
              {badge ? (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {badge}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-64 flex-col gap-2 [&>*]:w-full">
            {children}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
