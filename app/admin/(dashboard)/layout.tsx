import Image from "next/image";
import Link from "next/link";
import vultLogo from "@/components/public/vult-logo.svg";
import { requireAdmin } from "@/lib/auth/admin";
import { signOutAdmin } from "./actions";

const navigation = [
  { href: "/admin", label: "Overview", ready: true },
  { href: "/admin/competitions", label: "Competitions", ready: true },
  { href: "/admin/operations", label: "Operations", ready: true },
  { href: "/admin/participants", label: "Participants", ready: true },
  { href: "/admin/providers", label: "Providers", ready: true },
  { href: "/admin/providers/fpl", label: "FPL Connector", ready: true },
  { href: "/admin/leaderboards", label: "Leaderboards", ready: true },
  { href: "/admin/winners", label: "Winners", ready: true },
  { href: "/admin/payments", label: "Payments", ready: true },
  { href: "/admin/communications", label: "Communications", ready: true },
  { href: "/admin/disputes", label: "Disputes", ready: true },
  { href: "/admin/reports", label: "Reports", ready: true },
  { href: "/admin/admins", label: "Admin users", ready: true, superAdminOnly: true },
  { href: "/admin/account", label: "Account", ready: true },
] satisfies Array<{
  href: string;
  label: string;
  ready: boolean;
  superAdminOnly?: boolean;
}>;

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  competition_manager: "Competition Manager",
  compliance_officer: "Compliance Officer",
  finance_officer: "Finance Officer",
  content_manager: "Content Manager",
  support_officer: "Support Officer",
  auditor: "Auditor",
};

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin();
  const initials = admin.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0]?.toUpperCase())
    .join("");
  const visibleNavigation = navigation.filter(
    (item) => !item.superAdminOnly || admin.role === "super_admin",
  );

  return (
    <div className="min-h-screen bg-[#f4f6fb] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-white/10 bg-[var(--brand-strong)] text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-5 lg:px-6 lg:py-7">
            <Link href="/admin" className="flex items-center gap-3">
              <span className="rounded-xl bg-white px-3 py-2 shadow-md shadow-black/10">
                <Image src={vultLogo} alt="Vult" className="h-auto w-[90px]" priority />
              </span>
              <span>
                <span className="block text-sm font-black">EPL Fantasy</span>
                <span className="block text-[11px] text-blue-200">Admin Portal</span>
              </span>
            </Link>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 lg:hidden">
              Menu
            </span>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 pb-5 lg:block lg:space-y-1 lg:overflow-visible lg:px-4 lg:pb-0">
            {visibleNavigation.map((item) =>
              item.ready ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-blue-100 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-disabled="true"
                  title="This module will be added in a later implementation phase"
                  className="block cursor-not-allowed whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-blue-300/55"
                >
                  {item.label}
                  <span className="ml-2 text-[9px] font-black uppercase tracking-[0.12em]">
                    Soon
                  </span>
                </span>
              ),
            )}
          </nav>

          <div className="mt-auto hidden border-t border-white/10 p-4 lg:block">
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-black text-[var(--brand-strong)]">
                  {initials || "VA"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{admin.full_name}</p>
                  <p className="truncate text-xs text-blue-200">
                    {roleLabels[admin.role] ?? admin.role}
                  </p>
                </div>
              </div>
              <form action={signOutAdmin} className="mt-4">
                <button
                  type="submit"
                  className="w-full rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-blue-100 transition hover:bg-white/10 hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-white px-5 py-4 sm:px-8 lg:px-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">
              Administration
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Multi-season competition operations
            </p>
          </div>
          <div className="flex items-center gap-3 lg:hidden">
            <span className="text-right">
              <span className="block text-xs font-black text-[var(--brand-strong)]">
                {admin.full_name}
              </span>
              <span className="block text-[10px] text-[var(--muted)]">
                {roleLabels[admin.role] ?? admin.role}
              </span>
            </span>
            <form action={signOutAdmin}>
              <button
                type="submit"
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-black text-[var(--brand)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <div className="px-5 py-7 sm:px-8 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
