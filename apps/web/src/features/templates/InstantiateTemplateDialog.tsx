import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateTimeInput } from "@/components/DateTimeInput";

export function InstantiateTemplateDialog({
  templateId,
  templateName,
  open,
  onOpenChange,
  onDone,
}: {
  templateId: number;
  templateName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (createdTodoIds: number[]) => void;
}) {
  const qc = useQueryClient();
  const [baseDate, setBaseDate] = useState<string | null>(() => new Date().toISOString());

  const instantiate = useMutation({
    mutationFn: () =>
      api<{ createdItemIds: number[] }>(`/api/v1/templates/${templateId}/instantiate`, {
        method: "POST",
        json: baseDate ? { baseDateUTC: baseDate } : {},
      }),
    onSuccess: (res) => {
      for (const key of [["todos"], ["notes"], ["calendar"]]) {
        void qc.invalidateQueries({ queryKey: key, exact: false });
      }
      onOpenChange(false);
      onDone?.(res.createdItemIds);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Create items{templateName ? ` from "${templateName}"` : " from template"}</DialogTitle>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            instantiate.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Base date (local time)</Label>
            <DateTimeInput value={baseDate} onChange={setBaseDate} />
            <p className="text-xs text-foreground/70">
              Due dates are calculated as base date + each item&apos;s relative days.
            </p>
          </div>
          {instantiate.isError && (
            <p className="text-sm text-destructive">{(instantiate.error as Error).message}</p>
          )}
          <Button type="submit" disabled={instantiate.isPending}>
            Create items
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
