import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatLocal } from "@/lib/formatLocal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface AdminUser {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  lastLoginAtUTC: string | null;
  archivedAtUTC: string | null;
}

interface Group {
  id: number;
  name: string;
  description: string | null;
  archivedAtUTC: string | null;
}

interface Member {
  id: number;
  userId: number;
  username: string;
  displayName: string | null;
}

function UsersTab() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "users"] });
  const [showArchived, setShowArchived] = useState(false);
  const users = useQuery({
    queryKey: ["admin", "users", showArchived],
    queryFn: () => api<AdminUser[]>(`/api/v1/admin/users?includeArchived=${showArchived}`),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", email: "", isAdmin: false });
  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/admin/users", {
        method: "POST",
        json: {
          username: form.username,
          password: form.password,
          displayName: form.displayName || null,
          email: form.email || null,
          isAdmin: form.isAdmin,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ username: "", password: "", displayName: "", email: "", isAdmin: false });
      void invalidate();
    },
  });

  const archive = useMutation({
    mutationFn: (id: number) => api(`/api/v1/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`/api/v1/admin/users/${id}/restore`, { method: "POST" }),
    onSuccess: invalidate,
  });
  const resetPw = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api(`/api/v1/admin/users/${id}/reset-password`, { method: "POST", json: { password } }),
  });

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ displayName: "", email: "", isAdmin: false });
  const save = useMutation({
    mutationFn: (id: number) =>
      api(`/api/v1/admin/users/${id}`, {
        method: "PATCH",
        json: {
          displayName: editForm.displayName || null,
          email: editForm.email || null,
          isAdmin: editForm.isAdmin,
        },
      }),
    onSuccess: () => {
      setEditUser(null);
      void invalidate();
    },
  });

  function startEdit(u: AdminUser) {
    setEditUser(u);
    setEditForm({ displayName: u.displayName ?? "", email: u.email ?? "", isAdmin: u.isAdmin });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Create user</DialogTitle>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label>Username</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Display name</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email (for reminders)</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isAdmin}
                  onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
                />
                Administrator
              </label>
              {create.isError && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
              <Button type="submit" disabled={!form.username || form.password.length < 4 || create.isPending}>
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Username</TH>
            <TH>Display name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Last login</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {users.data?.map((u) => (
            <TR key={u.id} className={u.archivedAtUTC ? "opacity-60" : undefined}>
              <TD>{u.username}</TD>
              <TD>{u.displayName}</TD>
              <TD>{u.email}</TD>
              <TD>{u.isAdmin ? <Badge>admin</Badge> : null}</TD>
              <TD>{formatLocal(u.lastLoginAtUTC)}</TD>
              <TD className="text-right">
                {u.archivedAtUTC ? (
                  <Button size="sm" variant="outline" onClick={() => restore.mutate(u.id)}>
                    Restore
                  </Button>
                ) : (
                  <span className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const pw = prompt(`New password for ${u.username}:`);
                        if (pw) resetPw.mutate({ id: u.id, password: pw });
                      }}
                    >
                      Reset password
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => archive.mutate(u.id)}>
                      Archive
                    </Button>
                  </span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {editUser && (
        <Dialog open onOpenChange={(o) => !o && setEditUser(null)}>
          <DialogContent>
            <DialogTitle>Edit {editUser.username}</DialogTitle>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(editUser.id);
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label>Display name</Label>
                <Input
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email (for reminders)</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={editForm.isAdmin}
                  onChange={(e) => setEditForm({ ...editForm, isAdmin: e.target.checked })}
                />
                Administrator
              </label>
              {save.isError && <p className="text-sm text-destructive">{(save.error as Error).message}</p>}
              <Button type="submit" disabled={save.isPending}>
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function GroupMembers({ group }: { group: Group }) {
  const qc = useQueryClient();
  const key = ["admin", "groups", group.id, "members"];
  const members = useQuery({
    queryKey: key,
    queryFn: () => api<Member[]>(`/api/v1/admin/groups/${group.id}/members`),
  });
  // candidate pool for the add-member dropdown — active users only
  const users = useQuery({
    queryKey: ["admin", "users", false],
    queryFn: () => api<AdminUser[]>("/api/v1/admin/users?includeArchived=false"),
  });
  const add = useMutation({
    mutationFn: (userId: number) =>
      api(`/api/v1/admin/groups/${group.id}/members`, { method: "POST", json: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (userId: number) =>
      api(`/api/v1/admin/groups/${group.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const memberIds = new Set(members.data?.map((m) => m.userId));
  const candidates = users.data?.filter((u) => !u.archivedAtUTC && !memberIds.has(u.id)) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {members.data?.map((m) => (
          <Badge key={m.userId} className="gap-1">
            {m.displayName ?? m.username}
            <button className="ml-1 text-foreground hover:opacity-70" onClick={() => remove.mutate(m.userId)}>
              ×
            </button>
          </Badge>
        ))}
        {members.data?.length === 0 && <span className="text-sm text-foreground">No members</span>}
      </div>
      {candidates.length > 0 && (
        <select
          className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value=""
          onChange={(e) => {
            if (e.target.value) add.mutate(Number(e.target.value));
          }}
        >
          <option value="">Add member…</option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName ?? u.username}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function GroupsTab() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "groups"] });
  const [showArchived, setShowArchived] = useState(false);
  const groups = useQuery({
    queryKey: ["admin", "groups", showArchived],
    queryFn: () => api<Group[]>(`/api/v1/admin/groups?includeArchived=${showArchived}`),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/admin/groups", {
        method: "POST",
        json: { name: form.name, description: form.description || null },
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ name: "", description: "" });
      void invalidate();
    },
  });
  const archive = useMutation({
    mutationFn: (id: number) => api(`/api/v1/admin/groups/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`/api/v1/admin/groups/${id}/restore`, { method: "POST" }),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New group</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Create group</DialogTitle>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {create.isError && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
              <Button type="submit" disabled={!form.name || create.isPending}>
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>
      <div className="flex flex-col gap-3">
        {groups.data?.map((g) => (
          <div key={g.id} className={`rounded-lg border border-border p-3 ${g.archivedAtUTC ? "opacity-60" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="font-medium text-foreground">{g.name}</span>
                {g.description && <span className="ml-2 text-sm text-foreground">{g.description}</span>}
              </div>
              {g.archivedAtUTC ? (
                <Button size="sm" variant="outline" onClick={() => restore.mutate(g.id)}>
                  Restore
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={() => archive.mutate(g.id)}>
                  Archive
                </Button>
              )}
            </div>
            {!g.archivedAtUTC && <GroupMembers group={g} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">Admin</h1>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
