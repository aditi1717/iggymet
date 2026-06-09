import { useState, useEffect } from "react"
import { IndianRupee, Loader2, Save, Info, Calculator } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import BRAND_THEME from "@/config/brandTheme"

export default function DeliveryBoyCommission() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [baseRuleId, setBaseRuleId] = useState(null)
  const [commissions, setCommissions] = useState([])
  
  const [formData, setFormData] = useState({
    basePayout: "0",
    baseKm: "0",
    commissionPerKm: "0",
  })
  
  const [testDistance, setTestDistance] = useState("5")
  const [errors, setErrors] = useState({})

  // Fetch commission rules on mount
  useEffect(() => {
    fetchCommissionRules()
  }, [])

  const fetchCommissionRules = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getCommissionRules()
      
      let commissionsData = []
      if (response?.data?.success && response?.data?.data?.commissions) {
        commissionsData = response.data.data.commissions
      } else if (response?.data?.data?.commissions) {
        commissionsData = response.data.data.commissions
      } else if (response?.data?.commissions) {
        commissionsData = response.data.commissions
      }

      setCommissions(commissionsData || [])

      // Find the base rule (minDistance === 0)
      const baseRule = (commissionsData || []).find(r => Number(r.minDistance || 0) === 0)
      
      if (baseRule) {
        setBaseRuleId(baseRule._id)
        setFormData({
          basePayout: String(baseRule.basePayout ?? 0),
          baseKm: String(baseRule.maxDistance ?? 0),
          commissionPerKm: String(baseRule.commissionPerKm ?? 0),
        })
      } else {
        setBaseRuleId(null)
        setFormData({
          basePayout: "0",
          baseKm: "0",
          commissionPerKm: "0",
        })
      }
    } catch (error) {
      console.error('Error fetching commission rules:', error)
      toast.error('Failed to fetch commission rules')
    } finally {
      setLoading(false)
    }
  }

  const validateForm = () => {
    const newErrors = {}
    if (formData.basePayout === "" || parseFloat(formData.basePayout) < 0) {
      newErrors.basePayout = "Base payout must be 0 or greater"
    }
    if (formData.baseKm === "" || parseFloat(formData.baseKm) < 0) {
      newErrors.baseKm = "Base distance must be 0 or greater"
    }
    if (formData.commissionPerKm === "" || parseFloat(formData.commissionPerKm) < 0) {
      newErrors.commissionPerKm = "Extra per km must be 0 or greater"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    try {
      setSaving(true)
      
      // Clean up other rules in the database to ensure our single rule setup works perfectly
      const otherRules = commissions.filter(c => c._id !== baseRuleId)
      for (const rule of otherRules) {
        try {
          await adminAPI.deleteCommissionRule(rule._id)
        } catch (e) {
          console.error("Failed to delete extra rule:", rule._id, e)
        }
      }

      const minDistance = 0
      const maxDistance = parseFloat(formData.baseKm)
      const payload = {
        name: `Base (${maxDistance} km)`,
        minDistance,
        maxDistance,
        commissionPerKm: parseFloat(formData.commissionPerKm),
        basePayout: parseFloat(formData.basePayout),
        status: true,
      }

      if (baseRuleId) {
        await adminAPI.updateCommissionRule(baseRuleId, payload)
      } else {
        const response = await adminAPI.createCommissionRule(payload)
        const newRule = response?.data?.data?.commission || response?.data?.commission
        if (newRule?._id) {
          setBaseRuleId(newRule._id)
        }
      }

      toast.success("Delivery Boy Earning settings saved successfully")
      fetchCommissionRules()
    } catch (error) {
      console.error('Error saving commission rule:', error)
      toast.error(error.response?.data?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // Calculate live preview values
  const preview = (() => {
    const dist = parseFloat(testDistance) || 0
    const basePayout = parseFloat(formData.basePayout) || 0
    const baseKm = parseFloat(formData.baseKm) || 0
    const rate = parseFloat(formData.commissionPerKm) || 0

    if (dist <= 0) {
      return { total: 0, explanation: "Enter a valid test distance to calculate preview." }
    }

    if (dist <= baseKm) {
      return {
        total: basePayout,
        explanation: `Distance (${dist} km) is within the base range (0 to ${baseKm} km). The rider receives only the flat Base Payout.`
      }
    }

    const extraKm = dist - baseKm
    const extraPay = extraKm * rate
    const total = basePayout + extraPay
    return {
      total,
      explanation: `Rider covers ${dist} km: First ${baseKm} km is covered by Base Payout (₹${basePayout}). The remaining ${extraKm.toFixed(2)} km is paid at ₹${rate}/km (₹${extraPay.toFixed(2)}).`
    }
  })()

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-[#2979fb]" />
          <span className="font-semibold">Loading commission settings...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Title */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 id="page-title" className="text-2xl font-bold text-slate-900">Delivery Boy Payout Setup</h1>
              <p className="text-sm text-slate-500">Set the base price and per-kilometer charge for delivery boy earnings</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <h2 className="text-lg font-bold text-slate-900">Earning Configuration</h2>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition-all shadow-md flex items-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: BRAND_THEME.colors.brand.primary }}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>

            <div className="space-y-5">
              {/* Base Payout */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Fixed Base Payout (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.basePayout}
                    onChange={(e) => setFormData({ ...formData, basePayout: e.target.value })}
                    className={`w-full pl-8 pr-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm ${
                      errors.basePayout ? "border-red-500" : "border-slate-300"
                    }`}
                    placeholder="e.g., 23"
                  />
                </div>
                {errors.basePayout && <p className="text-xs text-red-500">{errors.basePayout}</p>}
                <p className="text-xs text-slate-500">The flat fee paid to the rider for accepting and completing a delivery.</p>
              </div>

              {/* Base Distance Limit */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Base Distance Limit (km) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.baseKm}
                    onChange={(e) => setFormData({ ...formData, baseKm: e.target.value })}
                    className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm ${
                      errors.baseKm ? "border-red-500" : "border-slate-300"
                    }`}
                    placeholder="e.g., 3"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">KM</span>
                </div>
                {errors.baseKm && <p className="text-xs text-red-500">{errors.baseKm}</p>}
                <p className="text-xs text-slate-500">The threshold distance up to which only the Fixed Base Payout applies.</p>
              </div>

              {/* Extra Per Km */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Extra Per Kilometer after base limit (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.commissionPerKm}
                    onChange={(e) => setFormData({ ...formData, commissionPerKm: e.target.value })}
                    className={`w-full pl-8 pr-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm ${
                      errors.commissionPerKm ? "border-red-500" : "border-slate-300"
                    }`}
                    placeholder="e.g., 4"
                  />
                </div>
                {errors.commissionPerKm && <p className="text-xs text-red-500">{errors.commissionPerKm}</p>}
                <p className="text-xs text-slate-500">The rate per kilometer paid to the rider for any distance exceeding the base limit.</p>
              </div>
            </div>
          </div>

          {/* Preview & Info Card */}
          <div className="space-y-6 md:col-span-2">
            {/* Live Calculator */}
            <div className="bg-slate-900 text-white rounded-xl shadow-lg p-6 border border-slate-800">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold">Live Earning Calculator</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-semibold">Test Distance (km)</label>
                  <input
                    type="number"
                    value={testDistance}
                    onChange={(e) => setTestDistance(e.target.value)}
                    min="0"
                    step="0.1"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="e.g., 5"
                  />
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">Estimated Rider Earning</div>
                  <div className="text-3xl font-extrabold text-green-400 flex items-baseline">
                    <span className="text-xl mr-0.5">₹</span>
                    {Math.round(preview.total)}
                  </div>
                </div>

                <div className="text-xs text-slate-400 bg-slate-800/30 rounded-lg p-3 border border-slate-800/40">
                  <p className="leading-relaxed">{preview.explanation}</p>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex gap-2.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 space-y-1.5">
                  <p className="font-bold">Formula</p>
                  <p className="font-mono bg-white/70 p-2 rounded border border-amber-200/70 text-[10px] text-slate-800 leading-normal">
                    Payout = Base + max(0, distance - Limit) &times; Extra Rate
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
