import { motion } from "framer-motion"
import { Bookmark, Clock, Minus, Plus, Share2 } from "lucide-react"
import BRAND_THEME from "@/config/brandTheme"

export default function RestaurantFoodCard({
  item,
  cardRef,
  onClick,
  highlighted = false,
  highlightStyle,
  quantity = 0,
  formattedPrice = "",
  onBookmark,
  isFavorite = false,
  onShare,
  onUpdateQuantity,
  disabled = false,
  showMobileActions = true,
  showCartControls = true,
  showRecommended = false,
  foodImageFallback,
}) {
  const isVeg = item?.foodType === "Veg"

  return (
    <div
      ref={cardRef}
      className={`flex gap-4 border-b border-gray-100 p-4 last:border-none relative transition-all duration-300 ${
        highlighted ? "bg-brand-50 ring-2 ring-inset dark:bg-brand-950/20" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
      style={highlighted ? highlightStyle : undefined}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {isVeg ? (
            <div className="w-4 h-4 border-2 border-green-600 flex items-center justify-center rounded-sm flex-shrink-0">
              <div className="w-2 h-2 bg-green-600 rounded-full" />
            </div>
          ) : (
            <div className="w-4 h-4 border-2 border-red-600 flex items-center justify-center rounded-sm flex-shrink-0">
              <div className="w-2 h-2 bg-red-600 rounded-full" />
            </div>
          )}
          {item?.isSpicy && <span className="text-xs font-semibold text-red-500">Spicy</span>}
        </div>

        <h3 className="font-bold text-gray-800 dark:text-white text-lg leading-tight">
          {item?.name || "Item"}
        </h3>

        {showRecommended && (
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full w-3/4" style={{ backgroundColor: BRAND_THEME.colors.brand.primary }} />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Highly reordered</span>
          </div>
        )}

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {(() => {
            let original = null;
            let final = null;
            const prefix = typeof formattedPrice === "string" && formattedPrice.includes("Starting from") ? "Starting from " : "";

            if (item?.discountedPrice != null && item?.price != null && item.discountedPrice < item.price) {
              original = item.price;
              final = item.discountedPrice;
            } else if (item?.originalPrice && item?.discountAmount && item?.discountAmount > 0) {
              original = item.originalPrice;
              let calculatedPrice = item.originalPrice;
              if (item.discountType === "Percent") {
                calculatedPrice = item.originalPrice - (item.originalPrice * item.discountAmount) / 100;
              } else if (item.discountType === "Fixed") {
                calculatedPrice = item.originalPrice - item.discountAmount;
              }
              final = Math.max(0, calculatedPrice);
            } else if (item?.originalPrice && item?.price && item.originalPrice > item.price) {
              original = item.originalPrice;
              final = item.price;
            }

            if (original !== null && final !== null && original > final) {
              return (
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-500 line-through text-sm">
                    {prefix}₹{Math.round(original)}
                  </p>
                  <p className="font-bold text-green-600 dark:text-green-500">
                    Get at ₹{Math.round(final)}
                  </p>
                </div>
              );
            }

            return formattedPrice ? (
              <p className="font-semibold text-gray-900 dark:text-white">{formattedPrice}</p>
            ) : null;
          })()}
          {item?.preparationTime && String(item.preparationTime).trim() && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              <Clock size={12} className="text-gray-500" />
              <span>{String(item.preparationTime).trim()}</span>
            </div>
          )}
        </div>

        {item?.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{item.description}</p>
        )}

        {showMobileActions && (
          <div className="flex gap-4 mt-3 md:hidden">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onBookmark?.(item)
              }}
              className={`p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                isFavorite
                  ? "border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20"
                  : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
              }`}
            >
              <Bookmark size={18} className={isFavorite ? "fill-red-500" : ""} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onShare?.(item)
              }}
              className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Share2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="relative w-32 h-32 flex-shrink-0">
        {item?.image ? (
          <img
            src={item.image}
            alt={item?.name || "Item"}
            className="w-full h-full object-cover rounded-2xl shadow-sm"
            onError={(e) => {
              if (foodImageFallback && e.currentTarget.src !== foodImageFallback) {
                e.currentTarget.src = foodImageFallback
              }
            }}
          />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-2xl flex items-center justify-center">
            <span className="text-xs text-gray-400">No image</span>
          </div>
        )}

        {showCartControls ? (
          quantity > 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border font-bold px-4 py-1.5 rounded-lg shadow-md flex items-center gap-1 ${
                disabled ? "border-gray-300 text-gray-400 cursor-not-allowed opacity-50" : "text-white"
              }`}
              style={
                disabled
                  ? undefined
                  : { borderColor: BRAND_THEME.colors.brand.primary, background: BRAND_THEME.gradients.primary }
              }
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (!disabled) {
                    onUpdateQuantity?.(item, Math.max(0, quantity - 1), e)
                  }
                }}
                disabled={disabled}
                className={disabled ? "text-gray-400 cursor-not-allowed" : ""}
                style={disabled ? undefined : { color: BRAND_THEME.colors.brand.primary }}
              >
                <Minus size={14} />
              </button>
              <span className={`mx-2 text-sm ${disabled ? "text-gray-400" : ""}`}>{quantity}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (!disabled) {
                    onUpdateQuantity?.(item, quantity + 1, e)
                  }
                }}
                disabled={disabled}
                className={disabled ? "text-gray-400 cursor-not-allowed" : ""}
                style={disabled ? undefined : { color: "#ffffff" }}
              >
                <Plus size={14} className="stroke-[3px]" />
              </button>
            </motion.div>
          ) : (
            <motion.button
              layoutId={`add-button-${item?.id}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, type: "spring", damping: 20, stiffness: 300 }}
              onClick={(e) => {
                e.stopPropagation()
                if (!disabled) {
                  onUpdateQuantity?.(item, 1, e)
                }
              }}
              disabled={disabled}
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white border font-bold px-6 py-1.5 rounded-lg shadow-md flex items-center gap-1 transition-colors ${
                disabled ? "border-gray-300 text-gray-400 cursor-not-allowed opacity-50" : "text-white"
              }`}
              style={
                disabled
                  ? undefined
                  : { borderColor: BRAND_THEME.colors.brand.primary, background: BRAND_THEME.gradients.primary }
              }
            >
              ADD <Plus size={14} className="stroke-[3px]" />
            </motion.button>
          )
        ) : null}
      </div>
    </div>
  )
}
