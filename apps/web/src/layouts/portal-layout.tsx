import type { AuthUser } from "@brightloop/shared";
import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { ContourArt } from "@/components/contour-art";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { useSSE } from "@/hooks/use-sse";
import { useRequiredUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PORTAL_NAV } from "./nav";
import { Brand, UserMenu } from "./shell-parts";

function PortalLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {PORTAL_NAV.map(({ label, to, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === "/portal"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar font-medium text-white [&>svg]:text-[#F26A1B]"
                  : "text-foreground/75 hover:bg-surface hover:text-foreground",
              )
            }
          >
            <Icon className="size-[1.05rem] shrink-0" aria-hidden />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function PortalSidebar({ user, onNavigate }: { user: AuthUser; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center px-5">
        <Brand to="/portal" />
      </div>
      <nav aria-label="Portal" className="flex-1 overflow-y-auto px-3 py-4">
        <PortalLinks onNavigate={onNavigate} />
      </nav>
      <div className="border-t p-3">
        <UserMenu user={user} />
      </div>
    </div>
  );
}

/** Customer portal shell: light sidebar on ≥768px, drawer below. */
export function PortalLayout() {
  const user = useRequiredUser();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Keeps invoices/payments fresh; the queries themselves stay customer-scoped by the API.
  useSSE();

  return (
    <div className="relative isolate min-h-svh md:grid md:grid-cols-[15.5rem_1fr]">
      <aside className="sticky top-0 hidden h-svh border-r md:block">
        <PortalSidebar user={user} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/85 px-4 backdrop-blur-md md:hidden">
        <Button variant="ghost" size="icon-sm" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
          <MenuIcon />
        </Button>
        <Brand to="/portal" />
      </header>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="bg-white">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Portal navigation</DialogDescription>
          <PortalSidebar user={user} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Dialog>

      <ContourArt
        variant="corner"
        highlight={-1}
        className="pointer-events-none fixed right-0 bottom-0 -z-10 h-[32rem] w-[44rem] max-w-full text-[#0f1729]/[0.06]"
      />
      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
