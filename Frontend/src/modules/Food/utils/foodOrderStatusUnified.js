export const getCanonicalFoodOrderStatus = (statusRaw, deliveryPhaseRaw = "") => {
  const status = String(statusRaw || "").toLowerCase().trim()
  const phase = String(deliveryPhaseRaw || "").toLowerCase().trim()

  if (!status || status === "created" || status === "placed") return "pending"
  if (status === "confirmed" || status === "accepted") return "accepted"
  if (status === "preparing" || status === "processed") return "processing"
  if (
    status === "ready" ||
    status === "ready_for_pickup" ||
    phase === "ready_for_pickup" ||
    phase === "at_pickup"
  ) return "ready"
  if (
    status === "picked_up" ||
    status === "out_for_delivery" ||
    status === "en_route_to_delivery" ||
    phase === "en_route_to_delivery"
  ) return "picked_up"
  if (
    status === "reached_drop" ||
    status === "at_drop" ||
    status === "at_delivery" ||
    phase === "reached_drop" ||
    phase === "at_drop"
  ) return "reached_customer"
  if (status === "delivered" || status === "completed") return "delivered"
  if (status === "user_unavailable_review") return "user_unavailable_review"
  if (status === "cancelled_by_user_unavailable") return "cancelled_user_unavailable"
  if (status === "rejected") return "rejected"
  if (status.includes("cancelled") || status === "cancelled") return "cancelled"
  return status
}

export const getCanonicalFoodOrderStatusFromOrder = (orderLike = {}) => {
  const status = orderLike?.orderStatus || orderLike?.status || ""
  const phase = orderLike?.deliveryState?.currentPhase || ""
  const canonical = getCanonicalFoodOrderStatus(status, phase)
  if (canonical === "picked_up") {
    if (
      orderLike?.deliveryState?.reachedDropAt ||
      orderLike?.deliveryState?.currentPhase === "at_drop" ||
      orderLike?.deliveryState?.currentPhase === "reached_drop" ||
      orderLike?.deliveryState?.status === "reached_drop"
    ) {
      return "reached_customer"
    }
  }
  return canonical
}

export const getFoodOrderStatusLabel = (statusRaw, deliveryPhaseRaw = "", context = "default") => {
  const key = getCanonicalFoodOrderStatus(statusRaw, deliveryPhaseRaw)
  const labels = {
    pending: "Pending",
    accepted: "Accepted",
    processing: "Processing",
    ready: "Ready",
    picked_up: context === "report" ? "Food On The Way" : "Picked Up",
    reached_customer: context === "report" ? "Food On The Way" : "Reached Customer",
    delivered: "Delivered",
    rejected: "Rejected",
    cancelled: "Cancelled",
    cancelled_user_unavailable: "Cancelled - User Unavailable",
    user_unavailable_review: "User Unavailable Review",
  }
  return labels[key] || String(statusRaw || "Pending")
}

export const getFoodOrderStatusLabelFromOrder = (orderLike = {}, context = "default") => {
  const key = getCanonicalFoodOrderStatusFromOrder(orderLike)
  const labels = {
    pending: "Pending",
    accepted: "Accepted",
    processing: "Processing",
    ready: "Ready",
    picked_up: context === "report" ? "Food On The Way" : "Picked Up",
    reached_customer: context === "report" ? "Food On The Way" : "Reached Customer",
    delivered: "Delivered",
    rejected: "Rejected",
    cancelled: "Cancelled",
    cancelled_user_unavailable: "Cancelled - User Unavailable",
    user_unavailable_review: "User Unavailable Review",
  }
  return labels[key] || String(orderLike?.orderStatus || orderLike?.status || "Pending")
}
