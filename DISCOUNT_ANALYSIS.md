# Restaurant Report - Discount Analysis

## Question: Is Restaurant Report Dynamic?
**Answer: YES ✅ - Completely Dynamic**

### How it works:
1. **Frontend**: `/admin/food/restaurants/commission` page
2. **API Call**: `adminAPI.getRestaurantReport(params)`
3. **Backend**: `Backend/src/modules/food/admin/services/admin.service.js`
4. **Function**: `getRestaurantReport()`

### Filters Applied (All Dynamic):
- **Zone**: Filter by restaurant zone
- **Status**: Active/Inactive restaurants
- **Type**: Commission/Subscription based
- **Time**: Today, This Week, This Month, This Year, All Time
- **Search**: Restaurant name, owner name, phone, city, area

---

## Question: Total Discount Kisse Aa Raha Hai?

### Answer: Order Model se aa raha hai

**Location**: `Backend/src/modules/food/orders/models/order.model.js`

```javascript
pricing: {
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    packagingFee: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    platformFee: { type: Number, default: 0, min: 0 },
    restaurantCommission: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },  // ⬅️ YEH FIELD
    total: { type: Number, required: true, min: 0 },
}
```

### Calculation in Backend:
**File**: `Backend/src/modules/food/admin/services/admin.service.js`
**Line**: ~990

```javascript
FoodOrder.aggregate([
    { $match: orderMatch },
    {
        $group: {
            _id: '$restaurantId',
            totalOrder: { $sum: 1 },
            totalOrderAmount: { $sum: { $ifNull: ['$pricing.total', 0] } },
            totalDiscountGiven: { $sum: { $ifNull: ['$pricing.discount', 0] } },  // ⬅️ YEH
            totalVATTAX: { $sum: { $ifNull: ['$pricing.tax', 0] } },
            totalAdminCommissionFromPlatformProfit: { $sum: { $ifNull: ['$platformProfit', 0] } },
            totalAdminCommissionFromPlatformFee: { $sum: { $ifNull: ['$pricing.platformFee', 0] } }
        }
    }
])
```

### Summary:
- **Field**: `order.pricing.discount`
- **Aggregation**: Sum of all discounts for that restaurant
- **Display**: Formatted as currency (₹XX.XX)
- **Dynamic**: Yes, calculated based on time filter

---

## Current Discount Implementation Status

### ❌ NOT IMPLEMENTED YET:
1. **Coupon System** - No coupon model exists
2. **Discount Types** - No distinction between restaurant-funded vs platform-funded
3. **Item-level Offers** - No automatic discount on menu items
4. **Discount Calculation Logic** - No logic to calculate discount based on coupon

### ✅ ALREADY EXISTS:
1. **Order Model** - Has `pricing.discount` field
2. **Transaction Model** - Has `pricing.discount` field
3. **Restaurant Report** - Shows total discount given
4. **Commission System** - Fully implemented

---

## What Needs to be Done

### To Implement 3 Discount Scenarios:

1. **Create Coupon Model**
   - Add `fundedBy: 'restaurant' | 'platform'`
   - Add discount calculation logic
   - Link to restaurant (for restaurant-funded)

2. **Update Order Creation Logic**
   - Apply coupon discount
   - Calculate who bears the cost
   - Update `pricing.discount` field
   - Update commission calculation

3. **Add Item-level Offers**
   - Update MenuItem model
   - Add offer fields
   - Calculate discount before commission

4. **Update Restaurant Report**
   - Show breakdown: restaurant-funded vs platform-funded
   - Show impact on commission
   - Show restaurant payout after discount

---

## Current Flow (Simplified):

```
Order Created
    ↓
pricing.discount = 0 (currently hardcoded or manual)
    ↓
Saved to database
    ↓
Restaurant Report aggregates all orders
    ↓
Shows total discount (sum of pricing.discount)
```

## Future Flow (After Implementation):

```
Order Created
    ↓
User applies coupon OR item has offer
    ↓
Calculate discount based on:
    - Coupon type (restaurant/platform funded)
    - Item offer (automatic)
    ↓
Update pricing.discount
    ↓
Calculate commission:
    - Scenario 1: Commission on original, discount from restaurant
    - Scenario 2: Commission on original, discount from platform
    - Scenario 3: Commission on discounted amount
    ↓
Save to database with breakdown
    ↓
Restaurant Report shows detailed breakdown
```

---

## Conclusion

**Is it dynamic?** YES ✅

**Where is discount coming from?** `order.pricing.discount` field (currently 0 or manually set)

**What needs to be done?** Implement coupon system and discount calculation logic to populate this field correctly based on 3 scenarios.
