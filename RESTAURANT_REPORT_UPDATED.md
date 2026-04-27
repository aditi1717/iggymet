# Restaurant Report - Updated with Discount Breakdown & Payout

## Summary
Restaurant Report ab detailed discount breakdown aur restaurant payout show karta hai.

---

## What's New

### ✅ Added Columns:

| Column | Description | Color | Formula |
|--------|-------------|-------|---------|
| **Coupon by Admin** | Platform-funded discounts | 🟢 Green | Sum of `pricing.couponByAdmin` |
| **Coupon by Restaurant** | Restaurant-funded discounts | 🟠 Orange | Sum of `pricing.couponByRestaurant` |
| **Offer by Restaurant** | Item-level discounts | 🟣 Purple | Sum of `pricing.offerByRestaurant` |
| **Admin Commission** | Total commission earned | 🔵 Blue (Bold) | Sum of `pricing.restaurantCommission` |
| **Restaurant Payout** | What restaurant receives | 🟢 Emerald (Bold) | Calculated (see below) |

### ❌ Removed Columns:
- "Total Discount Given" (replaced by 3 specific discount columns)

---

## Restaurant Payout Calculation

### Formula:
```javascript
restaurantPayout = subtotal + packagingFee - commission - couponByRestaurant - offerByRestaurant
```

### Breakdown:

**What Restaurant Gets**:
- ✅ Subtotal (item prices)
- ✅ Packaging Fee

**What Gets Deducted**:
- ❌ Admin Commission
- ❌ Restaurant-funded Coupons
- ❌ Restaurant Offers

**What Restaurant DOESN'T Pay**:
- ✅ Platform-funded Coupons (Admin bears this)

---

## Example Calculations

### Scenario 1: Restaurant-Funded Coupon

**Order Details**:
- Subtotal: ₹500
- Packaging Fee: ₹20
- Coupon by Restaurant: ₹50
- Commission (10%): ₹50

**Calculation**:
```
Payout = 500 + 20 - 50 - 50 - 0
Payout = ₹420
```

**Report Shows**:
- Total Order Amount: ₹470 (what customer paid)
- Coupon by Admin: ₹0.00
- Coupon by Restaurant: ₹50.00 (Orange)
- Offer by Restaurant: ₹0.00
- Admin Commission: ₹50.00 (Blue)
- Restaurant Payout: ₹420.00 (Emerald, Bold)

---

### Scenario 2: Platform-Funded Coupon

**Order Details**:
- Subtotal: ₹500
- Packaging Fee: ₹20
- Coupon by Admin: ₹100
- Commission (10%): ₹50

**Calculation**:
```
Payout = 500 + 20 - 50 - 0 - 0
Payout = ₹470
```

**Report Shows**:
- Total Order Amount: ₹420 (what customer paid)
- Coupon by Admin: ₹100.00 (Green)
- Coupon by Restaurant: ₹0.00
- Offer by Restaurant: ₹0.00
- Admin Commission: ₹50.00 (Blue)
- Restaurant Payout: ₹470.00 (Emerald, Bold)

---

### Scenario 3: Item-level Offer

**Order Details**:
- Subtotal: ₹500
- Packaging Fee: ₹20
- Offer by Restaurant: ₹100
- Commission (10% of ₹400): ₹40

**Calculation**:
```
Payout = 500 + 20 - 40 - 0 - 100
Payout = ₹380
```

**Report Shows**:
- Total Order Amount: ₹420 (what customer paid)
- Coupon by Admin: ₹0.00
- Coupon by Restaurant: ₹0.00
- Offer by Restaurant: ₹100.00 (Purple)
- Admin Commission: ₹40.00 (Blue)
- Restaurant Payout: ₹380.00 (Emerald, Bold)

---

### Combined Scenario

**Order Details**:
- Subtotal: ₹500
- Packaging Fee: ₹20
- Offer by Restaurant: ₹100 (item discount)
- Coupon by Restaurant: ₹50
- Commission (10% of ₹400): ₹40

**Calculation**:
```
Payout = 500 + 20 - 40 - 50 - 100
Payout = ₹330
```

**Report Shows**:
- Total Order Amount: ₹370 (what customer paid)
- Coupon by Admin: ₹0.00
- Coupon by Restaurant: ₹50.00 (Orange)
- Offer by Restaurant: ₹100.00 (Purple)
- Admin Commission: ₹40.00 (Blue)
- Restaurant Payout: ₹330.00 (Emerald, Bold)

---

## Table Structure

### Before (9 columns):
1. SL
2. Restaurant Name
3. Total Food
4. Total Order
5. Total Order Amount
6. Total Discount Given
7. Total Admin Commission
8. Total VAT/TAX
9. Average Ratings

### After (12 columns):
1. SL
2. Restaurant Name
3. Total Food
4. Total Order
5. Total Order Amount
6. **Coupon by Admin** (Green)
7. **Coupon by Restaurant** (Orange)
8. **Offer by Restaurant** (Purple)
9. **Admin Commission** (Blue, Bold)
10. **Restaurant Payout** (Emerald, Bold)
11. VAT/TAX
12. Average Ratings

---

## Color Coding

### Purpose:
Easy visual identification of who bears what cost.

### Colors:
- 🟢 **Green** (Coupon by Admin): Platform bears cost
- 🟠 **Orange** (Coupon by Restaurant): Restaurant bears cost
- 🟣 **Purple** (Offer by Restaurant): Restaurant bears cost
- 🔵 **Blue Bold** (Admin Commission): Platform revenue
- 🟢 **Emerald Bold** (Restaurant Payout): Restaurant revenue

---

## Backend Changes

### File: `Backend/src/modules/food/admin/services/admin.service.js`

**Added Aggregation Fields**:
```javascript
{
    $group: {
        _id: '$restaurantId',
        // ... existing fields
        totalCouponByAdmin: { $sum: { $ifNull: ['$pricing.couponByAdmin', 0] } },
        totalCouponByRestaurant: { $sum: { $ifNull: ['$pricing.couponByRestaurant', 0] } },
        totalOfferByRestaurant: { $sum: { $ifNull: ['$pricing.offerByRestaurant', 0] } },
        totalAdminCommission: { $sum: { $ifNull: ['$pricing.restaurantCommission', 0] } },
        totalSubtotal: { $sum: { $ifNull: ['$pricing.subtotal', 0] } },
        totalPackagingFee: { $sum: { $ifNull: ['$pricing.packagingFee', 0] } },
    }
}
```

**Payout Calculation**:
```javascript
const restaurantPayout = 
    totalSubtotal + 
    totalPackagingFee - 
    totalAdminCommission - 
    totalCouponByRestaurant - 
    totalOfferByRestaurant;
```

---

## Frontend Changes

### File: `Frontend/src/modules/Food/pages/admin/reports/RestaurantReport.jsx`

**Updated Table Headers**: 12 columns (was 9)

**Updated Table Body**: Color-coded values

**Updated Export**: Includes new columns

---

## Export Functionality

### CSV/Excel/PDF/JSON Export Includes:
- SL
- Restaurant Name
- Total Food
- Total Order
- Total Order Amount
- **Coupon by Admin**
- **Coupon by Restaurant**
- **Offer by Restaurant**
- **Admin Commission**
- **Restaurant Payout**
- VAT/TAX
- Average Ratings

---

## Business Insights

### For Admin:
1. **Platform Cost**: See total "Coupon by Admin" (how much platform spent on marketing)
2. **Platform Revenue**: See total "Admin Commission" (revenue from commissions)
3. **Net Profit**: Commission - Coupon by Admin

### For Restaurant:
1. **Total Discounts Given**: Coupon by Restaurant + Offer by Restaurant
2. **Commission Paid**: Admin Commission
3. **Net Earnings**: Restaurant Payout (what they actually receive)

### Comparison:
- Restaurant A: High payout, low discounts → Good profitability
- Restaurant B: Low payout, high discounts → Aggressive marketing
- Restaurant C: High commission, low discounts → High order value

---

## Use Cases

### 1. Restaurant Performance Analysis
**Question**: Which restaurants are most profitable?

**Answer**: Sort by "Restaurant Payout" (descending)

### 2. Discount Impact Analysis
**Question**: How much are restaurants spending on discounts?

**Answer**: Sum of "Coupon by Restaurant" + "Offer by Restaurant"

### 3. Platform Marketing Cost
**Question**: How much is platform spending on user acquisition?

**Answer**: Sum of "Coupon by Admin"

### 4. Commission Revenue
**Question**: How much commission did platform earn?

**Answer**: Sum of "Admin Commission"

### 5. Restaurant Comparison
**Question**: Which discount strategy works best?

**Compare**:
- Restaurant with high "Coupon by Restaurant" vs low payout
- Restaurant with high "Offer by Restaurant" vs better payout (due to lower commission)

---

## Backward Compatibility

### ✅ No Breaking Changes

**Existing Data**:
- Old orders without breakdown will show ₹0.00 for new columns
- Payout calculation will still work (uses subtotal + packaging - commission)

**Migration**: Not required

---

## Testing

### Test Case 1: Restaurant with Only Platform Coupons
**Expected**:
- Coupon by Admin: > ₹0
- Coupon by Restaurant: ₹0
- Offer by Restaurant: ₹0
- Payout: High (no restaurant-funded discounts)

### Test Case 2: Restaurant with Own Coupons
**Expected**:
- Coupon by Admin: ₹0
- Coupon by Restaurant: > ₹0
- Offer by Restaurant: ₹0
- Payout: Lower (restaurant bears discount)

### Test Case 3: Restaurant with Item Offers
**Expected**:
- Coupon by Admin: ₹0
- Coupon by Restaurant: ₹0
- Offer by Restaurant: > ₹0
- Payout: Medium (lower commission due to discounted base)

### Test Case 4: Restaurant with All Types
**Expected**:
- All discount columns have values
- Payout: Lowest (bears multiple discounts)

---

## Files Modified

### Backend:
1. ✅ `Backend/src/modules/food/admin/services/admin.service.js`

### Frontend:
1. ✅ `Frontend/src/modules/Food/pages/admin/reports/RestaurantReport.jsx`

---

## Summary

### ✅ What's Working:

1. **Discount Breakdown**: Shows 3 types of discounts separately
2. **Commission Tracking**: Shows total commission earned
3. **Payout Calculation**: Shows what restaurant actually receives
4. **Color Coding**: Easy visual identification
5. **Export**: All new columns included
6. **Backward Compatible**: Works with existing data

### 📊 Business Value:

1. **Transparency**: Restaurants can see exactly where their money goes
2. **Analytics**: Admin can analyze discount effectiveness
3. **Profitability**: Easy to identify profitable vs unprofitable restaurants
4. **Strategy**: Compare different discount strategies

---

## Next Steps

### Optional Enhancements:

1. **Filters**: Filter by discount type
2. **Sorting**: Sort by payout, commission, discounts
3. **Charts**: Visual representation of breakdown
4. **Trends**: Show payout trends over time
5. **Alerts**: Notify if payout is too low

---

## Conclusion

Restaurant Report ab complete financial breakdown show karta hai:
- ✅ Discount breakdown (3 types)
- ✅ Commission tracking
- ✅ Restaurant payout calculation
- ✅ Color-coded for clarity
- ✅ Export functionality

**Restaurant owners ab clearly dekh sakte hain**:
- Kitna discount diya
- Kitna commission gaya
- Kitna actually mila (payout)

**Admin ab clearly dekh sakta hai**:
- Platform ka marketing cost
- Commission revenue
- Restaurant profitability

🎉 **Complete!**
