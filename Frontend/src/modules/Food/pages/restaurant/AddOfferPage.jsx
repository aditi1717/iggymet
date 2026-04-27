import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Check, Loader2, X } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"

export default function AddOfferPage() {
  const navigate = useNavigate()
  const { id: offerId } = useParams()
  const isEditMode = !!offerId
  const goBack = useRestaurantBackNavigation()
  const [form, setForm] = useState({
    title: "",
    productIds: [],
    discountType: "percentage",
    discountValue: "",
    maxDiscount: "",
    maxOfferQuantityPerOrder: "",
    perUserLimit: "",
    startDate: "",
    endDate: ""
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [showProductsModal, setShowProductsModal] = useState(false)
  const [allOffers, setAllOffers] = useState([])

  const selectedProducts = useMemo(
    () => products.filter((product) => form.productIds.includes(String(product.id))),
    [products, form.productIds]
  )

  const occupiedProductIds = useMemo(() => {
    const ids = new Set()
    allOffers.forEach((off) => {
      // Skip the current offer being edited
      if (isEditMode && String(off._id || off.id) === String(offerId)) return

      if (Array.isArray(off.productIds)) {
        off.productIds.forEach((pid) => ids.add(String(pid)))
      } else if (off.productId) {
        ids.add(String(off.productId))
      }
    })
    return ids
  }, [allOffers, isEditMode, offerId])

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoadingProducts(true)
        const res = await restaurantAPI.getMenu()
        const menu = res?.data?.data?.menu || res?.data?.menu || res?.menu || res?.data?.data || {}

        // Prefer structured sections -> items
        const sections = Array.isArray(menu.sections) ? menu.sections : []
        const flattened = []
        sections.forEach((section) => {
          ;(section.items || []).forEach((item) => {
            const id = item?._id || item?.id
            const name = item?.name || item?.title || item?.foodName || item?.itemName
            if (id && name) flattened.push({ id, name })
          })
        })

        if (!flattened.length) {
          // fallback to other possible arrays
          const candidates = [
            menu.items,
            menu.foods,
            menu.menuItems,
            menu.data,
            res?.data?.data?.foods,
            res?.data?.foods,
            Array.isArray(menu) ? menu : null
          ].filter(Boolean)
          const extracted = candidates.find((c) => Array.isArray(c)) || []
          extracted.forEach((item) => {
            const id = item?._id || item?.id
            const name = item?.name || item?.title || item?.foodName || item?.itemName
            if (id && name) flattened.push({ id, name })
            if (Array.isArray(item?.items)) {
              item.items.forEach((sub) => {
                const sid = sub?._id || sub?.id
                const sname = sub?.name || sub?.title || sub?.foodName || sub?.itemName
                if (sid && sname) flattened.push({ id: sid, name: sname })
              })
            }
          })
        }

        setProducts(flattened)

        // Also fetch all existing offers to know which products are occupied
        const offersRes = await restaurantAPI.getRestaurantOffers()
        const list = offersRes?.data?.data?.offers || offersRes?.data?.offers || []
        setAllOffers(list)
      } catch (err) {
        setProducts([])
      } finally {
        setLoadingProducts(false)
      }
    }
    loadProducts()
  }, [])

  const updateField = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }))
    setError("")
  }

  const toggleProduct = (productId) => {
    setForm((prev) => {
      const exists = prev.productIds.includes(productId)
      return {
        ...prev,
        productIds: exists ? prev.productIds.filter((id) => id !== productId) : [...prev.productIds, productId]
      }
    })
    setError("")
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) return setError("Title is required")
    if (!Array.isArray(form.productIds) || form.productIds.length === 0) return setError("Select at least one product")
    const dv = Number(form.discountValue)
    if (!Number.isFinite(dv) || dv <= 0) return setError("Discount must be > 0")
    if (form.discountType === "percentage") {
      const md = Number(form.maxDiscount)
      if (!Number.isFinite(md) || md <= 0) return setError("Max discount required for percentage")
    }
    if (form.maxOfferQuantityPerOrder !== "") {
      const limit = Number(form.maxOfferQuantityPerOrder)
      if (!Number.isFinite(limit) || limit < 1) return setError("Max items per order must be at least 1")
    }
    if (form.perUserLimit !== "") {
      const limit = Number(form.perUserLimit)
      if (!Number.isFinite(limit) || limit < 1) return setError("Per user redeem limit must be at least 1")
    }
    try {
      setSaving(true)
      if (isEditMode) {
        await restaurantAPI.updateRestaurantOffer(offerId, {
          ...form,
          productId: form.productIds[0],
          discountValue: dv,
          maxDiscount: form.discountType === "percentage" ? Number(form.maxDiscount) : undefined,
          maxOfferQuantityPerOrder: form.maxOfferQuantityPerOrder === "" ? undefined : Number(form.maxOfferQuantityPerOrder),
          perUserLimit: form.perUserLimit === "" ? undefined : Number(form.perUserLimit)
        })
      } else {
        await restaurantAPI.createRestaurantOffer({
          ...form,
          productId: form.productIds[0],
          discountValue: dv,
          maxDiscount: form.discountType === "percentage" ? Number(form.maxDiscount) : undefined,
          maxOfferQuantityPerOrder: form.maxOfferQuantityPerOrder === "" ? undefined : Number(form.maxOfferQuantityPerOrder),
          perUserLimit: form.perUserLimit === "" ? undefined : Number(form.perUserLimit)
        })
      }
      navigate("/restaurant/offers")
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to create offer")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isEditMode) return
    const loadExisting = async () => {
      try {
        setLoadingExisting(true)
        const res = await restaurantAPI.getRestaurantOffers()
        const list = res?.data?.data?.offers || res?.data?.offers || []
        const found = list.find((o) => String(o._id || o.id) === String(offerId))
        if (found) {
          setForm({
            title: found.title || "",
            productIds: Array.isArray(found.productIds) && found.productIds.length > 0
              ? found.productIds.map((id) => String(id))
              : found.productId
                ? [String(found.productId)]
                : [],
            discountType: found.discountType || "percentage",
            discountValue: found.discountValue != null ? String(found.discountValue) : "",
            maxDiscount: found.maxDiscount != null ? String(found.maxDiscount) : "",
            maxOfferQuantityPerOrder: found.maxOfferQuantityPerOrder != null && Number(found.maxOfferQuantityPerOrder) > 0 ? String(found.maxOfferQuantityPerOrder) : "",
            perUserLimit: found.perUserLimit != null && Number(found.perUserLimit) > 0 ? String(found.perUserLimit) : "",
            startDate: found.startDate ? new Date(found.startDate).toISOString().slice(0, 10) : "",
            endDate: found.endDate ? new Date(found.endDate).toISOString().slice(0, 10) : ""
          })
        }
      } catch (err) {
        setError(err?.response?.data?.message || "Unable to load offer")
      } finally {
        setLoadingExisting(false)
      }
    }
    loadExisting()
  }, [isEditMode, offerId])

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 flex items-center gap-3">
        <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">{isEditMode ? "Update Offer" : "Create Offer"}</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>}

        <Card className="bg-white border border-gray-100 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <Input value={form.title} onChange={(e) => updateField("title", e.target.value)} placeholder="e.g. Combo Saver" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
              <div className="rounded-xl border border-gray-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setShowProductsModal(true)}
                  className="w-full rounded-xl border border-gray-200 bg-slate-50 px-3 py-3 text-left text-sm text-gray-700 transition hover:border-brand-300 hover:bg-brand-50"
                >
                  {selectedProducts.length > 0
                    ? `${selectedProducts.length} product${selectedProducts.length > 1 ? "s" : ""} selected`
                    : loadingProducts
                      ? "Loading products..."
                      : "Select products"}
                </button>

                {selectedProducts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedProducts.map((product) => (
                      <span
                        key={product.id}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                      >
                        {product.name}
                        <button
                          type="button"
                          onClick={() => toggleProduct(String(product.id))}
                          className="text-brand-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
                <select
                  value={form.discountType}
                  onChange={(e) => updateField("discountType", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat-price">Flat Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {form.discountType === "percentage" ? "Discount (%)" : "Discount Amount"}
                </label>
                <Input
                  type="number"
                  value={form.discountValue}
                  onChange={(e) => updateField("discountValue", e.target.value)}
                  placeholder={form.discountType === "percentage" ? "e.g. 10" : "e.g. 50"}
                />
              </div>
            </div>
            {form.discountType === "percentage" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Discount</label>
                <Input
                  type="number"
                  value={form.maxDiscount}
                  onChange={(e) => updateField("maxDiscount", e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Items Per Order</label>
                <Input
                  type="number"
                  min="1"
                  value={form.maxOfferQuantityPerOrder}
                  onChange={(e) => updateField("maxOfferQuantityPerOrder", e.target.value)}
                  placeholder="e.g. 5"
                />
                <p className="mt-1 text-xs text-gray-500">Leave empty for unlimited. Minimum 1 if set.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Per User Redeem Limit</label>
                <Input
                  type="number"
                  min="1"
                  value={form.perUserLimit}
                  onChange={(e) => updateField("perUserLimit", e.target.value)}
                  placeholder="e.g. 2"
                />
                <p className="mt-1 text-xs text-gray-500">Leave empty for unlimited. Minimum 1 if set.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date (optional)</label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateField("startDate", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date (optional)</label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateField("endDate", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-50 md:relative md:border-t-0 md:px-4 md:py-4 md:mt-6">
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEditMode ? "Update Offer" : "Create Offer"}
        </Button>
      </div>

      {showProductsModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 px-4 py-6"
          onClick={() => setShowProductsModal(false)}
        >
          <div
            className="mx-auto flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Select products</h2>
                <p className="text-xs text-gray-500">Choose one or more food items for this offer.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProductsModal(false)}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {loadingProducts ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading products...</div>
              ) : products.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No products found</div>
              ) : (
                <div className="space-y-2">
                  {products
                    .filter((product) => !occupiedProductIds.has(String(product.id)))
                    .map((product) => {
                    const checked = form.productIds.includes(String(product.id))
                    return (
                      <label
                        key={product.id}
                        className={`flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-3 transition ${
                          checked ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(String(product.id))}
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-4 py-4">
              <Button
                type="button"
                onClick={() => setShowProductsModal(false)}
                className="w-full bg-brand-600 text-white hover:bg-brand-700"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
