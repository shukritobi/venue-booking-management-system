-- TempahFlow production PostgreSQL reference schema.
-- Monetary values use integer sen. Timestamps use timestamptz.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  currency char(3) NOT NULL DEFAULT 'MYR',
  timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  platform_fee_bps integer NOT NULL DEFAULT 100 CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  platform_fee_min_sen bigint NOT NULL DEFAULT 0 CHECK (platform_fee_min_sen >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','manager','finance','operations','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  check_in_time time,
  check_out_time time,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,slug)
);
CREATE INDEX properties_tenant_idx ON properties(tenant_id);

CREATE TABLE unit_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  inventory_mode text NOT NULL DEFAULT 'quantity' CHECK (inventory_mode IN ('unique','quantity')),
  sellable_quantity integer NOT NULL DEFAULT 1 CHECK (sellable_quantity > 0),
  max_guests integer NOT NULL DEFAULT 1 CHECK (max_guests > 0),
  bedrooms integer NOT NULL DEFAULT 0,
  bathrooms integer NOT NULL DEFAULT 0,
  min_stay_nights integer NOT NULL DEFAULT 1 CHECK (min_stay_nights > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX unit_types_property_idx ON unit_types(property_id);

CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  external_code text,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (unit_type_id,name)
);

CREATE TABLE rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  weekday_rate_sen bigint NOT NULL CHECK (weekday_rate_sen >= 0),
  weekend_rate_sen bigint NOT NULL CHECK (weekend_rate_sen >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  nightly_rate_sen bigint,
  percentage_delta numeric(8,4),
  priority integer NOT NULL DEFAULT 100,
  min_stay_nights integer,
  CHECK (end_date >= start_date)
);
CREATE INDEX rate_rules_lookup_idx ON rate_rules(unit_type_id,start_date,end_date,priority DESC);

CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guests_tenant_phone_idx ON guests(tenant_id,phone);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id),
  guest_id uuid NOT NULL REFERENCES guests(id),
  reference text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','hold','pending_payment','confirmed','checked_in','checked_out','cancelled','expired','refunded')),
  check_in date NOT NULL,
  check_out date NOT NULL,
  adults integer NOT NULL DEFAULT 1 CHECK (adults >= 0),
  children integer NOT NULL DEFAULT 0 CHECK (children >= 0),
  currency char(3) NOT NULL DEFAULT 'MYR',
  subtotal_sen bigint NOT NULL DEFAULT 0,
  guest_total_sen bigint NOT NULL DEFAULT 0,
  platform_fee_sen bigint NOT NULL DEFAULT 0,
  merchant_share_sen bigint NOT NULL DEFAULT 0,
  hold_expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,reference),
  CHECK (check_out > check_in)
);
CREATE INDEX bookings_availability_idx ON bookings(tenant_id,property_id,check_in,check_out,status);

CREATE TABLE booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  unit_type_id uuid NOT NULL REFERENCES unit_types(id),
  unit_id uuid REFERENCES units(id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  check_in date NOT NULL,
  check_out date NOT NULL,
  subtotal_sen bigint NOT NULL DEFAULT 0,
  CHECK (check_out > check_in)
);
CREATE INDEX booking_items_inventory_idx ON booking_items(unit_type_id,check_in,check_out);

CREATE TABLE booking_price_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  line_type text NOT NULL,
  label text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_amount_sen bigint NOT NULL,
  total_amount_sen bigint NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE blackout_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_type_id uuid REFERENCES unit_types(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  quantity integer,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  external_uid text,
  CHECK (end_date > start_date)
);
CREATE INDEX blackout_lookup_idx ON blackout_periods(property_id,start_date,end_date);

CREATE TABLE gateway_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  account_label text,
  provider_account_id text,
  encrypted_credentials text,
  test_mode boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,provider,provider_account_id)
);

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  gateway_account_id uuid NOT NULL REFERENCES gateway_accounts(id),
  provider_payment_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('created','pending','paid','failed','cancelled','refunded')),
  amount_sen bigint NOT NULL CHECK (amount_sen > 0),
  platform_fee_sen bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'MYR',
  checkout_url text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_account_id,idempotency_key),
  UNIQUE (gateway_account_id,provider_payment_id)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  payment_intent_id uuid REFERENCES payment_intents(id),
  gateway_account_id uuid NOT NULL REFERENCES gateway_accounts(id),
  provider_payment_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('paid','partially_refunded','refunded','failed')),
  amount_sen bigint NOT NULL CHECK (amount_sen > 0),
  platform_fee_sen bigint NOT NULL DEFAULT 0,
  merchant_share_sen bigint NOT NULL DEFAULT 0,
  gateway_fee_sen bigint,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_account_id,provider_payment_id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id),
  provider_refund_id text,
  status text NOT NULL CHECK (status IN ('requested','processing','succeeded','failed')),
  amount_sen bigint NOT NULL CHECK (amount_sen > 0),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_fee_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  payment_id uuid REFERENCES payments(id),
  entry_type text NOT NULL CHECK (entry_type IN ('fee','fee_refund','adjustment')),
  amount_sen bigint NOT NULL,
  currency char(3) NOT NULL DEFAULT 'MYR',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE gateway_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_account_id uuid NOT NULL REFERENCES gateway_accounts(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  event_type text,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_account_id,provider_event_id)
);

CREATE TABLE ical_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_type_id uuid REFERENCES unit_types(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE CASCADE,
  provider text NOT NULL,
  import_url text,
  export_token_hash text,
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ical_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES ical_connections(id) ON DELETE CASCADE,
  external_uid text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  summary text,
  raw_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id,external_uid)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient text NOT NULL,
  template_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','sending','sent','delivered','failed')),
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','active','failed')),
  verification_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  ip inet,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_created_idx ON audit_logs(tenant_id,created_at DESC);
