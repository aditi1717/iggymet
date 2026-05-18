import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Clock, Loader2, Plus, Trash2, Calendar } from "lucide-react"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { Switch } from "@food/components/ui/switch"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { restaurantAPI } from "@food/api"

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const MAX_SLOTS = 1

const toTimeValue = (timeString, fallbackHour = 9, fallbackMinute = 0) => {
  if (!timeString || !String(timeString).includes(":")) {
    return new Date(2000, 0, 1, fallbackHour, fallbackMinute)
  }
  const [hours, minutes] = String(timeString).split(":").map(Number)
  const h = Math.max(0, Math.min(23, Number.isFinite(hours) ? hours : fallbackHour))
  const m = Math.max(0, Math.min(59, Number.isFinite(minutes) ? minutes : fallbackMinute))
  return new Date(2000, 0, 1, h, m)
}

const fromTimeValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "09:00"
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

const format12Hour = (time24) => {
  if (!time24 || !String(time24).includes(":")) return ""
  const [hoursRaw, minutesRaw] = String(time24).split(":").map(Number)
  const hours = Number.isFinite(hoursRaw) ? hoursRaw : 0
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 0
  const period = hours >= 12 ? "PM" : "AM"
  const hours12 = hours % 12 || 12
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`
}

const timeToMinutes = (value) => {
  if (!value || !String(value).includes(":")) return null
  const [hoursRaw, minutesRaw] = String(value).split(":").map(Number)
  if (!Number.isFinite(hoursRaw) || !Number.isFinite(minutesRaw)) return null
  if (hoursRaw < 0 || hoursRaw > 23 || minutesRaw < 0 || minutesRaw > 59) return null
  return (hoursRaw * 60) + minutesRaw
}

const getDefaultSchedule = () => ({
  isOpen: true,
  openDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  slots: [{ id: `slot-${Date.now()}`, openingTime: "09:00", closingTime: "22:00" }],
})

const normalizeSlotsFromDay = (dayData) => {
  const rawSlots = Array.isArray(dayData?.slots) ? dayData.slots : []
  const slotsFromArray = rawSlots
    .map((slot, index) => {
      const openingTime = String(slot?.openingTime || "").trim()
      const closingTime = String(slot?.closingTime || "").trim()
      if (!openingTime || !closingTime) return null
      return {
        id: `slot-${Date.now()}-${index}`,
        openingTime,
        closingTime,
      }
    })
    .filter(Boolean)

  if (slotsFromArray.length > 0) return slotsFromArray

  const openingTime = String(dayData?.openingTime || "").trim()
  const closingTime = String(dayData?.closingTime || "").trim()
  if (!openingTime || !closingTime) return getDefaultSchedule().slots

  return [{ id: `slot-${Date.now()}`, openingTime, closingTime }]
}

const normalizeScheduleFromApi = (outletTimings) => {
  if (!outletTimings || typeof outletTimings !== "object") return getDefaultSchedule()
  
  const openDays = DAY_NAMES.filter((day) => {
    const dayData = outletTimings[day]
    return dayData && dayData.isOpen !== false
  })

  const activeDay = openDays[0] || DAY_NAMES.find((day) => outletTimings?.[day]) || "Monday"
  const dayData = outletTimings[activeDay] || {}

  return {
    isOpen: openDays.length > 0,
    openDays: openDays.length > 0 ? openDays : [],
    slots: normalizeSlotsFromDay(dayData),
  }
}

const validateSlots = (slots = [], openDays = []) => {
  if (openDays.length === 0) return "At least one operational day must be selected."
  if (!Array.isArray(slots) || slots.length === 0) return "At least one time slot is required."

  const slot = slots[0]
  const openingMinutes = timeToMinutes(slot?.openingTime)
  const closingMinutes = timeToMinutes(slot?.closingTime)

  if (openingMinutes === null || closingMinutes === null) return "Please select valid opening and closing times."
  if (openingMinutes === closingMinutes) return "Opening and closing time cannot be same."

  return ""
}

const buildPayloadForAllDays = (schedule) => {
  const isOpen = schedule?.isOpen !== false
  const selectedDays = schedule?.openDays || []
  const slots = isOpen
    ? (schedule?.slots || []).map((slot) => ({
      openingTime: slot.openingTime,
      closingTime: slot.closingTime,
    }))
    : []

  const openingTime = isOpen ? (slots[0]?.openingTime || "09:00") : ""
  const closingTime = isOpen ? (slots[0]?.closingTime || "22:00") : ""

  return DAY_NAMES.reduce((acc, day) => {
    const isThisDayOpen = isOpen && selectedDays.includes(day)
    acc[day] = {
      isOpen: isThisDayOpen,
      openingTime: isThisDayOpen ? openingTime : "",
      closingTime: isThisDayOpen ? closingTime : "",
      slots: isThisDayOpen ? slots : [],
    }
    return acc
  }, {})
}

export default function OutletTimings() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const saveTimerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [savingState, setSavingState] = useState("idle")
  const [schedule, setSchedule] = useState(getDefaultSchedule)
  const [validationError, setValidationError] = useState("")

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getOutletTimings()
        const outletTimings = res?.data?.data?.outletTimings || res?.data?.outletTimings
        if (!active) return
        setSchedule(normalizeScheduleFromApi(outletTimings))
      } catch (_) {
        if (!active) return
        setSchedule(getDefaultSchedule())
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!schedule.isOpen) {
      setValidationError("")
      return
    }
    setValidationError(validateSlots(schedule.slots, schedule.openDays))
  }, [schedule, loading])

  useEffect(() => {
    if (loading) return
    if (validationError) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      try {
        setSavingState("saving")
        const outletTimings = buildPayloadForAllDays(schedule)
        await restaurantAPI.saveOutletTimings(outletTimings)
        setSavingState("saved")
        window.dispatchEvent(new Event("outletTimingsUpdated"))
      } catch (_) {
        setSavingState("error")
      }
    }, 500)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [schedule, validationError, loading])

  const statusLabel = useMemo(() => {
    if (savingState === "saving") return "Saving..."
    if (savingState === "saved") return "Saved"
    if (savingState === "error") return "Save failed"
    return ""
  }, [savingState])

  const handleSlotTimeChange = (slotId, field, dateValue) => {
    const nextTime = fromTimeValue(dateValue)
    setSavingState("idle")
    setSchedule((prev) => ({
      ...prev,
      slots: prev.slots.map((slot) => (
        slot.id === slotId
          ? { ...slot, [field]: nextTime }
          : slot
      )),
    }))
  }

  const handleAddSlot = () => {
    if (schedule.slots.length >= MAX_SLOTS) return
    setSavingState("idle")
    setSchedule((prev) => ({
      ...prev,
      slots: [
        ...prev.slots,
        {
          id: `slot-${Date.now()}-${Math.random()}`,
          openingTime: "09:00",
          closingTime: "22:00",
        },
      ],
    }))
  }

  const handleDeleteSlot = (slotId) => {
    if (schedule.slots.length <= 1) return
    setSavingState("idle")
    setSchedule((prev) => ({
      ...prev,
      slots: prev.slots.filter((slot) => slot.id !== slotId),
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="min-h-screen bg-white overflow-x-hidden">
        <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/food/restaurant/explore")}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-900">Outlet timings</h1>
              <p className="text-xs text-gray-500">Configure operational days and delivery timings</p>
            </div>
            {statusLabel ? (
              <p className={`text-xs font-medium ${savingState === "error" ? "text-red-600" : "text-emerald-600"}`}>
                {statusLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-brand-700">{companyName} delivery timings</h2>
              <p className="text-xs text-slate-600 mt-1">
                Select your open days and set the delivery timings slot for your outlet.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Outlet status</p>
                <p className="text-xs text-slate-500">
                  {schedule.isOpen ? "Open on selected days" : "Closed for all days"}
                </p>
              </div>
              <Switch
                checked={schedule.isOpen}
                onCheckedChange={(checked) => {
                  setSavingState("idle")
                  setSchedule((prev) => ({ ...prev, isOpen: Boolean(checked) }))
                }}
                className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-300"
              />
            </div>

            {schedule.isOpen ? (
              <div className="mt-4 space-y-3">
                {/* Days Selector */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <Calendar className="w-4 h-4 text-slate-800" />
                    <span>Select Operational Days</span>
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Choose the days of the week when your restaurant is open.
                  </p>
                  <div className="grid grid-cols-7 gap-1.5 mt-2">
                    {DAY_NAMES.map((day) => {
                      const active = (schedule.openDays || []).includes(day)
                      const abbr = day.slice(0, 3)
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSavingState("idle")
                            setSchedule((prev) => {
                              const openDays = prev.openDays || []
                              const exists = openDays.includes(day)
                              let nextDays
                              if (exists) {
                                nextDays = openDays.filter((d) => d !== day)
                              } else {
                                nextDays = [...openDays, day]
                              }
                              return {
                                ...prev,
                                openDays: nextDays,
                              }
                            })
                          }}
                          className={`aspect-square flex flex-col items-center justify-center rounded-md text-[11px] font-semibold transition-all border ${
                            active
                              ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <span>{abbr}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {schedule.slots.map((slot, index) => (
                  <div key={slot.id} className="rounded-lg border border-slate-200 bg-white p-3">


                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Opening
                          </span>
                        </label>
                        <MobileTimePicker
                          value={toTimeValue(slot.openingTime)}
                          onChange={(value) => value && handleSlotTimeChange(slot.id, "openingTime", value)}
                          format="hh:mm a"
                          slotProps={{
                            textField: {
                              size: "small",
                              fullWidth: true,
                            },
                          }}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Closing
                          </span>
                        </label>
                        <MobileTimePicker
                          value={toTimeValue(slot.closingTime, 22, 0)}
                          onChange={(value) => value && handleSlotTimeChange(slot.id, "closingTime", value)}
                          format="hh:mm a"
                          slotProps={{
                            textField: {
                              size: "small",
                              fullWidth: true,
                            },
                          }}
                        />
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-500">
                      {format12Hour(slot.openingTime)} - {format12Hour(slot.closingTime)}
                    </p>
                  </div>
                ))}



                {validationError ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{validationError}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                Outlet closed for all days. Turn ON to set timings.
              </p>
            )}
          </div>
        </div>
      </div>
    </LocalizationProvider>
  )
}
