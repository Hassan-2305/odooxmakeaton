import type { AuthUser } from "@brightloop/shared";
import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { LiveIndicator } from "@/components/live-indicator";
import { Button } from "@/components/ui/button";
import { useSSE } from "@/hooks/use-sse";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { useRequiredUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { navForRole } from "./nav";
import { Brand, UserMenu } from "./shell-parts";

function SidebarNav({ user, onNavigate }: { user: AuthUser; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {navForRole(user.role).map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label && (
            <p className="mb-1 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-foreground/80 hover:bg-background hover:text-foreground",
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Back-office shell: grouped sidebar on ≥768px, a slide-in drawer below. */
export function AppLayout() {
  const user = useRequiredUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const live = useSSE();

  return (
    <div className="min-h-svh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-svh flex-col border-r bg-surface md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Brand to="/dashboard" />
        </div>
        <SidebarNav user={user} />
        <div className="space-y-2 border-t p-3">
          <LiveIndicator status={live} className="px-1" />
          <UserMenu user={user} />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
        <Button variant="ghost" size="icon-sm" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
          <MenuIcon />
        </Button>
        <Brand to="/dashboard" />
        <div className="ml-auto">
          <UserMenu user={user} compact />
        </div>
      </header>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Main navigation</DialogDescription>
          <div className="flex h-14 items-center border-b px-4">
            <Brand to="/dashboard" />
          </div>
          <SidebarNav user={user} onNavigate={() => setDrawerOpen(false)} />
          <div className="border-t p-3">
            <UserMenu user={user} />
          </div>
        </SheetContent>
      </Dialog>

      <main className="min-w-0 px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
