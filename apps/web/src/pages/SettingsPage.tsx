import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe, type Me } from "@/features/auth/useMe";
import { useCategories, usePriorities } from "@/features/lookups/useLookups";
import { useTags } from "@/features/tags/useTags";
import { ColorInput } from "@/components/ColorInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface LookupRow {
  id: number;
  name: string;
  color: string | null;
  archivedAtUTC: string | null;
  sortOrder?: number;
  weight?: number;
}

function LookupManager({
  basePath,
  queryKey,
  rows,
  numberField,
  numberLabel,
  canEdit,
  canCreate = canEdit,
  showArchived,
  onShowArchived,
}: {
  basePath: string;
  queryKey: string;
  rows: LookupRow[] | undefined;
  numberField?: "sortOrder" | "weight";
  numberLabel?: string;
  canEdit: boolean;
  canCreate?: boolean;
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: [queryKey], exact: false });
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [num, setNum] = useState("0");
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ name: "", color: "", num: "0" });

  const create = useMutation({
    mutationFn: () =>
      api(basePath, {
        method: "POST",
        json: {
          name,
          color: color || null,
          ...(numberField ? { [numberField]: Number(num) || 0 } : {}),
        },
      }),
    onSuccess: () => {
      setName("");
      setColor("");
      setNum("0");
      invalidate();
    },
  });
  const save = useMutation({
    mutationFn: (id: number) =>
      api(`${basePath}/${id}`, {
        method: "PATCH",
        json: {
          name: edit.name,
          color: edit.color || null,
          ...(numberField ? { [numberField]: Number(edit.num) || 0 } : {}),
        },
      }),
    onSuccess: () => {
      setEditId(null);
      invalidate();
    },
  });
  const archive = useMutation({
    mutationFn: (id: number) => api(`${basePath}/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (id: number) => api(`${basePath}/${id}/restore`, { method: "POST" }),
    onSuccess: invalidate,
  });

  function startEdit(r: LookupRow) {
    setEditId(r.id);
    setEdit({
      name: r.name,
      color: r.color ?? "",
      num: numberField ? String(r[numberField] ?? 0) : "0",
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <label className="flex items-center gap-1.5 self-end text-sm text-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => onShowArchived(e.target.checked)}
        />
        Show archived
      </label>
      {canCreate && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-44" />
          <ColorInput value={color} onChange={setColor} />
          {numberField && (
            <Input
              placeholder={numberLabel}
              type="number"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              className="w-24"
            />
          )}
          <Button type="submit" size="sm" disabled={!name || create.isPending}>
            Add
          </Button>
          {create.isError && <p className="text-sm text-destructive">{(create.error as Error).message}</p>}
        </form>
      )}
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Color</TH>
            {numberField && <TH>{numberLabel}</TH>}
            {canEdit && <TH></TH>}
          </TR>
        </THead>
        <TBody>
          {rows?.map((r) =>
            editId === r.id ? (
              <TR key={r.id}>
                <TD>
                  <Input
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    className="h-8 w-40 text-xs"
                  />
                </TD>
                <TD>
                  <ColorInput value={edit.color} onChange={(v) => setEdit({ ...edit, color: v })} />
                </TD>
                {numberField && (
                  <TD>
                    <Input
                      type="number"
                      value={edit.num}
                      onChange={(e) => setEdit({ ...edit, num: e.target.value })}
                      className="h-8 w-20 text-xs"
                    />
                  </TD>
                )}
                <TD className="text-right">
                  <span className="inline-flex gap-1.5">
                    <Button size="sm" disabled={!edit.name || save.isPending} onClick={() => save.mutate(r.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      Cancel
                    </Button>
                  </span>
                  {save.isError && (
                    <p className="text-xs text-destructive">{(save.error as Error).message}</p>
                  )}
                </TD>
              </TR>
            ) : (
              <TR key={r.id} className={r.archivedAtUTC ? "opacity-60" : undefined}>
                <TD>{r.name}</TD>
                <TD>
                  {r.color && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.color}
                    </span>
                  )}
                </TD>
                {numberField && <TD>{r[numberField]}</TD>}
                {canEdit && (
                  <TD className="text-right">
                    <span className="inline-flex gap-1.5">
                      {!r.archivedAtUTC && (
                        <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                          Edit
                        </Button>
                      )}
                      {r.archivedAtUTC ? (
                        <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}>
                          Restore
                        </Button>
                      ) : (
                        <Button size="sm" variant="destructive" onClick={() => archive.mutate(r.id)}>
                          Archive
                        </Button>
                      )}
                    </span>
                  </TD>
                )}
              </TR>
            ),
          )}
        </TBody>
      </Table>
    </div>
  );
}

function Feedback({ result }: { result: { ok?: boolean; error?: string; message?: string } | null }) {
  if (!result) return null;
  return result.error ? (
    <p className="text-sm text-destructive">{result.error}</p>
  ) : (
    <p className="text-sm text-foreground">✓ {result.message ?? "OK"}</p>
  );
}

function SmtpTab() {
  const settings = useQuery({
    queryKey: ["settings", "smtp"],
    queryFn: () =>
      api<{ host: string | null; port: number | null; user: string | null; from: string | null; tls: string; hasPassword: boolean }>(
        "/api/v1/settings/smtp",
      ),
  });
  const [form, setForm] = useState({ host: "", port: "587", user: "", password: "", from: "", tls: "starttls" });
  const [result, setResult] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null);

  useEffect(() => {
    if (settings.data) {
      setForm({
        host: settings.data.host ?? "",
        port: String(settings.data.port ?? 587),
        user: settings.data.user ?? "",
        password: "",
        from: settings.data.from ?? "",
        tls: settings.data.tls,
      });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      api("/api/v1/settings/smtp", {
        method: "PUT",
        json: {
          host: form.host || null,
          port: form.port ? Number(form.port) : null,
          user: form.user || null,
          // empty field = keep the stored password
          ...(form.password ? { password: form.password } : {}),
          from: form.from || null,
          tls: form.tls,
        },
      }),
    onSuccess: () => setResult({ ok: true }),
    onError: (err) => setResult({ error: (err as Error).message }),
  });
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; to: string }>("/api/v1/settings/smtp/test", { method: "POST", json: {} }),
    onSuccess: (r) => setResult({ ok: true, message: `Test email sent to ${r.to}` }),
    onError: (err) => setResult({ error: (err as Error).message }),
  });

  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label>Host</Label>
          <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
        </div>
        <div className="flex w-24 flex-col gap-1.5">
          <Label>Port</Label>
          <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Username</Label>
        <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Password {settings.data?.hasPassword && "(stored — leave blank to keep)"}</Label>
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>From address</Label>
        <Input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>TLS</Label>
        <Select value={form.tls} onChange={(e) => setForm({ ...form, tls: e.target.value })}>
          <option value="none">none</option>
          <option value="starttls">STARTTLS</option>
          <option value="tls">TLS</option>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
        <Button type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
          Send test email
        </Button>
      </div>
      <Feedback result={result} />
    </form>
  );
}

function WebhookTab() {
  const settings = useQuery({
    queryKey: ["settings", "webhook"],
    queryFn: () => api<{ url: string | null; enabled: boolean; hasSecret: boolean }>("/api/v1/settings/webhook"),
  });
  const [form, setForm] = useState({ url: "", enabled: false, secret: "" });
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (settings.data) {
      setForm({ url: settings.data.url ?? "", enabled: settings.data.enabled, secret: "" });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      api("/api/v1/settings/webhook", {
        method: "PUT",
        json: {
          url: form.url || null,
          enabled: form.enabled,
          ...(form.secret ? { secret: form.secret } : {}),
        },
      }),
    onSuccess: () => setResult({ ok: true }),
    onError: (err) => setResult({ error: (err as Error).message }),
  });
  const test = useMutation({
    mutationFn: () => api("/api/v1/settings/webhook/test", { method: "POST" }),
    onSuccess: () => setResult({ ok: true }),
    onError: (err) => setResult({ error: (err as Error).message }),
  });

  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label>Webhook URL</Label>
        <Input
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://…"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>
          HMAC secret {settings.data?.hasSecret && "(stored — leave blank to keep)"} — sent as
          x-notestodo-signature
        </Label>
        <Input
          type="password"
          value={form.secret}
          onChange={(e) => setForm({ ...form, secret: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        Enabled
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
        <Button type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
          Send test webhook
        </Button>
      </div>
      <Feedback result={result} />
    </form>
  );
}

function ProfileTab() {
  const me = useMe();
  const qc = useQueryClient();
  const [profile, setProfile] = useState({ displayName: "", email: "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (me.data) setProfile({ displayName: me.data.displayName ?? "", email: me.data.email ?? "" });
  }, [me.data]);

  const saveProfile = useMutation({
    mutationFn: () =>
      api<Me>("/api/v1/auth/me", {
        method: "PATCH",
        json: { displayName: profile.displayName || null, email: profile.email || null },
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["me"], updated);
      setResult({ ok: true });
    },
    onError: (err) => setResult({ error: (err as Error).message }),
  });
  const changePw = useMutation({
    mutationFn: () =>
      api("/api/v1/auth/change-password", {
        method: "POST",
        json: { currentPassword: pw.current, newPassword: pw.next },
      }),
    onSuccess: () => {
      setPw({ current: "", next: "" });
      setResult({ ok: true });
    },
    onError: (err) => setResult({ error: (err as Error).message }),
  });

  return (
    <div className="flex max-w-md flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveProfile.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label>Display name</Label>
          <Input
            value={profile.displayName}
            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Email (reminder recipient address)</Label>
          <Input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
        </div>
        <Button type="submit" className="self-start" disabled={saveProfile.isPending}>
          Save profile
        </Button>
      </form>
      <form
        className="flex flex-col gap-3 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          changePw.mutate();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label>Current password</Label>
          <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>New password</Label>
          <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <Button
          type="submit"
          className="self-start"
          disabled={!pw.current || pw.next.length < 4 || changePw.isPending}
        >
          Change password
        </Button>
      </form>
      <Feedback result={result} />
    </div>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const canEdit = me.data?.isAdmin ?? false;
  const [showArchived, setShowArchived] = useState(false);
  const categories = useCategories(showArchived);
  const priorities = usePriorities(showArchived);
  const tags = useTags(showArchived);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">Settings</h1>
      {!canEdit && <p className="text-sm text-foreground">Lookups are managed by an administrator.</p>}
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          {canEdit && <TabsTrigger value="smtp">Email (SMTP)</TabsTrigger>}
          {canEdit && <TabsTrigger value="webhook">Webhook</TabsTrigger>}
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <LookupManager
            basePath="/api/v1/categories"
            queryKey="categories"
            rows={categories.data}
            numberField="sortOrder"
            numberLabel="Sort"
            canEdit={canEdit}
            showArchived={showArchived}
            onShowArchived={setShowArchived}
          />
        </TabsContent>
        <TabsContent value="priorities">
          <LookupManager
            basePath="/api/v1/priorities"
            queryKey="priorities"
            rows={priorities.data}
            numberField="weight"
            numberLabel="Weight"
            canEdit={canEdit}
            showArchived={showArchived}
            onShowArchived={setShowArchived}
          />
        </TabsContent>
        <TabsContent value="tags">
          {/* tag creation is open to everyone; rename/archive is admin-only */}
          <LookupManager
            basePath="/api/v1/tags"
            queryKey="tags"
            rows={tags.data}
            canEdit={canEdit}
            canCreate
            showArchived={showArchived}
            onShowArchived={setShowArchived}
          />
        </TabsContent>
        {canEdit && (
          <TabsContent value="smtp">
            <SmtpTab />
          </TabsContent>
        )}
        {canEdit && (
          <TabsContent value="webhook">
            <WebhookTab />
          </TabsContent>
        )}
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
