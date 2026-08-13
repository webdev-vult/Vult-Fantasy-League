-- Phase 13: winner eligibility must use the verified Vult phone workflow.
-- The participant-facing registration no longer collects a separate Vult customer reference.

do $patch$
declare
  v_oid oid;
  v_definition text;
  v_old text := $old$v_pass := not v_rules.requires_vult_account
    or (v_verification.vult_status = 'verified' and nullif(btrim(coalesce(v_participant.vult_customer_ref, '')), '') is not null);$old$;
  v_new text := $new$v_pass := not v_rules.requires_vult_account
    or (
      v_verification.vult_status = 'verified'
      and nullif(btrim(coalesce(v_participant.phone, '')), '') is not null
      and nullif(btrim(coalesce(v_verification.vult_verified_reference, '')), '') is not null
      and private.normalize_phone(v_verification.vult_verified_reference) = private.normalize_phone(v_participant.phone)
    );$new$;
  v_old_summary text := $old_summary$when v_pass then 'Vult account verification is complete.'
      else 'A verified Vult account is required.'$old_summary$;
  v_new_summary text := $new_summary$when v_pass then 'Vult account verification by the registered phone number is complete.'
      else 'A verified Vult account matching the registered phone number is required.'$new_summary$;
  v_old_details text := $old_details$'details', jsonb_build_object('verification_status', coalesce(v_verification.vult_status, 'missing'))$old_details$;
  v_new_details text := $new_details$'details', jsonb_build_object(
      'verification_status', coalesce(v_verification.vult_status, 'missing'),
      'verification_basis', 'registered_phone'
    )$new_details$;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'evaluate_winner_eligibility'
  limit 1;

  if v_oid is null then
    raise exception 'private.evaluate_winner_eligibility was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);

  if position('verification_basis'', ''registered_phone' in v_definition) > 0 then
    return;
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected legacy Vult customer-reference winner check was not found';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  v_definition := replace(v_definition, v_old_summary, v_new_summary);
  v_definition := replace(v_definition, v_old_details, v_new_details);
  execute v_definition;
end
$patch$;
