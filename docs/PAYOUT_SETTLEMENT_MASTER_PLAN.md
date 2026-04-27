# Payout Settlement Master Plan (Restaurant + Delivery)

## 1) Goal
Build one admin-controlled settlement system where:
- Admin selects date interval (`fromDate` to `toDate`)
- System shows payable data in table
- Admin marks payout as paid
- Status changes to `paid`
- Main reports (Restaurant Report, Delivery wallet/report) auto-update `unpaid` and `paid`
- Next cycle starts after last settled date

---

## 2) New Admin Module
Add new sidebar module:
- `Payout Settlement`

New routes:
- `/admin/food/payout-settlement/restaurants`
- `/admin/food/payout-settlement/delivery`

Page sections:
- Filter bar (`Start Date`, `End Date`, optional zone, optional entity search)
- Summary cards (`Total Payable`, `Total Paid`, `Pending`)
- Settlement table
- Action button per row: `Mark Paid`
- Bulk action: `Mark Selected Paid` (phase 2)

---

## 3) Core Data Model (New Collection)
Create new collection:
- `food_payout_settlements`

Suggested schema:
```js
{
  beneficiaryType: "restaurant" | "delivery",
  beneficiaryId: ObjectId,            // restaurantId or deliveryPartnerId
  fromDate: Date,
  toDate: Date,
  transactionIds: [ObjectId],         // linked food_transactions
  ordersCount: Number,
  grossAmount: Number,                // amount before any manual adjustment
  paidAmount: Number,                 // actual paid
  adjustmentAmount: Number,           // optional +/-
  status: "pending" | "partially_paid" | "paid" | "cancelled",
  payoutMethod: "bank" | "upi" | "cash" | "manual",
  referenceNumber: String,            // UTR/ref
  note: String,
  paidAt: Date,
  paidByAdminId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:
- `beneficiaryType + beneficiaryId + fromDate + toDate`
- `status`
- `paidAt`

---

## 4) Existing Data Sources
Use existing collections:
- `food_transactions`:
  - `amounts.restaurantShare`
  - `amounts.riderShare`
  - `settlement.isRestaurantSettled`
  - `settlement.isRiderSettled`
- `food_orders` for delivered-status validation

Rule:
- Only include delivered + valid financial transactions
- Exclude failed/refunded

---

## 5) Computation Rules
For restaurant:
- `totalEarning = sum(restaurantShare)`
- `alreadyPaid = sum(restaurantShare where settled=true)`
- `payableNow = totalEarning - alreadyPaid`

For delivery:
- `totalEarning = sum(riderShare)`
- `alreadyPaid = sum(riderShare where settled=true)`
- `payableNow = totalEarning - alreadyPaid`

Status:
- `paid` if payableNow == 0 for selected interval
- `pending` if payableNow > 0

---

## 6) APIs (Proposed)
### 6.1 Preview Table API
`GET /food/admin/payout-settlements/preview`

Query:
- `beneficiaryType=restaurant|delivery`
- `fromDate=YYYY-MM-DD`
- `toDate=YYYY-MM-DD`
- `zoneId` (optional)
- `beneficiaryId` (optional)
- `page`, `limit`

Response row:
```json
{
  "beneficiaryId": "....",
  "beneficiaryName": "Raddison",
  "ordersCount": 125,
  "totalEarning": 45320.00,
  "alreadyPaid": 30000.00,
  "payableNow": 15320.00,
  "status": "pending",
  "lastSettledToDate": "2026-04-14"
}
```

### 6.2 Create/Mark Paid API
`POST /food/admin/payout-settlements/mark-paid`

Body:
```json
{
  "beneficiaryType": "restaurant",
  "beneficiaryId": "....",
  "fromDate": "2026-04-15",
  "toDate": "2026-04-21",
  "paidAmount": 15320,
  "payoutMethod": "bank",
  "referenceNumber": "UTR12345",
  "note": "Weekly settlement"
}
```

Action:
- Resolve eligible transactionIds in range
- Deduplicate already-settled txs
- Insert settlement ledger entry
- Update tx settlement flags (`isRestaurantSettled` / `isRiderSettled`)
- Return updated summary

### 6.3 History API
`GET /food/admin/payout-settlements/history`

Filters:
- type, beneficiary, status, date range

---

## 7) Frontend Table Fields
For Restaurants tab:
- Restaurant
- Orders Count
- Total Earning
- Paid
- Unpaid (Payable)
- Last Settled Date
- Status
- Action (`Mark Paid`)

For Delivery tab:
- Delivery Partner
- Orders Count
- Total Earning
- Paid
- Unpaid (Payable)
- Last Settled Date
- Status
- Action

---

## 8) Validation Rules
- `fromDate <= toDate`
- both dates <= today
- cannot settle future dates
- cannot settle same transaction twice
- if payableNow <= 0 then block `Mark Paid`
- require confirmation modal before payout

---

## 9) Update Existing Reports Automatically
When settlement is done:
- `Restaurant Report` paid/unpaid columns update from transaction settlement flags
- Restaurant wallet/finance page updates
- Delivery wallet page updates
- Admin disbursement reports update

No manual sync required if computed from same source.

---

## 10) Example End-to-End Flow
### Example A (Restaurant weekly)
1. Admin opens restaurant settlement tab
2. Selects `2026-04-15` to `2026-04-21`
3. Table shows:
   - Total earning: 45,320
   - Paid: 30,000
   - Unpaid: 15,320
4. Admin clicks `Mark Paid`
5. Status becomes `paid`
6. Restaurant report unpaid reduces by 15,320
7. Next default cycle start = `2026-04-22`

### Example B (Delivery weekly)
1. Admin selects same range
2. Delivery row unpaid = 8,750
3. Mark paid with UTR
4. Rider unpaid becomes 0 for that interval
5. Wallet/disbursement pages reflect update

---

## 11) Rollout Plan
Phase 1:
- Settlement ledger model
- Preview + Mark Paid API for restaurants
- New admin page (restaurants tab)

Phase 2:
- Delivery tab + delivery settlement API
- History + export

Phase 3:
- Bulk pay
- Partial pay
- Reversal entry flow (no hard delete)

---

## 12) Safety / Audit Recommendations
- Never hard-delete settlement rows
- Keep `paidByAdminId`, `paidAt`, `referenceNumber`
- Keep immutable history
- Any correction as reversal/adjustment entry

---

## 13) Implementation Notes for Current Codebase
- `food_transactions` already has settlement flags; reuse them
- `Restaurant Report` already shows paid/unpaid style metrics; extend with settlement-ledger based interval controls
- Use same date-filter pattern already implemented (`startDate/endDate`, no future date)

---

## 14) Optional Better Ideas
- Auto-suggest weekly ranges
- “Settle till yesterday” quick button
- CSV export with one-click finance sheet format
- Email/notification to restaurant or rider after payout
- Payout dashboard card: `This Week Payable`, `Paid This Week`, `Overdue`

---

## 15) Ready-to-Build Checklist
- [ ] Create `food_payout_settlements` model
- [ ] Add preview API
- [ ] Add mark-paid API
- [ ] Add history API
- [ ] Add new admin routes
- [ ] Add new sidebar menu
- [ ] Create new page UI (restaurants + delivery tabs)
- [ ] Wire report/wallet refresh to same source
- [ ] Add exports
- [ ] Add tests for duplicate settlement prevention

