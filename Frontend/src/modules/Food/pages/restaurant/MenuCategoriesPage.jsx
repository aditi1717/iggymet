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
} from "lucide-react"
import { restaurantAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import BRAND_THEME from "@/config/brandTheme"

const defaultFormData = {
  name: "",
  type: "",
  image: "",
  isActive: true,
  sortOrder: 0,
  foodTypeScope: "Veg",
}

const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const scopePillClass = (scope) => {
  if (scope === "Veg") return "bg-green-50 text-green-700 border-green-200"
  if (scope === "Non-Veg") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

// DISABLED: Only admins can create categories now
// Restaurant category creation has been disabled
export default function MenuCategoriesPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
    >
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} className="rounded-full p-1 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Menu Categories</h1>
            <p className="text-xs text-slate-500">Category management is now handled by admin only.</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-lg font-semibold text-slate-900">Category Creation Disabled</p>
          <p className="mt-2 text-sm text-slate-600">
            Only administrators can create and manage menu categories. Please contact admin to add new categories.
          </p>
        </div>
      </div>
    </div>
  )
}


