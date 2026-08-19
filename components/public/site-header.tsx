import Image from "next/image";
import Link from "next/link";
import vultLogo from "./vult-logo.svg";

const links = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How to play" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/#fixtures", label: "Fixtures" },
  { href: "/prizes", label: "Prizes" },
  { href: "/rules", label: "Rules" },
  { href: "/announcements", label: "Announcements" },
];

export function SiteHeader({ registrationOpen = false }: { registrationOpen?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Vult Fantasy home">
          <Image src={vultLogo} alt="Vult" className="h-auto w-[50px] sm:w-[118px]" priority />
          <span className="hidden border-l border-[var(--border)] pl-3 text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)] sm:block">
            EPL Fantasy
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
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

        <div className="flex items-center gap-2">
          <Link
            href="/register"
            className="hidden rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-black text-[var(--brand-strong)] shadow-lg shadow-cyan-950/10 transition hover:-translate-y-0.5 hover:bg-[var(--accent-strong)] sm:inline-flex"
          >
            {registrationOpen ? "Join the league" : "Registration"}
          </Link>

          <details className="group relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center rounded-full border border-[var(--border)] bg-white px-4 py-3 text-sm font-black text-[var(--brand)] marker:content-none">
              Menu
            </summary>
            <nav className="absolute right-0 top-14 w-64 space-y-1 rounded-3xl border border-[var(--border)] bg-white p-3 shadow-2xl" aria-label="Mobile navigation">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="block rounded-xl px-4 py-3 text-sm font-bold text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--brand)]">
                  {link.label}
                </Link>
              ))}
              <Link href="/register" className="mt-2 block rounded-xl bg-[var(--accent)] px-4 py-3 text-center text-sm font-black text-[var(--brand-strong)] sm:hidden">
                {registrationOpen ? "Join the league" : "Registration"}
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
