import type { AuthUser } from "@brightloop/shared";
import { LogOutIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/lib/auth";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The Recurra mark: an "R" drawn as one unbroken stroke, stem into bowl into leg, a single loop. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#F26A1B" />
      <path
        d="M10 25V12.5a5.5 5.5 0 0 1 11 0 5.5 5.5 0 0 1-5.5 5.5H14l8 7"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("flex items-center gap-2.5 text-[1.15rem] font-bold tracking-[-0.03em]", className)}>
      <LogoMark />
      <span>{BRAND_NAME.toLowerCase()}</span>
    </Link>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-[#2a3654] text-xs font-semibold text-white ring-1 ring-white/15",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Avatar, name/role and a sign-out button. `dark` styles it for the navy sidebar. */
export function UserMenu({ user, compact = false, dark = false }: { user: AuthUser; compact?: boolean; dark?: boolean }) {
  const logout = useLogout();
  const navigate = useNavigate();

  const signOut = () =>
    logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) });

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5",
        !compact && "rounded-xl p-2",
        !compact && (dark ? "bg-white/5" : "bg-surface"),
      )}
    >
      <Avatar name={user.name} className={compact ? "size-8" : undefined} />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className={cn("truncate text-sm font-semibold", dark && "text-white")}>{user.name}</p>
          <p className={cn("truncate text-xs capitalize", dark ? "text-sidebar-muted" : "text-muted-foreground")}>
            {user.role}
          </p>
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("ml-auto", dark && "text-sidebar-foreground hover:bg-white/10 hover:text-white")}
        onClick={signOut}
        disabled={logout.isPending}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOutIcon />
      </Button>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-label="Loading">
      <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}
