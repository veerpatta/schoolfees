-- Drop public.get_my_preferred_locale().
--
-- It shipped one migration ago (20260726134923) as the read half of the
-- account-language pair, then never gained a caller: resolving the locale on
-- every request through its own RPC would have cost a round trip per page, so
-- the read rides along on the `public.users` select that
-- `lib/supabase/session.ts` and the login action already perform.
--
-- Leaving it in place would mean an executable, `authenticated`-granted
-- function on a live database that nothing calls — surface area with no
-- purpose. The setter stays: it is the write path and is genuinely used.

drop function if exists public.get_my_preferred_locale();
