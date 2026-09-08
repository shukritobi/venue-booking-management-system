# Proposed TempahFlow API v1

Merchant endpoints require authentication and tenant membership. Public booking endpoints resolve a tenant from a verified storefront host/slug.

## Public storefront

### `GET /api/v1/public/:tenantSlug/properties`
Return public active properties.

### `GET /api/v1/public/:tenantSlug/properties/:propertySlug`
Property details, amenities, unit types, media and booking policies.

### `GET /api/v1/public/:tenantSlug/properties/:propertySlug/availability`
Query: `check_in`, `check_out`, `adults`, `children`.

Return available unit types and an expiring server-side price quote.

### `POST /api/v1/public/:tenantSlug/booking-holds`
Create a transactional short-lived hold from a valid quote.

### `POST /api/v1/public/:tenantSlug/booking-holds/:holdId/payment-intent`
Create provider payment/bill and return checkout URL.

### `GET /api/v1/public/bookings/:reference/status`
Use a guest-facing confirmation token and return safe payment/booking status only.

## Authentication

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/auth/session`

## Merchant catalogue

- `GET/POST /api/v1/properties`
- `GET/PATCH/DELETE /api/v1/properties/:id`
- `GET/POST /api/v1/properties/:id/unit-types`
- `PATCH/DELETE /api/v1/unit-types/:id`
- `GET/POST /api/v1/unit-types/:id/units`

## Pricing and inventory

- `GET/POST /api/v1/unit-types/:id/rate-plans`
- `GET/POST /api/v1/unit-types/:id/rate-rules`
- `PATCH/DELETE /api/v1/rate-rules/:id`
- `GET/POST /api/v1/properties/:id/blackouts`
- `DELETE /api/v1/blackouts/:id`

## Bookings

- `GET /api/v1/bookings`
- `GET /api/v1/bookings/:id`
- `POST /api/v1/bookings/manual`
- `PATCH /api/v1/bookings/:id`
- `POST /api/v1/bookings/:id/cancel`
- `POST /api/v1/bookings/:id/refunds`

## Guests

- `GET /api/v1/guests`
- `GET /api/v1/guests/:id`
- `PATCH /api/v1/guests/:id`

## Payments

- `GET /api/v1/payments`
- `GET /api/v1/payments/:id`
- `POST /api/v1/integrations/gateways`
- `PATCH /api/v1/integrations/gateways/:id`
- `POST /api/v1/payments/:id/refund`

Provider webhook endpoints use provider authentication rather than browser session authentication:

- `POST /webhooks/billplz/:gatewayAccountId`
- `POST /webhooks/toyyibpay/:gatewayAccountId`

Every webhook is idempotent and validates payment identifiers, amount, currency and signature/token before changing state.

## iCal

- `GET/POST /api/v1/ical/connections`
- `PATCH/DELETE /api/v1/ical/connections/:id`
- `POST /api/v1/ical/connections/:id/sync`
- `GET /calendar/:publicToken.ics`

## Reports

- `GET /api/v1/reports/summary`
- `GET /api/v1/reports/revenue`
- `GET /api/v1/reports/occupancy`
- `GET /api/v1/reports/fees`

## Team

- `GET /api/v1/members`
- `POST /api/v1/invitations`
- `PATCH /api/v1/members/:userId`
- `DELETE /api/v1/members/:userId`

## Platform admin

Separate privileged authorization scope:

- `/api/v1/platform/tenants`
- `/api/v1/platform/bookings`
- `/api/v1/platform/payments`
- `/api/v1/platform/fees`
- `/api/v1/platform/webhook-events`
- `/api/v1/platform/jobs`
- `/api/v1/platform/domains`

## Error shape

```json
{
  "error": {
    "code": "AVAILABILITY_CONFLICT",
    "message": "The selected unit is no longer available.",
    "request_id": "req_..."
  }
}
```
