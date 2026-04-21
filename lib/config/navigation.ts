import {
  BarChart3,
  FileSpreadsheet,
  LayoutDashboard,
  ReceiptText,
  ScrollText,
  Settings2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type ProtectedNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const protectedNavigation: ProtectedNavigationItem[] = [
  {
    href: "/protected",
    label: "Overview",
    description: "Control panel for rollout, rules, and daily operations.",
    icon: LayoutDashboard,
  },
  {
    href: "/protected/students",
    label: "Students",
    description: "Student master records, admissions, and status control.",
    icon: UsersRound,
  },
  {
    href: "/protected/imports",
    label: "Imports",
    description: "Workbook-to-system migration batches and validation steps.",
    icon: FileSpreadsheet,
  },
  {
    href: "/protected/fee-structure",
    label: "Fee Structure",
    description: "Class-wise fee plans, due dates, and ledger defaults.",
    icon: ScrollText,
  },
  {
    href: "/protected/collections",
    label: "Collections",
    description: "Counter workflow, receipts, and payment capture.",
    icon: ReceiptText,
  },
  {
    href: "/protected/reports",
    label: "Reports",
    description: "Outstanding, day-book, and ledger-ready exports.",
    icon: BarChart3,
  },
  {
    href: "/protected/settings",
    label: "Settings",
    description: "Roles, environment readiness, and policy notes.",
    icon: Settings2,
  },
] as const;
