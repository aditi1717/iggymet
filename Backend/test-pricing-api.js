// Test pricing API to see if discount breakdown is calculated
import axios from 'axios';

const API_BASE = 'http://localhost:5000'; // Your backend URL
const AUTH_TOKEN = 'your-auth-token-here'; // Get from browser localStorage

async function testPricingAPI() {
  try {
    console.log('🧪 Testing Pricing API...\n');

    const response = await axios.post(
      `${API_BASE}/api/orders/calculate`,
      {
        restaurantId: 'your-restaurant-id', // Replace with actual restaurant ID
        items: [
          {
            itemId: 'item-id-1',
            name: 'Test Item',
            price: 500,
            quantity: 1
          }
        ],
        deliveryAddress: {
          street: 'Test Street',
          city: 'Test City',
          state: 'Test State',
          zipCode: '123456',
          location: {
            coordinates: [77.5946, 12.9716] // Bangalore coordinates
          }
        },
        couponCode: '' // Leave empty to test auto-offer
      },
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`
        }
      }
    );

    const pricing = response.data?.data?.pricing;

    console.log('✅ Pricing API Response:\n');
    console.log('Subtotal:', pricing.subtotal);
    console.log('Discount:', pricing.discount);
    console.log('\n📊 Discount Breakdown:');
    console.log('couponByAdmin:', pricing.couponByAdmin);
    console.log('couponByRestaurant:', pricing.couponByRestaurant);
    console.log('offerByRestaurant:', pricing.offerByRestaurant);

    if ('offerByRestaurant' in pricing) {
      console.log('\n✅ Discount breakdown fields are present in API response!');
      console.log('Backend update is working correctly.');
    } else {
      console.log('\n❌ Discount breakdown fields are MISSING!');
      console.log('Backend needs to be restarted with updated code.');
    }

    console.log('\n💰 Total:', pricing.total);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testPricingAPI();
