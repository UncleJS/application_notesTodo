import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, User } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Share {
  id: number;
  level: "view" | "edit";
  grantee: { type: "user" | "group"; id: number; name: string };
}

interface DirUser {
  id: number;
  username: string;
  displayName: string | null;
}

interface DirGroup {
  id: number;
  name: string;
}

export function SharesPanel({ itemId, isOwner }: { itemId: number; isOwner: boolean }) {
  const qc = useQueryClient();
  const key = ["items", itemId, "shares"];
  const shares = useQuery({
    queryKey: key,
    queryFn: () => api<Share[]>(`/api/v1/items/${itemId}/shares`),
    enabled: isOwner,
  });
  const dirUsers = useQuery({
    queryKey: ["directory", "users"],
    queryFn: () => api<DirUser[]>("/api/v1/directory/users"),
    enabled: isOwner,
    staleTime: 60_000,
  });
  const dirGroups = useQuery({
    queryKey: ["directory", "groups"],
    queryFn: () => api<DirGroup[]>("/api/v1/directory/groups"),
    enabled: isOwner,
    staleTime: 60_000,
  });

  const [grantee, setGrantee] = useState(""); // "user-3" | "group-1"
  const [level, setLevel] = useState<"view" | "edit">("view");

  const invalidate = () => void qc.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: () => {
      const [type, id] = grantee.split("-");
      return api(`/api/v1/items/${itemId}/shares`, {
        method: "POST",
        json: { granteeType: type, granteeId: Number(id), level },
      });
    },
    onSuccess: () => {
      setGrantee("");
      invalidate();
    },
  });
  const changeLevel = useMutation({
    mutationFn: ({ shareId, newLevel }: { shareId: number; newLevel: "view" | "edit" }) =>
      api(`/api/v1/shares/${shareId}`, { method: "PATCH", json: { level: newLevel } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (shareId: number) => api(`/api/v1/shares/${shareId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  if (!isOwner) {
    return <p className="text-xs text-foreground/70">Only the owner manages sharing.</p>;
  }

  const sharedKeys = new Set(shares.data?.map((s) => `${s.grantee.type}-${s.grantee.id}`));

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {shares.data?.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm text-foreground">
            {s.grantee.type === "group" ? (
              <Users className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{s.grantee.name}</span>
            <Select
              className="h-7 w-20 text-xs"
              value={s.level}
              onChange={(e) =>
                changeLevel.mutate({ shareId: s.id, newLevel: e.target.value as "view" | "edit" })
              }
            >
              <option value="view">view</option>
              <option value="edit">edit</option>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
              ×
            </Button>
          </li>
        ))}
        {shares.data?.length === 0 && <span className="text-xs text-foreground/70">Not shared</span>}
      </ul>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (grantee) add.mutate();
        }}
      >
        <Select className="h-8 flex-1 text-xs" value={grantee} onChange={(e) => setGrantee(e.target.value)}>
          <option value="">Share with…</option>
          {dirUsers.data
            ?.filter((u) => !sharedKeys.has(`user-${u.id}`))
            .map((u) => (
              <option key={`u${u.id}`} value={`user-${u.id}`}>
                {u.displayName ?? u.username}
              </option>
            ))}
          {dirGroups.data
            ?.filter((g) => !sharedKeys.has(`group-${g.id}`))
            .map((g) => (
              <option key={`g${g.id}`} value={`group-${g.id}`}>
                Group: {g.name}
              </option>
            ))}
        </Select>
        <Select
          className="h-8 w-20 text-xs"
          value={level}
          onChange={(e) => setLevel(e.target.value as "view" | "edit")}
        >
          <option value="view">view</option>
          <option value="edit">edit</option>
        </Select>
        <Button type="submit" size="sm" variant="outline" disabled={!grantee || add.isPending}>
          Add
        </Button>
      </form>
      {add.isError && <p className="text-xs text-destructive">{(add.error as Error).message}</p>}
    </div>
  );
}
