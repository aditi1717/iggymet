import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, MapPin, TicketPercent } from "lucide-react";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { Button } from "@food/components/ui/button";
import { restaurantAPI } from "@food/api";
import { toast } from "sonner";

export default function Coupons() {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await restaurantAPI.getPublicOffers();
        const list = res?.data?.data?.allOffers || res?.data?.allOffers || [];
        if (!cancelled) {
          const visible = Array.isArray(list) ? list.filter((o) => o?.showInCart !== false) : [];
          setOffers(visible);
        }
      } catch {
        if (!cancelled) setOffers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedOffers = useMemo(() => {
    if (!Array.isArray(offers)) return [];
    return [...offers].sort((a, b) => String(a?.couponCode || "").localeCompare(String(b?.couponCode || "")));
  }, [offers]);

  const handleCopy = async (code) => {
    const value = String(code || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Coupon copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <AnimatedPage className={`min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]`}>
      <div className="max-w-md mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/food/user/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-black dark:text-white">Your coupons</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh] text-sm text-gray-600 dark:text-gray-400">Loading coupons...</div>
        ) : sortedOffers.length > 0 ? (
          <div className="space-y-3 pb-6">
            {sortedOffers.map((offer) => {
              const code = offer?.couponCode || "";
              const title = offer?.title || "";
              const restaurantName = offer?.restaurantName || "All Restaurants";
              const endDate = offer?.endDate ? new Date(offer.endDate) : null;
              const expiryText =
                endDate && !Number.isNaN(endDate.getTime()) ? `Valid till ${endDate.toLocaleDateString()}` : "No expiry";

              return (
                <div key={offer?.id || offer?.offerId || code} className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${BRAND_THEME.colors.brand.primary}14`, color: BRAND_THEME.colors.brand.primary }}>
                        <TicketPercent className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{code}</span>
                          {title && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">{title}</span>}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">{restaurantName}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">{expiryText}</p>
                      </div>
                    </div>

                    <Button type="button" variant="outline" className="h-9 px-3 rounded-xl" onClick={() => handleCopy(code)} style={{ borderColor: BRAND_THEME.colors.brand.primary, color: BRAND_THEME.colors.brand.primary }}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
            <div className="relative mb-8">
              <div className="relative w-64 h-64 sm:w-80 sm:h-80 mx-auto bg-gray-200 rounded-full flex items-center justify-center overflow-hidden shadow-inner">
                <div className="absolute left-12 top-16 z-20">
                  <MapPin className="h-7 w-7 text-[#FA0000] drop-shadow-lg" fill="currentColor" />
                </div>
                <div className="absolute right-12 top-20 z-20">
                  <MapPin className="h-7 w-7 text-[#FA0000] drop-shadow-lg" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="text-center space-y-3 max-w-sm">
              <h2 className="text-xl font-bold text-black">No coupons found</h2>
              <p className="text-sm text-gray-600 leading-relaxed">Discover hidden coupons on your map screen after placing an order</p>
            </div>
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
