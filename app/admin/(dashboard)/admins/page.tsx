import { requireAdminRole } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { CreateAdminForm } from "./create-admin-form";

const SUPER_ADMIN_ROLES = ["super_admin"] as const;

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  competition_manager: "Competition Manager",
  compliance_officer: "Compliance Officer",
  finance_officer: "Finance Officer",
  content_manager: "Content Manager",
  support_officer: "Support Officer",
  auditor: "Auditor",
};

type AdminRow = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

export default async function AdminUsersPage() {
  await requireAdminRole(SUPER_ADMIN_ROLES);
  const supabase = createAdminSupabaseClient();
  const db = supabase as any;

  const [profilesResult, authUsersResult] = await Promise.all([
    db
      .from("admin_profiles")
      .select("id, full_name, role, is_active, created_at")
      .order("created_at", { ascending: false }),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const profiles = (profilesResult.data ?? []) as AdminRow[];
  const authUsers = authUsersResult.data?.users ?? [];
  const emailById = new Map(
    authUsers.map((user) => [user.id, user.email ?? "Email not available"]),
  );
  const loadError = profilesResult.error?.message ?? authUsersResult.error?.message ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
          Access administration
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
          Admin users
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Create Vult Fantasy staff logins and assign the least-privileged role required for each administrator. This page is restricted to Super Admins.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          Unable to load the complete administrator directory: {loadError}
        </div>
      ) : null}

      <section className="grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
        <CreateAdminForm />

        <div className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">
                Current access
              </p>
              <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">
                Administrator directory
              </h2>
            </div>
            <span className="rounded-full bg-[#eef3ff] px-3 py-1.5 text-xs font-black text-[#162a63]">
              {profiles.length} admin{profiles.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {profiles.length ? (
              profiles.map((profile) => (
                <article
                  key={profile.id}
                  className="rounded-2xl border border-[var(--border)] bg-[#fafbfe] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-black text-[var(--brand-strong)]">
                        {profile.full_name}
                      </p>
                      <p className="mt-1 break-all text-sm text-[var(--muted)]">
                        {emailById.get(profile.id) ?? "Authentication email not found"}
                      </p>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Added {formatDate(profile.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-800">
                        {roleLabels[profile.role] ?? profile.role.replaceAll("_", " ")}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${
                          profile.is_active
                            ? "border-green-200 bg-green-50 text-green-800"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {profile.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
                No administrator profiles were returned.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
