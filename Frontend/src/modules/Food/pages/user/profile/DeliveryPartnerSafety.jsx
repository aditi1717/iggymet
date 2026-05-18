import { useEffect, useState } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@food/components/ui/button"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"

const DEFAULT_TITLE = "Delivery Partner Safety"

export default function DeliveryPartnerSafety() {
  const goBack = useAppBackNavigation()
  const [loading, setLoading] = useState(true)
  const [pageData, setPageData] = useState({
    title: DEFAULT_TITLE,
    content: "",
  })

  useEffect(() => {
    const fetchPage = async () => {
      try {
        setLoading(true)
        const response = await api.get(API_ENDPOINTS.ADMIN.DELIVERY_SAFETY_PUBLIC)
        if (response.data.success) {
          setPageData(response.data.data || { title: DEFAULT_TITLE, content: "" })
        }
      } catch {
        setPageData({ title: DEFAULT_TITLE, content: "" })
      } finally {
        setLoading(false)
      }
    }
    fetchPage()
  }, [])

  const handleBack = () => {
    goBack()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex items-center justify-center p-6 transition-colors duration-200">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600 dark:text-gray-400" />
          <p className="text-gray-600 dark:text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white transition-colors duration-200">
      <div className="sticky top-0 z-40 bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95"
          >
            <ArrowLeft className="h-5 w-5 text-gray-900 dark:text-white" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {pageData.title || DEFAULT_TITLE}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {pageData.content ? (
          <div
            className="prose prose-slate dark:prose-invert max-w-none text-gray-900 dark:text-white"
            dangerouslySetInnerHTML={{ __html: pageData.content }}
          />
        ) : (
          <p className="text-gray-600 dark:text-gray-400">No safety content available at the moment.</p>
        )}
      </div>
    </div>
  )
}
