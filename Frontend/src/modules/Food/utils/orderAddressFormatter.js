const isCoordinateLikeText = (value) => {
  const text = String(value || "").trim()
  if (!text) return false
  return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(text)
}

const cleanText = (value) => String(value || "").trim()

export const formatOrderAddressWithLabels = (address) => {
  if (!address) return "Address not available"
  if (typeof address === "string") return cleanText(address) || "Address not available"
  if (typeof address !== "object") return "Address not available"

  const label = cleanText(address.label)
  const building = cleanText(address.buildingName || address.addressLine1)
  const floor = cleanText(address.floor)
  const street = cleanText(address.street || address.addressLine2)
  const area = cleanText(address.additionalDetails || address.area)
  const landmark = cleanText(address.landmark)
  const hasDistinctLandmark =
    landmark && (!area || landmark.toLowerCase() !== area.toLowerCase())
  const city = cleanText(address.city)
  const state = cleanText(address.state)
  const zipCode = cleanText(address.zipCode || address.postalCode || address.pincode)

  const labeledParts = [
    label ? `Type: ${label}` : "",
    building ? `Building: ${building}` : "",
    floor ? `Floor/Flat: ${floor}` : "",
    street ? `Street: ${street}` : "",
    area ? `Area: ${area}` : "",
    hasDistinctLandmark ? `Landmark: ${landmark}` : "",
    city ? `City: ${city}` : "",
    state ? `State: ${state}` : "",
    zipCode ? `Pincode: ${zipCode}` : "",
  ].filter(Boolean)

  if (labeledParts.length > 0) return labeledParts.join(", ")

  const formatted = cleanText(address.formattedAddress)
  if (formatted && !isCoordinateLikeText(formatted)) return formatted

  const raw = cleanText(address.address)
  if (raw) return raw

  return "Address not available"
}

export const formatOrderAddressForMap = (address) => {
  if (!address) return ""
  if (typeof address === "string") return cleanText(address)
  if (typeof address !== "object") return ""

  const formatted = cleanText(address.formattedAddress)
  if (formatted && !isCoordinateLikeText(formatted)) return formatted

  return [
    address.buildingName || address.addressLine1,
    address.floor,
    address.street || address.addressLine2,
    address.additionalDetails || address.area,
    address.landmark,
    address.city,
    address.state,
    address.zipCode || address.postalCode || address.pincode,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(", ")
}
