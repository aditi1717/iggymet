import { Link } from "react-router-dom"
import { useState, useEffect } from "react"

import { ArrowLeft, ArrowRight, Heart, Users, Shield, Clock, Star, Award, FileText, Lock, Loader2, Receipt, Truck, XCircle } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import quickSpicyLogo from "@food/assets/quicky-spicy-logo.png"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import BRAND_THEME from "@/config/brandTheme"

// Icon mapping
const iconMap = {
  Heart,
  Users,
  Shield,
  Clock,
  Star,
  Award
}

export default function About() {
  const companyName = useCompanyName()
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState(null)
  const [aboutData, setAboutData] = useState({
    appName: '',
    version: '',
    description: '',
    logo: '',
    features: [],
    stats: []
  })

  useEffect(() => {
    fetchAboutData()
    loadLogo()

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      if (cached?.logo?.url) {
        setLogoUrl(cached.logo.url)
      }
    }
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
  }, [])

  const loadLogo = async () => {
    const cached = getCachedSettings()
    if (cached?.logo?.url) {
      setLogoUrl(cached.logo.url)
    } else {
      const settings = await loadBusinessSettings()
      if (settings?.logo?.url) {
        setLogoUrl(settings.logo.url)
      }
    }
  }

  const fetchAboutData = async () => {
    try {
      setLoading(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.ABOUT_PUBLIC)
      if (response.data.success) {
        setAboutData(response.data.data || {})
      }
    } catch (error) {
      setAboutData({})
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white dark:from-[#0a0a0a] dark:to-[#1a1a1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-[#005128]" />
          <p className="text-sm text-gray-500">Loading About…</p>
        </div>
      </div>
    )
  }

  const displayAppName = (aboutData.appName || companyName || "About").replace(/appzeto/gi, "Iggymet")
  const normalizeLogo = () => {
    const candidate = logoUrl || aboutData.logo?.url || aboutData.logo
    if (candidate && typeof candidate === "string" && candidate.trim().startsWith("http")) {
      return candidate.trim()
    }
    return quickSpicyLogo
  }
  const heroLogo = normalizeLogo()

  return (
    <AnimatedPage className={`min-h-screen ${BRAND_THEME.tokens.profile.pageBackground}`}>
      <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-10 space-y-6 md:space-y-8 lg:space-y-10">
        {/* Header */}
        <div className="flex items-center gap-3 md:gap-4 mb-2 md:mb-0">
          <Link to="/food/user/profile">
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10 p-0 hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-gray-900 dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">About</h1>
        </div>

        {/* App Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-lg border-0 dark:border-gray-800 mb-6 overflow-hidden">
            <div className="bg-gradient-to-br from-brand-50 to-slate-50 dark:from-brand-950/20 dark:to-slate-900/20 pt-10 pb-12 px-9 md:pt-14 md:pb-15 md:px-12 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="flex justify-center mb-0"
              >
                <div className="relative p-4 md:p-5 lg:p-6">
                  <div className="absolute inset-0 bg-[#005128] rounded-2xl blur-3xl opacity-0 animate-pulse" />
                  <div className="relative bg-transparent dark:bg-transparent rounded-2xl p-4 md:p-5 lg:p-6 shadow-none">
                    <img
                      src={heroLogo}
                      alt={`${displayAppName} Logo`}
                      className="h-20 w-20 md:h-24 md:w-24 lg:h-28 lg:w-28 object-contain"
                      onError={(e) => {
                        if (e.target.src !== quickSpicyLogo) {
                          e.target.src = quickSpicyLogo
                        }
                      }}
                    />
                  </div>
                </div>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-2"
              >
                {displayAppName}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-gray-600 dark:text-gray-400 text-sm md:text-base mb-4"
              >
                {aboutData.version ? `Version ${aboutData.version}` : " "}
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="text-gray-700 dark:text-gray-300 leading-relaxed text-base md:text-lg max-w-2xl mx-auto"
              >
                {aboutData.description
                  ? aboutData.description
                  : "This page will appear once the admin adds About content."}
              </motion.p>
            </div>
          </Card>
        </motion.div>

        {/* Features Grid */}
        {aboutData.features && aboutData.features.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4 md:gap-6 mb-6"
          >
            {aboutData.features.map((feature, index) => {
              const IconComponent = iconMap[feature.icon] || Heart
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 + index * 0.1, duration: 0.3 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-md border-0 dark:border-gray-800 hover:shadow-xl transition-shadow duration-300 h-full">
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-center gap-3">
                        <div className={`${feature.bgColor} rounded-lg p-2.5 flex-shrink-0`}>
                          <IconComponent className={`h-5 w-5 md:h-6 md:w-6 ${feature.color}`} />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {feature.title}
                          </h3>
                          <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {/* Legal Links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        >
          <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-md border-0 dark:border-gray-800">
            <CardContent className="p-5 md:p-6">
              <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                Legal Information
              </h3>
              <div className="space-y-3">
                <Link
                  to="/food/user/profile/terms"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-medium text-gray-900 dark:text-white group-hover:text-[#005128] dark:group-hover:text-brand-400 transition-colors">
                      Terms and Conditions
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      Read our terms and conditions
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                </Link>

                <Link
                  to="/food/user/profile/privacy"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <Lock className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-medium text-gray-900 dark:text-white group-hover:text-[#005128] dark:group-hover:text-brand-400 transition-colors">
                      Privacy Policy
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      Learn how we protect your data
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                </Link>

                <Link
                  to="/food/user/profile/refund"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <Receipt className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-medium text-gray-900 dark:text-white group-hover:text-[#005128] dark:group-hover:text-brand-400 transition-colors">
                      Refund Policy
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      Read our refund terms and conditions
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                </Link>

                <Link
                  to="/food/user/profile/shipping"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <Truck className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-medium text-gray-900 dark:text-white group-hover:text-[#005128] dark:group-hover:text-brand-400 transition-colors">
                      Shipping Policy
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      Learn about our shipping terms
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                </Link>

                <Link
                  to="/food/user/profile/cancellation"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <XCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-medium text-gray-900 dark:text-white group-hover:text-[#005128] dark:group-hover:text-brand-400 transition-colors">
                      Cancellation Policy
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      Read our cancellation terms and conditions
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Footer Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.5 }}
          className="text-center mt-8 mb-4"
        >
          <p className="text-sm text-gray-500 dark:text-gray-500">
            © {new Date().getFullYear()} {companyName || "Iggymet"}. All rights reserved.
          </p>
        </motion.div>
      </div>
    </AnimatedPage>
  )
}

