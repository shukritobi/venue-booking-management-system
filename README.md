# TempahFlow

TempahFlow is a direct-booking platform for Malaysian homestays, villas, chalets, campsites and small accommodation operators.

The business model is intentionally simple:

- RM0 monthly subscription
- RM0 setup fee for the core platform
- A configurable platform transaction fee only when an online booking is successfully paid
- Payment gateway processing fees remain separate and are charged by the selected gateway

This repository contains an interactive GitHub Pages prototype plus the existing secure Node.js operations API skeleton.

## Interactive prototype

### Public marketing site
- Product overview and direct-booking value proposition
- Feature comparison and onboarding flow
- Transaction-fee pricing explanation
- Responsive mobile and desktop layouts

### Guest booking storefront
- Property page with accommodation details and amenities
- Date and guest search
- Availability calendar
- Whole-unit and multi-unit inventory model
- Weekday, weekend and seasonal pricing
- Blackout / occupied date handling
- Booking price calculation
- Checkout form
- Simulated payment success and booking confirmation

### Merchant dashboard
- Revenue, bookings, platform fee and estimated net metrics
- Booking calendar
- Booking list and status tracking
- Property / unit management preview
- Seasonal pricing rules
- Payment and platform-fee ledger
- Guest records
- Reports
- Gateway, WhatsApp and iCal settings preview

The GitHub Pages demo stores data only in the browser using `localStorage`. A booking made in the guest demo immediately appears in the owner dashboard in the same browser.

## Run the Node application locally

```bash
export ADMIN_EMAIL=owner@example.com
export ADMIN_PASSWORD='use-a-long-random-password'
export SESSION_SECRET='use-at-least-32-random-bytes'
npm start
```

Open `http://localhost:3000`.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys the `public/` directory automatically when `main` is updated.

## Production architecture

Read:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) for the SaaS architecture
- [`PAYMENTS.md`](PAYMENTS.md) for transaction-fee and gateway design
- [`docs/schema.sql`](docs/schema.sql) for the PostgreSQL data model
- [`docs/API.md`](docs/API.md) for the proposed API surface
- [`docs/ROADMAP.md`](docs/ROADMAP.md) for implementation phases

## Important production rule

Never confirm a paid booking from the browser redirect alone. A booking becomes paid/confirmed only after a verified, idempotent payment-gateway webhook has been processed by the backend.
