# First Super Admin Bootstrap

The platform deliberately does not provide a public administrator-registration page. The first administrator must be created through the Supabase dashboard and then assigned a role in the database.

## 1. Create the Auth user

In the `Vult-Fantasy-League` Supabase project:

1. Open **Authentication → Users**.
2. Select **Add user**.
3. Enter the authorised Vult staff email address.
4. Set a strong temporary password.
5. Mark the email as confirmed only when the staff identity has been verified.
6. Copy the generated user UUID.

## 2. Assign the Super Admin profile

Run the following in the Supabase SQL Editor after replacing the placeholders:

```sql
insert into public.admin_profiles (
  id,
  full_name,
  role,
  is_active
)
values (
  'AUTH_USER_UUID',
  'FULL NAME',
  'super_admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
```

The `id` must exactly match the UUID from `auth.users`.

## 3. Test access

1. Open `/admin/login` on the preview deployment.
2. Sign in with the Auth user email and temporary password.
3. Confirm the protected dashboard loads.
4. Sign out and confirm `/admin` redirects back to `/admin/login`.
5. Change the temporary password before production use.

## Security notes

- Never insert passwords directly into database tables.
- Never add a public sign-up flow for administrative users.
- Never expose the Supabase service-role key in browser code.
- Super Admin access should only be assigned after staff identity and authority are verified.
- Later staff accounts should be created and assigned through a controlled Super Admin workflow with audit logging.
