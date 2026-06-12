import { useCallback, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Menu, Search, X } from "lucide-react";
import { useMe, useLogout } from "@/features/auth/useMe";
import { CommandPalette } from "@/features/command/CommandPalette";
import { useGlobalShortcuts } from "@/features/command/useGlobalShortcuts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/notes", label: "Notes" },
  { to: "/todos", label: "Todos" },
  { to: "/calendar", label: "Calendar" },
  { to: "/templates", label: "Templates" },
  { to: "/activity", label: "Activity" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const me = useMe();
  const logout = useLogout();
  // Mobile: sidebar is off-canvas and toggled from the top bar; md+ always visible.
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useGlobalShortcuts(openPalette);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent",
      isActive && "bg-secondary font-medium",
    );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center gap-2 border-b border-border p-3 md:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-lg font-bold text-foreground">NotesTodo</span>
        <Button variant="ghost" size="icon" aria-label="Search" className="ml-auto" onClick={openPalette}>
          <Search className="h-5 w-5" />
        </Button>
      </header>

      {/* Backdrop (mobile, menu open) */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-48 shrink-0 flex-col border-r border-border bg-background p-3",
          "transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "md:static md:translate-x-0",
        )}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <span className="text-lg font-bold text-foreground">NotesTodo</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close menu"
            className="md:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <button
          type="button"
          onClick={openPalette}
          className="mb-3 flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm text-foreground/70 hover:bg-accent hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
        </button>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={linkCls}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-2">
          <span className="text-xs text-foreground">{me.data?.displayName ?? me.data?.username}</span>
          <Button variant="outline" size="sm" onClick={() => void logout().then(() => location.assign("/login"))}>
            Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
