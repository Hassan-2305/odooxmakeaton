import type { UserRole } from "@brightloop/shared";
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router";
import { ErrorState } from "@/components/error-state";
import { FullPageSpinner } from "@/layouts/shell-parts";
import { homePathFor, useMe } from "@/lib/auth";
import { LandingPage } from "@/pages/landing/landing-page";

/**
 * Renders child routes only for a signed-in user whose role (from /api/auth/me) is in
 * `roles`. Signed-out users go to /login with a `next` back here; other roles go home.
 */
export function RequireRole({ roles }: { roles: readonly UserRole[] }) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageSpinner />;
  if (me.isError) return <ErrorState className="min-h-svh" error={me.error} onRetry={() => void me.refetch()} />;

  const user = me.data;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}

/**
 * Login/register/forgot: signed-in users are sent to `?next` or their home page. Signing in
 * updates the cached user, so this is also what redirects after a successful login.
 */
export function GuestOnly() {
  const me = useMe();
  const [params] = useSearchParams();
  if (me.isPending) return <FullPageSpinner />;
  if (me.data) return <Navigate to={safeNext(params.get("next")) ?? homePathFor(me.data.role)} replace />;
  return <Outlet />;
}

/** Only same-app paths: "/invoices" yes, "//evil.com" or "https://..." no. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

/** "/" → the user's home, or the public landing page. */
export function HomeRedirect() {
  const me = useMe();
  if (me.isPending) return <FullPageSpinner />;
  return me.data ? <Navigate to={homePathFor(me.data.role)} replace /> : <LandingPage />;
}
