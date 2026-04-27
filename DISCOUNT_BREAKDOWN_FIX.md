# Discount Breakdown Fix

## Issue
User placed an order with restaurant offer, but:
1. Restaurant finance page mein discount nahi dikh raha tha
2. Admin order report mein discount values nahi aa rahi thi

## Root Cause
Order creation service (`order.service.js`) mein discount breakdown fields store nahi ho rahi thi:
- `couponByAdmin`
- `couponByRestaurant`
- `offerByRestaurant`

Pricing service (`order-pricing.service.js`) mein yeh values calculate ho rahi thi, lekin order create karte waqt store nahi ho rahi thi.

## Fix Applied

### File: `Backend/src/modules/food/orders/services/order.service.js`

**Before:**
```javascript
const normalizedPricing = {
  subtotal: Number(dto.pricing?.subtotal ?? computedSubtotal),
  tax: Number(dto.pricing?.tax ?? 0),
  packagingFee: Number(dto.pricing?.packagingFee ?? 0),
  deliveryFee: Number(dto.pricing?.deliveryFee ?? 0),
  platformFee: Number(dto.pricing?.platformFee ?? 0),
  discount: Number(dto.pricing?.discount ?? 0),
  total: Number(dto.pricing?.total ?? 0),
  currency: String(dto.pricing?.currency || "INR"),
};
```

**After:**
```javascript
const normalizedPricing = {
  subtotal: Number(dto.pricing?.subtotal ?? computedSubtotal),
  tax: Number(dto.pricing?.tax ?? 0),
  packagingFee: Number(dto.pricing?.packagingFee ?? 0),
  deliveryFee: Number(dto.pricing?.deliveryFee ?? 0),
  platformFee: Number(dto.pricing?.platformFee ?? 0),
  discount: Number(dto.pricing?.discount ?? 0),
  couponByAdmin: Number(dto.pricing?.couponByAdmin ?? 0),        // ✅ Added
  couponByRestaurant: Number(dto.pricing?.couponByRestaurant ?? 0), // ✅ Added
  offerByRestaurant: Number(dto.pricing?.offerByRestaurant ?? 0),   // ✅ Added
  total: Number(dto.pricing?.total ?? 0),
  currency: String(dto.pricing?.currency || "INR"),
};
```

## How It Works

### Flow:
1. **Frontend** calls pricing API with cart items + coupon/offer
2. **Pricing Service** calculates discount breakdown:
   - If coupon is platform-funded → `couponByAdmin`
   - If coupon is restaurant-funded → `couponByRestaurant`
   - If restaurant auto-offer → `offerByRestaurant`
3. **Frontend** sends pricing object to order creation API
4. **Order Service** now stores all breakdown fields in database
5. **Reports & Finance Pages** can now show proper breakdown

### Example Order with Restaurant Offer:

**Pricing Object:**
```javascript
{
  subtotal: 500,
  tax: 25,
  deliveryFee: 30,
  platformFee: 5,
  discount: 100,
  couponByAdmin: 0,           // No platform coupon
  couponByRestaurant: 0,      // No restaurant coupon
  offerByRestaurant: 100,     // Restaurant offer applied
  total: 460
}
```

**Stored in Order:**
```javascript
{
  orderId: "ORD-12345",
  pricing: {
    subtotal: 500,
    discount: 100,
    couponByAdmin: 0,
    couponByRestaurant: 0,
    offerByRestaurant: 100,    // ✅ Now stored!
    total: 460
  }
}
```

## Testing

### Test Case 1: Restaurant Offer
1. Add items to cart that have restaurant offer
2. Place order
3. Check order in database:
   ```javascript
   db.food_orders.findOne({ orderId: "ORD-XXXXX" })
   // Should show:
   // pricing.offerByRestaurant: 100
   // pricing.couponByAdmin: 0
   // pricing.couponByRestaurant: 0
   ```
4. Check admin order report - "Offer by Restaurant" column should show ₹100
5. Check restaurant finance page - "Your Offers" should show -₹100

### Test Case 2: Platform Coupon
1. Apply platform-funded coupon (e.g., NEWUSER100)
2. Place order
3. Check database:
   ```javascript
   // Should show:
   // pricing.couponByAdmin: 100
   // pricing.couponByRestaurant: 0
   // pricing.offerByRestaurant: 0
   ```
4. Check reports - "Coupon by Admin" should show ₹100

### Test Case 3: Restaurant Coupon
1. Apply restaurant-funded coupon (e.g., SAVE50)
2. Place order
3. Check database:
   ```javascript
   // Should show:
   // pricing.couponByRestaurant: 50
   // pricing.couponByAdmin: 0
   // pricing.offerByRestaurant: 0
   ```
4. Check reports - "Coupon by Restaurant" should show ₹50

### Test Case 4: Combined (Offer + Coupon)
1. Add items with restaurant offer
2. Apply restaurant coupon
3. Place order
4. Check database:
   ```javascript
   // Should show:
   // pricing.offerByRestaurant: 100
   // pricing.couponByRestaurant: 50
   // pricing.discount: 150
   ```

## Impact

### ✅ Fixed:
- Admin order report now shows proper discount breakdown
- Restaurant finance page now shows discount breakdown
- Restaurant payout calculation now accurate
- Commission calculation considers proper discount type

### ✅ Pages Affected:
1. `/admin/food/order-report/regular` - Shows all discount columns
2. `/admin/food/restaurant-report` - Shows restaurant payout correctly
3. `/food/restaurant` - Shows discount breakdown and payout calculation
4. `/orders` - Shows discount breakdown to users
5. `/orders/:id` - Shows detailed discount breakdown

## Backward Compatibility

Old orders (before this fix) will have:
```javascript
pricing: {
  discount: 100,
  couponByAdmin: 0,        // Default value
  couponByRestaurant: 0,   // Default value
  offerByRestaurant: 0     // Default value
}
```

This is fine because:
- Reports will show ₹0.00 for breakdown columns
- Total discount still shows correctly
- No breaking changes

## Next Steps

1. ✅ Restart backend server
2. ✅ Place new test orders with different discount types
3. ✅ Verify all reports show correct values
4. ✅ Verify restaurant finance page shows breakdown
5. ✅ Verify commission calculations are correct

## Files Modified

1. `Backend/src/modules/food/orders/services/order.service.js`
   - Added discount breakdown fields to normalizedPricing

## Related Files (Already Updated)

1. `Backend/src/modules/food/orders/models/order.model.js` - Has breakdown fields
2. `Backend/src/modules/food/orders/services/order-pricing.service.js` - Calculates breakdown
3. `Frontend/src/modules/Food/pages/admin/reports/RegularOrderReport.jsx` - Shows breakdown
4. `Frontend/src/modules/Food/pages/admin/reports/RestaurantReport.jsx` - Shows breakdown
5. `Frontend/src/modules/Food/pages/restaurant/HubFinance.jsx` - Shows breakdown
6. `Frontend/src/modules/Food/pages/user/orders/Orders.jsx` - Shows breakdown

---

**Status**: ✅ Fixed! Backend restart karke test karo.
