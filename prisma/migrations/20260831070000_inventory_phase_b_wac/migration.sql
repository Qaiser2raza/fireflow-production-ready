-- M031-B Phase B: WAC projection columns + movement cost snapshot columns

-- Add projection columns to inventory_items
ALTER TABLE inventory_items
  ADD COLUMN average_unit_cost DECIMAL(15, 4) NOT NULL DEFAULT 0,
  ADD COLUMN total_cost_basis  DECIMAL(15, 4) NOT NULL DEFAULT 0;

-- Add cost snapshot columns to stock_movements
ALTER TABLE stock_movements
  ADD COLUMN total_cost      DECIMAL(15, 4) NOT NULL DEFAULT 0,
  ADD COLUMN costing_method  VARCHAR(20)     NOT NULL DEFAULT 'WAC';

-- Widen unit_cost precision on stock_movements (was 10,4 -> 15,4)
ALTER TABLE stock_movements
  ALTER COLUMN unit_cost TYPE DECIMAL(15, 4);
