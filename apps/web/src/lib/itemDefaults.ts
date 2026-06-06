/** Remember last-used category/priority per item type so new items start there. */

export interface ItemDefaults {
  categoryId: number | null;
  priorityId: number | null;
}

const key = (type: string) => `notestodo.defaults.${type}`;

export function getDefaults(type: "note" | "todo" | "calendar"): ItemDefaults {
  try {
    const raw = localStorage.getItem(key(type));
    if (!raw) return { categoryId: null, priorityId: null };
    const parsed = JSON.parse(raw) as Partial<ItemDefaults>;
    return {
      categoryId: typeof parsed.categoryId === "number" ? parsed.categoryId : null,
      priorityId: typeof parsed.priorityId === "number" ? parsed.priorityId : null,
    };
  } catch {
    return { categoryId: null, priorityId: null };
  }
}

export function rememberDefaults(type: "note" | "todo" | "calendar", d: ItemDefaults): void {
  try {
    localStorage.setItem(key(type), JSON.stringify(d));
  } catch {
    // localStorage unavailable (private mode) — defaults just don't persist
  }
}
