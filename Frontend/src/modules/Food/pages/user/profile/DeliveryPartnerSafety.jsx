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
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          <p className="text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9 rounded-full hover:bg-gray-100 transition-all active:scale-95"
          >
            <ArrowLeft className="h-5 w-5 text-gray-900" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              {pageData.title || DEFAULT_TITLE}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {pageData.content ? (
          <div
            className="prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: pageData.content }}
          />
        ) : (
          <p className="text-gray-600">No safety content available at the moment.</p>
        )}
      </div>
    </div>
  )
}
