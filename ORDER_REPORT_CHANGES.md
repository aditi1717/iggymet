# Order Report Changes - Discount Breakdown

## Summary
Updated the Regular Order Report (`/admin/food/order-report/regular`) to show detailed discount breakdown and admin commission.

---

## Changes Made

### 1. Frontend Changes
**File**: `Frontend/src/modules/Food/pages/admin/reports/RegularOrderReport.jsx`

#### Replaced Single Column:
- ❌ **Removed**: "Coupon Discount" (single column)

#### Added 4 New Columns:
- ✅ **Coupon by Admin** - Platform-funded discounts (Green color)
- ✅ **Coupon by Restaurant** - Restaurant-funded discounts (Orange color)
- ✅ **Offer by Restaurant** - Item-level automatic discounts (Purple color)
- ✅ **Admin Commission** - Restaurant commission (Blue color, bold)

#### Data Mapping:
```javascript
// Old
const couponDiscount = Number(pricing.discount || 0)

// New
const couponByAdmin = Number(pricing.couponByAdmin || 0)
const couponByRestaurant = Number(pricing.couponByRestaurant || 0)
const offerByRestaurant = Number(pricing.offerByRestaurant || 0)
const adminCommission = Number(pricing.restaurantCommission || 0)
const totalDiscount = couponByAdmin + couponByRestaurant + offerByRestaurant
```

#### Export Headers Updated:
```javascript
{ key: "couponByAdmin", label: "Coupon by Admin" },
{ key: "couponByRestaurant", label: "Coupon by Restaurant" },
{ key: "offerByRestaurant", label: "Offer by Restaurant" },
{ key: "adminCommission", label: "Admin Commission" },
```

---

### 2. Backend Changes

#### Order Model
**File**: `Backend/src/modules/food/orders/models/order.model.js`

Added new fields to `pricingSchema`:
```javascript
pricing: {
    // ... existing fields
    discount: { type: Number, default: 0, min: 0 },
    
    // NEW: Discount breakdown for reporting
    couponByAdmin: { type: Number, default: 0, min: 0 },
    couponByRestaurant: { type: Number, default: 0, min: 0 },
    offerByRestaurant: { type: Number, default: 0, min: 0 },
    
    total: { type: Number, required: true, min: 0 },
}
```

#### Transaction Model
**File**: `Backend/src/modules/food/orders/models/foodTransaction.model.js`

Added same fields to transaction `pricing` snapshot:
```javascript
pricing: {
    // ... existing fields
    discount: { type: Number, default: 0, min: 0 },
    
    // NEW: Discount breakdown for reporting
    couponByAdmin: { type: Number, default: 0, min: 0 },
    couponByRestaurant: { type: Number, default: 0, min: 0 },
    offerByRestaurant: { type: Number, default: 0, min: 0 },
    
    total: { type: Number, default: 0, min: 0 },
}
```

---

## Table Structure (New)

| Column | Width | Description | Color |
|--------|-------|-------------|-------|
| SI | 3% | Serial number | - |
| Order ID | 7% | Order identifier | Blue (link) |
| Restaurant | 10% | Restaurant name | - |
| Customer Name | 9% | Customer name | - |
| Total Item Amount | 7% | Subtotal before discounts | - |
| **Coupon by Admin** | 6% | Platform-funded discount | **Green** |
| **Coupon by Restaurant** | 6% | Restaurant-funded discount | **Orange** |
| **Offer by Restaurant** | 6% | Item-level discount | **Purple** |
| **Admin Commission** | 6% | Restaurant commission | **Blue (Bold)** |
| VAT/Tax | 5% | Tax amount | - |
| Delivery Charge | 6% | Delivery fee | - |
| Platform Fee | 6% | Platform fee | - |
| Order Amount | 7% | Final total | Bold |
| Status | 5% | Order status | Badge |

**Total Columns**: 14 (was 11)

---

## Visual Indicators

### Color Coding:
- 🟢 **Green** - Coupon by Admin (Platform bears cost)
- 🟠 **Orange** - Coupon by Restaurant (Restaurant bears cost)
- 🟣 **Purple** - Offer by Restaurant (Restaurant bears cost)
- 🔵 **Blue Bold** - Admin Commission (Platform revenue)

### Purpose:
- Easy to identify who is funding each discount
- Clear visibility of admin commission
- Better financial reporting and analysis

---

## Backward Compatibility

### Existing Orders:
- Old orders without breakdown will show `₹0.00` for new fields
- `pricing.discount` field is retained for backward compatibility
- No data migration needed - new fields default to 0

### Future Orders:
When implementing coupon/offer system:
1. Calculate discount based on type
2. Populate appropriate field:
   - Platform coupon → `couponByAdmin`
   - Restaurant coupon → `couponByRestaurant`
   - Item offer → `offerByRestaurant`
3. Sum all three → `discount` (for backward compatibility)

---

## Next Steps

### To Fully Implement Discount System:

1. **Create Coupon Model** (not done yet)
   - Add `fundedBy` field
   - Link to restaurant if restaurant-funded

2. **Update Order Creation Logic** (not done yet)
   - Apply coupon/offer
   - Calculate breakdown
   - Populate new fields

3. **Add Coupon Management UI** (not done yet)
   - Admin can create platform coupons
   - Restaurant can create their own coupons

4. **Add Item Offer Management** (not done yet)
   - Restaurant can set item-level offers
   - Automatic discount application

---

## Testing Checklist

- [ ] Order report loads without errors
- [ ] All 14 columns display correctly
- [ ] Export (CSV/Excel/PDF/JSON) includes new columns
- [ ] Colors display correctly for discount columns
- [ ] Admin commission shows in blue bold
- [ ] Existing orders show ₹0.00 for new fields
- [ ] Table is responsive and scrollable
- [ ] Pagination works correctly

---

## Database Impact

**Migration Required**: ❌ NO

**Reason**: New fields have default values (0), so existing documents will work fine.

**Optional**: Run a script to populate breakdown from existing `discount` field if needed (but not necessary).

---

## Files Modified

### Frontend:
1. ✅ `Frontend/src/modules/Food/pages/admin/reports/RegularOrderReport.jsx`

### Backend:
1. ✅ `Backend/src/modules/food/orders/models/order.model.js`
2. ✅ `Backend/src/modules/food/orders/models/foodTransaction.model.js`

### Documentation:
1. ✅ `ORDER_REPORT_CHANGES.md` (this file)

---

## Screenshots Reference

### Before:
- 11 columns
- Single "Coupon Discount" column
- No admin commission visible

### After:
- 14 columns
- 3 discount columns (Admin, Restaurant Coupon, Restaurant Offer)
- Admin commission column added
- Color-coded for easy identification

---

## Notes

- Currently all new fields will show ₹0.00 until coupon system is implemented
- The structure is ready for future discount implementation
- Report is backward compatible with existing orders
- No breaking changes to existing functionality
