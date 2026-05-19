const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

const normalizeDay = (value) => {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  const match = DAY_NAMES.find((day) => day.toLowerCase() === trimmed)
  if (match) return match

  const abbreviatedMatch = DAY_NAMES.find((day) =>
    day.toLowerCase().startsWith(trimmed.slice(0, 3))
  )
  return abbreviatedMatch || null
}

const parseTimeToMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") return null
  const raw = timeValue.trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/)
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1])
    const minute = Number(meridiemMatch[2])
    const period = meridiemMatch[3]

    if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return null

    if (period === "pm" && hour < 12) hour += 12
    if (period === "am" && hour === 12) hour = 0
    if (hour < 0 || hour > 23) return null
    return hour * 60 + minute
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (!twentyFourHourMatch) return null

  const hour = Number(twentyFourHourMatch[1])
  const minute = Number(twentyFourHourMatch[2])
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return hour * 60 + minute
}

const getTodayTiming = (restaurant, dayName) => {
  const outletTimingsArray = restaurant?.outletTimings?.timings
  if (Array.isArray(outletTimingsArray)) {
    const matches = outletTimingsArray.filter((entry) => normalizeDay(entry?.day) === dayName)
    if (matches.length > 0) return matches
  }

  const outletTimingsObject = restaurant?.outletTimings
  if (outletTimingsObject && typeof outletTimingsObject === "object" && !Array.isArray(outletTimingsObject)) {
    const direct = outletTimingsObject[dayName]
    if (direct && typeof direct === "object") return [direct]
  }

  return []
}

const getNextDayName = (dayName) => {
  const index = DAY_NAMES.indexOf(dayName)
  if (index < 0) return null
  return DAY_NAMES[(index + 1) % DAY_NAMES.length]
}

const getPreviousDayName = (dayName) => {
  const index = DAY_NAMES.indexOf(dayName)
  if (index < 0) return null
  return DAY_NAMES[(index + DAY_NAMES.length - 1) % DAY_NAMES.length]
}

const isTruthyClosedStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  return (
    normalized === "closed" ||
    normalized === "offline" ||
    normalized === "inactive" ||
    normalized === "off"
  )
}

const hasExplicitClosedFlag = (restaurant) => {
  if (!restaurant || typeof restaurant !== "object") return false
  if (restaurant?.availability?.isOnline === false) return true
  if (restaurant.isOnline === false) return true
  if (restaurant.isOpen === false) return true
  if (restaurant.openNow === false) return true
  if (restaurant.isOpenNow === false) return true
  if (restaurant.isRestaurantOpen === false) return true
  if (restaurant.todayOpen === false) return true
  if (restaurant.isOpenToday === false) return true
  if (restaurant.closedToday === true) return true
  if (restaurant.isClosedToday === true) return true
  if (restaurant.dayOff === true) return true
  if (restaurant.isDayOff === true) return true
  if (restaurant.offToday === true) return true
  if (isTruthyClosedStatus(restaurant.status)) return true
  if (isTruthyClosedStatus(restaurant.availabilityStatus)) return true
  if (isTruthyClosedStatus(restaurant?.availability?.status)) return true
  if (isTruthyClosedStatus(restaurant.currentStatus)) return true
  if (restaurant?.outletTimings?.isOpen === false) return true
  if (restaurant?.outletTimings?.today?.isOpen === false) return true
  return false
}

const extractDaySlots = (timingInput) => {
  const timings = Array.isArray(timingInput) ? timingInput : [timingInput].filter(Boolean)
  const allNormalizedSlots = []

  for (const timing of timings) {
    const rawSlots = Array.isArray(timing?.slots) ? timing.slots : []
    const normalizedFromSlots = rawSlots
      .map((slot) => ({
        openingTime: slot?.openingTime || null,
        closingTime: slot?.closingTime || null,
        openingMinutes: parseTimeToMinutes(slot?.openingTime),
        closingMinutes: parseTimeToMinutes(slot?.closingTime),
      }))
      .filter((slot) => slot.openingMinutes !== null && slot.closingMinutes !== null)

    if (normalizedFromSlots.length > 0) {
      allNormalizedSlots.push(...normalizedFromSlots)
      continue
    }

    const openingTime = timing?.openingTime || null
    const closingTime = timing?.closingTime || null
    const openingMinutes = parseTimeToMinutes(openingTime)
    const closingMinutes = parseTimeToMinutes(closingTime)
    if (openingMinutes !== null && closingMinutes !== null) {
      allNormalizedSlots.push({ openingTime, closingTime, openingMinutes, closingMinutes })
    }
  }

  return allNormalizedSlots
}

const isWithinTimeWindow = (nowMinutes, openingMinutes, closingMinutes) => {
  if (openingMinutes === null || closingMinutes === null) return true
  if (openingMinutes === closingMinutes) return true

  if (closingMinutes > openingMinutes) {
    return nowMinutes >= openingMinutes && nowMinutes <= closingMinutes
  }

  return nowMinutes >= openingMinutes || nowMinutes <= closingMinutes
}

const getMinutesUntilClosing = (nowMinutes, openingMinutes, closingMinutes) => {
  if (openingMinutes === null || closingMinutes === null) return null
  if (!isWithinTimeWindow(nowMinutes, openingMinutes, closingMinutes)) return null

  if (closingMinutes > openingMinutes) {
    return closingMinutes - nowMinutes
  }

  if (nowMinutes <= closingMinutes) {
    return closingMinutes - nowMinutes
  }

  return (24 * 60 - nowMinutes) + closingMinutes
}

const getActiveSlot = (nowMinutes, slots = []) => {
  for (const slot of slots) {
    if (isWithinTimeWindow(nowMinutes, slot.openingMinutes, slot.closingMinutes)) {
      return slot
    }
  }
  return null
}

const formatTimeLabel = (timeValue) => {
  const totalMinutes = parseTimeToMinutes(timeValue)
  if (totalMinutes === null) return timeValue || null

  const hours24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const period = hours24 >= 12 ? "PM" : "AM"
  const hours12 = hours24 % 12 || 12

  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`
}

const formatClosingCountdown = (minutesUntilClose, closingTime) => {
  if (minutesUntilClose === null || minutesUntilClose === undefined) return null

  if (minutesUntilClose <= 0) {
    const closingLabel = formatTimeLabel(closingTime)
    return closingLabel ? `Closes at ${closingLabel}` : null
  }

  if (minutesUntilClose <= 60) {
    return `Closes in ${minutesUntilClose} min`
  }

  return null
}

const getFirstOpenSlotLabel = (slots = []) => {
  const firstSlot = [...slots].sort((a, b) => a.openingMinutes - b.openingMinutes)[0]
  return firstSlot ? formatTimeLabel(firstSlot.openingTime) : null
}

const getDisplayStatus = ({
  isOpen,
  reason,
  formattedOpeningTime,
  formattedClosingTime,
  closingCountdownLabel,
  nextWorkingDay,
}) => {
  if (isOpen) {
    return {
      badgeLabel: "Open now",
      detailLabel: closingCountdownLabel || (formattedClosingTime ? `Closes at ${formattedClosingTime}` : "Open now"),
      state: "open",
    }
  }

  if (reason === "day-closed" || reason === "closed-day") {
    return {
      badgeLabel: "Off today",
      detailLabel: nextWorkingDay ? `Opens ${nextWorkingDay}` : "Off today",
      state: "off",
    }
  }

  if (reason === "not-accepting-orders" || reason === "inactive") {
    return {
      badgeLabel: "Closed",
      detailLabel: "Currently not accepting orders",
      state: "closed",
    }
  }

  return {
    badgeLabel: "Closed",
    detailLabel: formattedOpeningTime ? `Opens at ${formattedOpeningTime}` : "Closed for today",
    state: "closed",
  }
}

export const getRestaurantAvailabilityStatus = (restaurant, now = new Date(), options = {}) => {
  if (!restaurant) {
    const display = getDisplayStatus({ isOpen: false, reason: "missing-restaurant" })
    return {
      isOpen: false,
      isActive: false,
      isAcceptingOrders: false,
      isWithinTimings: false,
      reason: "missing-restaurant",
      badgeLabel: display.badgeLabel,
      detailLabel: display.detailLabel,
      state: display.state,
    }
  }

  const ignoreOperationalStatus = options?.ignoreOperationalStatus === true
  const availabilityStatus = String(
    restaurant?.availabilityStatus ||
    restaurant?.availability?.status ||
    ""
  ).trim().toLowerCase()
  const hasOnlineFlag =
    restaurant?.availability?.isOnline === true ||
    restaurant?.availability?.isOnline === false ||
    restaurant?.isOnline === true ||
    restaurant?.isOnline === false
  const isOnlineByFlag = hasOnlineFlag
    ? (restaurant?.availability?.isOnline ?? restaurant?.isOnline) !== false
    : true
  const isOfflineByStatus = availabilityStatus === "offline" || availabilityStatus === "closed"
  const isActive = restaurant.isActive !== false
  const isAcceptingOrders = restaurant.isAcceptingOrders !== false && isOnlineByFlag && !isOfflineByStatus

  if (!ignoreOperationalStatus && !isActive) {
    const display = getDisplayStatus({ isOpen: false, reason: "inactive" })
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "inactive",
      badgeLabel: display.badgeLabel,
      detailLabel: display.detailLabel,
      state: display.state,
    }
  }

  if (!ignoreOperationalStatus && !isAcceptingOrders) {
    const display = getDisplayStatus({ isOpen: false, reason: "not-accepting-orders" })
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "not-accepting-orders",
      badgeLabel: display.badgeLabel,
      detailLabel: display.detailLabel,
      state: display.state,
    }
  }

  if (hasExplicitClosedFlag(restaurant)) {
    const display = getDisplayStatus({ isOpen: false, reason: "closed-day", nextWorkingDay: getNextDayName(DAY_NAMES[now.getDay()]) })
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "closed-flag",
      badgeLabel: display.badgeLabel,
      detailLabel: display.detailLabel,
      state: display.state,
    }
  }

  const dayName = DAY_NAMES[now.getDay()]
  const todayTiming = getTodayTiming(restaurant, dayName)
  const previousDayName = getPreviousDayName(dayName)
  const previousDayTiming = previousDayName ? getTodayTiming(restaurant, previousDayName) : []
  const todayTimingEntries = Array.isArray(todayTiming) ? todayTiming : [todayTiming].filter(Boolean)
  const hasTodayTiming = todayTimingEntries.length > 0

  // Legacy openDays can get stale; enforce only when no explicit outlet timing exists for today.
  const openDays = Array.isArray(restaurant.openDays) ? restaurant.openDays : []
  if (!hasTodayTiming && openDays.length > 0) {
    const normalizedOpenDays = new Set(openDays.map((day) => normalizeDay(day)).filter(Boolean))
    if (normalizedOpenDays.size > 0 && !normalizedOpenDays.has(dayName)) {
      const display = getDisplayStatus({
        isOpen: false,
        reason: "closed-day",
        nextWorkingDay: getNextDayName(dayName),
      })
      return {
        isOpen: false,
        isActive,
        isAcceptingOrders,
        isWithinTimings: false,
        reason: "closed-day",
        badgeLabel: display.badgeLabel,
        detailLabel: display.detailLabel,
        state: display.state,
      }
    }
  }

  const isTodayMarkedClosed = hasTodayTiming && todayTimingEntries.every((entry) => entry?.isOpen === false)
  if (isTodayMarkedClosed) {
    const display = getDisplayStatus({
      isOpen: false,
      reason: "day-closed",
      nextWorkingDay: getNextDayName(dayName),
    })
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "day-closed",
      badgeLabel: display.badgeLabel,
      detailLabel: display.detailLabel,
      state: display.state,
    }
  }

  const openingTime =
    todayTiming?.openingTime ||
    restaurant?.deliveryTimings?.openingTime ||
    restaurant?.openingTime ||
    null
  const closingTime =
    todayTiming?.closingTime ||
    restaurant?.deliveryTimings?.closingTime ||
    restaurant?.closingTime ||
    null

  const derivedSlots = extractDaySlots(todayTiming)
  const hasDaySlots = derivedSlots.length > 0
  const fallbackOpeningMinutes = parseTimeToMinutes(openingTime)
  const fallbackClosingMinutes = parseTimeToMinutes(closingTime)
  const slots = hasDaySlots
    ? derivedSlots
    : (
      fallbackOpeningMinutes !== null && fallbackClosingMinutes !== null
        ? [{
          openingTime,
          closingTime,
          openingMinutes: fallbackOpeningMinutes,
          closingMinutes: fallbackClosingMinutes,
        }]
        : []
    )
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const hasExplicitWindow = slots.length > 0 || Boolean(openingTime || closingTime)
  const activeSlot = getActiveSlot(nowMinutes, slots)
  const isWithinTimings = hasExplicitWindow ? (slots.length > 0 ? Boolean(activeSlot) : true) : true
  const nextSlotToday = !isWithinTimings
    ? slots
        .filter((slot) => slot.openingMinutes > nowMinutes)
        .sort((a, b) => a.openingMinutes - b.openingMinutes)[0]
    : null
  const minutesUntilClose = (isWithinTimings && activeSlot)
    ? getMinutesUntilClosing(nowMinutes, activeSlot.openingMinutes, activeSlot.closingMinutes)
    : null
  const effectiveOpeningTime = nextSlotToday?.openingTime || activeSlot?.openingTime || openingTime
  const effectiveClosingTime = activeSlot?.closingTime || closingTime
  const formattedOpeningTime = formatTimeLabel(effectiveOpeningTime)
  const formattedClosingTime = formatTimeLabel(effectiveClosingTime)
  const closingCountdownLabel = isWithinTimings
    ? formatClosingCountdown(minutesUntilClose, effectiveClosingTime)
    : null
  const reason = isWithinTimings
    ? (isAcceptingOrders ? "open" : "open-by-timings")
    : (hasExplicitWindow ? "outside-hours" : "no-timings")
  const display = getDisplayStatus({
    isOpen: isWithinTimings,
    reason,
    formattedOpeningTime,
    formattedClosingTime,
    closingCountdownLabel,
    nextWorkingDay: !nextSlotToday ? getNextDayName(dayName) : null,
  })

  return {
    isOpen: isWithinTimings,
    isActive,
    isAcceptingOrders,
    isWithinTimings,
    openingTime: effectiveOpeningTime,
    closingTime: effectiveClosingTime,
    formattedOpeningTime,
    formattedClosingTime,
    minutesUntilClose,
    closingCountdownLabel,
    reason,
    badgeLabel: display.badgeLabel,
    detailLabel: display.detailLabel,
    state: display.state,
  }
}
