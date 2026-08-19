import Image from "next/image";
import Link from "next/link";
import vultLogo from "./vult-logo.svg";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[var(--brand-strong)] text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-9 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-10">
        <div className="max-w-md">
          <div className="w-fit rounded-2xl bg-white px-4 py-2">
            <Image src={vultLogo} alt="Vult" className="h-auto w-[50px]" />
          </div>
          <p className="mt-5 text-lg font-black">Play fantasy. Compete all season. Win with Vult.</p>
          <p className="mt-2 text-sm leading-7 text-blue-100">The official home for Vult EPL Fantasy registration, published standings, fixtures, prizes and competition updates.</p>
        </div>
        <div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-blue-100 lg:justify-end">
            <Link href="/how-it-works" className="font-bold hover:text-white">How to play</Link>
            <Link href="/leaderboards" className="font-bold hover:text-white">Leaderboards</Link>
            <Link href="/prizes" className="font-bold hover:text-white">Prizes</Link>
            <Link href="/announcements" className="font-bold hover:text-white">Announcements</Link>
            <Link href="/rules" className="font-bold hover:text-white">Rules</Link>
            <Link href="/privacy" className="font-bold hover:text-white">Privacy</Link>
          </div>
          <p className="mt-6 text-xs text-blue-200 lg:text-right">Terms, prizes and promotions are subject to published campaign rules.</p>
        </div>
      </div>
    </footer>
  );
}
