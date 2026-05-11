import { useEffect, useState } from "react"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Camera,
  Loader2,
  Upload,
  Image as ImageIcon,
  X,
} from "lucide-react"
import { restaurantAPI, adminAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import DocumentUploadActions from "@food/components/DocumentUploadActions"
import BRAND_THEME from "@/config/brandTheme"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"

const defaultFormData = {
  name: "",
  type: "", // Text label
  foodTypeScope: "Both", // Enum
  image: "",
  isActive: true,
  sortOrder: 0,
}

export default function EditCategoryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const goBackRestaurant = useRestaurantBackNavigation()
  
  const isAdmin = location.pathname.startsWith("/admin")
  const isEditing = !!id

  const [formData, setFormData] = useState(defaultFormData)
  const [loading, setLoading] = useState(isEditing)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false)

  const handleBack = () => {
    if (isAdmin) {
      navigate("/admin/food/categories")
    } else {
      goBackRestaurant()
    }
  }

  useEffect(() => {
    if (isEditing) {
      fetchCategory()
    }
  }, [id])

  const fetchCategory = async () => {
    try {
      setLoading(true)
      let category
      if (isAdmin) {
        // Admin might need a specific getById or filter from list
        const res = await adminAPI.getCategories()
        const list = res?.data?.data?.categories || res?.data?.categories || []
        category = list.find(c => String(c.id || c._id) === id)
      } else {
        const res = await restaurantAPI.getAllCategories()
        const list = res?.data?.data?.categories || res?.data?.categories || []
        category = list.find(c => String(c.id || c._id) === id)
      }

      if (category) {
        setFormData({
          name: category.name || "",
          type: category.type || "",
          foodTypeScope: category.foodTypeScope || "Both",
          image: category.image || "",
          isActive: category.isActive ?? category.status ?? true,
          sortOrder: category.sortOrder || 0,
        })
        setImagePreview(category.image || "")
      } else {
        toast.error("Category not found")
        handleBack()
      }
    } catch (error) {
      console.error("Error fetching category:", error)
      toast.error("Failed to load category details")
    } finally {
      setLoading(false)
    }
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
      setImageFile(null) // Signal base64 usage
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error("Please enter category name")
      return
    }

    if (!imagePreview && !imageFile && !formData.image) {
      toast.error("Category image is mandatory")
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
          uploadRes = await uploadAPI.uploadMedia(imageFile, { folder: "appzeto/categories" })
        } else {
          uploadRes = await uploadAPI.uploadMedia(imagePreview, { folder: "appzeto/categories" })
        }
        imageUrl = uploadRes?.data?.data?.url || uploadRes?.data?.url || uploadRes?.data?.data
      }

      const payload = {
        name: formData.name.trim(),
        type: formData.type.trim(),
        foodTypeScope: formData.foodTypeScope,
        sortOrder: Number(formData.sortOrder || 0),
        image: imageUrl,
        status: formData.isActive,
        isActive: formData.isActive,
        visibilityStartTime: "00:00",
        visibilityEndTime: "23:59",
      }

      if (isAdmin) {
        if (isEditing) {
          await adminAPI.updateCategory(id, payload)
          toast.success("Category updated successfully")
        } else {
          await adminAPI.createCategory(payload)
          toast.success("Category created successfully")
        }
      } else {
        if (isEditing) {
          await restaurantAPI.updateCategory(id, payload)
          toast.success("Category updated successfully")
        } else {
          await restaurantAPI.createCategory(payload)
          toast.success("Category created successfully. Pending admin approval.")
        }
      }

      handleBack()
    } catch (error) {
      console.error("Error saving category:", error)
      toast.error(error?.response?.data?.message || "Failed to save category")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-600 mx-auto" />
          <p className="mt-4 text-slate-600 font-medium">Loading category details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={handleBack} className="rounded-full p-2 hover:bg-slate-100 transition-colors">
            <ArrowLeft className="h-6 w-6 text-slate-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isEditing ? "Edit Category" : "Add New Category"}
            </h1>
            <p className="text-sm text-slate-500">
              {isAdmin ? "Manage global category" : "Manage your restaurant category"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
        >
          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Image Upload Section */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700 ml-1">Category Image *</label>
              
              <div className="flex flex-col items-center">
                <div
                  className="relative h-40 w-full sm:w-64 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all"
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} className="h-full w-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => {
                          setImagePreview("")
                          setImageFile(null)
                          setFormData({ ...formData, image: "" })
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-slate-400">
                      <ImageIcon className="h-10 w-10 mb-2 opacity-20" />
                      <span className="text-xs font-medium">No image selected</span>
                    </div>
                  )}
                </div>
              </div>

              <DocumentUploadActions
                onFileSelect={handleImageSelect}
                fileNamePrefix="category-image"
                galleryInputRef={null} // Component will handle its own gallery input
              />
              <p className="text-[10px] text-slate-400 text-center font-medium">
                High quality square image (512x512) recommended
              </p>
            </div>

            <div className="grid gap-6">
              {/* Category Name */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Category Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Main Course, Appetizers, Drinks"
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-medium"
                />
              </div>

              {/* Category Type Label */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">Category Type (Label)</label>
                <input
                  type="text"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="e.g. Starters, Desserts, Pizza"
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Diet Scope */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Diet Scope</label>
                  <div className="relative">
                    <select
                      value={formData.foodTypeScope}
                      onChange={(e) => setFormData({ ...formData, foodTypeScope: e.target.value })}
                      className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-medium appearance-none"
                    >
                      <option value="Veg">Veg Only</option>
                      <option value="Non-Veg">Non-Veg</option>
                      <option value="Both">Both</option>
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ArrowLeft className="h-4 w-4 -rotate-90" />
                    </div>
                  </div>
                </div>

                {/* Sort Order */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Sort Order</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-200">
                <div>
                  <label className="text-sm font-bold text-slate-900 block">Active Status</label>
                  <p className="text-xs text-slate-500">Visible to customers when enabled</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
                    formData.isActive ? "bg-brand-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      formData.isActive ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-4 flex gap-4">
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 px-8 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-colors"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-[2] px-8 py-4 bg-brand-600 text-white rounded-2xl font-bold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{isEditing ? "Update Category" : "Create Category"}</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>

    </div>
  )
}
