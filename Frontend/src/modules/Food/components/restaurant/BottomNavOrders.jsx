import { useNavigate, useLocation } from "react-router-dom"
import { useMemo } from "react"
import { motion } from "framer-motion"
import {
  FileText,
  Package,
  MessageSquare,
  Compass,
} from "lucide-react"
import BRAND_THEME from "@/config/brandTheme"

const getOrdersTabs = (basePath = "/restaurant") => [
  { id: "orders", label: "Orders", icon: FileText, route: `${basePath}` },
  { id: "inventory", label: "Inventory", icon: Package, route: `${basePath}/inventory` },
  { id: "feedback", label: "Feedback", icon: MessageSquare, route: `${basePath}/feedback` },
  { id: "explore", label: "Explore", icon: Compass, route: `${basePath}/explore` },
]

const findActiveTab = (tabs, pathname) =>
  tabs
    .slice()
    .sort((a, b) => b.route.length - a.route.length)
    .find((tab) => pathname === tab.route || pathname.startsWith(tab.route + "/"))

const isExploreContextPath = (pathname = "", state) => {
  const normalizedPath = pathname.startsWith("/restaurant")
    ? `/food${pathname}`
    : pathname

  const fromPath = String(state?.from || "")
  const backToPath = String(state?.backTo || "")
  if (fromPath.includes("/restaurant/explore") || backToPath.includes("/restaurant/explore")) {
    return true
  }

  const exploreLinkedPrefixes = [
    "/food/restaurant/explore",
    "/food/restaurant/outlet-info",
    "/food/restaurant/outlet-timings",
    "/food/restaurant/coupon",
    "/food/restaurant/offers",
    "/food/restaurant/delivery-settings",
    "/food/restaurant/zone-setup",
    "/food/restaurant/help-centre/support",
    "/food/restaurant/share-feedback",
    "/food/restaurant/hub-finance",
    "/food/restaurant/update-bank-details",
  ]

  return exploreLinkedPrefixes.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  )
}

export default function BottomNavOrders() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pathname, state } = location

  const basePath = pathname.startsWith("/food/restaurant")
    ? "/food/restaurant"
    : pathname.startsWith("/restaurant")
    ? "/food/restaurant"
    : "/restaurant"

  const tabs = useMemo(() => getOrdersTabs(basePath), [basePath])

  const isInternalPage = pathname.includes("/create-offers")
  if (isInternalPage) {
    return null
  }

  const activeTab = useMemo(() => {
    const match = findActiveTab(tabs, pathname)
    if (match?.id) return match.id
    if (isExploreContextPath(pathname, state)) return "explore"
    return "orders"
  }, [tabs, pathname, state])

  const handleTabClick = (tab) => {
    if (tab.route && tab.route !== pathname) {
      navigate(tab.route)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-md items-end gap-2">
        <div className="flex-1 min-w-0">
          <div
            className="relative overflow-visible rounded-[30px] py-2 pl-3 pr-2 shadow-[0_16px_40px_rgba(41,121,251,0.28)]"
            style={{ background: BRAND_THEME.gradients.primary }}
          >
            <div className="relative flex items-end justify-around gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id

                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => handleTabClick(tab)}
                    aria-current={isActive ? "page" : undefined}
                    className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-visible rounded-full px-2 py-2"
                    whileTap={{ scale: 0.95 }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bottomNavActive"
                        className="absolute inset-0 -z-10 rounded-full bg-white/18"
                        initial={false}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    )}
                    <Icon
                      className={`relative z-10 h-[18px] w-[18px] transition-colors duration-300 ease-in-out ${
                        isActive ? "text-white" : "text-white/80"
                      }`}
                    />
                    <span
                      className={`relative z-10 whitespace-nowrap text-[11px] leading-none transition-colors duration-300 ease-in-out ${
                        isActive ? "text-white" : "text-white/80"
                      }`}
                    >
                      {tab.label}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

