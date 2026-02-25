// Database Schema Setup for Supabase

// 1. SALES Table - Records all transactions
/*
CREATE TABLE sales (
  id BIGINT PRIMARY KEY DEFAULT NEXTVAL('sales_id_seq'),
  item_name VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  is_voided BOOLEAN DEFAULT FALSE,
  void_reason TEXT,
  staff_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_staff_name ON sales(staff_name);
CREATE INDEX idx_sales_is_voided ON sales(is_voided);
*/

// 2. INVENTORY Table - Track bar stock
/*
CREATE TABLE inventory (
  id BIGINT PRIMARY KEY DEFAULT NEXTVAL('inventory_id_seq'),
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  quantity INT DEFAULT 0,
  unit_price DECIMAL(10, 2) NOT NULL,
  last_restocked TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_category ON inventory(category);
*/

// 3. VOID_LOGS Table - Forensic audit trail
/*
CREATE TABLE void_logs (
  id BIGINT PRIMARY KEY DEFAULT NEXTVAL('void_logs_id_seq'),
  sale_id BIGINT NOT NULL REFERENCES sales(id),
  staff_name VARCHAR(255) NOT NULL,
  void_reason TEXT,
  voided_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_void_logs_staff_name ON void_logs(staff_name);
CREATE INDEX idx_void_logs_created_at ON void_logs(created_at);
*/

// Environment Variables to add to .env.local
/*
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
*/

export {};
