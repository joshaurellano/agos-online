# OTP on resident registration

Adding a resident (`/add-resident`) texts a 6-digit code to the resident's
mobile number and only saves after it is entered correctly.

Flow: form -> number-already-registered check -> privacy notice -> code -> save.

The code goes to the resident's phone and they read it to the staff member.

Staff accounts (`/register`) have no code, because Smart/TNT/Sun numbers may
not receive SMS. They get the same already-registered check instead: the form
looks the number up in `profiles`, and `create-user` checks it again on the
server.

## Setup

1. Run `supabase/migrations/20261024000000_phone_otp.sql`.
2. Deploy `send-otp`, `verify-otp` and `create-user`
   (`supabase functions deploy send-otp verify-otp create-user`).
3. Secrets: `PHILSMS_API_KEY` and `PHILSMS_SENDER_ID` are already used by
   `send-alert`. Add `OTP_SECRET` (any long random string).
4. Local testing without SMS: set `OTP_DEV_ECHO=true`. The code is printed in
   the function log instead of being texted. Never set it in production.

## Rules

- Code is 6 digits, valid 5 minutes, 5 wrong tries, then a new code is needed.
- One code per minute and 5 per hour for each number.
- A verified number can be used once, within 15 minutes.
- The server enforces it: a database trigger blocks staff inserts into
  `residents` without a verified number.
- Codes are stored as an HMAC, not in plain text.

## Known limit

The SMS gateway has trouble reaching Smart/TNT/Sun numbers (see
`phoneNetwork.js`). Those residents may not receive the code.
