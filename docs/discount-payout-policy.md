# Discount & Payout Policy — Decision Document

**Prepared for:** Client Review  
**Purpose:** Clarify how discounts affect restaurant payouts across all three offer types, and confirm the commission model for restaurant auto-offers.

---

## Background

The platform supports three types of discounts:

1. **Admin/Platform Coupon** — Created by the platform team for marketing (e.g. new user offers, festival campaigns)
2. **Restaurant Coupon** — Created by the restaurant with a coupon code (e.g. "WELCOME20")
3. **Restaurant Auto-Offer** — Created by the restaurant, applies automatically at checkout with no code required (e.g. "20% off on Paneer Tikka")

Each type has a different impact on who bears the cost of the discount.

---

## Scenario 1: Admin / Platform Coupon

> The platform creates and funds the discount. The restaurant is not affected.

### How it works
The platform offers a discount to attract customers. The restaurant receives their full payout as if no discount existed.

### Example
- Order subtotal: ₹500
- Delivery fee: ₹25
- Platform fee: ₹5
- GST (5%): ₹25
- Platform coupon discount: ₹100
- Commission rate: 10%

| Breakdown | Amount |
|---|---|
| Customer pays | ₹500 + ₹25 + ₹5 + ₹25 − ₹100 = **₹455** |
| Commission (10% of ₹500) | ₹50 |
| Restaurant receives | ₹500 − ₹50 = **₹450** |
| **Who bears the ₹100 discount?** | **Platform** |

### Key point
The restaurant's payout is completely unaffected by platform coupons. This is identical to how Zomato handles platform-funded offers.

---

## Scenario 2: Restaurant Coupon (with coupon code)

> The restaurant creates and funds the discount. It is deducted from their payout.

### How it works
The restaurant creates a coupon code and shares it with customers. The discount amount is deducted from the restaurant's payout. Commission is still charged on the original subtotal.

### Example
- Order subtotal: ₹500
- Delivery fee: ₹25
- Platform fee: ₹5
- GST (5%): ₹25
- Restaurant coupon discount: ₹100
- Commission rate: 10%

| Breakdown | Amount |
|---|---|
| Customer pays | ₹500 + ₹25 + ₹5 + ₹25 − ₹100 = **₹455** |
| Commission (10% of ₹500) | ₹50 |
| Restaurant receives | ₹500 − ₹50 − ₹100 = **₹350** |
| **Who bears the ₹100 discount?** | **Restaurant** |

### Key point
Commission is charged on the **original subtotal (₹500)**, not the discounted amount. This is the standard industry model, same as Zomato.

---

## Scenario 3: Restaurant Auto-Offer (no coupon code, auto-applied)

> The restaurant creates an item-level offer that applies automatically. The discount is funded by the restaurant, but commission is charged on the original subtotal.

### How it works
The restaurant sets up an offer on specific menu items (e.g. "20% off on Paneer Tikka"). It applies automatically when eligible items are in the cart — no code needed. The customer pays less, but the restaurant's commission is still calculated on the original subtotal.

### Example
- Order subtotal: ₹500
- Delivery fee: ₹25
- Platform fee: ₹5
- GST (5%): ₹25
- Restaurant auto-offer discount: ₹100
- Commission rate: 10%

| Breakdown | Amount |
|---|---|
| Customer pays | ₹500 + ₹25 + ₹5 + ₹25 − ₹100 = **₹455** |
| Commission (10% of ₹500) | ₹50 |
| Restaurant receives | ₹500 − ₹50 = **₹450** |
| **Who bears the ₹100 discount?** | **Restaurant** (customer paid ₹100 less, restaurant payout stays same) |

### Key point
The restaurant funds the discount by receiving less from the customer, but commission is still on the original ₹500. This differs from Zomato, where commission is charged on the discounted amount (₹400). The current model is **more favorable for the platform**.

---

## Full Comparison Table

*(All examples use: ₹500 subtotal, ₹25 delivery, ₹5 platform fee, ₹25 GST, 10% commission)*

| Scenario | Customer Pays | Restaurant Gets | Discount Borne By |
|---|---|---|---|
| No discount | ₹555 | ₹450 | — |
| Admin/Platform coupon (₹100 off) | ₹455 | ₹450 | **Platform** |
| Restaurant coupon (₹100 off) | ₹455 | ₹350 | **Restaurant** |
| Restaurant auto-offer (₹100 off) | ₹455 | ₹450 | **Restaurant** |

---

## Platform vs Zomato — Commission Model Comparison

| | Our Platform | Zomato |
|---|---|---|
| Admin coupon | Commission on original subtotal | Commission on original subtotal |
| Restaurant coupon | Commission on original subtotal | Commission on original subtotal |
| Restaurant auto-offer | Commission on **original** subtotal ← | Commission on **discounted** subtotal |

---

## Decision Required — Scenario 3 Commission Basis

For **restaurant auto-offers**, there are two valid approaches:

### Option A — Current behavior (Platform-favorable)
Commission is charged on the **original subtotal** (before discount).

- Platform earns more commission
- Restaurant bears the full discount cost + pays commission on a higher base
- Simpler to implement and audit

**Example:** Commission = 10% × ₹500 = ₹50. Restaurant gets ₹450.

---

### Option B — Zomato model (Restaurant-favorable)
Commission is charged on the **discounted subtotal** (after discount).

- Platform earns slightly less commission
- Fairer to the restaurant — they pay commission only on what the customer actually paid for food
- May encourage restaurants to create more offers, driving higher order volumes

**Example:** Commission = 10% × ₹400 = ₹40. Restaurant gets ₹360.

---

## Recommendation

Both options are standard in the industry. The choice depends on the platform's business priorities:

- If the goal is **maximizing platform revenue per order** → keep Option A (current)
- If the goal is **encouraging restaurants to run more offers** and building long-term restaurant loyalty → switch to Option B

> **Please confirm which option you would like to proceed with so the development team can finalize the commission calculation logic.**

---

*Document prepared by the development team. All figures are illustrative examples.*
