# Production payment readiness

The backend listens only on `127.0.0.1:${PORT:-3250}`.  In the checked-in
configuration, the default port is `3250`; no production admin frontend port
is defined in this repository.  A production reverse proxy must expose the
admin frontend and proxy its `/api/` requests to that backend before the
following webhook URL can work:

```
https://admin.insurance.olnoo.com/api/payments/yookassa/webhook
```

Configure that exact public HTTPS URL in YooKassa after the reverse proxy and
TLS certificate are live.  Subscribe to `payment.succeeded`, `payment.canceled`
and `refund.succeeded`; `payment.waiting_for_capture` is also accepted.  The
handler validates the notification shape, then reads the payment from YooKassa
using the payment account that created it before changing local state.  It is
safe for duplicate deliveries.

Set these production environment variables without committing their values:

```
NODE_ENV=production
PAYMENT_RETURN_URL_ORIGINS=https://admin.insurance.olnoo.com
YOOKASSA_WEBHOOK_PUBLIC_URL=https://admin.insurance.olnoo.com/api/payments/yookassa/webhook
```

Keep `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`,
`PAYMENT_SECRETS_ENCRYPTION_KEY`, `DOCUMENTS_DIR`, and `POLICIES_DIR` in the
deployment secret/environment store.  The document and policy directories must
remain private directories outside the web root and writable by the backend
service only.

The payment return URL is only a browser return destination.  It does not mark
a payment as paid.  The webhook (or the authenticated status check, which also
reads YooKassa) performs payment confirmation and automatically creates the
single active policy and its PDF.  If PDF generation temporarily fails, the
paid payment and policy stay committed and the existing protected policy PDF
regeneration action can retry it.

Any verified successful refund changes that payment to `refunded`.  If the
application has no other paid payment, its active policy is cancelled and the
application becomes `cancelled`.  The local schema has no partial-refund
amount, so a successful partial refund is treated as refunded too; production
operations should add explicit partial-refund accounting before supporting a
business flow where coverage remains active after a partial refund.
