import { NavLink, Outlet } from "react-router-dom";
import { useMe, useLogout } from "@/features/auth/useMe";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/notes", label: "Notes" },
  { to: "/todos", label: "Todos" },
  { to: "/calendar", label: "Calendar" },
  { to: "/templates", label: "Templates" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const me = useMe();
  const logout = useLogout();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-48 shrink-0 flex-col border-r border-border p-3">
        <div className="mb-4 px-2 text-lg font-bold text-foreground">NotesTodo</div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent",
                  isActive && "bg-secondary font-medium",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          {me.data?.isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  "rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent",
                  isActive && "bg-secondary font-medium",
                )
              }
            >
              Admin
            </NavLink>
          )}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-2">
          <span className="text-xs text-foreground">{me.data?.displayName ?? me.data?.username}</span>
          <Button variant="outline" size="sm" onClick={() => void logout().then(() => location.assign("/login"))}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
