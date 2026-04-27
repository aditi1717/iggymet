# Check Order in Database

## Order Details from Report:
- Order ID: FOD-KEDATF
- Total Item Amount: ₹340.00
- All discount fields showing ₹0.00

## Database Query to Run:

```javascript
// In MongoDB shell or Compass
db.food_orders.findOne({ orderId: "FOD-KEDATF" })
```

## What to Check:

### 1. Check if discount breakdown fields exist:
```javascript
{
  pricing: {
    subtotal: 340,
    discount: 0,
    couponByAdmin: ???,      // Check if this field exists
    couponByRestaurant: ???, // Check if this field exists
    offerByRestaurant: ???,  // Check if this field exists
    restaurantCommission: 34,
    total: 450
  }
}
```

### 2. Possible Scenarios:

#### Scenario A: Fields Don't Exist (Old Order)
```javascript
{
  pricing: {
    subtotal: 340,
    discount: 0,
    // couponByAdmin: NOT PRESENT
    // couponByRestaurant: NOT PRESENT
    // offerByRestaurant: NOT PRESENT
    total: 450
  }
}
```
**Solution**: This is an old order placed before backend update. Place a NEW order to test.

#### Scenario B: Fields Exist but are 0
```javascript
{
  pricing: {
    subtotal: 340,
    discount: 0,
    couponByAdmin: 0,
    couponByRestaurant: 0,
    offerByRestaurant: 0,
    total: 450
  }
}
```
**Reason**: No discount was actually applied in this order.

#### Scenario C: Backend Not Restarted
If you place a new order and still fields don't exist, backend needs restart.

## Test Steps:

### Step 1: Check Current Order
```bash
# In MongoDB
use your_database_name
db.food_orders.findOne({ orderId: "FOD-KEDATF" }, { pricing: 1, orderId: 1 })
```

### Step 2: Restart Backend
```bash
cd Backend
# Stop current process (Ctrl+C if running)
npm start
```

### Step 3: Place NEW Test Order
1. Go to a restaurant that has an offer
2. Add items with offer to cart
3. Verify offer is applied in cart (should show discount)
4. Place order
5. Check order report again

### Step 4: Verify New Order in Database
```javascript
// Get the latest order
db.food_orders.find().sort({ createdAt: -1 }).limit(1).pretty()

// Check if discount breakdown fields are present
```

## Expected Result for New Order with Offer:

```javascript
{
  orderId: "FOD-XXXXX",
  pricing: {
    subtotal: 500,
    discount: 100,
    couponByAdmin: 0,
    couponByRestaurant: 0,
    offerByRestaurant: 100,  // ✅ Should have value
    restaurantCommission: 40, // 10% of (500-100)
    total: 460
  }
}
```

## Quick Check Command:

```javascript
// Check if ANY order has discount breakdown fields
db.food_orders.findOne(
  { 
    "pricing.offerByRestaurant": { $exists: true, $gt: 0 } 
  },
  { 
    orderId: 1, 
    "pricing.offerByRestaurant": 1,
    createdAt: 1 
  }
)
```

If this returns null, it means NO order has been placed with the new backend code yet.
