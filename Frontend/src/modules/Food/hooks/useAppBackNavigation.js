import { useCallback } from "react"
import { useLocation, useNavigate } from "react-router-dom"

const toFoodPath = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("/food/")) return trimmed
  if (trimmed === "/food") return trimmed
  if (trimmed.startsWith("/user/")) return `/food${trimmed}`
  if (trimmed === "/user") return "/food/user"
  return null
}

const getNormalizedUserPath = (pathname) => {
  if (pathname.startsWith("/food")) {
    return pathname.slice(5) || "/"
  }
  return pathname || "/"
}

const resolveBackPath = ({ pathname, search, state }) => {
  const normalizedPath = getNormalizedUserPath(pathname)
  const userAwarePath = normalizedPath.replace(/^\/user(?=\/|$)/, "")
  const explicitBackPath = toFoodPath(state?.backTo) || toFoodPath(state?.from)
  const searchParams = new URLSearchParams(search || "")

  if (
    userAwarePath === "/profile/payments/new" ||
    /^\/profile\/payments\/[^/]+\/edit$/.test(userAwarePath)
  ) {
    return "/food/user/profile/payments"
  }

  if (
    /^\/profile\/(edit|favorites|support|coupons|about|report-safety-emergency|accessibility|logout|refer-earn|payments)$/.test(
      userAwarePath,
    )
  ) {
    return "/food/user/profile"
  }

  if (
    /^\/profile\/(terms|privacy|refund|shipping|cancellation)$/.test(
      userAwarePath,
    )
  ) {
    return explicitBackPath || "/food/user/profile/about"
  }

  if (userAwarePath === "/wallet") {
    return "/food/user/profile"
  }

  if (userAwarePath === "/notifications") {
    return explicitBackPath || "/food/user"
  }

  if (/^\/restaurants\/[^/]+$/.test(userAwarePath)) {
    const underParam = Number(searchParams.get("under"))
    if (Number.isFinite(underParam) && underParam > 0) {
      return "/food/under-price"
    }
    if (searchParams.get("under250") === "true") {
      return "/food/under-price"
    }
    return explicitBackPath || "/food/user"
  }

  if (/^\/orders\/[^/]+(\/invoice|\/details)?$/.test(userAwarePath)) {
    return "/food/user/orders"
  }

  if (
    userAwarePath === "/cart/checkout" ||
    userAwarePath === "/cart/select-address" ||
    userAwarePath === "/cart/address-selector"
  ) {
    return "/food/user/cart"
  }

  if (userAwarePath === "/address-selector") {
    return explicitBackPath || "/food/user"
  }

  if (/^\/collections\/[^/]+$/.test(userAwarePath)) {
    return "/food/user/collections"
  }

  if (userAwarePath === "/categories") {
    return "/food/user"
  }

  if (/^\/category\/[^/]+$/.test(userAwarePath)) {
    return "/food/user/categories"
  }

  if (
    userAwarePath === "/offers" ||
    userAwarePath === "/gourmet" ||
    userAwarePath === "/coffee"
  ) {
    return "/food/user"
  }

  if (/^\/product\/[^/]+$/.test(userAwarePath)) {
    return explicitBackPath || "/food/user"
  }

  if (/^\/complaints(\/|$)/.test(userAwarePath)) {
    return explicitBackPath || "/food/user/orders"
  }

  if (explicitBackPath && explicitBackPath !== pathname) {
    return explicitBackPath
  }

  return "/food/user"
}

export default function useAppBackNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    // Prefer true history back so user returns to the exact previous screen.
    // For direct-entry pages (initial key), fall back to deterministic route mapping.
    if (location?.key && location.key !== "default" && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(resolveBackPath(location))
  }, [location, navigate])
}
