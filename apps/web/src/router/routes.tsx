import type { ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { AppLayout } from "@/layouts/app-layout";
import { AuthLayout } from "@/layouts/auth-layout";
import { APP_NAV, PORTAL_NAV } from "@/layouts/nav";
import { PortalLayout } from "@/layouts/portal-layout";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password-page";
import { LoginPage } from "@/pages/auth/login-page";
import { RegisterPage } from "@/pages/auth/register-page";
import { ResetPasswordPage } from "@/pages/auth/reset-password-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { PlaceholderPage } from "@/pages/placeholder-page";
import { DashboardPage } from "@/pages/dashboard/dashboard-page";
import { RenewalsPage } from "@/pages/renewals/renewals-page";
import { AuditPage } from "@/pages/settings/audit-page";
import { GuestOnly, HomeRedirect, RequireRole } from "./guards";

/** Built screens; every other nav item renders a placeholder until its feature lands. */
const SCREENS: Record<string, ReactNode> = {
  "/dashboard": <DashboardPage />,
  "/renewals": <RenewalsPage />,
  "/settings/audit": <AuditPage />,
};

const BACK_OFFICE = ["admin", "staff"] as const;
const relative = (path: string, base: string) => path.slice(base.length).replace(/^\//, "");

/** Back-office routes from the sidebar config; each is guarded by the same roles that see it. */
const appRoutes: RouteObject[] = APP_NAV.flatMap((group) =>
  group.items.map((item) => ({
    element: <RequireRole roles={item.roles ?? group.roles ?? BACK_OFFICE} />,
    children: [{ path: relative(item.to, ""), element: SCREENS[item.to] ?? <PlaceholderPage title={item.label} /> }],
  })),
);

const portalRoutes: RouteObject[] = PORTAL_NAV.map((item) =>
  item.to === "/portal"
    ? { index: true, element: <PlaceholderPage title={item.label} /> }
    : { path: relative(item.to, "/portal"), element: <PlaceholderPage title={item.label} /> },
);

export const router = createBrowserRouter([
  { index: true, element: <HomeRedirect /> },
  {
    element: <AuthLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: "login", element: <LoginPage /> },
          { path: "register", element: <RegisterPage /> },
          { path: "forgot-password", element: <ForgotPasswordPage /> },
        ],
      },
      // Not guest-only: a reset link should work even if this browser is signed in.
      { path: "reset-password", element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <RequireRole roles={BACK_OFFICE} />,
    children: [{ element: <AppLayout />, children: appRoutes }],
  },
  {
    path: "portal",
    element: <RequireRole roles={["customer"]} />,
    children: [{ element: <PortalLayout />, children: portalRoutes }],
  },
  { path: "*", element: <NotFoundPage /> },
]);
