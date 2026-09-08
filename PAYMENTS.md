# TempahFlow Payment and Transaction-Fee Design

## Commercial model

TempahFlow core product has no monthly subscription.

Default prototype configuration:

- monthly fee: RM0
- setup fee: RM0
- platform fee: 1% of successful paid booking value
- guest markup: RM0
- gateway fee: separate according to provider/merchant agreement

The 1% is a configurable prototype choice, not a hard-coded future business rule. Production should support global default plus per-merchant overrides.

## Preferred money flow

Where the gateway supports split payments:

`Guest -> Payment Gateway -> Merchant share + TempahFlow fee`

TempahFlow should not unnecessarily receive and hold the full booking value.

Example for RM1,000 at 1%:

- booking gross: RM1,000.00
- TempahFlow fee: RM10.00
- merchant gross share before gateway charges: RM990.00
- gateway charge: according to gateway pricing/settlement

## Malaysian MVP

### FPX-first automatic split
Billplz and ToyyibPay expose split-payment capabilities for FPX. This makes FPX the cleanest first route for a transaction-only fee model.

Requirements:

- merchant completes gateway verification required to receive funds
- TempahFlow stores only encrypted gateway identifiers/secrets needed for calls
- backend creates each bill with correct split instruction
- fee is calculated server-side
- exact fee snapshot is stored with the booking/payment intent

### Cards
Do not assume FPX split behavior applies to cards. Card support should only be enabled after selecting a Malaysian provider/product that supports marketplace/platform split settlement for the intended setup, or after implementing a compliant merchant fee-ledger/collection mechanism.

## Fee calculation

Store money as integer sen.

```text
gross_sen = 100000
fee_bps = 100
platform_fee_sen = round(gross_sen * fee_bps / 10000)
merchant_share_sen = gross_sen - platform_fee_sen
```

For a future rule such as `1% or RM1 minimum`, store `fee_bps` and `minimum_fee_sen` and choose the larger result server-side.

## Payment lifecycle

### 1. Quote
Backend returns an expiring quote from current inventory and pricing.

### 2. Hold
Backend opens a transaction and reserves inventory for a short TTL.

### 3. Payment intent
Create a local payment-intent row before calling the gateway. Generate an idempotency key and freeze the fee snapshot.

### 4. Gateway bill
Create the provider bill/payment object and persist provider ID plus checkout URL.

### 5. Redirect
Browser redirects the guest to the provider.

### 6. Webhook
Provider calls TempahFlow server. Handler:

1. reads raw payload if the signature scheme requires it
2. verifies provider signature/token
3. validates gateway account mapping
4. records provider event ID with a unique constraint
5. verifies amount/currency/reference
6. records payment exactly once
7. atomically confirms booking
8. writes platform-fee ledger entry
9. queues notifications

### 7. Browser return
The browser return page asks the backend for status. It never self-confirms payment from query parameters.

## Idempotency

Use uniqueness constraints on provider payment/event identifiers. A repeated webhook returns success without duplicating payments, bookings or ledger entries.

## Refunds

- authorized owner/admin requests refund
- backend records amount/reason
- provider API is called when supported
- webhook/poll confirms provider state
- refund ledger entry is added
- booking cancellation status is handled separately

Platform-fee refund policy must be explicit rather than inferred.

## Reconciliation

Each paid transaction records:

- gross booking amount
- platform fee
- expected merchant share
- gateway fee if provider reports it
- provider payment ID
- settlement reference/status where available

Platform admin should expose a daily mismatch report.

## Secrets

- never expose gateway secrets in client JavaScript
- encrypt secrets at rest
- rotate credentials
- redact secrets from logs
- separate test and production credentials

Merchant-specific credentials belong encrypted in the database rather than in one shared environment variable.
