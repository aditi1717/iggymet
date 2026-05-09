import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  BadgeCheck,
  Edit2,
  Globe,
  Loader2,
  Plus,
  Trash2,
  Image as ImageIcon,
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"
import BRAND_THEME from "@/config/brandTheme"


const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

export default function MenuCategoriesPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getAllCategories({ privateOnly: true })
      const data = response?.data?.data?.categories || response?.data?.categories || []
      setCategories(data)
    } catch (error) {
      console.error("Error fetching categories:", error)
      toast.error("Failed to load categories")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleOpenModal = (category = null) => {
    if (category) {
      navigate(`/food/restaurant/menu-categories/${category.id || category._id}/edit`)
    } else {
      navigate("/food/restaurant/menu-categories/new")
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this category?")) return

    try {
      await restaurantAPI.deleteCategory(id)
      toast.success("Category deleted successfully")
      fetchCategories()
    } catch (error) {
      console.error("Error deleting category:", error)
      toast.error("Failed to delete category")
    }
  }

  const handleToggleStatus = async (category) => {
    try {
      const newStatus = !category.isActive
      await restaurantAPI.updateCategory(category.id || category._id, {
        isActive: newStatus,
      })
      toast.success(`Category ${newStatus ? "enabled" : "disabled"} successfully`)
      // Optimistic update
      setCategories((prev) =>
        prev.map((c) =>
          (c.id || c._id) === (category.id || category._id) ? { ...c, isActive: newStatus } : c
        )
      )
    } catch (error) {
      console.error("Error toggling status:", error)
      toast.error("Failed to update category status")
    }
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
    >
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="rounded-full p-1 hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5 text-slate-700" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Menu Categories</h1>
              <p className="text-xs text-slate-500">Manage your menu sections</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add New</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="mt-2 text-sm text-slate-500">Loading categories...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-lg font-semibold text-slate-900">No Categories Found</p>
            <p className="mt-1 text-sm text-slate-500">
              Start by adding your first menu category.
            </p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-6 px-6 py-2 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition-colors"
            >
              Add Your First Category
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {categories.map((category) => (
              <motion.div
                key={category.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200 p-4 flex items-center gap-4 group hover:border-brand-400/50 transition-all shadow-sm hover:shadow-md"
              >
                <div className="h-16 w-16 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-100">
                  {category.image ? (
                    <img
                      src={category.image}
                      alt={category.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-slate-300" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 truncate">{category.name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${approvalBadgeClass(
                        category.approvalStatus
                      )}`}
                    >
                      {category.approvalStatus || "Pending"}
                    </span>
                    {category.isGlobal && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-brand-600 border border-brand-100 uppercase">
                        Global
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {category.foodTypeScope || "Both"}
                    </span>
                    <span className="text-xs text-slate-500">
                      Sort: {category.sortOrder || 0}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {!category.isGlobal && (
                    <button
                      onClick={() => handleToggleStatus(category)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        category.isActive ? "bg-brand-600" : "bg-slate-200"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          category.isActive ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  )}

                  <div className={`flex items-center gap-2 transition-opacity ${category.isGlobal ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                    {!category.isGlobal && (
                      <>
                        <button
                          onClick={() => handleOpenModal(category)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="p-2 hover:bg-rose-50 rounded-lg text-rose-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
              </div>
            </motion.div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
