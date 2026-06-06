import { useCallback, useEffect, useRef, useState } from "react"
import { IndianRupee, Loader2 } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function DeliveryCashLimit() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingZoneLimits, setSavingZoneLimits] = useState(false)
  const [editingZoneLimits, setEditingZoneLimits] = useState(false)
  const [deliveryCashLimit, setDeliveryCashLimit] = useState("")
  const [zones, setZones] = useState([])
  const [zoneLimitValues, setZoneLimitValues] = useState({})
  const isMountedRef = useRef(true)

  const buildZoneLimitsPayload = useCallback(() => {
    const entries = Object.entries(zoneLimitValues || {})
      .map(([zoneId, value]) => [String(zoneId || "").trim(), String(value ?? "").trim()])
      .filter(([zoneId, value]) => zoneId && value !== "")

    for (const [, value] of entries) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error("Each zone cash limit must be a number (>= 0)")
      }
    }

    return entries.map(([zoneId, value]) => ({
      zoneId,
      deliveryCashLimit: Math.max(0, Number(value) || 0),
    }))
  }, [zoneLimitValues])

  const fetchLimit = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      const [response, zonesResponse] = await Promise.all([
        adminAPI.getDeliveryCashLimit(),
        adminAPI.getZones({ page: 1, limit: 1000, isActive: true }),
      ])
      const data = response?.data?.data || response?.data || {}
      const limit = data.deliveryCashLimit
      const zoneOverrides = Array.isArray(data.zoneLimits) ? data.zoneLimits : []
      const zonesList = zonesResponse?.data?.data?.zones || []
      if (!isMountedRef.current) return
      setDeliveryCashLimit(limit !== undefined && limit !== null ? String(limit) : "")
      setZones(zonesList)
      setZoneLimitValues(
        zoneOverrides.reduce((acc, entry) => {
          const zoneId = String(entry?.zoneId?._id || entry?.zoneId || "").trim()
          if (!zoneId) return acc
          acc[zoneId] = String(Number(entry?.deliveryCashLimit ?? 0))
          return acc
        }, {}),
      )
    } catch (error) {
      debugError("Error fetching delivery cash limit:", error)
      if (!isMountedRef.current) return
      if (!silent) {
        toast.error(error.response?.data?.message || "Failed to load delivery cash limit")
      }
      setDeliveryCashLimit("")
      setZones([])
      setZoneLimitValues({})
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  const saveLimit = async () => {
    const value = Number(deliveryCashLimit)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Cash limit must be a number (>= 0)")
      return
    }
    try {
      setSaving(true)
      const response = await adminAPI.updateDeliveryCashLimit({
        deliveryCashLimit: value,
        zoneLimits: buildZoneLimitsPayload(),
      })
      const saved =
        response?.data?.data?.deliveryCashLimit ??
        response?.data?.deliveryCashLimit ??
        value
      setDeliveryCashLimit(String(saved))
      toast.success("Delivery cash limit updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving delivery cash limit:", error)
      toast.error(error?.response?.data?.message || error?.message || "Failed to update delivery cash limit")
    } finally {
      setSaving(false)
    }
  }

  const saveZoneLimits = async () => {
    const value = Number(deliveryCashLimit)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Cash limit must be a number (>= 0)")
      return
    }
    try {
      setSavingZoneLimits(true)
      await adminAPI.updateDeliveryCashLimit({
        deliveryCashLimit: value,
        zoneLimits: buildZoneLimitsPayload(),
      })
      setEditingZoneLimits(false)
      toast.success("Zone-wise cash limits updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving zone cash limits:", error)
      toast.error(error?.response?.data?.message || error?.message || "Failed to update zone cash limits")
    } finally {
      setSavingZoneLimits(false)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    fetchLimit()

    return () => {
      isMountedRef.current = false
    }
  }, [fetchLimit])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <IndianRupee className="w-5 h-5 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Delivery Cash Limit</h1>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            Set a <strong>global COD cash limit</strong> for all delivery partners. Cash limit is used for Available
            cash limit in the delivery app.
          </p>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg mb-6">
            <div className="flex items-start gap-3">
              <IndianRupee className="w-5 h-5 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-emerald-900 mb-1">
                  Delivery Boy Available Cash Limit (Global)
                </div>
                <div className="text-sm text-emerald-800/80 mb-3">
                  When COD cash is collected, delivery partner&apos;s remaining limit will decrease automatically.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliveryCashLimit}
                      onChange={(e) => setDeliveryCashLimit(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm border-emerald-200"
                      placeholder={loading ? "Loading..." : "e.g., 2000"}
                      disabled={loading || saving}
                    />
                    {loading && (
                      <p className="text-xs text-emerald-700/80 mt-1 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading current limit…
                      </p>
                    )}
                  </div>
                  <button
                    onClick={saveLimit}
                    disabled={loading || saving}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-sky-50 border border-sky-200 rounded-lg mt-6">
            <div className="flex items-start gap-3">
              <IndianRupee className="w-5 h-5 text-sky-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sky-900 mb-1">
                  Zone-wise Cash Limit Override
                </div>
                <div className="text-sm text-sky-800/80 mb-3">
                  Leave a zone empty to use the global cash limit. If a delivery boy reaches the cash limit for that zone,
                  admin order assignment will hide that rider from the assign modal.
                </div>

                {zones.length === 0 ? (
                  <div className="text-sm text-sky-800/80">
                    {loading ? "Loading zones..." : "No active zones found."}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      {editingZoneLimits ? (
                        <button
                          onClick={saveZoneLimits}
                          disabled={loading || savingZoneLimits}
                          className="px-4 py-2.5 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {savingZoneLimits && <Loader2 className="w-4 h-4 animate-spin" />}
                          Save Zone Limits
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingZoneLimits(true)}
                          disabled={loading}
                          className="px-4 py-2.5 text-sm font-medium rounded-lg border border-sky-300 bg-white text-sky-700 hover:bg-sky-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Edit Zone Limits
                        </button>
                      )}
                    </div>

                    {zones.map((zone) => {
                      const zoneId = String(zone?._id || zone?.id || "")
                      const zoneLabel = zone?.name || zone?.zoneName || zone?.serviceLocation || "Unnamed Zone"
                      return (
                        <div key={zoneId} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] gap-3 items-center">
                          <div className="text-sm font-medium text-slate-800">{zoneLabel}</div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={zoneLimitValues[zoneId] ?? ""}
                            onChange={(e) =>
                              setZoneLimitValues((prev) => ({
                                ...prev,
                                [zoneId]: e.target.value,
                              }))
                            }
                            className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm border-sky-200"
                            placeholder={`Use global (${deliveryCashLimit || 0})`}
                            disabled={loading || savingZoneLimits || !editingZoneLimits}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



