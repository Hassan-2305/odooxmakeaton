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
import { Avatar, Brand, UserMenu } from "./shell-parts";

function SidebarNav({ user, onNavigate }: { user: AuthUser; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {navForRole(user.role).map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label && (
            <p className="mb-2 px-3 text-[0.68rem] font-semibold tracking-[0.12em] text-sidebar-muted uppercase">
              {group.label}
            </p>
          )}
          <ul className="space-y-1">
            {group.items.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-gradient-to-r from-orange-500/25 to-orange-500/5 font-medium text-white"
                        : "text-sidebar-foreground hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-orange-500" aria-hidden />
                      )}
                      <Icon
                        className={cn("size-[1.05rem] shrink-0", isActive ? "text-orange-400" : "opacity-80")}
                        aria-hidden
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ user, onNavigate }: { user: AuthUser; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#121b31] to-[#0a1120] text-sidebar-foreground">
      <div className="flex h-16 items-center px-5 text-white">
        <Brand to="/dashboard" />
      </div>
      <SidebarNav user={user} onNavigate={onNavigate} />
      <div className="border-t border-sidebar-border p-3">
        <UserMenu user={user} dark />
      </div>
    </div>
  );
}

/** Back-office shell: navy sidebar on ≥768px, a slide-in drawer below, and a slim top bar. */
export function AppLayout() {
  const user = useRequiredUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const live = useSSE();

  return (
    <div className="min-h-svh md:grid md:grid-cols-[16.5rem_1fr]">
      <aside className="sticky top-0 hidden h-svh md:block">
        <SidebarBody user={user} />
      </aside>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="bg-sidebar">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Main navigation</DialogDescription>
          <SidebarBody user={user} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-white/80 px-4 backdrop-blur-md md:px-8">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </Button>
          <Brand to="/dashboard" className="md:hidden" />
          <div className="ml-auto flex items-center gap-4">
            <LiveIndicator
              status={live}
              className="hidden rounded-full border bg-white px-3 py-1 shadow-xs sm:inline-flex"
            />
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right leading-tight lg:block">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
              <Avatar name={user.name} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[90rem] min-w-0 flex-1 px-4 py-7 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
