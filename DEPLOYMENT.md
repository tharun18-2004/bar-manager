# Bar Manager - Production Deployment Guide

## Quick Deploy to Vercel (Recommended)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit: bar-manager"
git remote add origin https://github.com/YOUR_USERNAME/bar-manager.git
git push -u origin main
```

### 2. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
5. Click "Deploy"

## Alternative: Deploy to Railway

```bash
npm install -g railway
railway login
railway init
railway link
railway up
```

Add environment variables in Railway dashboard.

## Environment Variables Needed

Create `.env.local` locally and add to deployment platform:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-key
```

## Database Setup (Supabase)

Run these queries in Supabase SQL editor:

```sql
-- Sales Table
CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  item_name VARCHAR(255),
  amount DECIMAL(10, 2),
  is_voided BOOLEAN DEFAULT FALSE,
  void_reason TEXT,
  staff_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory Table
CREATE TABLE inventory (
  id BIGSERIAL PRIMARY KEY,
  item_name VARCHAR(255),
  category VARCHAR(100),
  quantity INT DEFAULT 0,
  unit_price DECIMAL(10, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Staff Table
CREATE TABLE staff (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Void Logs Table
CREATE TABLE void_logs (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT REFERENCES sales(id),
  staff_name VARCHAR(255),
  void_reason TEXT,
  voided_amount DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment Transactions Table
CREATE TABLE payment_transactions (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID,
  external_order_id TEXT,
  staff_name VARCHAR(255),
  amount DECIMAL(10, 2),
  stripe_id VARCHAR(255),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_transactions_external_order_id
  ON payment_transactions(external_order_id);
```

## Migration Order (Required)

After base table creation, run:

1. `db/migrations/2026-02-16_add_external_order_id_to_payment_transactions.sql`
2. `db/migrations/2026-02-16_enable_rls_and_role_policies.sql`

See `db/migrations/README.md` for verification queries and role assignment SQL.

## Post-Deployment Checklist

- [ ] Test all pages load correctly
- [ ] Verify Supabase connection works
- [ ] Verify health endpoint returns OK (`GET /api/health`)
- [ ] Test employee POS functionality
- [ ] Test owner dashboard
- [ ] Check void transaction logging
- [ ] Verify API routes respond
- [ ] Test inventory management
- [ ] Confirm reports display correctly

## Pre-Deploy Verification (Local)

Run the full verification gate before each production deployment:

```bash
npm run verify
```
