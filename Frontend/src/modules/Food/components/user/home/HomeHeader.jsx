import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Navigation,
  ChevronDown,
  Search,
  Bookmark,
  Bell,
  BellOff,
  X,
  Pizza,
  Beef,
  ChefHat,
  Soup,
  Coffee,
  ShoppingCart,
} from "lucide-react";
import { Switch } from "@food/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@food/components/ui/popover";
import { Badge } from "@food/components/ui/badge";
import foodPattern from "@food/assets/food_pattern_background.png";
import useNotificationInbox from "@food/hooks/useNotificationInbox";
import { useCart } from "@food/context/CartContext";
import BRAND_THEME from "@/config/brandTheme";

const normalizeHex = (hex, fallback = "#8e24aa") => {
  const value = String(hex || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
};

const withAlpha = (hex, alpha) => {
  const value = normalizeHex(hex).slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const quickTheme = (baseColor) => {
  const base = normalizeHex(baseColor, "#67c6f5");
  return {
    topBg: `linear-gradient(140deg, ${withAlpha(base, 0.96)} 0%, ${withAlpha(base, 0.78)} 100%)`,
    accent: base,
    text: "#ffffff",
    activeBg: "#ffffff",
    activeText: base,
    inactiveBg: withAlpha("#ffffff", 0.18),
    inactiveBorder: withAlpha("#ffffff", 0.2),
  };
};

const foodTheme = {
  topBg: "transparent",
  accent: BRAND_THEME.colors.brand.primary,
  text: "#ffffff",
  activeBg: "#ffffff",
  activeText: BRAND_THEME.colors.brand.primary,
  inactiveBg: "rgba(255,255,255,0.14)",
  inactiveBorder: "rgba(255,255,255,0.12)",
};

export default function HomeHeader({
  activeTab,
  setActiveTab,
  location,
  savedAddressText,
  handleLocationClick,
  handleSearchFocus,
  placeholderIndex,
  placeholders,
  vegMode = false,
  onVegModeChange,
  showVegMode = true,
  bannerContent,
  quickThemeColor,
  compact = false,
  scrolledHeaderColor = "",
}) {
  const [notifications, setNotifications] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("food_user_notifications");
    return saved ? JSON.parse(saved) : [];
  });
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    dismiss: dismissBroadcastNotification,
  } = useNotificationInbox("user", { limit: 20 });
  const { getCartCount } = useCart();

  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem("food_user_notifications");
      setNotifications(saved ? JSON.parse(saved) : []);
    };
    window.addEventListener("notificationsUpdated", sync);
    return () => window.removeEventListener("notificationsUpdated", sync);
  }, []);

  const theme = activeTab === "quick" ? quickTheme(quickThemeColor) : foodTheme;
  const isFood = activeTab === "food";
  const isScrolledFoodHeader = isFood && Boolean(compact);
  const stickyFoodBackground =
    compact && isFood
      ? scrolledHeaderColor || "transparent"
      : "transparent";
  const locationTitle =
    savedAddressText || location?.area || location?.city || "Select Location";
  const locationSubtitle =
    location?.address || location?.city || "Tap to choose delivery location";
  const headerTextClass = isScrolledFoodHeader ? "text-slate-900 dark:text-white" : "text-white";
  const headerSubtleTextClass = isScrolledFoodHeader ? "text-slate-500 dark:text-slate-400" : "text-white/80";
  const floatingIconButtonClass = isScrolledFoodHeader
    ? "bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10"
    : "bg-black/18 border border-white/18";
  const floatingIconClass = isScrolledFoodHeader ? "text-slate-700 dark:text-white" : "text-white";
  const { brand, semantic } = BRAND_THEME.colors;
  const { header, searchOverlay } = BRAND_THEME.tokens;

  const mergedNotifications = useMemo(() => {
    const localItems = Array.isArray(notifications)
      ? notifications.map((item) => ({ ...item, source: "local" }))
      : [];
    const remoteItems = (broadcastNotifications || []).map((item) => ({
      ...item,
      id: item.id || item._id,
      source: "broadcast",
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "Just now",
    }));
    return [...remoteItems, ...localItems].sort(
      (a, b) =>
        new Date(b.createdAt || b.timestamp || 0).getTime() -
        new Date(a.createdAt || a.timestamp || 0).getTime(),
    );
  }, [broadcastNotifications, notifications]);

  const unreadCount =
    notifications.filter((item) => !item.read).length + broadcastUnreadCount;
  const cartCount = getCartCount();

  const removeNotification = (id, source) => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id);
      return;
    }
    setNotifications((prev) => {
      const next = prev.filter((item) => item.id !== id);
      localStorage.setItem("food_user_notifications", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("notificationsUpdated"));
      return next;
    });
  };

  return (
    <motion.div
      className={`relative overflow-hidden transition-all duration-700 ${
        isFood ? (compact ? "min-h-[96px]" : "min-h-[450px]") : "min-h-[90px]"
      }`}
      style={{
        background: isFood ? stickyFoodBackground : theme.topBg,
        color: isScrolledFoodHeader
          ? BRAND_THEME.colors.neutral.textPrimary
          : theme.text,
      }}
    >
      {isFood && !compact && bannerContent && (
        <div className="absolute inset-0 z-0 flex justify-center overflow-hidden">
          {bannerContent}
          <div className="absolute inset-0 bg-gradient-to-b from-[#7f2d25]/88 via-[#7f2d25]/18 via-[28%] to-black/22" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/16" />
        </div>
      )}

      {!compact && (
        <div
          className="absolute inset-0 z-[1] opacity-[0.1] pointer-events-none"
          style={{
            backgroundImage: `url(${foodPattern})`,
            backgroundSize: "200px",
            backgroundRepeat: "repeat",
            mixBlendMode: "soft-light",
            color: brand.primary,
          }}
        />
      )}

      {isFood && !compact && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Pizza className="absolute top-10 right-[15%] opacity-[0.10]" size={64} style={{ color: brand.primary }} />
          <Beef className="absolute top-40 left-[10%] opacity-[0.08]" size={80} style={{ color: brand.primary }} />
          <ChefHat className="absolute bottom-[20%] right-[20%] opacity-[0.08]" size={56} style={{ color: brand.primary }} />
          <Coffee className="absolute top-20 left-[30%] opacity-[0.08]" size={48} style={{ color: brand.primary }} />
          <Soup className="absolute bottom-[40%] left-[5%] opacity-[0.05]" size={72} style={{ color: brand.primary }} />
        </div>
      )}

      <div className="relative z-10 pt-0 pb-3">
        {isFood && !compact && <div className="absolute inset-0 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />}
        <div
          className={`rounded-none border-none px-3 pt-2 pb-3 backdrop-blur-[4px] ${
            compact
              ? "bg-transparent shadow-none"
              : isFood
                ? "bg-transparent shadow-none"
                : BRAND_THEME.tokens.homepage.header.heroOverlay
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-start gap-2 cursor-pointer flex-1 min-w-0" onClick={handleLocationClick}>
              {isFood ? (
                <>
                  <Navigation
                    className="h-[14px] w-[14px] rotate-[15deg] mt-[5px] shrink-0"
                    style={{ color: theme.accent, fill: theme.accent }}
                    strokeWidth={2.5}
                  />
                  <div className="flex min-w-0 max-w-[190px] flex-col">
                    <div className="flex items-center gap-[3px]">
                      <span className={`truncate text-[16px] font-extrabold tracking-[-0.3px] ${headerTextClass}`}>
                        {locationTitle}
                      </span>
                      <ChevronDown className={`h-[14px] w-[14px] shrink-0 opacity-80 ${headerTextClass}`} strokeWidth={3} />
                    </div>
                    <span className={`max-w-[190px] truncate text-[11px] font-medium ${headerSubtleTextClass}`}>
                      {locationSubtitle}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col min-w-0">
                  <span className="text-[22px] font-black tracking-tighter leading-none mb-1">15 mins</span>
                  <span className={`text-[11px] font-bold truncate opacity-80 ${headerTextClass}`}>To {locationTitle}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`relative h-[38px] w-[38px] rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.12)] backdrop-blur-[6px] ${floatingIconButtonClass}`}
                  >
                    <Bell className={`h-[18px] w-[18px] ${floatingIconClass}`} />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-yellow-400 border border-white" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0 overflow-hidden border-none shadow-2xl rounded-2xl mt-2" align="end">
                  <div className={searchOverlay.headerSurface}>
                    <div className={`p-4 border-b ${searchOverlay.headerBorder} flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50`}>
                      <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        Notifications
                        {unreadCount > 0 && (
                          <Badge variant="secondary" className="border-none text-[10px] h-4" style={{ backgroundColor: `${BRAND_THEME.colors.brand.primary}1a`, color: BRAND_THEME.colors.brand.primary }}>
                            {unreadCount} New
                          </Badge>
                        )}
                      </h3>
                      <Link to="/food/user/notifications" className="text-xs font-bold" style={{ color: BRAND_THEME.colors.brand.primary }}>
                        {mergedNotifications.length > 0 ? "View All" : ""}
                      </Link>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {mergedNotifications.length > 0 ? (
                        mergedNotifications.slice(0, 5).map((item) => (
                          <div key={item.id} className="p-4 flex items-start gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <div className="mt-1 p-2 rounded-full" style={{ backgroundColor: `${BRAND_THEME.colors.brand.primary}1a`, color: BRAND_THEME.colors.brand.primary }}>
                              <Bell className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.title}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{item.time}</span>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      removeNotification(item.id, item.source);
                                    }}
                                    className="rounded-full p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">{item.message}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center flex flex-col items-center gap-2">
                          <BellOff className="h-10 w-10 text-slate-200 dark:text-slate-700" />
                          <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">All caught up!</p>
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Link
                to="/cart"
                className={`relative flex h-[38px] w-[38px] items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.12)] backdrop-blur-[6px] ${floatingIconButtonClass}`}
              >
                <ShoppingCart className={`h-[18px] w-[18px] ${floatingIconClass}`} strokeWidth={2.2} />
                {cartCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 py-[1px] text-center text-[10px] font-bold leading-none text-white"
                    style={{ backgroundColor: BRAND_THEME.tokens.homepage.header.cartBadgeBackground }}
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-[12px] h-[46px] flex items-center px-3 cursor-pointer relative overflow-hidden bg-white dark:bg-gray-800 shadow-[0_6px_18px_rgba(15,23,42,0.10)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.3)]"
            onClick={handleSearchFocus}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-[2.5px] rounded-l-[12px]"
              style={{ background: `linear-gradient(180deg, ${brand.primary} 0%, ${brand.primaryDark} 100%)` }}
            />
            <Search className="h-[16px] w-[16px] ml-1.5 mr-2 flex-shrink-0" strokeWidth={2.3} style={{ color: header.searchIcon }} />
            <div className="flex-1 overflow-hidden relative h-[20px]">
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholderIndex}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 whitespace-nowrap leading-[22px] text-[12.5px] font-medium text-slate-400 dark:text-slate-500"
                >
                  {placeholders?.[placeholderIndex] || "Search for food..."}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {isFood && showVegMode ? (
            <div
              onClick={() => onVegModeChange?.(!vegMode)}
              className="h-[46px] min-w-[54px] px-1 flex flex-col items-center justify-center cursor-pointer"
            >
              <span className="text-[10px] font-black tracking-[0.4px] mb-1 leading-none" style={{ color: semantic.veg }}>VEG MODE</span>
              <div className="scale-[0.82]">
                <Switch
                  checked={vegMode}
                  onCheckedChange={() => {}}
                  className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-400 pointer-events-none"
                />
              </div>
            </div>
          ) : isFood ? (
            <div className="w-[52px] shrink-0" aria-hidden="true" />
          ) : (
            <button
              type="button"
              className="rounded-[16px] h-[52px] w-[52px] flex items-center justify-center shadow-xl bg-white"
            >
              <Bookmark className="h-[22px] w-[22px]" style={{ color: theme.accent }} />
            </button>
          )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
