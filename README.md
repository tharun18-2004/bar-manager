# Bar Manager Pro v2.0 🍹

Enterprise-grade bar management system with POS, inventory, staff management, customer tracking, and analytics.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- Google Gemini API key

### Installation

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🎯 Features

### Core Features
- ✅ **POS System** - Complete point-of-sale with item search, order management, quantity control
- ✅ **Void Transactions** - Track voided sales with reason logging for audit trails
- ✅ **Payment Method Recording** - Store how each order was paid (CASH/CARD/UPI/COMPLIMENTARY) without processing payments
- ✅ **Customer Tracking** - Manage customers, track spending, visit history
- ✅ **Table Management** - Manage dining areas, track table status (available/occupied/reserved)
- ✅ **Inventory Management** - Track stock levels, value calculations, low stock alerts
- ✅ **Staff Management** - Add/manage employees with role-based access
- ✅ **Reports & Analytics** - Sales analytics, top items, revenue tracking
- ✅ **Receipt Generation** - Print/download transaction receipts
- ✅ **PDF Export** - Generate reports as PDF files
- ✅ **Authentication** - Secure login with Supabase Auth

### Admin Features
- 👑 Owner Dashboard with revenue overview
- 🔍 Audit logs for voided transactions
- 📊 Advanced analytics and reporting
- 📈 Salesforce AI insights via Gemini

## 📁 Project Structure

```
bar-manager/
├── app/
│   ├── api/                 # API routes
│   │   ├── sales/          # Sales endpoints
│   │   ├── inventory/      # Stock management
│   │   ├── staff/          # Employee management
│   │   ├── customers/      # Customer data
│   │   ├── tables/         # Table management
│   │   ├── voids/          # Void transactions
│   │   └── reports/        # Analytics
│   ├── employee/           # POS System
│   ├── owner/              # Owner Dashboard
│   ├── inventory/          # Inventory page
│   ├── staff/              # Staff management
│   ├── customers/          # Customer tracking
│   ├── tables/             # Table management
│   ├── reports/            # Analytics page
│   ├── auth/               # Authentication
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── components/
│   ├── Sidebar.tsx         # Navigation
│   ├── StatCard.tsx        # Metrics display
│   ├── VoidModal.tsx       # Void confirmation
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── auth.ts             # Auth helpers
│   ├── receipt.ts          # Receipt generation
│   ├── errors.ts           # Error handling
│   ├── pdf.ts              # PDF export
│   └── gemini.ts           # AI insights
├── public/                 # Static assets
├── .env.example            # Environment template
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
└── tailwind.config.js      # Tailwind config
```

## 📋 Environment Variables

Required environment variables in `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Gemini AI (server-side only)
GEMINI_API_KEY=your-gemini-key

# Optional app metadata surfaced in /api/health
NEXT_PUBLIC_APP_VERSION=2.0.0

# Enable persistent audit writes to audit_logs table
AUDIT_LOG_TO_DB=1
```

## 🗄️ Database Schema

### Supabase Tables

```sql
-- Sales transactions
CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  item_name VARCHAR(255),
  amount DECIMAL(10, 2),
  is_voided BOOLEAN DEFAULT FALSE,
  void_reason TEXT,
  staff_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inventory stock
CREATE TABLE inventory (
  id BIGSERIAL PRIMARY KEY,
  item_name VARCHAR(255),
  category VARCHAR(100),
  quantity INT DEFAULT 0,
  unit_price DECIMAL(10, 2),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Staff/Employees
CREATE TABLE staff (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  role VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Void audit trail
CREATE TABLE void_logs (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT REFERENCES sales(id),
  staff_name VARCHAR(255),
  void_reason TEXT,
  voided_amount DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Customers
CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  total_spent DECIMAL(10, 2),
  visit_count INT,
  last_visit TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Dining tables
CREATE TABLE tables (
  id BIGSERIAL PRIMARY KEY,
  table_number INT,
  capacity INT,
  status VARCHAR(50),
  customer_name VARCHAR(255),
  order_amount DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment records
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

-- Unified audit trail
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT,
  actor_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  metadata JSONB,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Migration Order

After creating base tables, run:

1. `db/migrations/2026-02-16_add_external_order_id_to_payment_transactions.sql`
2. `db/migrations/2026-02-16_enable_rls_and_role_policies.sql`

Reference: `db/migrations/README.md`

## 🔐 Authentication

Default demo credentials:
- Email: `demo@bar.com`
- Password: `Demo@123`

Note: Change these in production!

Role-based access is enforced in API routes and pages. Supported roles:
- `staff`
- `manager`
- `owner`

Set roles in Supabase user metadata/app metadata (for example `app_metadata.role = "owner"`).
All API requests require a valid Supabase bearer token in the `Authorization` header.

## 📱 Pages Overview

| Page | Path | Role | Description |
|------|------|------|-------------|
| Home | `/` | Public | Login page |
| Auth | `/auth` | Public | Sign up/Sign in |
| POS | `/employee` | Staff/Manager/Owner | Point of sale system |
| Inventory | `/inventory` | Manager/Owner | Stock management |
| Staff | `/staff` | Owner | Employee management |
| Customers | `/customers` | Manager/Owner | Customer tracking |
| Tables | `/tables` | Staff/Manager/Owner | Table management |
| Reports | `/reports` | Manager/Owner | Analytics & insights |
| Owner | `/owner` | Owner | Dashboard & audit logs |

## 🛠️ Development

### Running Tests
```bash
npm run test
# or run just API auth integration tests
npm run test:api
```

`test:api` runs integration files sequentially to avoid port/startup race conditions between Next dev server test processes.

### Building for Production
```bash
npm run build
npm start
```

### Full Verification Gate
```bash
npm run verify
```

Release checks before production deploy:
- `npm run verify` passes
- `GET /api/audit` with owner token returns data plus page metadata
- Owner audit tab `Next`/`Previous` works with 50+ records

Rollback/degraded mode note:
- If `audit_logs` table is missing, `/api/audit` returns success with empty `data` and a warning so owner UI stays usable.

### Linting
```bash
npm run lint
```

## 🚀 Deployment

### Deploy to Vercel (Recommended)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import repository
4. Add environment variables
5. Deploy

```bash
# Or use Vercel CLI
npm i -g vercel
vercel --prod
```

### Deploy to Railway

```bash
npm install -g railway
railway login
railway init
railway up
```

## 📚 API Documentation

### Sales API
- `POST /api/sales` - Record a sale (`staff/manager/owner`)
- `GET /api/sales` - Fetch sales records (`staff/manager/owner`)
- `GET /api/sales?staff=name` - Filter by staff (`staff/manager/owner`)
- `GET /api/sales?voided=true` - Get voided sales (`staff/manager/owner`)


### Orders API
- `POST /api/orders` - Complete order and record `payment_method` (`staff/manager/owner`)

### Inventory API
- `GET /api/inventory` - Get all items (`staff/manager/owner`)
- `POST /api/inventory` - Add item (`manager/owner`)
- `PUT /api/inventory` - Update quantity (`manager/owner`)

### Staff API
- `GET /api/staff` - List all staff (`manager/owner`)
- `POST /api/staff` - Add staff member (`owner`)
- `PUT /api/staff` - Update staff (`owner`)
- `DELETE /api/staff?id=xxx` - Remove staff (`owner`)

### Customers API
- `GET /api/customers` - List customers (`manager/owner`)
- `POST /api/customers` - Add customer (`manager/owner`)
- `PUT /api/customers` - Update customer info (`manager/owner`)
- `DELETE /api/customers?id=xxx` - Remove customer (`manager/owner`)

### Tables API
- `GET /api/tables` - List all tables (`staff/manager/owner`)
- `POST /api/tables` - Create table (`manager/owner`)
- `PUT /api/tables` - Update table status (`staff/manager/owner`)

### Voids API
- `POST /api/voids` - Void a transaction (`staff/manager/owner`)
- `GET /api/voids` - Fetch void logs (`manager/owner`)

### Reports API
- `GET /api/reports?range=today|week|month` - Sales report + AI insights (`manager/owner`)

### Audit API
- `GET /api/audit` - Owner audit stream (`owner`)
- Filters:
  - `actor` (contains match on actor email)
  - `action` (exact action)
  - `date_from=YYYY-MM-DD`
  - `date_to=YYYY-MM-DD`
- Pagination:
  - `limit` (1-200, default 50)
  - `cursor` (opaque next cursor from previous response)
- Examples:
  - `GET /api/audit?action=staff.update&limit=50`
  - `GET /api/audit?limit=50&cursor=<nextCursor>`

### Health API
- `GET /api/health` - Deployment/readiness check (no auth required)

## 🐛 Troubleshooting

### Supabase Connection Error
- Confirm `NEXT_PUBLIC_SUPABASE_URL` is correct
- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is valid
- Check network connectivity

### Database Tables Missing
- Run SQL schema from `.env.example`
- Verify Supabase project is active
- Check table permissions

## 📄 License

Proprietary - All rights reserved

## 🤝 Support

For issues and questions, please contact the development team.

---

**Version**: 2.0.0  
**Last Updated**: February 19, 2026  
**Status**: Production Ready ✅




