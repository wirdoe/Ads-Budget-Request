# Ads Budget Approval Portal
A Next.js / Supabase application for **exactly two parallel manager approvals**. Both managers receive private links; final approval requires both managers to approve. Either rejection finalizes the request as rejected.

## Project status
Supabase project: `ssoiiurfngyhlurmgjrm` (separate dedicated database; migrations already applied).
Vercel project: `prj_aDWWouGMEOXEcdnjUCvuhUZwR3we` (deployment protection enabled).
The application must be deployed and tested before financial authorization use.

## Required Vercel variables
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are already configured.
Add `SUPABASE_SERVICE_ROLE_KEY` as a server-only **encrypted** variable (never a NEXT_PUBLIC_ variable).
Add `APP_BASE_URL` using the actual externally accessible https:// deployment URL.
Configure `RESEND_API_KEY` and verified `EMAIL_FROM` for both approval notifications.

## Authentication
Create requestor users in Supabase Authentication. Promote a designated administrator via SQL:
`UPDATE public.profiles SET role='admin' WHERE email='the-real-admin-email';`
Do not open public signups. Administrators configure two manager profiles with distinct PINs; share PINs separately from their email links.

## Limitations
Not yet production-validated. No attachments, drafts or resend/reissue flow. Email delivery uses Resend; provider acceptance is not proof of inbox receipt. Requires security review and end-to-end tests before management use.
