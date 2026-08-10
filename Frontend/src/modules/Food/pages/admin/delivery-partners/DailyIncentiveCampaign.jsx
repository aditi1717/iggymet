import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Calendar,
  Edit2,
  IndianRupee,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const DEFAULT_SLABS = [
  { trips: "14", amount: "110", label: "" },
  { trips: "17", amount: "145", label: "" },
  { trips: "23", amount: "210", label: "" },
  { trips: "27", amount: "285", label: "" },
]

const emptyForm = {
  title: "",
  description: "",
  timezone: "Asia/Kolkata",
  status: "active",
  isAllZones: true,
  zoneIds: [],
  slabs: DEFAULT_SLABS,
}

const normalizeSlabs = (slabs = []) =>
  slabs.map((slab) => ({
    trips: String(slab?.trips ?? ""),
    amount: String(slab?.amount ?? ""),
    label: String(slab?.label ?? ""),
  }))

export default function DailyIncentiveCampaign() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [zones, setZones] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const zoneNameById = useMemo(() => {
    const map = new Map()
    for (const zone of zones || []) {
      const zoneId = String(zone?._id || zone?.id || "")
      if (!zoneId) continue
      map.set(zoneId, zone?.name || zone?.zoneName || "Unnamed zone")
    }
    return map
  }, [zones])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [campaignRes, zoneRes] = await Promise.all([
        adminAPI.getDailyIncentiveCampaigns(),
        adminAPI.getZones({ page: 1, limit: 1000, isActive: true }),
      ])

      const campaignList = campaignRes?.data?.data?.campaigns || campaignRes?.data?.campaigns || []
      const zoneList = zoneRes?.data?.data?.zones || zoneRes?.data?.zones || []
      setCampaigns(Array.isArray(campaignList) ? campaignList : [])
      setZones(Array.isArray(zoneList) ? zoneList : [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load daily incentives")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const startEdit = (campaign) => {
    setEditingId(campaign?._id || null)
    setForm({
      title: campaign?.title || "",
      description: campaign?.description || "",
      timezone: campaign?.timezone || "Asia/Kolkata",
      status: campaign?.status || "active",
      isAllZones: campaign?.isAllZones !== false,
      zoneIds: Array.isArray(campaign?.zoneIds) ? campaign.zoneIds.map((id) => String(id)) : [],
      slabs: normalizeSlabs(campaign?.slabs || []),
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const updateSlab = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      slabs: prev.slabs.map((slab, i) => (i === index ? { ...slab, [field]: value } : slab)),
    }))
  }

  const addSlab = () => {
    setForm((prev) => ({
      ...prev,
      slabs: [...prev.slabs, { trips: "", amount: "", label: "" }],
    }))
  }

  const removeSlab = (index) => {
    setForm((prev) => {
      const next = prev.slabs.filter((_, i) => i !== index)
      return { ...prev, slabs: next.length ? next : [{ trips: "", amount: "", label: "" }] }
    })
  }

  const toggleZone = (zoneId) => {
    setForm((prev) => {
      const exists = prev.zoneIds.includes(zoneId)
      return {
        ...prev,
        zoneIds: exists ? prev.zoneIds.filter((id) => id !== zoneId) : [...prev.zoneIds, zoneId],
      }
    })
  }

  const validate = () => {
    if (!form.title.trim()) {
      toast.error("Campaign title is required")
      return false
    }

    const slabs = form.slabs
      .map((slab) => ({
        trips: Number(slab.trips),
        amount: Number(slab.amount),
        label: String(slab.label || "").trim(),
      }))
      .filter((slab) => slab.trips > 0 && slab.amount >= 0)

    if (!slabs.length) {
      toast.error("Add at least one valid incentive slab")
      return false
    }

    if (!form.isAllZones && !form.zoneIds.length) {
      toast.error("Select at least one zone or enable all zones")
      return false
    }

    return true
  }

  const saveCampaign = async () => {
    if (!validate()) return

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      timezone: form.timezone.trim() || "Asia/Kolkata",
      status: form.status,
      isAllZones: Boolean(form.isAllZones),
      zoneIds: form.isAllZones ? [] : form.zoneIds,
      slabs: form.slabs
        .map((slab) => ({
          trips: Number(slab.trips),
          amount: Number(slab.amount),
          label: String(slab.label || "").trim(),
        }))
        .filter((slab) => slab.trips > 0 && slab.amount >= 0),
    }

    try {
      setSaving(true)
      if (editingId) {
        await adminAPI.updateDailyIncentiveCampaign(editingId, payload)
        toast.success("Daily incentive campaign updated")
      } else {
        await adminAPI.createDailyIncentiveCampaign(payload)
        toast.success("Daily incentive campaign created")
      }
      resetForm()
      await fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save campaign")
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (campaign) => {
    const nextStatus = campaign?.status === "active" ? "inactive" : "active"
    try {
      await adminAPI.toggleDailyIncentiveCampaignStatus(campaign._id, nextStatus)
      toast.success(`Campaign ${nextStatus === "active" ? "activated" : "deactivated"}`)
      await fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update campaign status")
    }
  }

  const removeCampaign = async (campaign) => {
    if (!window.confirm(`Delete "${campaign?.title || "this campaign"}"?`)) return
    try {
      await adminAPI.deleteDailyIncentiveCampaign(campaign._id)
      toast.success("Campaign deleted")
      if (editingId === campaign._id) resetForm()
      await fetchData()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete campaign")
    }
  }

  const maxReward = useMemo(() => {
    return form.slabs.reduce((max, slab) => Math.max(max, Number(slab.amount) || 0), 0)
  }, [form.slabs])

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-[#2979fb]" />
          <span className="font-semibold">Loading daily incentives...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Daily Incentive Campaign</h1>
              <p className="text-sm text-slate-500">Configure a live trip-count ladder for delivery partners.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Campaign title</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Daily Incentive"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Timezone</label>
                  <input
                    value={form.timezone}
                    onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Asia/Kolkata"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-24"
                  placeholder="Short note shown to admins"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, status: prev.status === "active" ? "inactive" : "active" }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm flex items-center justify-center gap-2 hover:bg-slate-50"
                  >
                    {form.status === "active" ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                    {form.status === "active" ? "On" : "Off"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="w-4 h-4" />
                  <span>Slab ladder</span>
                </div>
                <button
                  type="button"
                  onClick={addSlab}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800"
                >
                  <Plus className="w-4 h-4" />
                  Add row
                </button>
              </div>

              <div className="space-y-3">
                {form.slabs.map((slab, index) => (
                  <div key={`${index}-${slab.trips}-${slab.amount}`} className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Trips</label>
                      <input
                        type="number"
                        min="1"
                        value={slab.trips}
                        onChange={(e) => updateSlab(index, "trips", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Reward</label>
                      <input
                        type="number"
                        min="0"
                        value={slab.amount}
                        onChange={(e) => updateSlab(index, "amount", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Label</label>
                      <input
                        value={slab.label}
                        onChange={(e) => updateSlab(index, "label", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="Optional"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeSlab(index)}
                        className="w-10 h-10 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-red-50 hover:text-red-600"
                        disabled={form.slabs.length === 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase text-slate-500 mb-2">Scope</div>
                <div className="text-sm text-slate-600 mb-3">Only one daily incentive campaign is kept here. Turn it on or off as needed.</div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, isAllZones: !prev.isAllZones }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm flex items-center justify-center gap-2 mb-3 hover:bg-slate-50"
                >
                  {form.isAllZones ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                  {form.isAllZones ? "All zones" : "Selected zones"}
                </button>

                {!form.isAllZones && (
                  <div className="space-y-2 max-h-72 overflow-auto pr-1">
                    {zones.length === 0 ? (
                      <p className="text-sm text-slate-500">No active zones found.</p>
                    ) : (
                      zones.map((zone) => {
                        const zoneId = String(zone?._id || zone?.id || "")
                        const checked = form.zoneIds.includes(zoneId)
                        return (
                          <label
                            key={zoneId}
                            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleZone(zoneId)}
                              className="h-4 w-4 accent-amber-600"
                            />
                            <MapPin className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-800">{zoneNameById.get(zoneId) || "Zone"}</span>
                          </label>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-semibold uppercase text-amber-700 mb-2">Preview</div>
                <div className="text-3xl font-bold text-slate-900 flex items-center gap-1">
                  <IndianRupee className="w-7 h-7 text-amber-600" />
                  {maxReward || 0}
                </div>
                <div className="text-sm text-slate-600 mt-1">Highest slab reward in the current form.</div>
              </div>

              <button
                type="button"
                onClick={saveCampaign}
                disabled={saving}
                className="w-full rounded-lg bg-amber-600 text-white px-4 py-3 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit2 className="w-4 h-4" />}
                {editingId ? "Update campaign" : "Create campaign"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-50"
                >
                  Cancel editing
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Saved campaigns</h2>
              <p className="text-sm text-slate-500">Edit, toggle, or remove the ladder rules below.</p>
            </div>
            <div className="text-sm text-slate-500">{campaigns.length} total</div>
          </div>

          {campaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-slate-400" />
              No daily incentive campaigns yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b">
                    <th className="py-3 pr-4">Campaign</th>
                    <th className="py-3 pr-4">Scope</th>
                    <th className="py-3 pr-4">Slabs</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign._id} className="border-b last:border-b-0 align-top">
                      <td className="py-4 pr-4">
                        <div className="font-semibold text-slate-900">{campaign.title}</div>
                        <div className="text-xs text-slate-500 mt-1">{campaign.description || "No description"}</div>
                      </td>
                      <td className="py-4 pr-4 text-slate-600">
                        {campaign.isAllZones ? "All zones" : (campaign.zoneIds || []).map((id) => zoneNameById.get(String(id)) || String(id)).join(", ")}
                      </td>
                      <td className="py-4 pr-4">
                        <div className="space-y-1">
                          {(campaign.slabs || []).map((slab) => (
                            <div key={`${campaign._id}-${slab.trips}`} className="flex items-center gap-2">
                              <span className="inline-flex min-w-20 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                                {slab.trips} trips
                              </span>
                              <span className="font-medium text-slate-900">₹{Number(slab.amount || 0).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <button
                          type="button"
                          onClick={() => toggleStatus(campaign)}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                            campaign.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {campaign.status === "active" ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          {campaign.status || "inactive"}
                        </button>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(campaign)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCampaign(campaign)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
