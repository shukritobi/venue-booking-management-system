# TempahFlow Build Roadmap

## Phase 0 - Interactive prototype

Status: implemented in this repository.

- original TempahFlow brand/UI
- public product website
- guest property page
- date/guest search
- visual availability calendar
- weekday/weekend/seasonal pricing demo
- checkout and simulated successful payment
- local booking creation
- owner dashboard
- booking/payment/guest/report views
- fee ledger
- gateway/iCal/WhatsApp settings preview
- GitHub Pages deployment

## Phase 1 - Production SaaS foundation

- PostgreSQL migrations from `docs/schema.sql`
- real tenant registration and onboarding
- owner/staff memberships and RBAC
- property/unit CRUD
- media uploads to R2/S3
- transactional availability service
- expiring booking holds
- server-side quote/pricing engine
- audit logs

Exit criteria: two independent merchants can safely use the same deployment without seeing each other's data, and concurrent booking tests cannot oversell the last unit.

## Phase 2 - Real payments and transaction fees

- Billplz FPX adapter
- ToyyibPay FPX adapter
- encrypted merchant gateway configuration
- split-payment instruction builder
- webhook signature/verification
- webhook idempotency
- payment/fee ledger
- booking confirmation after webhook
- refund workflow
- reconciliation screen

Exit criteria: a real sandbox/test payment confirms exactly one booking and records exactly one platform-fee ledger entry even if the webhook is replayed.

## Phase 3 - Notifications and calendars

- transactional email provider
- WhatsApp provider
- queued owner + guest messages
- iCal import/export
- scheduled sync
- sync freshness/error UX
- booking reminders

## Phase 4 - Merchant growth features

- multiple properties
- custom domains
- staff invitations
- advanced revenue/occupancy reports
- reviews/nearby places
- deposit/full-payment policies
- security deposits
- promo codes
- CSV exports
- PWA installability

## Phase 5 - Distribution and scale

- card marketplace/split provider after commercial/provider validation
- stronger channel-manager integrations beyond iCal
- API/webhooks for third-party integrations
- platform admin support tooling
- data warehouse / cohort analytics
- settlement and reconciliation improvements
