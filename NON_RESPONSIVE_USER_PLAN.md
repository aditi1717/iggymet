# Feature Plan: Non-Responsive User Penalty System

This document outlines the strategy for handling cases where a user does not answer the delivery partner's call, and how to recover the resulting financial loss in the next order.

## 1. Money Flow Logic (Who gets paid?)

In a "No-Response" scenario, the platform must ensure the working partners (Restaurant and Rider) are not penalized for the user's mistake.

| Party | Money Action | Rationale |
| :--- | :--- | :--- |
| **Restaurant** | **Paid in Full** | Food was prepared and picked up correctly. |
| **Delivery Boy** | **Paid in Full + Bonus** | Travel was completed and target location was reached. Extra wait time should be compensated. |
| **Admin (Platform)**| **Initial Loss** | Admin pays the restaurant and rider out of pocket initially. |
| **User** | **Debt Recorded** | The total cost (Food + Delivery + Platform Fee) is added to the user's account as a "Pending Due". |

---

## 2. Implementation Steps

### Phase 1: Delivery Partner App (Reporting)
1. **At-Drop Phase Tools**: When the rider reaches the drop location, a "Contact User" section becomes active.
2. **Waiting Timer**: If the user doesn't pick up, a 5-minute timer starts. The rider must wait until it finishes.
3. **Evidence Capture**: After the timer, the rider can click "User Not Responding". They must upload a photo of the house/gate as proof.
4. **Order Status**: The order status transitions to `cancelled_user_unavailable`.

### Phase 2: Backend (Data Management)
1. **New Model (`FoodUserDebt`)**: Store the `userId`, `failedOrderId`, `amount`, and `status`.
2. **Financial Trigger**: When the order is marked `cancelled_user_unavailable`, automatically create a `FoodUserDebt` record.
3. **Status Update**: Notify the restaurant and settle their balance as a successful preparation.

### Phase 3: User App (Recovery & Prevention)
1. **Debt Notification**: Send a push notification informing the user about the cancellation fee.
2. **Checkout Logic**: The `calculateOrder` API will check for any 'unpaid' debts.
3. **UI Integration**: 
    - The Cart will display a line item: **"Dues from previous failed delivery: ₹XXX"**.
    - The "Place Order" button will only work if the total (including debt) is paid.
4. **Debt Clearing**: Once the new order is paid (either via Online or COD successfully), the `FoodUserDebt` record is marked as 'paid'.

---

## 3. History & Reporting Visualization

### A. Order History (User App)
When a user views an order that included a penalty, the price breakdown will clearly show the recovery:

**Order #10050 Details**
- Item Total: ₹450.00
- Delivery Fee: ₹30.00
- Taxes & Fees: ₹25.00
- **Previous Unpaid Dues (Order #10032): ₹200.00**
---
- **Total Paid: ₹705.00**

---

### B. Transaction History (Owner/Admin View)
The transaction log will maintain the link between the failed attempt and the recovery:

| Date | Order ID | Description | Amount | Status |
| :--- | :--- | :--- | :--- | :--- |
| 18 Apr | #10032 | Delivery Failed (No Response) | ₹200.00 | **Overdue** |
| 19 Apr | #10050 | Order Payment (incl. ₹200 dues) | ₹705.00 | **Paid** (✅) |

**Real-time logic**: As soon as Order #10050 is marked 'Paid', the system will automatically update the status of Order #10032 in the records to **"Recovered"**.

---

### C. Money Flow (Settlement)
- **Admin Dashboard**: Shows a "Recovery Report" that tracks how much bad debt was generated and how much was successfully collected.
- **Restaurant/Rider Payout**: They see their normal payout for the successful order, while the "Due Amount" portion is internally routed to the Admin's recovery pool (since Admin already paid them for the old order).

---

## 4. Before & After Payment Visualization

### Scenario A: Before Dues are Paid (The Failed Order)
- **Order #10032 View**: Status is "Cancelled". A red alert box says: *"You missed this delivery. A ₹200 penalty is pending and will be added to your next order."*
- **User Cart**: Before checkout, the cart shows a mandatory line item: *"Outstanding Balance: ₹200"*.

### Scenario B: After Dues are Paid (The Recovery)
- **Original Order #10032**: Status updates from "Cancelled" to **"Closed (Penalty Paid in #10050)"**.
- **New Order #10050**: The Bill summary shows the recovery as a successful line item.
- **Transaction History**: Two green-labeled transactions:
   1. "Order #10050 Payment: ₹540"
   2. "Previous Dues Recovery (#10032): ₹200"

---

## 5. Edge Cases & Safety
- **Rider Honesty**: Use GPS verification to ensure the rider was within 50-100 meters of the drop location before they can raise a complaint.
- **Support Override**: Admin can manually remove a debt if the user provides a valid medical or emergency reason via support.
- **Max Debt Limit**: If a user has more than X unpaid failed deliveries, block their account entirely until they clear the balance.
