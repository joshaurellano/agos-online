# PAGASA wind-signal integration

Reads PAGASA's Tropical Cyclone Bulletin (TCB) and shows the official wind
signal for Naga City / Camarines Sur on the Dashboard. The flood model backend
is not involved.

    PAGASA bulletin PDF -> edge function `pagasa-bulletin` -> table `pagasa_bulletins` -> Dashboard banner

## Deploy
1. `supabase db push` (creates `pagasa_bulletins`, public read-only).
2. `supabase functions deploy pagasa-bulletin`
3. Schedule it like `poll-flood` (Dashboard > Integrations > Cron), every 15-30 min.

## Test before the next typhoon
No cyclone is active most of the year, so test with a past bulletin:

    curl -X POST "$SUPABASE_URL/functions/v1/pagasa-bulletin" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
      -d '{"pdf_url":"https://pubfiles.pagasa.dost.gov.ph/tamss/weather/bulletin/TCB%237_maymay.pdf","dry_run":true}'

Check `row.signals`, `row.naga_signal`, `row.center_lat` and `text_sample`. If the
signal areas come out wrong, adjust `extractSignals` in
`functions/_shared/pagasa-parse.ts` (PDF text layout is the fragile part).

## Known limits
- PAGASA has no official API. Active bulletins are discovered by scanning
  PAGASA's bulletin pages for `.../tamss/weather/bulletin/TCB%23<n>_<name>.pdf`
  links. If those pages load their list with JavaScript, discovery finds nothing.
  Verify during the first real storm.
- The banner never says "no signal" unless the bulletin parsed cleanly; otherwise it
  tells people to check the official bulletin.
- A match on "Camarines Sur" with a qualifier (northern portion, town list) is
  flagged as partial.
