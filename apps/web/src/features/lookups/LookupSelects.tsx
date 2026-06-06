import { Select } from "@/components/ui/select";
import { useCategories, usePriorities, useStatuses } from "./useLookups";

export function CategorySelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const categories = useCategories();
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">No category</option>
      {categories.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

export function PrioritySelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const priorities = usePriorities();
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">No priority</option>
      {priorities.data?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </Select>
  );
}

export function StatusSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const statuses = useStatuses();
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">No status</option>
      {statuses.data?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

export function StatusBadge({ statusId }: { statusId: number | null }) {
  const statuses = useStatuses();
  const st = statuses.data?.find((s) => s.id === statusId);
  if (!st) return null;
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-foreground"
      style={st.color ? { borderColor: st.color } : undefined}
    >
      {st.name}
    </span>
  );
}

export function LookupBadges({
  categoryId,
  priorityId,
}: {
  categoryId: number | null;
  priorityId: number | null;
}) {
  const categories = useCategories();
  const priorities = usePriorities();
  const cat = categories.data?.find((c) => c.id === categoryId);
  const pri = priorities.data?.find((p) => p.id === priorityId);
  return (
    <>
      {cat && (
        <span
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-foreground"
          style={cat.color ? { borderColor: cat.color } : undefined}
        >
          {cat.name}
        </span>
      )}
      {pri && (
        <span
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
          style={pri.color ? { borderColor: pri.color, color: pri.color } : undefined}
        >
          {pri.name}
        </span>
      )}
    </>
  );
}
