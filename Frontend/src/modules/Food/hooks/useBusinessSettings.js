import { useState, useEffect } from 'react';
import { loadBusinessSettings, getCachedSettings } from '@food/utils/businessSettings';
import BRAND_THEME from "@/config/brandTheme";

/**
 * Custom hook to get business settings
 * @returns {Object} Business settings including logo, company name, favicon
 */
export const useBusinessSettings = () => {
  const [settings, setSettings] = useState(() => {
    return getCachedSettings() || {
      companyName: BRAND_THEME.brandName,
      logo: { url: "" },
      favicon: { url: "" }
    };
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const fetched = await loadBusinessSettings();
        if (fetched) {
          setSettings(fetched);
        }
      } catch (error) {
        console.warn('Failed to load business settings:', error);
      }
    };

    fetchSettings();

    const handleSettingsUpdate = () => {
      const updated = getCachedSettings();
      if (updated) {
        setSettings(updated);
      }
    };

    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
    };
  }, []);

  return settings;
};
