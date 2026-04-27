import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings";

const DEFAULT_MESSAGE = {
  badge: "WE WILL BE LIVE SOON",
  heading: "Store is Closed",
  paragraph: "Currently undergoing maintenance",
};

const resolveTargetApp = (pathname = "") => {
  if (pathname.startsWith("/food/delivery")) return "deliveryApp";
  if (pathname.startsWith("/food/restaurant")) return "restaurantApp";
  return "userApp";
};

export default function AppMaintenanceOverlay() {
  const location = useLocation();
  const [settings, setSettings] = useState(() => getCachedSettings() || null);

  useEffect(() => {
    let active = true;

    const applyCachedSettings = () => {
      if (!active) return;
      const cached = getCachedSettings();
      if (cached) setSettings(cached);
    };

    applyCachedSettings();
    loadBusinessSettings()
      .then((fresh) => {
        if (!active || !fresh) return;
        setSettings(fresh);
      })
      .catch(() => {});

    window.addEventListener("businessSettingsUpdated", applyCachedSettings);
    return () => {
      active = false;
      window.removeEventListener("businessSettingsUpdated", applyCachedSettings);
    };
  }, []);

  const activeConfig = useMemo(() => {
    const targetApp = resolveTargetApp(location.pathname || "");
    return settings?.maintenanceModes?.[targetApp] || null;
  }, [location.pathname, settings]);

  const enabled = Boolean(activeConfig?.enabled);
  if (!enabled) return null;

  const heading = String(activeConfig?.heading || DEFAULT_MESSAGE.heading).trim() || DEFAULT_MESSAGE.heading;
  const paragraph = String(activeConfig?.paragraph || DEFAULT_MESSAGE.paragraph).trim() || DEFAULT_MESSAGE.paragraph;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[1300] bg-[#970a2d] text-white border-b border-white/10">
        <div className="mx-auto max-w-[1200px] px-3 py-2.5">
          <div className="flex flex-col items-center justify-center gap-1.5 text-center sm:flex-row sm:flex-wrap sm:gap-3">
            <span className="inline-flex items-center rounded-full border border-white/40 bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wide whitespace-nowrap">
              {DEFAULT_MESSAGE.badge}
            </span>
            <div className="min-w-0 flex flex-col items-center gap-1 pb-0.5 text-center sm:flex-row sm:items-center sm:gap-2 sm:pb-0">
              <p className="text-sm font-bold leading-tight break-words">{heading}</p>
              <span className="hidden text-white/70 sm:inline">|</span>
              <p className="text-xs sm:text-sm text-white/90 leading-tight break-words">{paragraph}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="fixed inset-0 z-[1290] bg-slate-900/20 backdrop-blur-[2.5px]" />
    </>
  );
}
