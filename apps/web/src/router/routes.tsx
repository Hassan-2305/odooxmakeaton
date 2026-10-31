import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { AppLayout } from "@/layouts/app-layout";
import { BillingRunDetailPage } from "@/pages/billing-runs/billing-run-detail-page";
import { BillingRunsPage } from "@/pages/billing-runs/billing-runs-page";
import { AuthLayout } from "@/layouts/auth-layout";
import { APP_NAV, PORTAL_NAV } from "@/layouts/nav";
import { PortalLayout } from "@/layouts/portal-layout";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password-page";
import { LoginPage } from "@/pages/auth/login-page";
import { RegisterPage } from "@/pages/auth/register-page";
import { ResetPasswordPage } from "@/pages/auth/reset-password-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { PlaceholderPage } from "@/pages/placeholder-page";
import { ProductDetailPage } from "@/pages/catalog/product-detail-page";
import { ProductsPage } from "@/pages/catalog/products-page";
import { CustomerDetailPage } from "@/pages/customers/customer-detail-page";
import { CustomersPage } from "@/pages/customers/customers-page";
import { DashboardPage } from "@/pages/dashboard/dashboard-page";
import { IntegrityPage } from "@/pages/integrity/integrity-page";
import { InvoiceDetailPage } from "@/pages/invoices/invoice-detail-page";
import { InvoicesPage } from "@/pages/invoices/invoices-page";
import { PaymentsPage } from "@/pages/payments/payments-page";
import { PortalInvoicesPage } from "@/pages/portal/portal-invoices-page";
import { PortalOverviewPage } from "@/pages/portal/portal-overview-page";
import { PortalPaymentsPage } from "@/pages/portal/portal-payments-page";
import { PortalProfilePage } from "@/pages/portal/portal-profile-page";
import { PortalSubscriptionsPage } from "@/pages/portal/portal-subscriptions-page";
import { QuotationsPage } from "@/pages/quotations/quotations-page";
import { RenewalsPage } from "@/pages/renewals/renewals-page";
import { AuditPage } from "@/pages/settings/audit-page";
import { SubscriptionDetailPage } from "@/pages/subscriptions/subscription-detail-page";
import { SubscriptionsPage } from "@/pages/subscriptions/subscriptions-page";
import { GuestOnly, HomeRedirect, RequireRole } from "./guards";

/** Built screens; every other nav item renders a placeholder until its feature lands. */
const SCREENS: Record<string, ReactNode> = {
  "/dashboard": <DashboardPage />,
  "/customers": <CustomersPage />,
  "/quotations": <QuotationsPage />,
  "/subscriptions": <SubscriptionsPage />,
  "/products": <ProductsPage />,
  "/invoices": <InvoicesPage />,
  "/payments": <PaymentsPage />,
  "/billing-runs": <BillingRunsPage />,
  "/renewals": <RenewalsPage />,
  "/revenue-integrity": <IntegrityPage />,
  "/settings/audit": <AuditPage />,
};

const BACK_OFFICE = ["admin", "staff"] as const;
const relative = (path: string, base: string) => path.slice(base.length).replace(/^\//, "");

/** Back-office routes from the sidebar config; each is guarded by the same roles that see it. */
const navRoutes: RouteObject[] = APP_NAV.flatMap((group) =>
  group.items.map((item) => ({
    element: <RequireRole roles={item.roles ?? group.roles ?? BACK_OFFICE} />,
    children: [{ path: relative(item.to, ""), element: SCREENS[item.to] ?? <PlaceholderPage title={item.label} /> }],
  })),
);

/** Detail pages and old links, outside the sidebar. */
const extraRoutes: RouteObject[] = [
  {
    element: <RequireRole roles={BACK_OFFICE} />,
    children: [
      { path: "customers/:id", element: <CustomerDetailPage /> },
      { path: "products/:id", element: <ProductDetailPage /> },
      { path: "subscriptions/:id", element: <SubscriptionDetailPage /> },
      { path: "invoices/:id", element: <InvoiceDetailPage /> },
      { path: "billing-runs/:id", element: <BillingRunDetailPage /> },
    ],
  },
  {
    // Taxes and discounts now live as tabs on Products & Plans.
    element: <RequireRole roles={["admin"]} />,
    children: [
      { path: "settings/taxes", element: <Navigate to="/products?tab=taxes" replace /> },
      { path: "settings/discounts", element: <Navigate to="/products?tab=discounts" replace /> },
    ],
  },
];

const appRoutes: RouteObject[] = [...navRoutes, ...extraRoutes];

const PORTAL_SCREENS: Record<string, ReactNode> = {
  "/portal": <PortalOverviewPage />,
  "/portal/subscriptions": <PortalSubscriptionsPage />,
  "/portal/invoices": <PortalInvoicesPage />,
  "/portal/payments": <PortalPaymentsPage />,
  "/portal/profile": <PortalProfilePage />,
};

const portalRoutes: RouteObject[] = PORTAL_NAV.map((item) => {
  const element = PORTAL_SCREENS[item.to] ?? <PlaceholderPage title={item.label} />;
  return item.to === "/portal" ? { index: true, element } : { path: relative(item.to, "/portal"), element };
});

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
