import { Link, useNavigate } from "react-router-dom"
import { useState, useEffect } from "react"
import { ArrowLeft, FileText, Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import api from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { API_ENDPOINTS } from "@food/api/config"
import BRAND_THEME from "@/config/brandTheme"

export default function Terms() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const [loading, setLoading] = useState(true)
  const [termsData, setTermsData] = useState({
    title: 'Terms of Service',
    content: ''
  })

  useEffect(() => {
    fetchTermsData()
  }, [])

  const fetchTermsData = async () => {
    try {
      setLoading(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.TERMS_PUBLIC)
      if (response.data.success) {
        setTermsData(response.data.data || { title: 'Terms of Service', content: '' })
      }
    } catch (error) {
      console.error('Error fetching terms data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate('/food/user/profile/about')
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${BRAND_THEME.tokens.profile.pageBackground} flex items-center justify-center p-6`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin" style={{ color: BRAND_THEME.tokens.profile.avatarBackground }} />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AnimatedPage className={`min-h-screen ${BRAND_THEME.tokens.profile.pageBackground} pb-10`}>
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b ${BRAND_THEME.tokens.profile.pageBackground} ${BRAND_THEME.tokens.profile.border}`}>
        <div className="max-w-4xl mx-auto px-4 h-16 md:h-20 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="h-10 w-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-900 transition-all active:scale-95"
          >
            <ArrowLeft className="h-6 w-6 text-gray-900 dark:text-white" />
          </Button>
          <div className="flex-1">
             <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
               {termsData.title || "Terms of Service"}
             </h1>
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Iggymet Policy</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${BRAND_THEME.tokens.profile.surface} rounded-[2rem] p-6 md:p-10 shadow-sm border ${BRAND_THEME.tokens.profile.border}`}
        >
          {termsData.content ? (
            <div
              className="prose prose-slate dark:prose-invert max-w-none
                prose-headings:font-black prose-headings:text-gray-900 dark:prose-headings:text-white
                prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
                prose-strong:text-gray-900 dark:prose-strong:text-white
                prose-li:text-gray-600 dark:prose-li:text-gray-400"
              style={{ '--tw-prose-links': BRAND_THEME.colors.brand.primary, '--tw-prose-invert-links': BRAND_THEME.colors.brand.primary }}
              dangerouslySetInnerHTML={{ __html: termsData.content }}
            />
          ) : (
            <div className="text-center py-20">
               <FileText className="w-16 h-16 text-gray-100 dark:text-gray-800 mx-auto mb-4" />
               <p className="text-gray-400 font-medium">No content available at the moment.</p>
            </div>
          )}
        </motion.div>

        <p className="text-center mt-10 text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] leading-relaxed">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} <br />
          ? {new Date().getFullYear()} Iggymet. All Rights Reserved.
        </p>
      </div>
    </AnimatedPage>
  )
}




