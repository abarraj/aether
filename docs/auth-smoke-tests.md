# Auth & Onboarding Smoke Tests

Manual regression checklist for auth flows. Run after any changes to
login, signup, onboarding, callback, or middleware.

---

## 1. New User — Password Signup

- [ ] Navigate to `/signup`
- [ ] Fill name, email, password → click "Create account"
- [ ] Verify redirect to `/onboarding` (not `/dashboard`)
- [ ] Complete all 3 onboarding steps → click "Finish"
- [ ] Verify redirect to `/dashboard` with correct org name

## 2. New User — Google OAuth Signup

- [ ] Navigate to `/signup` → click "Continue with Google"
- [ ] Complete Google auth flow
- [ ] Verify redirect to `/onboarding` (not `/dashboard`)
- [ ] Complete onboarding → verify dashboard loads

## 3. New User — Magic Link Signup

- [ ] Navigate to `/signup` → enter name + email → click magic link button
- [ ] Click link in email
- [ ] Verify redirect to `/onboarding` (not `/dashboard`)
- [ ] Complete onboarding → verify dashboard loads

## 4. Existing User — Password Login

- [ ] Navigate to `/login` → enter credentials → click "Sign in"
- [ ] Verify redirect to `/dashboard` (not `/onboarding`)
- [ ] Verify correct org name shown in sidebar

## 5. Existing User — Google OAuth Login

- [ ] Navigate to `/login` → click "Continue with Google"
- [ ] Verify redirect to `/dashboard`

## 6. Existing User — Magic Link Login

- [ ] Navigate to `/login` → enter email → click magic link button
- [ ] Click link in email
- [ ] Verify redirect to `/dashboard`

## 7. Invite Accept — New User

- [ ] Send invite from Settings > Team
- [ ] Open invite link in an incognito window
- [ ] Click "Sign up" on invite page
- [ ] Verify `/signup?next=/invite/[token]` URL
- [ ] Create account → verify redirect back to invite page
- [ ] Accept invite → verify redirect to `/dashboard`

## 8. Invite Accept — Existing User

- [ ] Send invite to an existing user's email
- [ ] Open invite link (logged out)
- [ ] Click "Sign in" → verify `/login?next=/invite/[token]` URL
- [ ] Log in → verify redirect back to invite page
- [ ] Accept invite → verify redirect to `/dashboard`

## 9. Onboarding — Exit and Resume

- [ ] Create new account (don't complete onboarding)
- [ ] Click "Skip setup for now" link below wizard
- [ ] Verify redirect back to `/onboarding` (middleware enforces)
- [ ] Complete onboarding → verify dashboard loads
- [ ] Navigate to `/onboarding` → verify redirect to `/dashboard`

## 10. Onboarding — Page Refresh

- [ ] Start onboarding, complete Step 1
- [ ] Refresh the page
- [ ] Verify form resets to Step 1 (no crash, no duplicate org)
- [ ] Complete all steps → verify single org created

## 11. Sign Out + Multi-Account

- [ ] Log in as User A → note org name in sidebar
- [ ] Sign out → verify redirect to `/login`
- [ ] Log in as User B (different org)
- [ ] Verify User B's org name shows (not User A's)
- [ ] Verify no stale data from User A's session

## 12. Logo Navigation

- [ ] On `/login` → click Aether logo → verify redirect to `/`
- [ ] On `/signup` → click Aether logo → verify redirect to `/`
- [ ] On `/onboarding` → click Aether logo → verify redirect to `/`
- [ ] On `/dashboard` → click sidebar logo → verify stays on `/dashboard`

## 13. Browser Back Button

- [ ] Log in → navigate to `/dashboard/settings`
- [ ] Click browser back → verify smooth navigation (no loops)
- [ ] From `/login`, sign in, then click back → verify no return to login form

## 14. Password Reset

- [ ] On `/login` → click "Forgot password?"
- [ ] Enter email → click "Send reset link"
- [ ] Verify confirmation screen
- [ ] Click reset link in email → verify lands on `/login`

## 15. Authenticated User on Auth Pages

- [ ] While logged in, navigate to `/login` → verify redirect to `/dashboard`
- [ ] While logged in, navigate to `/signup` → verify redirect to `/dashboard`
- [ ] While logged in with no org, navigate to `/login` → verify redirect to `/onboarding`
