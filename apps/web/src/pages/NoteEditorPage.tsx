import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelect, PrioritySelect } from "@/features/lookups/LookupSelects";
import { TagPicker } from "@/features/tags/TagPicker";
import { LinksPanel } from "@/features/links/LinksPanel";
import { SharesPanel } from "@/features/shares/SharesPanel";
import { useMe } from "@/features/auth/useMe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Note } from "./NotesPage";

export default function NoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const me = useMe();

  const note = useQuery({
    queryKey: ["notes", Number(id)],
    queryFn: () => api<Note>(`/api/v1/notes/${id}`),
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (note.data && !dirty) {
      setTitle(note.data.title);
      setBody(note.data.bodyMd ?? "");
    }
  }, [note.data, dirty]);

  const noteKey = ["notes", Number(id)];
  const patch = useMutation({
    mutationFn: (json: Record<string, unknown>) => api<Note>(`/api/v1/notes/${id}`, { method: "PATCH", json }),
    // optimistic: merge the patch into the cached note, roll back on error
    onMutate: async (json) => {
      await qc.cancelQueries({ queryKey: noteKey });
      const prev = qc.getQueryData<Note>(noteKey);
      if (prev) qc.setQueryData(noteKey, { ...prev, ...json });
      return { prev };
    },
    onError: (_err, _json, ctx) => {
      if (ctx?.prev) qc.setQueryData(noteKey, ctx.prev);
    },
    onSuccess: (updated, json) => {
      qc.setQueryData(noteKey, updated);
      void qc.invalidateQueries({ queryKey: ["notes"], exact: false });
      setDirty(false);
      if ("title" in json || "bodyMd" in json) toast({ title: "Note saved" });
    },
  });

  const restore = useMutation({
    mutationFn: () => api(`/api/v1/notes/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"], exact: false });
      toast({ title: "Note restored" });
    },
  });
  const archive = useMutation({
    mutationFn: () => api(`/api/v1/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes"], exact: false });
      toast({
        title: "Note archived",
        description: "It can be restored at any time.",
        action: { label: "Undo", onClick: () => restore.mutate() },
      });
      navigate("/notes");
    },
  });

  if (note.isLoading) return <p className="text-foreground">Loading…</p>;
  if (!note.data) return <p className="text-foreground">Note not found.</p>;
  const n = note.data;

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          className="text-base font-semibold"
        />
        <Button
          variant="ghost"
          size="icon"
          title={n.pinned ? "Unpin" : "Pin"}
          onClick={() => patch.mutate({ pinned: !n.pinned })}
        >
          {n.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex w-44 flex-col gap-1">
          <Label>Category</Label>
          <CategorySelect value={n.categoryId} onChange={(v) => patch.mutate({ categoryId: v })} />
        </div>
        <div className="flex w-44 flex-col gap-1">
          <Label>Priority</Label>
          <PrioritySelect value={n.priorityId} onChange={(v) => patch.mutate({ priorityId: v })} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            disabled={!dirty || patch.isPending}
            onClick={() => patch.mutate({ title, bodyMd: body })}
          >
            {patch.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
          {n.archivedAtUTC ? (
            <Button size="sm" variant="outline" onClick={() => restore.mutate()}>
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => archive.mutate()}>
              Archive
            </Button>
          )}
        </div>
      </div>
      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setDirty(true);
        }}
        placeholder="Write in markdown…"
        className="min-h-96 font-mono"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <TagPicker
              itemId={n.id}
              tagIds={n.tagIds}
              invalidateKeys={[["notes"]]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Linked items</CardTitle>
          </CardHeader>
          <CardContent>
            <LinksPanel itemId={n.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sharing</CardTitle>
          </CardHeader>
          <CardContent>
            <SharesPanel itemId={n.id} isOwner={me.data?.id === n.ownerId || (me.data?.isAdmin ?? false)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
