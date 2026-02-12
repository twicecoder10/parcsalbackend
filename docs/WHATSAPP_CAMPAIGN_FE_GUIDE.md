# WhatsApp Campaign – Frontend Integration Guide

This document describes the backend support for **WhatsApp marketing campaigns** and how the frontend should integrate with it.

---

## Summary

- **WhatsApp campaigns are now fully supported.** You can create, update, schedule, and send campaigns with `channel: "WHATSAPP"` using the existing marketing campaign APIs.
- Recipients are limited to users who have **opted in to WhatsApp marketing** and have a **valid phone number**.
- Messages are sent via **Meta WhatsApp Business API** using an **approved template**; the template name and body text are provided when creating/updating the campaign.

---

## API Base Paths (unchanged)

| Context   | Base path              | Who can use              |
|----------|-------------------------|---------------------------|
| Admin    | `POST/GET/PUT ... /admin/marketing/campaigns`   | Super admin only          |
| Company  | `POST/GET/PUT ... /companies/marketing/campaigns` | Company admin/staff       |

All existing campaign endpoints work for WhatsApp the same way as for EMAIL and IN_APP; only the payload and validation differ when `channel` is `WHATSAPP`.

---

## Channel value

Use the existing `CampaignChannel` enum. For WhatsApp:

- **`channel: "WHATSAPP"`**

---

## Create campaign – WhatsApp payload

**POST** `/admin/marketing/campaigns` or **POST** `/companies/marketing/campaigns`

When `channel` is `"WHATSAPP"`, the request body **must** include:

| Field                 | Type   | Required for WHATSAPP | Description |
|-----------------------|--------|------------------------|-------------|
| `audienceType`        | string | Yes                    | Same as before (e.g. `COMPANY_PAST_CUSTOMERS` for companies). |
| `channel`             | string | Yes                    | `"WHATSAPP"` |
| `whatsappTemplateKey`  | string | Yes                    | **Exact name** of the approved Meta WhatsApp template (should always be `whatsapptemplatekey`). |
| `contentText`         | string | Yes                    | Message body sent as the **first template body parameter**. Max 1024 characters; longer text is truncated. |

Optional (same as other channels):

- `scheduledAt` – ISO 8601 datetime string if you want to schedule for later.

**Example body (WhatsApp):**

```json
{
  "audienceType": "COMPANY_PAST_CUSTOMERS",
  "channel": "WHATSAPP",
  "whatsappTemplateKey": "whatsapptemplatekey",
  "contentText": "Hi! We have a new offer for you. Reply to this message for details."
}
```

**Validation:**

- If `channel === "WHATSAPP"` and either `whatsappTemplateKey` or `contentText` is missing or empty, the API returns **400** with a message like:  
  `"Required fields missing for selected channel. WHATSAPP requires whatsappTemplateKey and contentText."`
- The backend also validates in the service:  
  - `"whatsappTemplateKey is required for WHATSAPP campaigns (only approved Meta template name)"`  
  - `"contentText is required for WHATSAPP campaigns (used as the template body message)"`

---

## Update campaign – WhatsApp payload

**PUT** `/admin/marketing/campaigns/:id` or **PUT** `/companies/marketing/campaigns/:id`

- Only campaigns in **DRAFT** status can be updated.
- When updating a WhatsApp campaign (or switching a campaign to WhatsApp), send at least:
  - `whatsappTemplateKey` – non-empty string (template name).
  - `contentText` – non-empty string (body parameter).
- Other optional fields (`audienceType`, `channel`, `scheduledAt`, etc.) follow the same rules as create.

---

## Preview recipients – WhatsApp behaviour

**GET** `/admin/marketing/campaigns/:id/preview` or **GET** `/companies/marketing/campaigns/:id/preview`

- Response shape is unchanged: `totalCount`, `campaignId`, `audienceType`, `channel`, and for admin a `sample` array.
- For **WhatsApp**, `totalCount` is the number of recipients who:
  - Match the campaign’s audience and consent rules, and
  - Have **WhatsApp marketing opt-in** and a **valid phone number**.

So the count can be **lower** than for the same audience on EMAIL or IN_APP. Use this count to show “This campaign will be sent to X people via WhatsApp” and to avoid sending when the count is 0.

---

## Send and schedule – no payload changes

- **POST** `.../campaigns/:id/send` – no body required; same as before.
- **POST** `.../campaigns/:id/schedule` – body: `{ "scheduledAt": "<ISO 8601>" }`.

Same as other channels. For companies, WhatsApp campaigns use **WhatsApp promo credits/limits** (same as existing plan/usage logic).

---

## Campaign and message log statuses – WhatsApp

- **Campaign statuses** are unchanged: `DRAFT`, `SCHEDULED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`.
- **Message log status** (per recipient) for WhatsApp can be:
  - `SENT` – message was sent via WhatsApp.
  - `FAILED` – send failed (e.g. API error).
  - `SKIPPED_NO_PHONE` – user had no valid phone number.
  - `SKIPPED_NOT_IMPLEMENTED` – WhatsApp not enabled or template/config issue.

You can use these when showing per-recipient or aggregate stats (e.g. “Sent”, “Failed”, “Skipped – no phone”).

---

## Meta WhatsApp template requirement

- WhatsApp marketing messages must use a **pre-approved template** in Meta Business Manager.
- The template must have a **body** with at least one dynamic part, e.g. `Hello! {{1}}`.
- Backend sends `contentText` as the **first body parameter** (`{{1}}`).
- The **template name** in Meta `whatsapptemplatekey` must be exactly the value you send in `whatsappTemplateKey`.

**Frontend suggestions:**

- Hide `whatsappTemplateKey` and only let the user edit `contentText`.
- Optionally show a character count for `contentText` with a 1024-character limit.

---

## Error responses (examples)

- **400 – Validation**  
  `"Required fields missing for selected channel. WHATSAPP requires whatsappTemplateKey and contentText."`  
  → Ensure both fields are non-empty when `channel === "WHATSAPP"`.

- **400 – Business rule**  
  `"whatsappTemplateKey is required for WHATSAPP campaigns (use an approved Meta template name)"`  
  `"contentText is required for WHATSAPP campaigns (used as the template body message)"`  
  → Same as above; often from update or server-side validation.

- **403 – Credits/limits**  
  `"Insufficient WhatsApp promo credits. You have X credits, but need Y ..."`  
  → Show upgrade/top-up CTA for the company.

- **403 – Plan**  
  `"Insufficient WhatsApp promo credits. You have X credits, but need Y. Please top up credits or upgrade to Starter plan."`  
  → Same as above; typical for FREE plan.

---

## Checklist for FE

1. **Create/Edit form**
   - When channel is **WHATSAPP**, require and show:
     - `whatsappTemplateKey` (template name).
     - `contentText` (message body, max 1024 chars).
   - Validate non-empty before submit and show the same error messages the API returns.

2. **Preview**
   - Call preview endpoint and show `totalCount`; for WhatsApp, mention that only users with phone + WhatsApp opt-in are included.

3. **Send / Schedule**
   - Reuse existing send and schedule flows; no extra body for send; schedule body unchanged.

4. **Campaign list / detail**
   - Display `channel: "WHATSAPP"` like EMAIL/IN_APP; show status and scheduled time as before.

5. **Message logs / stats**
   - If you show per-recipient or aggregate stats, handle WhatsApp-specific statuses: `SENT`, `FAILED`, `SKIPPED_NO_PHONE`, `SKIPPED_NOT_IMPLEMENTED`.

6. **Template name**
   - Either fix one template name in your app or let the user input it and document that it must match the approved template name in Meta.

---

## Quick reference – WhatsApp create payload

```ts
// TypeScript shape (align with your existing campaign types)
interface CreateWhatsAppCampaignBody {
  audienceType: 'COMPANY_PAST_CUSTOMERS' | 'PLATFORM_CUSTOMERS_ONLY' | 'PLATFORM_COMPANIES_ONLY' | 'PLATFORM_ALL_USERS';
  channel: 'WHATSAPP';
  whatsappTemplateKey: string;  // non-empty, Meta template name
  contentText: string;          // non-empty, max 1024 chars
  scheduledAt?: string;         // optional ISO 8601
}
```

---

If you need more detail on consent, credits, or audience types, those follow the same rules as the rest of the marketing campaign API; only the channel-specific payload and recipient filtering differ for WhatsApp.
