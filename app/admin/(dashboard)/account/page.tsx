import { requireAdmin } from "@/lib/auth/admin";
import { changeAdminPasswordAction } from "./actions";

type SearchParams = Promise<{
  success?: string;
  error?: string;
  notice?: string;
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

function errorMessage(code?: string) {
  switch (code) {
    case "weak_password":
      return "Use at least 12 characters with uppercase, lowercase, a number and a symbol.";
    case "password_mismatch":
      return "The two password entries do not match.";
    case "password_update_failed":
      return "The password could not be changed. Sign in again and retry.";
    case "password_flag_update_failed":
      return "The password changed, but the first-login security flag could not be cleared. Contact a Super Admin before continuing.";
    default:
      return null;
  }
}

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const error = errorMessage(params.error);
  const changed = params.success === "password_changed";
  const mustChange = params.notice === "change_temporary_password";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
          Administrator account
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
          Account security
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Review your administrator identity and replace a temporary or existing password with a private password known only to you.
        </p>
      </div>

      {mustChange ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900">
          This account is using a temporary password. Change it now before accessing the rest of the Admin Portal.
        </div>
      ) : null}

      {changed ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
          Your administrator password was changed successfully.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 md:grid-cols-[0.75fr_1.25fr]">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">
            Signed-in administrator
          </p>
          <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">
            {admin.full_name}
          </h2>
          <p className="mt-2 text-sm font-bold text-[var(--muted)]">
            {roleLabels[admin.role] ?? admin.role.replaceAll("_", " ")}
          </p>
          <span className="mt-5 inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-black text-green-800">
            Active administrator
          </span>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">
            Password
          </p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">
            Change password
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            New administrators must replace the temporary password after their first sign-in. Passwords are handled by Supabase Auth and are not stored in the Vult Fantasy admin profile.
          </p>

          <form action={changeAdminPasswordAction} className="mt-6 space-y-4">
            <label className="block text-sm font-bold text-[var(--brand-strong)]">
              New password
              <input
                type="password"
                name="password"
                required
                minLength={12}
                autoComplete="new-password"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#162a63] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="block text-sm font-bold text-[var(--brand-strong)]">
              Confirm new password
              <input
                type="password"
                name="confirm_password"
                required
                minLength={12}
                autoComplete="new-password"
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#162a63] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <p className="text-xs leading-5 text-[var(--muted)]">
              Minimum 12 characters, including uppercase, lowercase, a number and a symbol.
            </p>
            <button
              type="submit"
              className="rounded-xl bg-[#162a63] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/15 transition hover:bg-[#0e1d49]"
            >
              Change password
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
