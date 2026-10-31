import type { AuthUser } from "@brightloop/shared";
import { LogOutIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function Brand({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        B
      </span>
      <span>Brightloop One</span>
    </Link>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Avatar, name/role and a sign-out button. */
export function UserMenu({ user, compact = false }: { user: AuthUser; compact?: boolean }) {
  const logout = useLogout();
  const navigate = useNavigate();

  const signOut = () =>
    logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) });

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
        aria-hidden
      >
        {initials(user.name)}
      </span>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground capitalize">{user.role}</p>
        </div>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
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
