import { CalendarDays, FileText, ListTodo } from "lucide-react";

/** Icon per item type — shared by LinksPanel, the command palette and link chips. */
export const typeIcon = {
  note: FileText,
  todo: ListTodo,
  calendar: CalendarDays,
} as const;

export type ItemType = keyof typeof typeIcon;
