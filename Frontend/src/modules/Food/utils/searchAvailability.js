import { restaurantAPI } from "@food/api"

export const normalizeSearchAvailabilityRestaurant = (restaurant = {}) => {
  const restaurantId =
    restaurant.restaurantId ||
    restaurant.mongoId ||
    restaurant._id ||
    restaurant.id ||
    null

  return {
    ...restaurant,
    id: restaurant.id || restaurantId,
    _id: restaurant._id || restaurantId,
    mongoId: restaurant.mongoId || restaurant._id || restaurantId,
    restaurantId,
    name: restaurant.name || restaurant.restaurantName || "Restaurant",
    restaurantName: restaurant.restaurantName || restaurant.name || "Restaurant",
    pureVegRestaurant: restaurant.pureVegRestaurant === true || restaurant.pureVegRestaurant === "true",
    isActive: restaurant.isActive !== false,
    isAcceptingOrders: restaurant.isAcceptingOrders !== false,
    availabilityStatus: restaurant.availabilityStatus ?? null,
    availability: restaurant.availability ?? null,
    isOnline: restaurant.isOnline,
    currentStatus: restaurant.currentStatus ?? null,
    isOpen: restaurant.isOpen,
    openNow: restaurant.openNow,
    isOpenNow: restaurant.isOpenNow,
    isRestaurantOpen: restaurant.isRestaurantOpen,
    todayOpen: restaurant.todayOpen,
    isOpenToday: restaurant.isOpenToday,
    closedToday: restaurant.closedToday,
    isClosedToday: restaurant.isClosedToday,
    dayOff: restaurant.dayOff,
    isDayOff: restaurant.isDayOff,
    offToday: restaurant.offToday,
    openDays: Array.isArray(restaurant.openDays) ? restaurant.openDays : [],
    deliveryTimings: restaurant.deliveryTimings ?? null,
    outletTimings: restaurant.outletTimings ?? null,
    openingTime: restaurant.openingTime ?? null,
    closingTime: restaurant.closingTime ?? null,
  }
}

export const isPureVegRestaurant = (restaurant = {}) =>
  restaurant?.pureVegRestaurant === true || restaurant?.pureVegRestaurant === "true"

export const isVegCompatibleCategory = (category = {}) => {
  const normalizedScope = String(
    category?.foodTypeScope ||
    category?.foodType ||
    category?.dietType ||
    "",
  ).trim().toLowerCase()

  return (
    !normalizedScope ||
    normalizedScope === "veg" ||
    normalizedScope === "vegetarian" ||
    normalizedScope === "both" ||
    normalizedScope === "all"
  )
}

export const enrichSearchRestaurantsWithOutletTimings = async (restaurants = []) => {
  const normalizedRestaurants = restaurants.map(normalizeSearchAvailabilityRestaurant)

  return Promise.all(
    normalizedRestaurants.map(async (restaurant) => {
      if (!restaurant.mongoId || restaurant.outletTimings) return restaurant

      try {
        const outletResponse = await restaurantAPI.getOutletTimingsByRestaurantId(
          restaurant.mongoId,
          { noCache: true },
        )
        const outletTimings =
          outletResponse?.data?.data?.outletTimings ||
          outletResponse?.data?.outletTimings ||
          null

        return outletTimings ? { ...restaurant, outletTimings } : restaurant
      } catch (_) {
        return restaurant
      }
    }),
  )
}
