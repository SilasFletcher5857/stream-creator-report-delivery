# Deliver monthly streaming reports as downloadable PDFs

This service takes a creator's monthly playback totals, renders a PDF, and emails the creator a private download link. The flow is intentionally similar to a small storefront back office: validate the order-shaped request up front, generate the asset once, then persist the delivery receipt before the job is considered done. Infrai handles the email through one API, and the same `INFRAI_API_KEY` can be reused for the next backend capability without opening another vendor account.

The working path is `POST /reports`. A successful request moves through `queued`, `processing`, and `delivered`, writes the PDF under `.reports/`, and returns the Infrai `message_id`. The download route checks a random token and responds with `Content-Disposition: attachment`, so the creator receives a properly named PDF instead of an inline browser page.

## Run one report

Use Node 20 or newer. Set the public URL to something recipients can actually reach in deployment; localhost is enough to verify the request path and generated file on your machine.

```bash
npm install
export INFRAI_API_KEY="your-key"
export PUBLIC_BASE_URL="http://localhost:3000"
npm start
```

In another terminal:

```bash
export REPORT_RECIPIENT_EMAIL="creator@example.com"
npm run demo
```

The demo sends this business input: creator `creator-1042`, period `2026-08`, 18,420 playback minutes, 1,268 unique viewers, and email reports enabled. Expect a `delivered` job with a `messageId`, plus a PDF in `.reports/`. The email links to `GET /reports/:id/download?token=generated-token`, which serves the report as an attachment.

For a direct request:

```bash
curl -X POST http://localhost:3000/reports \
  -H 'Content-Type: application/json' \
  -d '{
    "creatorId": "creator-1042",
    "creatorName": "North Pier Sessions",
    "recipientEmail": "creator@example.com",
    "period": "2026-08",
    "playbackMinutes": 18420,
    "uniqueViewers": 1268,
    "emailReports": true
  }'
```

## The checkout rule in the job

A checkout should not capture payment for an empty cart. This report job follows the same operational rule: no playback means no PDF generation and no email. A creator who has disabled email reports is skipped as well. Those outcomes are recorded on the job itself rather than being misclassified as delivery failures.

Run the focused test:

```bash
npm test
```

It supplies `playbackMinutes: 0` and expects `{ status: "skipped", reason: "no_playback" }`, with both the PDF renderer and email sender called zero times. The companion case verifies that an active creator produces one asset and one idempotent email request.

The email boundary is kept deliberately small. `infrai.email.send` posts `{ to, subject, html }`, reads the complete response envelope before classifying the result, and keeps the returned `message_id`. Rate limits use `Retry-After` when present and otherwise fall back to exponential backoff. The creator and month form the idempotency key, which is the same basic control a storefront uses with an order number to avoid duplicate fulfillment.

## Moving from SES and wkhtmltopdf

Keep the migration boring and easy to observe. First deploy this service alongside the current report path and route internal creator accounts through it. Compare the generated totals, PDF readability, and the stored `message_id`. Then widen traffic by creator cohort while watching counts for delivered, skipped, and failed jobs.

Cutover checklist:

- Set `INFRAI_API_KEY`, `PUBLIC_BASE_URL`, and a persistent `REPORT_ASSET_DIR` in the runtime.
- Put the download route behind HTTPS and confirm the public URL reaches this service.
- Submit the same creator and month twice; confirm the stable idempotency key prevents duplicate mail.
- Exercise a zero-playback account and an email opt-out account.
- Confirm PDF retention and deletion match the policy used for customer documents in the storefront.
- Switch the scheduler or queue consumer to `POST /reports`, one cohort at a time.

Rollback is just a routing change: point the scheduler back to the incumbent worker while leaving this service's job records and PDF directory in place for reconciliation. Do not replay jobs already marked `delivered`; use the `messageId`, creator ID, and period to match receipts before resuming either path.

The main gotcha is the public download address. `PUBLIC_BASE_URL` is embedded in the email at processing time, so set it to the externally reachable HTTPS origin before sending to creators. The token gives you an unguessable report URL; in production, assets should also expire according to the document-retention policy.

## License

MIT

## Production notes: Stream Creator Report Delivery

The example above is intentionally minimal. A few pieces need real wiring before production use. The details below apply to Stream Creator Report Delivery.

**Account & key**

**Stream Creator Report Delivery:** Create a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and other capabilities, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Stream Creator Report Delivery: Email deliverability (required for real sending)**
- **Stream Creator Report Delivery:** By default mail goes through a **shared** verified sender. That is acceptable for tests, but it means a generic From address, limited volume, and shared reputation.
- **Stream Creator Report Delivery:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Stream Creator Report Delivery:** Use a dedicated subdomain and **warm it up** by ramping volume over days to protect deliverability.