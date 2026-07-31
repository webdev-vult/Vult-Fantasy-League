import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { signOutAdmin } from "./actions";

const navigation = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/competitions", label: "Competitions" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/leaderboards", label: "Leaderboards" },
  { href: "/admin/winners", label: "Winners" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/reports", label: "Reports" },
];

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

  return (
    <div className="min-h-screen bg-[#f4f6fb] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-white/10 bg-[var(--brand-strong)] text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-5 lg:px-6 lg:py-7">
            <Link href="/admin" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-[var(--brand)]">
                V
              </span>
              <span>
                <span className="block text-sm font-black">Vult Fantasy</span>
                <span className="block text-[11px] text-blue-200">Admin Portal</span>
              </span>
            </Link>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 lg:hidden">
              Menu
            </span>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 pb-5 lg:block lg:space-y-1 lg:overflow-visible lg:px-4 lg:pb-0">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold text-blue-100 transition hover:bg-white/10 hover:text-white lg:block"
              >
                {item.label}
              </Link>
            ))}
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
