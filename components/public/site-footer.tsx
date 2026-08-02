import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-10 text-sm text-[var(--muted)] sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div>
          <p className="font-black text-[var(--brand-strong)]">Vult Fantasy Platform</p>
          <p className="mt-1">A reusable multi-season competition platform.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/leaderboards" className="font-bold hover:text-[var(--brand)]">Leaderboards</Link>
          <Link href="/rules" className="font-bold hover:text-[var(--brand)]">Rules</Link>
          <Link href="/privacy" className="font-bold hover:text-[var(--brand)]">Privacy</Link>
          <Link href="/admin/login" className="font-bold hover:text-[var(--brand)]">Admin</Link>
        </div>
      </div>
    </footer>
  );
}
