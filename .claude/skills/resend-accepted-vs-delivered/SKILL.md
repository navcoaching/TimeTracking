---
name: resend-accepted-vs-delivered
description: Use when an email sent through Resend (reports, alerts, form notifications) never arrives even though the code logged "accepted" or got an id back, or when checking that a newly configured sender/recipient really works. Covers the suppression list, hard bounces, and how to verify real delivery.
---

# Resend: "accepted" is not "delivered"

Learned in Nov 2026 while wiring weekly security-audit emails for Nav Builds, Vaqti and Dar Noura.

## When to Use
- A script prints `email: accepted by Resend, id …` but nothing reaches the inbox.
- Resend's Emails page shows **Suppressed** or **Bounced** for a recipient.
- You just set `RESEND_API_KEY` / `REPORT_EMAIL_FROM` / `REPORT_EMAIL_TO` and need to prove mail flows.
- Choosing a sender domain or API-key domain scope.

## When NOT to Use
- Errors the API returns directly (401, 403 domain not verified, 422 validation). Those fail loudly; read the response.
- Messages that arrive but land in spam: that is reputation/content, not suppression.

## What actually happens
- `POST /emails` returning an `id` only means Resend **accepted the request**. Delivery is decided later and shown per message: Delivered, Bounced, Suppressed, Complained.
- After a **hard bounce** (mailbox doesn't exist) Resend adds the address to the **suppression list** and silently skips every later send to it, still returning an id. Fixing the mailbox does **not** clear the list.
- Real case: `nav@navbuilds.net` had no mailbox. It was printed on the website, PDFs and in every audit workflow, so client mail and every audit report bounced or were suppressed for days while logs said "accepted".

## Fix
1. Open the message in Resend → Email events. "Recipient is on the suppression list … hard bounces" confirms it.
2. Make the address receive mail: add it as an **alias** of an existing mailbox (cheaper and safer than a second mailbox; old PDFs keep working).
3. Send a test from a personal inbox and confirm it arrives.
4. Resend → Emails → **Suppressions** → remove the address. Without this, sends stay suppressed.
5. Re-run the sender and confirm the message status is **Delivered** (or the user sees it in the inbox). Do not report success from the API log alone.

## Keys and domains
- An API key scoped to one domain can only send from that domain; Resend cannot change a key's domain later, so create a new key, swap the secret, then delete the old key.
- Use one key per purpose (site mail vs audit reports) so one can be revoked without breaking the other.
- Personal GitHub accounts have no organization secrets; set secrets per repository.

## Verification checklist
- [ ] Resend message status is Delivered, not just an id in the log.
- [ ] Address absent from Suppressions.
- [ ] Recipient confirms it arrived (check spam on first send from a new sender).
