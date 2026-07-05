-- Writes require a signed-in owner. Reads stay public.
--
-- The owner signs in with email+password (create the user once in the
-- Supabase dashboard under Authentication → Users). The policies check the
-- signed-in email, so even if signups were somehow enabled, strangers still
-- couldn't write.

drop policy "public add funds" on funds;
revoke insert on funds from anon;

grant insert, delete on funds to authenticated;

create policy "owner adds funds" on funds
  for insert to authenticated
  with check (custom = true and auth.email() = 'jan.mastalier@gmail.com');

-- Deleting a fund cascades to its filings and holdings (see 0001_schema.sql).
create policy "owner removes funds" on funds
  for delete to authenticated
  using (auth.email() = 'jan.mastalier@gmail.com');
