# TempahFlow Production Architecture

## Product goal

TempahFlow is a multi-tenant direct-booking SaaS for Malaysian accommodation operators. Core access has no recurring subscription. Revenue comes from a configurable transaction fee on successfully paid direct bookings.

It supports single homestays, villas, chalets, multi-room resorts, campsites and operators with several properties.

## Product surfaces

### Marketing application
Public website, onboarding, documentation, pricing and merchant acquisition pages.

### Merchant application
Authenticated control panel for owners and staff:

- dashboard
- properties
- unit types and physical units
- rate plans
- seasonal / weekend pricing
- availability and manual blocks
- enquiries
- bookings
- payments / refunds
- guests
- notification templates
- iCal channels
- reports
- users / roles
- custom domains
- integrations

### Guest booking application
Public storefront at a merchant subdomain, a TempahFlow path, or verified custom domain.

Guest flow:

1. Choose property
2. Enter dates and guest count
3. Search live inventory
4. Select room / unit
5. Review transparent price breakdown
6. Enter guest details
7. Create temporary booking hold
8. Pay through connected payment gateway
9. Backend verifies gateway webhook
10. Booking becomes confirmed
11. Confirmation email / WhatsApp is queued

### Platform admin application
Internal operations surface for merchant accounts, GMV and fees, gateway/webhook health, support, custom domains, audits, fee configuration and feature flags.

## Recommended deployment

### Web
- GitHub as source of truth
- Cloudflare Pages for marketing, merchant SPA and public booking pages
- wildcard DNS for merchant subdomains
- custom-hostname support for merchant domains

### API
- Cloudflare Workers/Hono or a Node-compatible API service
- versioned REST JSON `/api/v1`
- keep the repository's current Node server as local/demo API while production services evolve behind the same contract

### Database
Use PostgreSQL in production. Managed options can include Neon, Supabase, Railway Postgres or equivalent.

Availability, inventory and payment confirmation require real database transactions and constraints. Browser/local JSON storage is demo-only.

### Storage and jobs
- R2/S3-compatible object storage for property media and exports
- queue for notifications, webhooks, retries and iCal work
- scheduled jobs for booking-hold expiry, iCal imports and reminders
- Redis/Upstash optionally for rate limiting and cache, never as the sole booking source of truth

## Multi-tenancy

Every business-owned row carries `tenant_id`.

A user may access a tenant row only through an active membership for that tenant. Enforce this in application authorization and database row-level security/repository filters.

Never trust a tenant ID supplied by the browser without membership validation.

## Core domain model

### Identity
users, tenants, memberships, invitations, sessions

### Catalogue
properties, unit_types, units, amenities, property_amenities, media

### Inventory and pricing
rate_plans, rate_rules, blackout_periods, inventory_overrides, minimum-stay rules

### Customers and sales
guests, enquiries, bookings, booking_items, booking_price_lines, booking_status_history

### Money
gateway_accounts, payment_intents, payments, refunds, platform_fee_ledger, payout_reconciliation, gateway_webhook_events

### Distribution and communication
ical_connections, ical_events, notification_templates, notifications, custom_domains

### Operations
staff tasks, audit_logs, feature_flags

## Availability engine

### Whole-place / unique unit
Inventory count is one. Any overlapping unexpired hold or confirmed booking blocks the unit.

### Quantity inventory
A unit type can have N sellable units.

`available = sellable inventory - confirmed quantity - unexpired hold quantity - manual blocks`

### Booking hold
When checkout starts:

- create a hold with a short TTL such as 15 minutes
- reserve inventory inside a database transaction
- attach the payment intent to that hold
- expire/release it if payment does not complete

### Correctness
Two simultaneous buyers must never receive the same last unit. Use PostgreSQL transactions plus row locking / constraints. Public availability is advisory; the backend repeats the availability check transactionally before creating a hold.

## Pricing engine

Suggested rate priority:

1. explicit date override
2. seasonal rule
3. weekend / weekday rule
4. base rate plan

Then apply extra guest charges, merchant fees, taxes if required, security deposit and future coupons.

The TempahFlow platform fee is normally merchant-side, not a surprise guest surcharge.

Every booking stores immutable `booking_price_lines` so later rate changes never rewrite historical bookings.

## Booking state machine

Suggested states:

- draft
- hold
- pending_payment
- confirmed
- checked_in
- checked_out
- cancelled
- expired
- refunded

Rules:

- browser redirects cannot mark payment successful
- only a verified payment webhook settles a payment intent
- webhook handlers are idempotent
- cancellation and refund remain separate operations
- every transition is written to status history and audit logs

## Payment architecture

See `PAYMENTS.md`.

High-level flow:

1. Merchant connects/configures a supported gateway
2. TempahFlow creates booking hold
3. Backend calculates fee snapshot
4. Backend creates gateway bill/payment intent with split instruction where supported
5. Guest pays at gateway
6. Gateway sends server-to-server webhook
7. Backend verifies callback authenticity
8. Provider event is recorded with an idempotency constraint
9. Payment is recorded exactly once
10. Booking is atomically confirmed
11. Notifications are queued

## iCal channel sync

### Import
Merchant adds Airbnb / Booking.com / other iCal URL. A scheduled worker fetches the feed, normalizes UID/start/end/source, upserts external blocks and exposes sync freshness/errors.

### Export
Each property/unit gets a hard-to-guess `.ics` feed containing confirmed and blocked dates.

Local direct-booking transactions remain authoritative; imported events are external availability blocks.

## Notifications

Queue rather than synchronously send notifications during checkout.

Channels:
- transactional email
- WhatsApp via Meta Cloud API or approved provider

Events:
- successful payment
- booking confirmation
- owner new-booking alert
- payment reminder
- check-in reminder
- cancellation/refund

Store provider message ID, attempts, delivery state and last error.

## Authentication and authorization

Recommended:
- Argon2id or scrypt hashes
- secure HttpOnly sessions
- CSRF protection for cookie-authenticated writes
- login throttling
- optional passkeys/MFA
- RBAC: owner, manager, finance, operations, viewer
- expiring invitations

The existing Node skeleton already demonstrates scrypt, HttpOnly sessions, CSRF, login throttling and audit history. Production multi-tenancy should preserve those controls.

## Security and privacy

- HTTPS everywhere
- encrypt gateway secrets at rest
- never store card PAN/CVV
- cryptographically validate payment webhooks
- strict tenant isolation
- authorization on every object mutation
- rate-limit public search/checkout endpoints
- safe upload/MIME handling
- Content Security Policy
- signed/private media URLs when needed
- audit support/admin access
- database backups / PITR
- personal-data retention/deletion workflows
- Malaysia PDPA-aware privacy/processing practices

## Custom domains

1. Merchant enters hostname
2. Platform supplies DNS CNAME target
3. System checks ownership/resolution
4. Edge provisions TLS
5. Hostname maps to `tenant_id`

Never allow an arbitrary Host header to select a tenant without a verified mapping.

## Observability

Track checkout attempts, conflicts, gateway creation errors, webhook latency/failure, booking-confirmation latency, iCal sync age, notification failures and API error rates.

Use structured logs plus Sentry/equivalent. Failed webhooks/jobs require retry and dead-letter tooling.

## Testing

### Unit
price priority, weekend/season rules, fee rounding, hold expiry, state transitions

### Integration
concurrent last-unit checkout, webhook idempotency, refunds, tenant authorization, iCal deduplication

### E2E
merchant onboarding, property setup, guest checkout, successful payment, dashboard appearance, cancellation/refund

## CI/CD

Pull requests: syntax/lint, tests, dependency/security checks, build.

Main: deploy static app, controlled DB migrations, deploy API, smoke-test health and booking search.

## Scale path

Stage 1: one Postgres cluster, stateless API, queue, object storage.

Stage 2: read replicas, partition large event/audit tables, cache storefront data, dedicated workers.

Stage 3: isolate payment/webhook workers, stronger reporting pipeline and regional edge cache.

Keep money and availability boring: PostgreSQL transactions remain the source of truth.
