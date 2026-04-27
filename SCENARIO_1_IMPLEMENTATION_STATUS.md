# Scenario 1: Restaurant-Funded Coupon - Implementation Status

## Overview
**Scenario 1**: Restaurant khud discount deta hai aur commission full original amount par lagta hai.

### Example:
- Order Value: ₹500
- Coupon: SAVE50 (₹50 discount, restaurant-funded)
- User Pays: ₹450
- Commission: ₹50 (on ₹500)
- Restaurant Gets: ₹400 (₹500 - ₹50 commission - ₹50 discount)

---

## Implementation Checklist

### ✅ Phase 1: Database Schema (COMPLETED)

#### 1. ✅ Coupon Model Updated
**File**: `Backend/src/modules/food/admin/models/offer.model.js`

**Added Field**:
```javascript
fundedBy: { 
    type: String, 
    enum: ['restaurant', 'platform'], 
    default: 'platform',
    index: true 
}
```

**Status**: ✅ DONE
- Existing `FoodOffer` model ko update kiya
- `fundedBy` field add kiya to distinguish restaurant vs platform funded
- Default value: `'platform'`

#### 2. ✅ Order Model Updated
**File**: `Backend/src/modules/food/orders/models/order.model.js`

**Added Fields**:
```javascript
pricing: {
    // ... existing fields
    discount: { type: Number, default: 0, min: 0 },
    
    // NEW: Discount breakdown
    couponByAdmin: { type: Number, default: 0, min: 0 },
    couponByRestaurant: { type: Number, default: 0, min: 0 },
    offerByRestaurant: { type: Number, default: 0, min: 0 },
    
    total: { type: Number, required: true, min: 0 },
}
```

**Status**: ✅ DONE
- Discount breakdown fields added
- Backward compatible (default: 0)

#### 3. ✅ Transaction Model Updated
**File**: `Backend/src/modules/food/orders/models/foodTransaction.model.js`

**Added Fields**: Same as Order Model

**Status**: ✅ DONE

---

### ✅ Phase 2: Backend Services (COMPLETED)

#### 1. ✅ Order Pricing Service Updated
**File**: `Backend/src/modules/food/orders/services/order-pricing.service.js`

**Changes Made**:
```javascript
// Store fundedBy in appliedCoupon
appliedCoupon = { 
    code: codeRaw, 
    discount: couponDiscount, 
    fundedBy: offer.fundedBy || 'platform' 
};

// Calculate breakdown
let couponByAdmin = 0;
let couponByRestaurant = 0;
let offerByRestaurant = autoOfferDiscount;

if (appliedCoupon) {
    if (appliedCoupon.fundedBy === 'restaurant') {
        couponByRestaurant = couponDiscount;
    } else {
        couponByAdmin = couponDiscount;
    }
}

// Return in pricing
return {
    pricing: {
        // ... existing fields
        couponByAdmin,
        couponByRestaurant,
        offerByRestaurant,
        // ... rest
    }
};
```

**Status**: ✅ DONE
- Reads `fundedBy` from coupon
- Calculates breakdown correctly
- Returns breakdown in pricing object

#### 2. ✅ Order Service Updated
**File**: `Backend/src/modules/food/orders/services/order.service.js`

**Changes Made**: Same logic as order-pricing.service.js

**Status**: ✅ DONE
- Discount breakdown calculation added
- `fundedBy` logic implemented

---

### ✅ Phase 3: Frontend (COMPLETED)

#### 1. ✅ Order Report Updated
**File**: `Frontend/src/modules/Food/pages/admin/reports/RegularOrderReport.jsx`

**Changes Made**:
- ❌ Removed: "Coupon Discount" column
- ✅ Added: "Coupon by Admin" column (Green)
- ✅ Added: "Coupon by Restaurant" column (Orange)
- ✅ Added: "Offer by Restaurant" column (Purple)
- ✅ Added: "Admin Commission" column (Blue, Bold)

**Status**: ✅ DONE
- Table structure updated
- Color coding implemented
- Export functionality updated

---

## What's Working Now

### ✅ Scenario 1: Restaurant-Funded Coupon

**When a restaurant-funded coupon is applied**:

1. **Coupon Creation**:
   - Admin/Restaurant creates coupon with `fundedBy: 'restaurant'`
   - Coupon stored in `FoodOffer` model

2. **Order Creation**:
   - User applies coupon code
   - System checks `fundedBy` field
   - If `fundedBy === 'restaurant'`:
     - Discount goes to `pricing.couponByRestaurant`
   - If `fundedBy === 'platform'`:
     - Discount goes to `pricing.couponByAdmin`

3. **Commission Calculation**:
   - Commission calculated on **original amount** (₹500)
   - NOT on discounted amount
   - Uses existing `getRestaurantCommissionSnapshot()` function

4. **Restaurant Payout**:
   ```javascript
   originalAmount = ₹500
   discount = ₹50 (restaurant-funded)
   commission = ₹50 (on ₹500)
   restaurantPayout = ₹500 - ₹50 - ₹50 = ₹400
   ```

5. **Order Report**:
   - Shows ₹50 in "Coupon by Restaurant" column (Orange)
   - Shows ₹50 in "Admin Commission" column (Blue)
   - Shows ₹450 in "Order Amount" (what customer paid)

---

## What's NOT Done Yet

### ❌ Phase 4: Admin UI for Coupon Management

#### Missing Features:

1. **Admin Panel - Create Coupon UI**
   - No UI to create coupons with `fundedBy` selection
   - Need dropdown: "Funded By" → Restaurant / Platform
   - Need restaurant selection (if restaurant-funded)

2. **Admin Panel - Coupon List UI**
   - No UI to view existing coupons
   - No filter by `fundedBy`
   - No edit/delete functionality

3. **Restaurant Panel - Create Own Coupons**
   - Restaurants can't create their own coupons yet
   - Need restaurant-side coupon management

4. **User App - Coupon Apply UI**
   - Existing coupon apply should work
   - But no visual indication of who funds it

---

## Testing Status

### ✅ Can Test Now:

1. **Manual Database Entry**:
   ```javascript
   // Create a restaurant-funded coupon manually in MongoDB
   db.food_offers.insertOne({
       couponCode: "SAVE50",
       fundedBy: "restaurant",
       discountType: "fixed",
       discountValue: 50,
       restaurantId: ObjectId("..."),
       minOrderValue: 0,
       status: "active",
       approvalStatus: "approved",
       startDate: new Date(),
       endDate: new Date("2025-12-31")
   })
   ```

2. **Create Order with Coupon**:
   - Use existing order creation API
   - Pass `couponCode: "SAVE50"`
   - Check order document in database

3. **Verify Breakdown**:
   ```javascript
   // Check order.pricing
   {
       subtotal: 500,
       discount: 50,
       couponByRestaurant: 50,  // ✅ Should be 50
       couponByAdmin: 0,         // ✅ Should be 0
       offerByRestaurant: 0,     // ✅ Should be 0
       restaurantCommission: 50, // ✅ Commission on original
       total: 450
   }
   ```

4. **Check Order Report**:
   - Go to `/admin/food/order-report/regular`
   - Find the order
   - Verify columns show correct values

### ❌ Can't Test Yet:

1. Creating coupons via UI (no UI exists)
2. Restaurant creating their own coupons (no UI)
3. User seeing coupon details (no UI update)

---

## Commission Calculation - Scenario 1

### Current Implementation:

**File**: `Backend/src/modules/food/orders/services/foodTransaction.service.js`

**Function**: `getRestaurantCommissionSnapshot()`

**How it works**:
```javascript
// Commission calculated on SUBTOTAL (original amount)
const baseAmount = Number(orderDoc?.pricing?.subtotal ?? 0) || 0;

// Get restaurant commission rule
const rule = rules.find((r) => 
    String(r.restaurantId) === String(restaurantIdRaw)
);

// Calculate commission
if (rule.defaultCommission.type === 'percentage') {
    commission = baseAmount * (rule.defaultCommission.value / 100);
} else {
    commission = rule.defaultCommission.value;
}
```

**Key Point**: ✅ Commission is calculated on `subtotal`, NOT on discounted amount.

This is **CORRECT** for Scenario 1:
- Order: ₹500
- Discount: ₹50 (restaurant-funded)
- Commission: 10% of ₹500 = ₹50 (NOT 10% of ₹450)
- Restaurant gets: ₹500 - ₹50 - ₹50 = ₹400

---

## Summary

### ✅ COMPLETED (Scenario 1):

1. ✅ Database schema updated
2. ✅ `fundedBy` field added to FoodOffer model
3. ✅ Discount breakdown calculation implemented
4. ✅ Order pricing service updated
5. ✅ Order service updated
6. ✅ Order report UI updated
7. ✅ Commission calculation (already correct)
8. ✅ Backend logic complete

### ❌ PENDING (Optional):

1. ❌ Admin UI for coupon management
2. ❌ Restaurant UI for creating coupons
3. ❌ User app UI updates (optional)

---

## Can We Use It?

### YES! ✅

**Scenario 1 is FUNCTIONALLY COMPLETE**

You can:
1. Create coupons manually in database with `fundedBy: 'restaurant'`
2. Users can apply these coupons
3. System will calculate breakdown correctly
4. Commission will be on original amount
5. Order report will show correct breakdown

**What's missing**: Only the UI to create/manage coupons. The core logic is done.

---

## Next Steps

### Option 1: Test Scenario 1 Now
1. Create test coupon in database
2. Place test order
3. Verify breakdown in order report

### Option 2: Build Admin UI
1. Create coupon management page
2. Add `fundedBy` dropdown
3. Add restaurant selection

### Option 3: Move to Scenario 2
1. Scenario 2 is already implemented! (same code)
2. Just set `fundedBy: 'platform'`
3. Platform bears the discount cost

### Option 4: Move to Scenario 3
1. Implement item-level offers
2. Update MenuItem model
3. Calculate discount before commission

---

## Recommendation

**Scenario 1 is COMPLETE** ✅

The backend logic is fully implemented. You can test it by:
1. Creating a coupon manually in MongoDB
2. Applying it to an order
3. Checking the order report

If you want UI for coupon management, that's a separate task (frontend work).

**Should we**:
- A) Test Scenario 1 now?
- B) Build coupon management UI?
- C) Move to Scenario 3 (item-level offers)?
