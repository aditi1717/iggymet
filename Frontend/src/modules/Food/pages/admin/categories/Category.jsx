import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  BadgeCheck,
  Download,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { toast } from "sonner"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const defaultFormData = {
  name: "",
  image: "",
  status: true,
  type: "",
  foodTypeScope: "Both",
  sortOrder: 0,
}


const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const scopeBadgeClass = (scope) => {
  if (scope === "Veg") return "bg-green-50 text-green-700 border-green-200"
  if (scope === "Non-Veg") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}



export default function Category() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPendingOnly, setShowPendingOnly] = useState(false)

  useEffect(() => {
    const adminToken = localStorage.getItem("admin_accessToken")
    if (!adminToken) {
      toast.error("Please login to access categories")
      setLoading(false)
      return
    }
    fetchCategories()
  }, [])



  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchCategories()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery, showPendingOnly])

  const filteredCategories = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase()
    if (!query) return categories
    return categories.filter((category) => {
      const creator = category?.createdByRestaurant?.name || category?.restaurant?.name || ""
      return (
        String(category?.name || "").toLowerCase().includes(query) ||
        String(category?.foodTypeScope || "").toLowerCase().includes(query) ||
        String(creator || "").toLowerCase().includes(query) ||
        String(category?.id || "").toLowerCase().includes(query)
      )
    })
  }, [categories, searchQuery])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const params = {}
      if (searchQuery) params.search = searchQuery
      if (showPendingOnly) params.approvalStatus = "pending"

      const response = await adminAPI.getCategories(params)
      const list = response?.data?.data?.categories || response?.data?.categories || []
      setCategories(Array.isArray(list) ? list : [])
    } catch (error) {
      if (error?.response?.status === 401) {
        toast.error("Authentication required. Please login again.")
      } else if (error?.response?.status === 403) {
        toast.error("Access denied. You do not have permission.")
      } else if (error?.response?.status === 404) {
        toast.error("Categories endpoint not found. Please check backend server.")
      } else if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
        toast.error("Cannot connect to server. Please check if backend is running on " + API_BASE_URL.replace("/api", ""))
      } else {
        toast.error(error?.response?.data?.message || "Failed to load categories")
      }
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddNew = () => {
    navigate("/admin/food/categories/add")
  }

  const handleEdit = (category) => {
    navigate(`/admin/food/categories/edit/${category.id || category._id}`)
  }

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    setSelectedImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleToggleStatus = async (id) => {
    try {
      const response = await adminAPI.toggleCategoryStatus(String(id))
      if (response?.data?.success) {
        toast.success("Category status updated successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update category status")
    }
  }

  const handleApprove = async (id) => {
    try {
      const response = await adminAPI.approveCategory(String(id))
      if (response?.data?.success) {
        toast.success("Category approved successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to approve category")
    }
  }

  const handleReject = async (category) => {
    const reason = window.prompt(`Reject "${category?.name}" with a reason:`)
    if (reason == null) return
    if (!String(reason).trim()) {
      toast.error("Rejection reason is required")
      return
    }

    try {
      const response = await adminAPI.rejectCategory(String(category?.id || category?._id), reason)
      if (response?.data?.success) {
        toast.success("Category rejected successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject category")
    }
  }

  const handleMakeGlobal = async (category) => {
    if (!window.confirm(`Make "${category?.name}" global for every restaurant?`)) return

    try {
      const response = await adminAPI.makeCategoryGlobal(String(category?.id || category?._id))
      if (response?.data?.success) {
        toast.success("Category is now global")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to make category global")
    }
  }

  const handleDelete = async (id) => {
    const categoryName = categories.find((category) => String(category?.id) === String(id))?.name || "this category"
    if (!window.confirm(`Delete "${categoryName}"? This action cannot be undone.`)) return

    try {
      const response = await adminAPI.deleteCategory(String(id))
      if (response?.data?.success) {
        toast.success("Category deleted successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete category")
    }
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text("Category List", 14, 20)
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Generated on: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 14, 28)

      const tableData = filteredCategories.map((category, index) => [
        index + 1,
        category?.name || "N/A",
        category?.foodTypeScope || "Both",
        category?.isGlobal ? "Global" : "Private",
        category?.approvalStatus || "pending",
      ])

      autoTable(doc, {
        startY: 35,
        head: [["SL", "Category", "Diet Scope", "Visibility", "Approval"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 10,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 30, 30],
        },
      })

      doc.save(`Categories_${new Date().toISOString().split("T")[0]}.pdf`)
      toast.success("PDF exported successfully!")
    } catch {
      toast.error("Failed to export PDF")
    }
  }


  return (
    <div className="min-h-screen bg-white p-4 lg:p-6">
      <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Categories</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
              Review restaurant-created categories, approve them for use, or make them global to share across the entire platform.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 p-1">
              <button
                type="button"
                onClick={() => setShowPendingOnly(false)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${!showPendingOnly ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setShowPendingOnly(true)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${showPendingOnly ? "bg-amber-600 text-white" : "text-slate-600"}`}
              >
                Pending
              </button>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search categories"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <button
              onClick={handleExportPDF}
              disabled={filteredCategories.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            <button
              onClick={handleAddNew}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Add Category
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="w-[25%] px-5 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Category</th>
                <th className="w-[17%] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Owner</th>
                <th className="w-[10%] px-4 py-4 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">Diet</th>
                <th className="w-[10%] px-4 py-4 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">Status</th>
                <th className="w-[13%] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Approval</th>
                <th className="w-[20%] px-5 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
                    <p className="mt-2 text-sm text-slate-500">Loading categories...</p>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700">No categories found</p>
                    <p className="mt-1 text-sm text-slate-500">Try a different search or create a new category.</p>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => {
                  const creatorName = category?.createdByRestaurant?.name || category?.restaurant?.name || "Admin"
                  const approvalStatus = category?.approvalStatus || "pending"
                  const isRestaurantCategory = Boolean(category?.createdByRestaurantId || category?.restaurantId)

                  return (
                    <tr key={category.id} className="align-top hover:bg-slate-50/80">
                      <td className="px-5 py-5">
                        <div className="flex items-start gap-3">
                          <div className="h-11 w-11 overflow-hidden rounded-2xl bg-slate-100">
                            {category?.image ? (
                              <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                                {String(category?.name || "C").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold leading-6 text-slate-900">{category?.name || "-"}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>{category?.type || "No type"}</span>
                              <span className="text-slate-300">•</span>
                              <span>Items linked: {category?.itemCount || 0}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-sm text-slate-600">
                        <div className="space-y-1">
                          <p className="font-medium leading-6 text-slate-800">{creatorName}</p>
                          <p className="text-xs text-slate-400">
                            {category?.isGlobal ? "Global category" : "Private to creator"}
                          </p>
                          {category?.isGlobal && isRestaurantCategory && (
                            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">
                              <Globe className="mr-1 h-3.5 w-3.5" />
                              Shared
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-5 text-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scopeBadgeClass(category?.foodTypeScope)}`}>
                          {category?.foodTypeScope || "Both"}
                        </span>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <button
                          onClick={() => handleToggleStatus(category.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${category?.status ? "bg-brand-600" : "bg-slate-300"}`}
                          title={category?.status ? "Deactivate" : "Activate"}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${category?.status ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-5">
                        <div className="space-y-2">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalBadgeClass(approvalStatus)}`}>
                            {approvalStatus === "approved" && <BadgeCheck className="mr-1 h-3.5 w-3.5" />}
                            {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                          </span>
                          {category?.rejectionReason && (
                            <p className="max-w-[180px] text-xs leading-5 text-rose-600">{category.rejectionReason}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex flex-wrap justify-end gap-2">
                            {approvalStatus !== "approved" && (
                              <button
                                onClick={() => handleApprove(category.id)}
                                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
                              >
                                Approve
                              </button>
                            )}
                            {isRestaurantCategory && approvalStatus !== "rejected" && (
                              <button
                                onClick={() => handleReject(category)}
                                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                              >
                                Reject
                              </button>
                            )}
                            {isRestaurantCategory && !category?.isGlobal && approvalStatus === "approved" && (
                              <button
                                onClick={() => handleMakeGlobal(category)}
                                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-1.5"
                              >
                                <Globe className="h-3.5 w-3.5" />
                                Make Global
                              </button>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(category)}
                              className="rounded-lg p-2 text-brand-600 hover:bg-brand-50"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(category.id)}
                              className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
