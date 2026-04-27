# Fix: Prevent Offer Reuse in Cart

## 🔍 Issue

User has already redeemed an offer, but it still shows in cart as "auto-applied".

## ✅ Solution

Backend already has logic to check `perUserLimit`, but the offer might not have this field set.

---

## 🔧 Fix Steps

### Step 1: Check Offer Configuration

```javascript
// In MongoDB
db.restaurant_offers.findOne({ title: "Chicken discount" })

// Check if perUserLimit is set:
{
  title: "Chicken discount",
  perUserLimit: ???  // Should be 1 for one-time use
}
```

### Step 2: Update Offer with Per-User Limit

```javascript
// Set perUserLimit = 1 for one-time use offers
db.restaurant_offers.updateMany(
  { 
    // Update all offers that should be one-time use
    $or: [
      { perUserLimit: { $exists: false } },
      { perUserLimit: 0 },
      { perUserLimit: null }
    ]
  },
  { 
    $set: { 
      perUserLimit: 1  // Allow only 1 use per user
    } 
  }
)
```

### Step 3: Verify Usage Tracking

```javascript
// Check if usage is being tracked
db.restaurant_offer_usages.find({ 
  userId: ObjectId("user-id"),
  offerId: ObjectId("offer-id")
})

// Should show:
{
  userId: ObjectId("..."),
  offerId: ObjectId("..."),
  count: 1,  // Number of times used
  lastUsedAt: ISODate("...")
}
```

---

## 🔄 How It Works

### Backend Logic (Already Implemented):

**File**: `Backend/src/modules/food/orders/services/order-pricing.service.js`

```javascript
// Line 79-86: Check per-user limit
if (userId && Number(offer?.perUserLimit) > 0) {
  const usage = await RestaurantOfferUsage.findOne({
    offerId: offer._id,
    userId,
  }).lean();
  
  if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
    continue; // ✅ Skip this offer - user already used it
  }
}
```

### When Order is Placed:

**File**: `Backend/src/modules/food/orders/services/order.service.js`

```javascript
// Line 1050-1065: Track offer usage
const restaurantAutoOfferId = dto.pricing?.autoAppliedOffer?.offerId;

if (restaurantAutoOfferId) {
  await RestaurantOffer.updateOne(
    { _id: new mongoose.Types.ObjectId(restaurantAutoOfferId) },
    { $inc: { usedCount: 1 } }
  );
  
  // Track per-user usage
  await RestaurantOfferUsage.updateOne(
    { 
      offerId: new mongoose.Types.ObjectId(restaurantAutoOfferId),
      userId: new mongoose.Types.ObjectId(userId)
    },
    { 
      $inc: { count: 1 },
      $set: { lastUsedAt: new Date() }
    },
    { upsert: true }  // Create if doesn't exist
  );
}
```

---

## 🧪 Testing

### Test Case 1: First Time User
```
1. User adds items with offer
2. Offer auto-applies ✅
3. User places order
4. Usage tracked: count = 1
```

### Test Case 2: User Already Used Offer
```
1. User adds same items again
2. Check usage: count = 1, perUserLimit = 1
3. Offer should NOT apply ✅
4. Cart shows no offer
```

### Test Case 3: Unlimited Use Offer
```
Offer with perUserLimit = 0 or null
→ Can be used multiple times ✅
```

---

## 📊 Database Schema

### RestaurantOffer Model:
```javascript
{
  _id: ObjectId("..."),
  title: "Chicken discount",
  discountType: "percentage",
  discountValue: 10,
  perUserLimit: 1,  // ✅ Set this to 1 for one-time use
  usageLimit: 100,  // Total usage limit (all users)
  usedCount: 45,    // Total times used
  status: "active",
  approvalStatus: "approved"
}
```

### RestaurantOfferUsage Model:
```javascript
{
  _id: ObjectId("..."),
  offerId: ObjectId("offer-id"),
  userId: ObjectId("user-id"),
  count: 1,  // Number of times THIS user used this offer
  lastUsedAt: ISODate("2024-01-15T10:30:00Z")
}
```

---

## 🔧 Quick Fix Commands

### 1. Set perUserLimit for All Offers
```javascript
// Make all offers one-time use per user
db.restaurant_offers.updateMany(
  {},
  { $set: { perUserLimit: 1 } }
)
```

### 2. Set perUserLimit for Specific Offer
```javascript
// Update specific offer by title
db.restaurant_offers.updateOne(
  { title: "Chicken discount" },
  { $set: { perUserLimit: 1 } }
)
```

### 3. Check User's Offer Usage
```javascript
// See which offers user has used
db.restaurant_offer_usages.find({ 
  userId: ObjectId("user-id") 
})
```

### 4. Reset User's Offer Usage (Testing Only)
```javascript
// Allow user to use offer again (for testing)
db.restaurant_offer_usages.deleteOne({
  userId: ObjectId("user-id"),
  offerId: ObjectId("offer-id")
})
```

---

## ✅ Verification Steps

### Step 1: Check Offer Configuration
```bash
# In MongoDB shell
use your_database

# Check if offer has perUserLimit
db.restaurant_offers.findOne(
  { title: "Chicken discount" },
  { title: 1, perUserLimit: 1, usageLimit: 1 }
)
```

**Expected**:
```javascript
{
  title: "Chicken discount",
  perUserLimit: 1,  // ✅ Should be set
  usageLimit: 100
}
```

### Step 2: Check User Usage
```bash
# Check if user has used this offer
db.restaurant_offer_usages.findOne({
  userId: ObjectId("user-id"),
  offerId: ObjectId("offer-id")
})
```

**If user already used**:
```javascript
{
  userId: ObjectId("..."),
  offerId: ObjectId("..."),
  count: 1,  // ✅ Already used once
  lastUsedAt: ISODate("...")
}
```

### Step 3: Test in Cart
```
1. Login as user who already used offer
2. Add items to cart
3. Offer should NOT auto-apply ✅
4. Cart shows no offer discount
```

---

## 🎯 Different Offer Types

### Type 1: One-Time Use Per User
```javascript
{
  perUserLimit: 1,  // Each user can use only once
  usageLimit: 1000  // Total 1000 uses across all users
}
```

### Type 2: Limited Uses Per User
```javascript
{
  perUserLimit: 3,  // Each user can use 3 times
  usageLimit: 1000
}
```

### Type 3: Unlimited Per User
```javascript
{
  perUserLimit: 0,  // No per-user limit
  usageLimit: 1000  // But total limit exists
}
```

### Type 4: Completely Unlimited
```javascript
{
  perUserLimit: 0,
  usageLimit: 0  // No limits at all
}
```

---

## 🚨 Common Issues

### Issue 1: Offer Still Shows After Use
**Cause**: `perUserLimit` not set or = 0
**Fix**: Set `perUserLimit: 1`

### Issue 2: Usage Not Tracked
**Cause**: Order placement not updating `RestaurantOfferUsage`
**Fix**: Check order.service.js line 1050-1065

### Issue 3: Offer Shows for Wrong Items
**Cause**: `productIds` mismatch
**Fix**: Verify offer's `productIds` match cart items

---

## 📝 Summary

**Current Status**: ✅ Backend logic already implemented

**What's Needed**: 
1. Set `perUserLimit: 1` on offers that should be one-time use
2. Verify usage tracking is working

**Quick Fix**:
```javascript
// In MongoDB
db.restaurant_offers.updateOne(
  { title: "Chicken discount" },
  { $set: { perUserLimit: 1 } }
)
```

**Test**:
1. User who already used offer adds items
2. Offer should NOT show in cart
3. ✅ Working!

---

## 🔍 Debug Commands

### Check if offer is being filtered out:
```javascript
// Add console.log in order-pricing.service.js line 86
if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
  console.log('Offer skipped - user already used:', {
    offerId: offer._id,
    userId,
    usageCount: usage.count,
    perUserLimit: offer.perUserLimit
  });
  continue;
}
```

### Check offer usage in real-time:
```javascript
// In backend
const usage = await RestaurantOfferUsage.findOne({
  offerId: offer._id,
  userId: userId
});
console.log('User offer usage:', usage);
```

---

**Status**: Backend logic is correct. Just need to set `perUserLimit` on offers! ✅
