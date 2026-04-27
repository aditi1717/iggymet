# Discount Scenarios Implementation Plan

## Overview
Teen discount scenarios implement karne hain food delivery platform mein.

**Important:** Restaurant commission already implemented hai aur admin panel se set hota hai (`/admin/food/restaurants/commission`). Hum existing commission calculation ko reuse karenge.

---

## Scenario 1: Restaurant-Funded Coupon
**Restaurant khud discount deta hai**

### Example:
- Order Value: ₹500
- Coupon: SAVE50 (₹50 discount)
- User Pays: ₹450
- Commission: ₹50 (on ₹500)
- Restaurant Gets: ₹400 (₹500 - ₹50 commission - ₹50 discount)

### Implementation Steps:

#### 1. Database Changes
- **Coupon Model** mein add karna:
  - `fundedBy: 'restaurant' | 'platform'`
  - `restaurantId: ObjectId` (agar restaurant-funded hai)
  - `discountType: 'percentage' | 'fixed'`
  - `discountValue: Number`
  - `maxDiscount: Number` (for percentage type)

#### 2. Order Calculation Logic
```javascript
// Order breakdown calculation
originalAmount = ₹500
discountAmount = ₹50
customerPayableAmount = ₹450
commissionAmount = originalAmount * commissionRate (₹50)
restaurantPayout = originalAmount - commissionAmount - discountAmount (₹400)
platformRevenue = commissionAmount (₹50)
```

#### 3. API Changes
- **POST /api/orders/apply-coupon**
  - Validate coupon
  - Check if restaurant-funded
  - Calculate breakdown
  - Return preview

- **POST /api/orders/create**
  - Apply discount
  - Calculate restaurant payout
  - Store breakdown in order

#### 4. Models to Update
- `Order Model`: Add fields
  - `discount.fundedBy`
  - `discount.amount`
  - `breakdown.originalAmount`
  - `breakdown.discountAmount`
  - `breakdown.customerPaid`
  - `breakdown.restaurantPayout`
  - `breakdown.platformRevenue`

---

## Scenario 2: Platform-Funded Coupon
**Zomato/Platform discount deta hai**

### Example:
- Order Value: ₹500
- Coupon: NEWUSER100 (₹100 discount)
- User Pays: ₹400
- Commission: ₹50 (on ₹500)
- Restaurant Gets: ₹450 (₹500 - ₹50 commission)
- Platform Bears: ₹100 discount

### Implementation Steps:

#### 1. Database Changes
- Same coupon model, but `fundedBy: 'platform'`
- No `restaurantId` required

#### 2. Order Calculation Logic
```javascript
// Order breakdown calculation
originalAmount = ₹500
discountAmount = ₹100
customerPayableAmount = ₹400
commissionAmount = originalAmount * commissionRate (₹50)
restaurantPayout = originalAmount - commissionAmount (₹450)
platformRevenue = commissionAmount - discountAmount (₹50 - ₹100 = -₹50 loss)
```

#### 3. Key Difference
- Restaurant ko full amount milta hai (minus commission)
- Platform discount bear karta hai
- Marketing/acquisition ke liye use hota hai

---

## Scenario 3: Restaurant Offer (Item-level Discount)
**Restaurant menu items par direct discount**

### Example:
- Original Order: ₹500
- Item Discount: ₹50 (automatic)
- Discounted Order: ₹450
- User Pays: ₹450
- Commission: ₹45 (on ₹450)
- Restaurant Gets: ₹405 (₹450 - ₹45)

### Implementation Steps:

#### 1. Database Changes
- **MenuItem Model** mein add:
  - `offer.isActive: Boolean`
  - `offer.discountType: 'percentage' | 'fixed'`
  - `offer.discountValue: Number`
  - `offer.originalPrice: Number`
  - `offer.discountedPrice: Number`

#### 2. Order Calculation Logic
```javascript
// Item level discount pehle apply hota hai
originalPrice = ₹500
itemDiscount = ₹50
discountedAmount = ₹450
customerPayableAmount = ₹450
commissionAmount = discountedAmount * commissionRate (₹45)
restaurantPayout = discountedAmount - commissionAmount (₹405)
platformRevenue = commissionAmount (₹45)
```

#### 3. Key Difference
- No coupon code needed
- Discount automatically applied
- Commission calculated on discounted amount
- Restaurant ka loss kam hota hai compared to Scenario 1

---

## Implementation Priority

### Phase 1: Database Schema
1. Create/Update Coupon Model
2. Update Order Model with breakdown fields
3. Update MenuItem Model for offers

### Phase 2: Backend Services
1. Coupon validation service
2. Order calculation service (all 3 scenarios)
3. Restaurant payout calculation
4. Platform revenue tracking

### Phase 3: API Endpoints
1. Apply coupon API
2. Order creation with discount
3. Restaurant offer listing
4. Admin coupon management

### Phase 4: Frontend Integration
1. Coupon apply UI
2. Order breakdown display
3. Restaurant offer display
4. Admin dashboard for coupons

---

## Files to Create/Modify

### Backend
- `Backend/src/core/coupons/coupon.model.js` (new)
- `Backend/src/core/coupons/coupon.service.js` (new)
- `Backend/src/core/coupons/coupon.controller.js` (new)
- `Backend/src/core/coupons/coupon.routes.js` (new)
- `Backend/src/modules/food/*/models/order.model.js` (update)
- `Backend/src/modules/food/*/models/menuItem.model.js` (update)
- `Backend/src/modules/food/*/services/order.service.js` (update)

### Frontend
- Coupon apply component
- Order breakdown component
- Restaurant offer display

---

## Testing Checklist
- [ ] Scenario 1: Restaurant-funded coupon calculation
- [ ] Scenario 2: Platform-funded coupon calculation
- [ ] Scenario 3: Item-level discount calculation
- [ ] Commission calculation for all scenarios
- [ ] Restaurant payout verification
- [ ] Platform revenue tracking
- [ ] Coupon validation (expiry, usage limits, etc.)

---

## Existing Commission Structure
**Already Implemented:**
- Restaurant commission already exists in `FoodRestaurantCommission` model
- Commission set hota hai per restaurant basis
- Admin panel: `http://localhost:5173/admin/food/restaurants/commission`
- Commission types: `percentage` or `amount`
- Commission calculation already working in `foodTransaction.service.js`

**Integration Points:**
- Use existing `getRestaurantCommissionSnapshot()` function
- Commission calculation: `computeRestaurantCommissionAmount()`
- Order model already has `pricing.restaurantCommission` field
- Transaction model already tracks commission breakdown

## Notes
- Commission rate already configurable per restaurant ✅
- Multiple coupons ek saath apply nahi hone chahiye (unless specified)
- Item-level discount + coupon dono ek saath ho sakte hain (business logic decide karegi)
- Restaurant dashboard mein unka loss/discount clearly dikhna chahiye
- Existing commission calculation ko reuse karenge, naya nahi banayenge
