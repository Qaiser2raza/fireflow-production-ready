# 💰 Fireflow Financial Architecture: Double-Entry Ledger System

## 🏦 Accounting Philosophy
Fireflow operates on a **Double-Entry Ledger System**. Every movement of value (food leaving, cash entering, float issued) must be recorded as a balanced transaction between two accounts. This ensures that the math always balances and prevents "hidden" shortages.

---

## 🚴 Rider Debt Model (Logistics)
In Fireflow, a Delivery Rider is treated as a **Short-Term Debtor**.

### **1. Dispatch (Debt Creation)**
When a rider is assigned orders and given a float:
- **Debit**: `Rider_Ledger` (Asset account - Rider owes this value)
- **Credit**: `Cash_Drawer` (for Float) & `Sales_Revenue` (for Food)
- **Impact**: The rider's "Cash in Hand" liability increases.

### **2. Marking Delivered**
- The system confirms the sale is complete, but the rider still holds the value.
- The button changes to **"Delivered"** (Visual confirmation).

### **3. Cash Settlement (Debt Clearing)**
- **Debit**: `Cash_Drawer` (Asset account - Physical cash returned)
- **Credit**: `Rider_Ledger` (Liability account - Rider's debt reduced)
- **Shortage Logic**: If `Amount_Received < Amount_Expected`, the difference remains in the `Rider_Ledger`. The rider carries this debt to the next shift.

---

## 📂 Chart of Accounts (Logical)

| Account Name | Category | Description |
| :--- | :--- | :--- |
| **Cash Drawer** | Asset | Physical cash currently in the POS drawer. |
| **Rider Ledgers** | Asset | Total debt owed by all riders (Float + Unsettled Sales). |
| **Supplier Ledgers** | Liability | Accounts Payable (Money we owe for stock incoming). |
| **Service Charge Pool** | Liability | Money collected for staff that hasn't been disbursed yet. |
| **Sales Revenue** | Revenue | Total value of food/services sold. |
| **Operating Expenses** | Expense | Payments for utilities, rent, small purchases. |

---

## 🛠️ Data Entities (Proposed Schema)

### **`ledger_entries`**
The atomic unit of every financial movement.
- `id`: UUID
- `account_id`: (Rider ID, Supplier ID, or System Account)
- `transaction_type`: `DEBIT` | `CREDIT`
- `amount`: Decimal
- `reference_type`: `ORDER` | `SETTLEMENT` | `PAYOUT` | `STOCK_IN`
- `reference_id`: UUID
- `staff_id`: (Who processed it)
- `created_at`: Timestamp

### **`payouts`**
Outbound cash movements from the drawer.
- `id`: UUID
- `amount`: Decimal
- `category`: `SUPPLIER_PAYMENT` | `EXPENSE` | `STAFF_ADVNACE` | `SC_DISBURSEMENT`
- `reference_id`: UUID
- `notes`: String

---

## 📈 End-of-Day (Z-Report) Workflow
The Z-Report is the final reconciliation of the restaurant's financial state.

1.  **Expected Cash Calculation**:
    `Opening Cash` + `Cash Sales` + `Rider Settlements` - `Payouts` = **Expected Drawer Balance**.
2.  **Physical Count**: Manager enters the actual cash in the drawer.
3.  **Variance Reporting**: System calculates `Actual - Expected`.
4.  **Closing the Day**: 
    - Archive today's transactions.
    - Carry forward Rider Shortages.
    - Set `Opening Cash` for tomorrow.

---

## 📋 Integration Requirements for Agents
- **Backend**: Implement `AccountingService.ts` to hook into existing order flows.
- **Frontend**: Create `FinancialCommandCenter` tab to manage Payables, Receivables (Riders), and Payouts.
- **Auditing**: Every `ledger_entry` must have an associated `audit_log` entry.

---
**Document Owner**: Financial Advisor / Architecture Agent
**Status**: ACTIVE Specification
