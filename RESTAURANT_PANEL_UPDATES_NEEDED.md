# Restaurant Panel - Discount Breakdown Updates

## Current Status

### ✅ Backend Already Updated
Backend API (`restaurantAPI.getFinance()`) ab discount breakdown return kar raha hai:
- `pricing.couponByAdmin`
- `pricing.couponByRestaurant`
- `pricing.offerByRestaurant`
- `pricing.restaurantCommission`

### ❌ Frontend Needs Update
Restaurant panel (`/food/restaurant`) mein abhi old structure hai. Update karna padega.

---

## What Restaurant Sees Currently

### Current Finance Page Shows:
1. **Earnings**: Total payout (restaurant ko kitna mila)
2. **Commission**: Total commission paid
3. **Gross**: Total order amount
4. **Order Count**: Number of orders

### Missing Information:
- ❌ Discount breakdown (coupon by admin, restaurant, offers)
- ❌ Clear calculation showing how payout was calculated
- ❌ Impact of different discount types

---

## What Restaurant SHOULD See

### Updated Finance Page Should Show:

#### 1. **Summary Cards**:
```
┌─────────────────────────────────────────────────────────┐
│ Current Cycle (15 Dec - 21 Dec)                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Total Orders: 150                                       │
│  Gross Revenue: ₹75,000                                  │
│                                                          │
│  Discounts Given:                                        │
│    • Platform Coupons: ₹5,000 (Green)                   │
│    • Your Coupons: ₹3,000 (Orange)                      │
│    • Your Offers: ₹2,000 (Purple)                       │
│    Total Discounts: ₹10,000                             │
│                                                          │
│  Commission Paid: ₹7,500 (Blue)                         │
│                                                          │
│  Your Payout: ₹60,500 (Emerald, Bold)                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 2. **Breakdown Table**:
| Order ID | Amount | Coupon (Admin) | Coupon (You) | Offer (You) | Commission | Payout |
|----------|--------|----------------|--------------|-------------|------------|--------|
| #12345 | ₹500 | ₹0 | ₹50 | ₹0 | ₹50 | ₹400 |
| #12346 | ₹600 | ₹100 | ₹0 | ₹0 | ₹60 | ₹540 |
| #12347 | ₹400 | ₹0 | ₹0 | ₹80 | ₹32 | ₹288 |

#### 3. **Visual Breakdown**:
```
Order Amount: ₹500
├─ Platform Coupon: -₹0 (You don't pay)
├─ Your Coupon: -₹50 (You pay)
├─ Your Offer: -₹0 (You pay)
├─ Commission: -₹50 (You pay)
└─ Your Payout: ₹400 ✅
```

---

## Payout Calculation Formula

### Show Restaurant:
```
Your Payout = 
    Subtotal + 
    Packaging Fee - 
    Commission - 
    Your Coupons - 
    Your Offers

Note: Platform coupons are NOT deducted from your payout!
```

### Example:
```
Order Details:
- Subtotal: ₹500
- Packaging: ₹20
- Platform Coupon: ₹100 (Customer gets discount, you don't pay)
- Your Coupon: ₹50 (You pay)
- Commission (10%): ₹50

Your Payout:
= 500 + 20 - 50 - 50 - 0
= ₹420 ✅

Customer Paid: ₹370 (500 + 20 - 100 - 50)
```

---

## Files to Update

### Frontend:

#### 1. **HubFinance.jsx** (Main Finance Page)
**File**: `Frontend/src/modules/Food/pages/restaurant/HubFinance.jsx`

**Changes Needed**:
- Add discount breakdown cards
- Update summary calculation
- Show payout calculation formula
- Add color-coded discount display

#### 2. **Finance Details Page** (if exists)
**File**: `Frontend/src/modules/Food/pages/restaurant/FinanceDetails.jsx`

**Changes Needed**:
- Detailed order-wise breakdown
- Show discount impact per order
- Export with discount breakdown

#### 3. **Order Details Modal/Page**
**Changes Needed**:
- Show discount breakdown for each order
- Explain payout calculation

---

## Backend API Response

### Current Response Structure:
```javascript
{
  currentCycle: {
    start: { day, month, year },
    end: { day, month, year },
    orders: [
      {
        orderId: "...",
        totalAmount: 500,
        payout: 420,  // ← This is already calculated correctly
        commission: 50,
        // NEW fields (already in backend):
        pricing: {
          subtotal: 500,
          packagingFee: 20,
          couponByAdmin: 100,
          couponByRestaurant: 50,
          offerByRestaurant: 0,
          restaurantCommission: 50,
          total: 370
        }
      }
    ],
    summary: {
      totalOrders: 150,
      totalGross: 75000,
      totalPayout: 60500,
      totalCommission: 7500,
      // NEW fields needed:
      totalCouponByAdmin: 5000,
      totalCouponByRestaurant: 3000,
      totalOfferByRestaurant: 2000
    }
  }
}
```

### Backend Update Needed:
**File**: `Backend/src/modules/food/restaurant/services/restaurant.service.js`

Add summary totals for discounts:
```javascript
summary: {
  totalOrders: orders.length,
  totalGross: sum(orders, 'totalAmount'),
  totalPayout: sum(orders, 'payout'),
  totalCommission: sum(orders, 'commission'),
  // ADD THESE:
  totalCouponByAdmin: sum(orders, 'pricing.couponByAdmin'),
  totalCouponByRestaurant: sum(orders, 'pricing.couponByRestaurant'),
  totalOfferByRestaurant: sum(orders, 'pricing.offerByRestaurant')
}
```

---

## UI Components to Add

### 1. **Discount Breakdown Card**
```jsx
<div className="bg-white rounded-lg p-6 shadow">
  <h3 className="text-lg font-semibold mb-4">Discount Breakdown</h3>
  
  <div className="space-y-3">
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-600">Platform Coupons</span>
      <span className="text-sm font-medium text-green-600">
        ₹{formatCurrency(totalCouponByAdmin)}
      </span>
    </div>
    
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-600">Your Coupons</span>
      <span className="text-sm font-medium text-orange-600">
        -₹{formatCurrency(totalCouponByRestaurant)}
      </span>
    </div>
    
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-600">Your Offers</span>
      <span className="text-sm font-medium text-purple-600">
        -₹{formatCurrency(totalOfferByRestaurant)}
      </span>
    </div>
    
    <div className="border-t pt-3 flex justify-between items-center">
      <span className="text-sm font-semibold">Net Discount Impact</span>
      <span className="text-sm font-bold text-red-600">
        -₹{formatCurrency(totalCouponByRestaurant + totalOfferByRestaurant)}
      </span>
    </div>
  </div>
  
  <div className="mt-4 p-3 bg-blue-50 rounded">
    <p className="text-xs text-blue-800">
      💡 Platform coupons don't affect your payout. Only your coupons and offers are deducted.
    </p>
  </div>
</div>
```

### 2. **Payout Calculation Card**
```jsx
<div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-6">
  <h3 className="text-lg font-semibold mb-4">Your Payout Calculation</h3>
  
  <div className="space-y-2 text-sm">
    <div className="flex justify-between">
      <span>Subtotal</span>
      <span className="font-medium">₹{formatCurrency(subtotal)}</span>
    </div>
    
    <div className="flex justify-between">
      <span>+ Packaging Fee</span>
      <span className="font-medium text-green-600">+₹{formatCurrency(packagingFee)}</span>
    </div>
    
    <div className="flex justify-between">
      <span>- Commission</span>
      <span className="font-medium text-red-600">-₹{formatCurrency(commission)}</span>
    </div>
    
    <div className="flex justify-between">
      <span>- Your Coupons</span>
      <span className="font-medium text-red-600">-₹{formatCurrency(couponByRestaurant)}</span>
    </div>
    
    <div className="flex justify-between">
      <span>- Your Offers</span>
      <span className="font-medium text-red-600">-₹{formatCurrency(offerByRestaurant)}</span>
    </div>
    
    <div className="border-t-2 border-emerald-300 pt-2 mt-2 flex justify-between">
      <span className="font-bold text-lg">Your Payout</span>
      <span className="font-bold text-lg text-emerald-600">
        ₹{formatCurrency(payout)}
      </span>
    </div>
  </div>
</div>
```

### 3. **Order Table with Breakdown**
```jsx
<table className="w-full">
  <thead>
    <tr>
      <th>Order ID</th>
      <th>Amount</th>
      <th>Platform Coupon</th>
      <th>Your Coupon</th>
      <th>Your Offer</th>
      <th>Commission</th>
      <th>Your Payout</th>
    </tr>
  </thead>
  <tbody>
    {orders.map(order => (
      <tr key={order.orderId}>
        <td>{order.orderId}</td>
        <td>₹{order.totalAmount}</td>
        <td className="text-green-600">₹{order.pricing.couponByAdmin}</td>
        <td className="text-orange-600">₹{order.pricing.couponByRestaurant}</td>
        <td className="text-purple-600">₹{order.pricing.offerByRestaurant}</td>
        <td className="text-blue-600">₹{order.commission}</td>
        <td className="font-bold text-emerald-600">₹{order.payout}</td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## Color Coding (Same as Admin Panel)

- 🟢 **Green**: Platform Coupon (Restaurant doesn't pay)
- 🟠 **Orange**: Restaurant Coupon (Restaurant pays)
- 🟣 **Purple**: Restaurant Offer (Restaurant pays)
- 🔵 **Blue**: Commission (Restaurant pays)
- 🟢 **Emerald Bold**: Payout (Restaurant receives)

---

## Benefits for Restaurant

### 1. **Transparency**
Restaurant clearly sees:
- What discounts they gave
- What platform gave
- How much commission was charged
- Final payout calculation

### 2. **Strategy Insights**
Restaurant can analyze:
- Which discount type is more profitable?
- Should they use coupons or item offers?
- Impact of discounts on earnings

### 3. **Financial Planning**
Restaurant can:
- Predict earnings based on discount strategy
- Compare different discount approaches
- Optimize discount vs commission trade-off

---

## Implementation Priority

### Phase 1: Backend (if not done)
1. ✅ Add discount breakdown to order response
2. ✅ Add summary totals for discounts
3. ✅ Ensure payout calculation is correct

### Phase 2: Frontend - Summary View
1. ❌ Update HubFinance.jsx with discount breakdown cards
2. ❌ Add payout calculation display
3. ❌ Show color-coded discounts

### Phase 3: Frontend - Detailed View
1. ❌ Update order table with discount columns
2. ❌ Add per-order breakdown
3. ❌ Add export with discount details

### Phase 4: UI/UX Enhancements
1. ❌ Add tooltips explaining each discount type
2. ❌ Add charts showing discount trends
3. ❌ Add comparison with previous cycles

---

## Testing Scenarios

### Test Case 1: Platform Coupon Only
**Order**:
- Subtotal: ₹500
- Platform Coupon: ₹100
- Commission: ₹50

**Expected Display**:
- Platform Coupon: ₹100 (Green)
- Your Coupon: ₹0
- Your Offer: ₹0
- Commission: ₹50 (Blue)
- Your Payout: ₹450 (Emerald)

### Test Case 2: Restaurant Coupon Only
**Order**:
- Subtotal: ₹500
- Restaurant Coupon: ₹50
- Commission: ₹50

**Expected Display**:
- Platform Coupon: ₹0
- Your Coupon: ₹50 (Orange)
- Your Offer: ₹0
- Commission: ₹50 (Blue)
- Your Payout: ₹400 (Emerald)

### Test Case 3: Item Offer Only
**Order**:
- Subtotal: ₹500
- Item Offer: ₹100
- Commission: ₹40 (on ₹400)

**Expected Display**:
- Platform Coupon: ₹0
- Your Coupon: ₹0
- Your Offer: ₹100 (Purple)
- Commission: ₹40 (Blue)
- Your Payout: ₹360 (Emerald)

### Test Case 4: All Combined
**Order**:
- Subtotal: ₹500
- Platform Coupon: ₹50
- Restaurant Coupon: ₹30
- Item Offer: ₹20
- Commission: ₹45 (on ₹450)

**Expected Display**:
- Platform Coupon: ₹50 (Green)
- Your Coupon: ₹30 (Orange)
- Your Offer: ₹20 (Purple)
- Commission: ₹45 (Blue)
- Your Payout: ₹405 (Emerald)

---

## Summary

### ✅ What's Already Working:
1. Backend calculates payout correctly
2. Backend has discount breakdown in order data
3. Admin panel shows complete breakdown

### ❌ What Needs to be Done:
1. Update restaurant finance page UI
2. Add discount breakdown cards
3. Show payout calculation formula
4. Add color-coded display
5. Update order table with discount columns
6. Add tooltips and explanations

### 🎯 Goal:
Restaurant owners should clearly understand:
- How much they earned
- How much they spent on discounts
- How much commission they paid
- Why their payout is what it is

**Transparency = Trust = Better Business Relationship** ✅
