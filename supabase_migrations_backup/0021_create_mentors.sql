-- ============================================================================
-- Migration 0021: Create Mentors Dharshan and Ashwin
-- ============================================================================

do $$
declare
  dharshan_id uuid;
  ashwin_id uuid;
begin
  -- 1. Dharshan (dharshan@mentor.in / sara@123)
  select id into dharshan_id from auth.users where email = 'dharshan@mentor.in';
  if dharshan_id is null then
    dharshan_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      dharshan_id,
      'authenticated', 'authenticated',
      'dharshan@mentor.in',
      extensions.crypt('sara@123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Dharshan","class":"Mentor","batch_number":"990001"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt('sara@123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"name":"Dharshan","class":"Mentor","batch_number":"990001"}'::jsonb,
        updated_at = now()
    where id = dharshan_id;
  end if;

  -- Ensure auth.identities for Dharshan
  delete from auth.identities where user_id = dharshan_id or email = 'dharshan@mentor.in';
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    dharshan_id,
    dharshan_id,
    jsonb_build_object('sub', dharshan_id, 'email', 'dharshan@mentor.in'),
    'email',
    'dharshan@mentor.in',
    now(), now(), now()
  );

  -- Ensure public.users for Dharshan
  insert into public.users (id, name, class, batch_number)
  values (dharshan_id, 'Dharshan', 'Mentor', '990001')
  on conflict (id) do update set
    name = excluded.name,
    class = excluded.class,
    batch_number = excluded.batch_number;


  -- 2. Ashwin (ashwin@mentor.in / sara@123)
  select id into ashwin_id from auth.users where email = 'ashwin@mentor.in';
  if ashwin_id is null then
    ashwin_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      ashwin_id,
      'authenticated', 'authenticated',
      'ashwin@mentor.in',
      extensions.crypt('sara@123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Ashwin","class":"Mentor","batch_number":"990002"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt('sara@123', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"name":"Ashwin","class":"Mentor","batch_number":"990002"}'::jsonb,
        updated_at = now()
    where id = ashwin_id;
  end if;

  -- Ensure auth.identities for Ashwin
  delete from auth.identities where user_id = ashwin_id or email = 'ashwin@mentor.in';
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    ashwin_id,
    ashwin_id,
    jsonb_build_object('sub', ashwin_id, 'email', 'ashwin@mentor.in'),
    'email',
    'ashwin@mentor.in',
    now(), now(), now()
  );

  -- Ensure public.users for Ashwin
  insert into public.users (id, name, class, batch_number)
  values (ashwin_id, 'Ashwin', 'Mentor', '990002')
  on conflict (id) do update set
    name = excluded.name,
    class = excluded.class,
    batch_number = excluded.batch_number;

end $$;
