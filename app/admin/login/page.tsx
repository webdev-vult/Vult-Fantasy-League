import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import vultLogo from "@/components/public/vult-logo.svg";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signInAdmin } from "./actions";

const errorMessages: Record<string, string> = {
  missing_credentials: "Enter both your email address and password.",
  invalid_credentials: "The email address or password is incorrect.",
  not_authorized: "This account does not have access to the administration portal.",
};

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    next?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    const { data: admin } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("id", data.claims.sub)
      .eq("is_active", true)
      .maybeSingle();

    if (admin) {
      redirect("/admin");
    }
  }

  const errorMessage = params.error ? errorMessages[params.error] : null;
  const passwordChanged = params.notice === "password_changed_sign_in_again";
  const nextPath = params.next?.startsWith("/admin") ? params.next : "/admin";

  return (
    <main className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden bg-[var(--brand-strong)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-black/10">
            <Image src={vultLogo} alt="Vult" className="h-auto w-[84px]" priority />
          </span>
          <span>
            <span className="block text-sm font-black">EPL Fantasy</span>
            <span className="block text-xs text-blue-200">Administration Portal</span>
          </span>
        </Link>

        <div className="max-w-xl">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--accent)]">
            Secure competition operations
          </p>
          <h1 className="mt-5 text-5xl font-black leading-[1.04] tracking-[-0.045em]">
            Manage participants, scores, winners and prizes from one controlled workspace.
          </h1>
          <p className="mt-6 text-lg leading-8 text-blue-100">
            Administrative access is restricted to approved Vult staff accounts with assigned roles.
          </p>
        </div>

        <p className="text-xs text-blue-200">Vult EPL Fantasy League · Staff portal</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="rounded-xl bg-white py-1">
              <Image src={vultLogo} alt="Vult" className="h-auto w-[98px]" priority />
            </span>
            <span>
              <span className="block text-sm font-black text-[var(--brand-strong)]">EPL Fantasy</span>
              <span className="block text-[11px] text-[var(--muted)]">Admin Portal</span>
            </span>
          </Link>

          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Staff access
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Sign in to the admin portal
          </h2>
          <p className="mt-4 leading-7 text-[var(--muted)]">
            Use the email address and password assigned to your administrative account.
          </p>

          {errorMessage ? (
            <div
              role="alert"
              className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {errorMessage}
            </div>
          ) : null}

          {passwordChanged ? (
            <div
              role="status"
              className="mt-7 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"
            >
              Your password was changed successfully. Sign in once more with your new password to continue.
            </div>
          ) : null}

          <form action={signInAdmin} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={nextPath} />

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--brand-strong)]">
                Email address
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-blue-100"
                placeholder="name@vultme.io"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--brand-strong)]">
                Password
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-blue-100"
                placeholder="Enter your password"
              />
            </label>

            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--brand)] px-5 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-[var(--brand-strong)] focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              Sign in securely
            </button>
          </form>

          <p className="mt-7 text-center text-xs leading-5 text-[var(--muted)]">
            Contact the Super Admin when your account is locked, inactive or missing an assigned role.
          </p>
        </div>
      </section>
    </main>
  );
}
