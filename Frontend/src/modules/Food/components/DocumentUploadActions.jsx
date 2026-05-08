import React from "react"
import { Camera, Upload } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { openCamera } from "@food/utils/imageUploadUtils"

/**
 * Reusable component for document uploads that provides direct buttons 
 * for both Gallery and Camera access on the page.
 */
export default function DocumentUploadActions({ 
  onFileSelect, 
  fileNamePrefix = "upload", 
  galleryInputRef 
}) {
  const handleCamera = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    await openCamera({
      onSelectFile: onFileSelect,
      fileNamePrefix: fileNamePrefix
    })
  }

  const handleGallery = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (galleryInputRef?.current) {
      galleryInputRef.current.click()
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 mt-2">
      <Button
        type="button"
        variant="outline"
        className="flex flex-col items-center justify-center h-16 border-dashed border-gray-300 hover:bg-gray-50 hover:border-brand-300 transition-all group bg-white"
        onClick={handleGallery}
      >
        <Upload className="w-5 h-5 mb-1 text-brand-600 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] font-medium text-gray-700">Upload Gallery</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="flex flex-col items-center justify-center h-16 border-dashed border-gray-300 hover:bg-gray-50 hover:border-orange-300 transition-all group bg-white"
        onClick={handleCamera}
      >
        <Camera className="w-5 h-5 mb-1 text-orange-600 group-hover:scale-110 transition-transform" />
        <span className="text-[10px] font-medium text-gray-700">Use Camera</span>
      </Button>
    </div>
  )
}
