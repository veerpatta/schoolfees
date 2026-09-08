-- A saved campaign may name any of the five recovery notices added on
-- 2026-09-08: the late-fee waiver window and its last call, the overdue final
-- notice, the promise-due reminder and the exam clearance notice.
--
-- Same shape as 20260903131911, for the same reason: a campaign SAVES the rule,
-- not the audience, and the office can legitimately want to save "waiver
-- window, Hindi, fees pending at least 2,000" before Meta has approved the
-- template. Saving a rule and sending a message are different acts; only the
-- second needs Meta, and `campaignFor` refuses the second until it has.
--
-- `whatsapp_campaign_runs.situation` still carries no constraint: a run records
-- what was attempted, and constraining history to a list that grows would make
-- an old run unreadable the day a notice is retired.

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
      'promise_lapsed',
      'late_fee_waiver',
      'waiver_last_call',
      'overdue_final',
      'promise_due',
      'exam_clearance'
    ));
end $$;

comment on column public.whatsapp_campaigns.situation is
  'Which notice this saved rule sends. Widened in 20260903131911 from the three '
  'that existed in August, and again in 20260908093000 for the five recovery '
  'notices. Kept as a CHECK rather than a free text column because `campaignFor` '
  'throws on an unrecognised situation, and a typo saved here would surface as a '
  'crash on the send screen rather than at the Save.';
