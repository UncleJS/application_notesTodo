import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LookupBadges } from "@/features/lookups/LookupSelects";
import { TagPicker } from "@/features/tags/TagPicker";
import { LinksPanel } from "@/features/links/LinksPanel";
import { SharesPanel } from "@/features/shares/SharesPanel";
import { RemindersPanel } from "@/features/reminders/RemindersPanel";

interface BaseItem {
  id: number;
  itemType: "note" | "todo" | "calendar";
  title: string;
  ownerId: number;
  categoryId: number | null;
  priorityId: number | null;
  access: "owner" | "edit" | "view";
  createdAtUTC: string;
  updatedAtUTC: string;
  archivedAtUTC: string | null;
}

const typeEndpoint = {
  note: (id: number) => `/api/v1/notes/${id}`,
  todo: (id: number) => `/api/v1/todos/${id}`,
  calendar: (id: number) => `/api/v1/calendar/items/${id}`,
};

export default function ItemDetailPage() {
  const { id } = useParams();
  const itemId = Number(id);

  const base = useQuery({
    queryKey: ["items", itemId],
    queryFn: () => api<BaseItem>(`/api/v1/items/${itemId}`),
  });

  const detail = useQuery({
    queryKey: ["items", itemId, "detail", base.data?.itemType],
    queryFn: () => api<Record<string, unknown> & { tagIds?: number[] }>(typeEndpoint[base.data!.itemType](itemId)),
    enabled: !!base.data,
  });

  if (base.isLoading) return <p className="text-foreground">Loading…</p>;
  if (!base.data) return <p className="text-foreground">Item not found.</p>;
  const item = base.data;
  const canEdit = item.access !== "view";
  const tagIds = (detail.data?.tagIds as number[] | undefined) ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge>{item.itemType}</Badge>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">{item.title}</h1>
        <LookupBadges categoryId={item.categoryId} priorityId={item.priorityId} />
        {item.itemType === "note" && (
          <Link to={`/notes/${item.id}`} className="text-sm text-foreground underline">
            Open editor
          </Link>
        )}
      </div>
      <p className="text-xs text-foreground/70">
        Created {formatLocal(item.createdAtUTC)} · Updated {formatLocal(item.updatedAtUTC)}
        {item.archivedAtUTC && ` · Archived ${formatLocal(item.archivedAtUTC)}`}
      </p>

      {item.itemType === "todo" && detail.data && (
        <Card>
          <CardContent className="pt-4 text-sm text-foreground">
            <p>Status: {(detail.data.done as boolean) ? "done" : "open"}</p>
            {detail.data.dueAtUTC != null && <p>Due: {formatLocal(detail.data.dueAtUTC as string)}</p>}
            {detail.data.notesMd != null && (
              <p className="mt-2 whitespace-pre-wrap">{detail.data.notesMd as string}</p>
            )}
          </CardContent>
        </Card>
      )}
      {item.itemType === "calendar" && detail.data && (
        <Card>
          <CardContent className="pt-4 text-sm text-foreground">
            <p>
              {formatLocal(detail.data.startAtUTC as string)}
              {detail.data.endAtUTC != null && ` → ${formatLocal(detail.data.endAtUTC as string)}`}
            </p>
            {detail.data.location != null && <p>Location: {detail.data.location as string}</p>}
            {detail.data.descriptionMd != null && (
              <p className="mt-2 whitespace-pre-wrap">{detail.data.descriptionMd as string}</p>
            )}
          </CardContent>
        </Card>
      )}
      {item.itemType === "note" && detail.data?.bodyMd != null && (
        <Card>
          <CardContent className="pt-4">
            <p className="whitespace-pre-wrap text-sm text-foreground">{detail.data.bodyMd as string}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <TagPicker
              itemId={itemId}
              tagIds={tagIds}
              canEdit={canEdit}
              invalidateKeys={[["items", itemId], ["notes"], ["todos"], ["calendar"]]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Linked items</CardTitle>
          </CardHeader>
          <CardContent>
            <LinksPanel itemId={itemId} canEdit={canEdit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sharing</CardTitle>
          </CardHeader>
          <CardContent>
            <SharesPanel itemId={itemId} isOwner={item.access === "owner"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
          </CardHeader>
          <CardContent>
            <RemindersPanel itemId={itemId} isCalendar={item.itemType === "calendar"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
