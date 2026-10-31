import type { AuthUser } from "@brightloop/shared";
import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { ContourArt } from "@/components/contour-art";
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
    <nav aria-label="Main" className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {navForRole(user.role).map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label && <p className="mb-1.5 px-3 text-xs font-medium text-sidebar-muted">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-white/[0.08] font-medium text-white"
                        : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-white",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn("size-[1.05rem] shrink-0", isActive ? "text-[#F26A1B]" : "opacity-70")}
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
    <div className="flex h-full flex-col border-r border-white/[0.06] bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-5 text-white">
        <Brand to="/dashboard" />
      </div>
      <SidebarNav user={user} onNavigate={onNavigate} />
      <div className="border-t border-white/[0.06] p-3">
        <UserMenu user={user} dark />
      </div>
    </div>
  );
}

/**
 * Back-office shell: navy sidebar, and a navy masthead band (with the contour artwork) that
 * the page title sits on; the page's cards overlap its lower edge.
 */
export function AppLayout() {
  const user = useRequiredUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const live = useSSE();

  return (
    <div className="min-h-svh md:grid md:grid-cols-[16rem_1fr]">
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

      <div className="relative isolate flex min-w-0 flex-col">
        <div className="absolute inset-x-0 top-0 -z-10 h-60 overflow-hidden bg-sidebar" aria-hidden>
          <ContourArt variant="band" className="absolute inset-0 size-full text-white/[0.09]" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-sidebar/60" />
        </div>
        <ContourArt
          variant="corner"
          highlight={-1}
          className="pointer-events-none fixed right-0 bottom-0 -z-20 h-[32rem] w-[44rem] max-w-full text-[#0f1729]/[0.06]"
        />

        <header className="flex h-16 items-center gap-3 px-4 text-white md:px-8">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </Button>
          <Brand to="/dashboard" className="md:hidden" />
          <div className="ml-auto flex items-center gap-4">
            <LiveIndicator status={live} className="hidden text-slate-300 sm:inline-flex" />
            <span className="hidden h-5 w-px bg-white/15 sm:block" aria-hidden />
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right leading-tight lg:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-slate-400 capitalize">{user.role}</p>
              </div>
              <Avatar name={user.name} />
            </div>
          </div>
        </header>

        <main data-band className="mx-auto w-full max-w-[90rem] min-w-0 flex-1 px-4 pt-4 pb-10 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
