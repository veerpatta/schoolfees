-- A saved campaign may name any notice the registry knows about.
--
-- `whatsapp_campaigns.situation` was constrained to the three notices that
-- existed in August. Phase 1 added four more — due soon, final call, late fee
-- applied, promise lapsed — and a campaign SAVES the rule rather than the
-- audience, so the office can legitimately want to save "due soon, Hindi, ten
-- day window" before the template is Live.
--
-- Without this, that Save fails with a constraint violation and the office
-- learns about it from a red banner rather than from the disabled chip that
-- already tells them the notice is not sendable yet. Saving a rule and sending
-- a message are different acts; only the second needs Meta.
--
-- `whatsapp_campaign_runs.situation` carries no such constraint and needs no
-- change: a run records what was attempted, and constraining history to a list
-- that grows would make an old run unreadable the day a notice is retired.

do $$
begin
  alter table public.whatsapp_campaigns
    drop constraint if exists whatsapp_campaigns_situation_check;

  alter table public.whatsapp_campaigns
    add constraint whatsapp_campaigns_situation_check
    check (situation in (
      'fee_due',
      'balance',
      'prevyear',
      'upcoming',
      'upcoming_final',
      'late_fee_applied',
      'promise_lapsed'
    ));
end $$;

comment on column public.whatsapp_campaigns.situation is
  'Which notice this saved rule sends. Widened in 20260903131911 from the three '
  'that existed in August. Kept as a CHECK rather than a free text column '
  'because `campaignFor` throws on an unrecognised situation, and a typo saved '
  'here would surface as a crash on the send screen rather than at the Save.';
