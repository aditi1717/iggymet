import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
  Camera,
  Image as ImageIcon,
} from "lucide-react"
import { restaurantAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import BRAND_THEME from "@/config/brandTheme"

const defaultFormData = {
  name: "",
  type: "Veg", // Default to Veg
  image: "",
  isActive: true,
  sortOrder: 0,
}

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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(defaultFormData)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getAllCategories()
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
      setEditingId(category.id)
      setFormData({
        name: category.name || "",
        type: category.type || "Veg",
        image: category.image || "",
        isActive: category.isActive ?? true,
        sortOrder: category.sortOrder || 0,
      })
      setImagePreview(category.image || "")
    } else {
      setEditingId(null)
      setFormData(defaultFormData)
      setImagePreview("")
    }
    setImageFile(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setFormData(defaultFormData)
    setImageFile(null)
    setImagePreview("")
    setEditingId(null)
  }

  const handleImageSelect = (file) => {
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleImageCapture = (base64) => {
    if (base64) {
      setImagePreview(base64)
      // Convert base64 to File object if needed, or just use base64 in upload
      // For now we'll handle it in submit
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error("Please enter category name")
      return
    }

    try {
      setIsSubmitting(true)
      let imageUrl = formData.image

      // Upload image if new one selected
      if (imageFile || (imagePreview && imagePreview.startsWith("data:"))) {
        toast.info("Uploading image...")
        let uploadRes
        if (imageFile) {
          uploadRes = await uploadAPI.uploadMedia(imageFile)
        } else {
          // Handle base64 from camera
          uploadRes = await uploadAPI.uploadMedia(imagePreview)
        }
        imageUrl = uploadRes?.data?.data?.url || uploadRes?.data?.url
      }

      const payload = {
        ...formData,
        image: imageUrl,
      }

      if (editingId) {
        await restaurantAPI.updateCategory(editingId, payload)
        toast.success("Category updated successfully")
      } else {
        await restaurantAPI.createCategory(payload)
        toast.success("Category created successfully. Pending admin approval.")
      }

      handleCloseModal()
      fetchCategories()
    } catch (error) {
      console.error("Error saving category:", error)
      toast.error(error?.response?.data?.message || "Failed to save category")
    } finally {
      setIsSubmitting(false)
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
                className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4 group"
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
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {category.type || "Veg"}
                    </span>
                    <span className="text-xs text-slate-500">
                      Sort: {category.sortOrder || 0}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-900">
                    {editingId ? "Edit Category" : "Add New Category"}
                  </h2>
                  <button
                    onClick={handleCloseModal}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="h-5 w-5 text-slate-500" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Image Upload */}
                  <div className="flex flex-col items-center">
                    <div
                      onClick={() => setIsImagePickerOpen(true)}
                      className="relative h-24 w-24 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-brand-500 transition-colors"
                    >
                      {imagePreview ? (
                        <>
                          <img src={imagePreview} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="h-6 w-6 text-white" />
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="h-6 w-6 text-slate-400" />
                          <span className="text-[10px] text-slate-500 mt-1 font-medium">
                            Add Image
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Square images work best</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Category Name
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Main Course, Appetizers"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          Type
                        </label>
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all appearance-none bg-white"
                        >
                          <option value="Veg">Veg Only</option>
                          <option value="Non-Veg">Non-Veg</option>
                          <option value="Both">Both</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                          Sort Order
                        </label>
                        <input
                          type="number"
                          value={formData.sortOrder}
                          onChange={(e) =>
                            setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })
                          }
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 px-6 py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>{editingId ? "Update Category" : "Create Category"}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ImageSourcePicker
        isOpen={isImagePickerOpen}
        onClose={() => setIsImagePickerOpen(false)}
        onImageSelect={handleImageSelect}
        onImageCapture={handleImageCapture}
        aspectRatio={1}
      />
    </div>
  )
}
