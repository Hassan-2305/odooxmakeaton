import { NavLink, Outlet } from "react-router";
import { useSSE } from "@/hooks/use-sse";
import { useRequiredUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PORTAL_NAV } from "./nav";
import { Brand, UserMenu } from "./shell-parts";

/** Customer portal shell: top bar with the nav; it scrolls sideways on small screens. */
export function PortalLayout() {
  const user = useRequiredUser();
  // Keeps invoices/payments fresh; the queries themselves stay customer-scoped by the API.
  useSSE();

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Brand to="/portal" />
          <nav aria-label="Portal" className="hidden flex-1 md:block">
            <PortalLinks />
          </nav>
          <div className="ml-auto md:ml-0">
            <UserMenu user={user} />
          </div>
        </div>
        <nav aria-label="Portal" className="overflow-x-auto border-t px-2 md:hidden">
          <PortalLinks />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function PortalLinks() {
  return (
    <ul className="flex gap-1 whitespace-nowrap">
      {PORTAL_NAV.map(({ label, to, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === "/portal"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm transition-colors md:py-[1.0625rem]",
                isActive
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
