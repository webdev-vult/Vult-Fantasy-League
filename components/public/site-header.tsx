import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/rules", label: "Rules" },
  { href: "/prizes", label: "Prizes" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/announcements", label: "Announcements" },
  { href: "/support", label: "Support" },
];

export function SiteHeader({ registrationOpen = false }: { registrationOpen?: boolean }) {
  return (
    <header className="border-b border-[var(--border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand)] text-sm font-black tracking-[0.14em] text-white shadow-lg shadow-blue-950/20">
            V
          </span>
          <span>
            <span className="block text-sm font-black text-[var(--brand-strong)]">Vult Fantasy</span>
            <span className="block text-xs text-[var(--muted)]">Competition Platform</span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <nav className="flex flex-wrap gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl px-3 py-2 text-sm font-bold text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/register"
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5"
          >
            {registrationOpen ? "Register now" : "Registration"}
          </Link>
        </div>
      </div>
    </header>
  );
}
