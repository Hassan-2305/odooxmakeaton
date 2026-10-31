import type { UserRole } from "@brightloop/shared";
import {
  BanknoteIcon,
  BoxesIcon,
  CalendarClockIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  PercentIcon,
  PlayCircleIcon,
  ReceiptIcon,
  RepeatIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
  CircleUserIcon,
  LandmarkIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Roles that see this item. Omit for every back-office role. */
  roles?: readonly UserRole[];
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
  roles?: readonly UserRole[];
}

const ADMIN = ["admin"] as const;

export const APP_NAV: NavGroup[] = [
  { items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboardIcon }] },
  {
    label: "Sales",
    items: [
      { label: "Customers", to: "/customers", icon: UsersIcon },
      { label: "Quotations", to: "/quotations", icon: FileTextIcon },
      { label: "Subscriptions", to: "/subscriptions", icon: RepeatIcon },
      { label: "Products & Plans", to: "/products", icon: BoxesIcon },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Invoices", to: "/invoices", icon: ReceiptIcon },
      { label: "Payments", to: "/payments", icon: WalletIcon },
      { label: "Billing Runs", to: "/billing-runs", icon: PlayCircleIcon },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Revenue Integrity", to: "/revenue-integrity", icon: ShieldCheckIcon },
      { label: "Renewals", to: "/renewals", icon: CalendarClockIcon },
    ],
  },
  {
    label: "Settings",
    roles: ADMIN,
    items: [
      { label: "Staff", to: "/settings/staff", icon: UserCogIcon },
      { label: "Taxes", to: "/settings/taxes", icon: LandmarkIcon },
      { label: "Discounts", to: "/settings/discounts", icon: PercentIcon },
      { label: "Audit", to: "/settings/audit", icon: ScrollTextIcon },
    ],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { label: "Overview", to: "/portal", icon: LayoutDashboardIcon },
  { label: "Subscriptions", to: "/portal/subscriptions", icon: RepeatIcon },
  { label: "Invoices", to: "/portal/invoices", icon: ReceiptIcon },
  { label: "Payments", to: "/portal/payments", icon: BanknoteIcon },
  { label: "Profile", to: "/portal/profile", icon: CircleUserIcon },
];

const allows = (roles: readonly UserRole[] | undefined, role: UserRole) => !roles || roles.includes(role);

/** The sidebar groups and items `role` may see; empty groups are dropped. */
export function navForRole(role: UserRole): NavGroup[] {
  return APP_NAV.filter((g) => allows(g.roles, role))
    .map((g) => ({ ...g, items: g.items.filter((i) => allows(i.roles, role)) }))
    .filter((g) => g.items.length > 0);
}
