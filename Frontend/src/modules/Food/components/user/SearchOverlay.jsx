import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { X, Search, Clock, Loader2 } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { searchAPI } from "@/services/api"
import BRAND_THEME from "@/config/brandTheme"

const SEARCH_HISTORY_KEY = "user_recent_searches_v1"

export default function SearchOverlay({ isOpen, onClose, searchValue, onSearchChange }) {
  const { searchOverlay } = BRAND_THEME.tokens
  const { brand } = BRAND_THEME.colors
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [filteredFoods, setFilteredFoods] = useState([])
  const [recentSuggestions, setRecentSuggestions] = useState([])
  const [loadingFoods, setLoadingFoods] = useState(false)
  const searchRequestIdRef = useRef(0)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const loadRecentSuggestions = () => {
      try {
        const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed)) {
          setRecentSuggestions(parsed.filter((item) => typeof item === "string" && item.trim()).slice(0, 8))
          return
        }
      } catch {
        // Ignore parse errors.
      }
      setRecentSuggestions([])
    }

    loadRecentSuggestions()
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return

    const term = searchValue.trim()
    if (!term) {
      setFilteredFoods([])
      setLoadingFoods(false)
      return
    }

    const requestId = ++searchRequestIdRef.current
    const timer = setTimeout(async () => {
      setLoadingFoods(true)
      try {
        const res = await searchAPI.unifiedSearch({ q: term, limit: 60 })
        const restaurants = res?.data?.data?.restaurants || []
        const normalizedFoods = restaurants
          .map((item, index) => {
            if (item?.matchType === "food" && item?.matchedDish) {
              return {
                id: item?.matchedDishId || `${item?._id || "restaurant"}-dish-${index}`,
                name: String(item.matchedDish).trim(),
                image: item?.matchedDishImage || item?.image || item?.profileImage || "",
              }
            }

            if (item?.restaurantName) {
              return {
                id: item?._id || `restaurant-${index}`,
                name: String(item.restaurantName).trim(),
                image: item?.image || item?.profileImage || "",
              }
            }

            return null
          })
          .filter(Boolean)

        if (searchRequestIdRef.current === requestId) {
          setFilteredFoods(normalizedFoods)
        }
      } catch {
        if (searchRequestIdRef.current === requestId) {
          setFilteredFoods([])
        }
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setLoadingFoods(false)
        }
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [isOpen, searchValue])

  const saveRecentSearch = (term) => {
    const value = String(term || "").trim()
    if (!value) return

    setRecentSuggestions((prev) => {
      const next = [value, ...prev.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8)
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleSuggestionClick = (suggestion) => {
    onSearchChange(suggestion)
    inputRef.current?.focus()
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchValue.trim()) {
      saveRecentSearch(searchValue)
      navigate(`/food/user/search?q=${encodeURIComponent(searchValue.trim())}`)
      onClose()
      onSearchChange("")
    }
  }

  const handleFoodClick = (food) => {
    saveRecentSearch(food.name)
    navigate(`/food/user/search?q=${encodeURIComponent(food.name)}`)
    onClose()
    onSearchChange("")
  }

  if (!isOpen) return null

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col ${searchOverlay.surface}`}
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* Header with Search Bar */}
      <div className={`flex-shrink-0 ${searchOverlay.headerSurface} border-b ${searchOverlay.headerBorder} shadow-sm`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 z-10" style={{ color: searchOverlay.searchIcon }} />
              <Input
                ref={inputRef}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search for food, restaurants..."
                className={`pl-12 pr-4 h-12 w-full ${searchOverlay.inputSurface} ${searchOverlay.inputBorder} focus:border-[var(--brand-search-focus)] rounded-full text-lg dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500`}
                style={{ "--brand-search-focus": searchOverlay.inputFocusBorder }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className={`rounded-full ${searchOverlay.closeHover}`}
            >
              <X className={`h-5 w-5 ${searchOverlay.closeIcon}`} />
            </Button>
          </form>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 scrollbar-hide ${searchOverlay.surface}`}>
        {/* Suggestions Row */}
        <div
          className="mb-6"
          style={{
            animation: 'slideDown 0.3s ease-out 0.1s both'
          }}
        >
          <h3 className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: brand.primary }} />
            Recent Searches
          </h3>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            {recentSuggestions.slice(0, 8).map((suggestion, index) => (
              <button
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full transition-all duration-200 text-xs sm:text-sm font-medium shadow-sm hover:shadow-md ${searchOverlay.recentChip}`}
                style={{
                  animation: `scaleIn 0.3s ease-out ${0.1 + index * 0.02}s both`
                }}
              >
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" style={{ color: brand.primary }} />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Food Grid */}
        <div
          style={{
            animation: 'fadeIn 0.3s ease-out 0.2s both'
          }}
        >
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
            {searchValue.trim() === "" ? "Search Results (0)" : `Search Results (${filteredFoods.length})`}
          </h3>
          {filteredFoods.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
              {filteredFoods.map((food, index) => (
                <div
                  key={food.id}
                  className="flex flex-col items-center gap-2 sm:gap-3 cursor-pointer group"
                  style={{
                    animation: `slideUp 0.3s ease-out ${0.25 + 0.05 * (index % 12)}s both`
                  }}
                  onClick={() => handleFoodClick(food)}
                >
                  <div className={`relative w-full aspect-square rounded-full overflow-hidden transition-all duration-200 shadow-md group-hover:shadow-lg ${searchOverlay.cardSurface} p-1 sm:p-1.5`}>
                    {food.image ? (
                      <img
                        src={food.image}
                        alt={food.name}
                        className="w-full h-full object-cover rounded-full"
                        loading="lazy"
                      />
                    ) : (
                      <div className={`w-full h-full rounded-full ${searchOverlay.placeholderSurface} flex items-center justify-center`}>
                        <Search className={`h-5 w-5 ${searchOverlay.placeholderIcon}`} />
                      </div>
                    )}
                  </div>
                  <div className="px-1 sm:px-2 text-center">
                    <span className={`text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 transition-colors line-clamp-2 ${searchOverlay.itemHoverText}`}>
                      {food.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 sm:py-16">
              {loadingFoods ? (
                <>
                  <Loader2 className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4 animate-spin" />
                  <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">Loading dishes from database...</p>
                </>
              ) : (
                <>
                  <Search className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">
                    {searchValue.trim() ? `No results found for "${searchValue}"` : "Search for dishes to see results"}
                  </p>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-500 mt-2">
                    {searchValue.trim() ? "Try a different search term" : "Start typing to search dishes"}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes scaleIn {
            from {
              opacity: 0;
              transform: scale(0.9);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
    </div>
  )
}
