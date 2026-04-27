import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';

/**
 * useOrderManager - Professional hook for real-world trip lifecycle actions.
 * Connects directly to the backend API services.
 */
export const useOrderManager = () => {
  const { 
    activeOrder, tripStatus, updateTripStatus, clearActiveOrder, setActiveOrder, riderLocation 
  } = useDeliveryStore();

  const hydrateOrderForTrip = (rawOrder, fallbackOrderId) => {
    const getLoc = (ref, keysLat, keysLng) => {
      if (!ref) return null;
      if (ref.location) {
        if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
          return {
            lat: ref.location.coordinates[1],
            lng: ref.location.coordinates[0]
          };
        }
        return {
          lat: ref.location.latitude || ref.location.lat,
          lng: ref.location.longitude || ref.location.lng
        };
      }
      for (const k of keysLat) {
        if (ref[k] != null) {
          return { lat: ref[k], lng: ref[keysLng[keysLat.indexOf(k)]] };
        }
      }
      return null;
    };

    const restaurantLocation =
      getLoc(rawOrder?.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) ||
      getLoc(rawOrder, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']);

    const customerLocation =
      getLoc(rawOrder?.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) ||
      getLoc(rawOrder, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']);

    return {
      ...rawOrder,
      orderId: rawOrder?.orderId || fallbackOrderId,
      restaurantLocation,
      customerLocation
    };
  };

  const acceptOrder = async (order, options = {}) => {
    const orderId = order?.orderId || order?._id || order?.id;
    if (!orderId) {
      toast.error('Invalid order data');
      return;
    }

    try {
      const response = await deliveryAPI.acceptOrder(orderId);
      
      if (response?.data?.success) {
        const fullOrder = response.data.data?.order || order;
        const hydratedOrder = hydrateOrderForTrip(fullOrder, orderId);

        if (!options.keepCurrentActive) {
          setActiveOrder(hydratedOrder);
          updateTripStatus('PICKING_UP');
        }

        return hydratedOrder;
      } else {
        toast.error('Order is already taken or unavailable');
        throw new Error('Accept failed');
      }
    } catch (error) {
      console.error('Accept Order Error:', error);
      toast.error('Network error. Please try again.');
      throw error;
    }
  };

  const rejectOrder = async (order, reasonType = "passed") => {
    const orderId = order?.orderId || order?._id || order?.id;
    if (!orderId) {
      toast.error('Invalid order data');
      return;
    }

    try {
      await deliveryAPI.rejectOrder(orderId, {
        reasonType: String(reasonType || "passed").toLowerCase() === "timeout"
          ? "timeout"
          : "passed",
      });
    } catch (error) {
      // UI should not get stuck if reject API fails transiently.
      // Keep this silent-ish and let order recovery sync handle retries/state.
      console.warn('Reject Order Error:', error);
    }
  };

  /**
   * Mark "Reached Pickup" (Arrival at restaurant)
   */
  const reachPickup = async () => {
    const orderId = activeOrder?.orderId;
    try {
      const response = await deliveryAPI.confirmReachedPickup(orderId);
      if (response?.data?.success) {
        updateTripStatus('REACHED_PICKUP');
        // toast.info('Arrived at Restaurant');
      } else {
        throw new Error('Confirm pickup failed');
      }
    } catch (error) {
      toast.error('Failed to update status');
      throw error;
    }
  };

  /**
   * Mark "Picked Up" (Confirm order ID & start delivery)
   */
  const pickUpOrder = async () => {
    const orderId = activeOrder?.orderId;
    try {
      // confirmOrderId(orderId, confirmedOrderId, location, data)
      const response = await deliveryAPI.confirmOrderId(
        orderId, 
        activeOrder.displayOrderId || orderId, 
        riderLocation || {},
        {}
      );
      
      if (response?.data?.success) {
        updateTripStatus('PICKED_UP');
        // toast.success('Order Collected! Heading to Drop-off');
      } else {
        throw new Error('Confirm order ID failed');
      }
    } catch (error) {
      toast.error('Error confirming pickup');
      throw error;
    }
  };

  /**
   * Finalize delivery directly (OTP-free flow).
   */
  const completeDelivery = async () => {
    const orderId = activeOrder?.orderId;
    try {
      const completeRes = await deliveryAPI.completeDelivery(orderId, { rating: 5 });
      if (completeRes?.data?.success) {
        const finalOrder = completeRes.data?.data?.order || activeOrder;
        if (finalOrder) setActiveOrder(finalOrder);
        updateTripStatus('COMPLETED');
      } else {
        throw new Error('Complete delivery failed');
      }
    } catch (error) {
      console.error('Completion Error:', error);
      toast.error('Failed to complete delivery');
      throw error;
    }
  };

  const resetTrip = () => {
    clearActiveOrder();
  };

  return {
    acceptOrder,
    rejectOrder,
    reachPickup,
    pickUpOrder,
    completeDelivery,
    resetTrip,
  };
};
