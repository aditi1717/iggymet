import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { deliveryAPI, zoneAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"
import { openCamera, openGallery } from "@food/utils/imageUploadUtils"
import { DEFAULT_USER_AVATAR } from "@food/utils/profileAvatar"
import DocumentUploadActions from "@food/components/DocumentUploadActions"

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  vehicleType: "",
  vehicleName: "",
  vehicleNumber: "",
  drivingLicenseNumber: "",
  aadharNumber: "",
  panNumber: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
  bankName: "",
  upiId: "",
}

const DELIVERY_EDIT_FILES_DB = "DeliveryEditProfileFiles"
const DELIVERY_EDIT_FILES_STORE = "files"
const UPI_QR_DRAFT_KEY = "editDeliveryUpiQrCode"
const UPI_QR_EDITING_KEY = "deliveryEditBankDraftActive"
const PROFILE_PHOTO_DRAFT_KEY = "editDeliveryProfilePhoto"
const PROFILE_PHOTO_EDITING_KEY = "deliveryEditProfilePhotoDraftActive"

const isUploadableFile = (value) => {
  if (!value || typeof value !== "object") return false
  if (typeof File !== "undefined" && value instanceof File) return true
  if (typeof Blob !== "undefined" && value instanceof Blob) return true
  return (
    typeof value.size === "number" &&
    (typeof value.slice === "function" || typeof value.arrayBuffer === "function")
  )
}

const openDeliveryEditFilesDB = () =>
  new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DELIVERY_EDIT_FILES_DB, 1)
      request.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(DELIVERY_EDIT_FILES_STORE)) {
          db.createObjectStore(DELIVERY_EDIT_FILES_STORE)
        }
      }
      request.onsuccess = (e) => resolve(e.target.result)
      request.onerror = (e) => reject(e.target.error)
    } catch (err) {
      reject(err)
    }
  })

const saveEditFileToDB = async (key, file) => {
  if (!isUploadableFile(file) || typeof indexedDB === "undefined") return
  try {
    const db = await openDeliveryEditFilesDB()
    const tx = db.transaction(DELIVERY_EDIT_FILES_STORE, "readwrite")
    tx.objectStore(DELIVERY_EDIT_FILES_STORE).put(file, key)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"))
    })
  } catch {
    // Best-effort only. The live preview still works even if draft persistence fails.
  }
}

const getEditFileFromDB = async (key) => {
  if (typeof indexedDB === "undefined") return null
  try {
    const db = await openDeliveryEditFilesDB()
    const tx = db.transaction(DELIVERY_EDIT_FILES_STORE, "readonly")
    const request = tx.objectStore(DELIVERY_EDIT_FILES_STORE).get(key)
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

const deleteEditFileFromDB = async (key) => {
  if (typeof indexedDB === "undefined") return
  try {
    const db = await openDeliveryEditFilesDB()
    const tx = db.transaction(DELIVERY_EDIT_FILES_STORE, "readwrite")
    tx.objectStore(DELIVERY_EDIT_FILES_STORE).delete(key)
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error("IndexedDB delete failed"))
      tx.onabort = () => reject(tx.error || new Error("IndexedDB delete aborted"))
    })
  } catch {
    // Stale drafts can be overwritten next time.
  }
}

export const EditDeliveryBoy = () => {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const profilePhotoInputRef = useRef(null)
  const aadharInputRef = useRef(null)
  const panInputRef = useRef(null)
  const drivingInputRef = useRef(null)
  const upiQrInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState("")
  const [zones, setZones] = useState([])
  const [profile, setProfile] = useState(null)
  const [zoneId, setZoneId] = useState("")
  const [form, setForm] = useState(emptyForm)
  const [editingBasic, setEditingBasic] = useState(false)
  const [editingProfilePhoto, setEditingProfilePhoto] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(false)
  const [editingDocuments, setEditingDocuments] = useState(false)
  const [editingBank, setEditingBank] = useState(false)
  const [errors, setErrors] = useState({})
  const [upiQrPreviewUrl, setUpiQrPreviewUrl] = useState("")
  const [upiQrFile, setUpiQrFile] = useState(null)
  const [upiQrUploadState, setUpiQrUploadState] = useState("")
  const [profileImageRefreshKey, setProfileImageRefreshKey] = useState(0)
  const [profilePhotoFile, setProfilePhotoFile] = useState(null)
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState("")
  const [profilePhotoUploadState, setProfilePhotoUploadState] = useState("")

  const profileImageRawUrl = profile?.profileImage?.url || profile?.profilePhoto || null
  const profileImageVersion =
    profileImageRefreshKey ||
    profile?.profileImage?.updatedAt ||
    profile?.updatedAt ||
    ""
  const profileImageUrl = profileImageRawUrl
    ? `${profileImageRawUrl}${profileImageRawUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(profileImageVersion))}`
    : null
  const visibleProfileImageUrl = profilePhotoPreviewUrl || profileImageUrl || DEFAULT_USER_AVATAR
  const hasRealProfileImage = Boolean(profilePhotoPreviewUrl || profileImageUrl)
  const aadharNumber = profile?.documents?.aadhar?.number || profile?.aadharNumber || "Not added"
  const panNumber = profile?.documents?.pan?.number || profile?.panNumber || "Not added"
  const drivingNumber = profile?.documents?.drivingLicense?.number || profile?.drivingLicenseNumber || "Not added"
  const aadharPhotoUrl = profile?.documents?.aadhar?.document || null
  const panPhotoUrl = profile?.documents?.pan?.document || null
  const drivingPhotoUrl = profile?.documents?.drivingLicense?.document || null
  const getUpiQrUrl = (p) =>
    p?.documents?.bankDetails?.upiQrCode ||
    p?.upiQrCode ||
    p?.bankDetails?.upiQrCode ||
    null
  const upiQrUrl = getUpiQrUrl(profile)
  const visibleUpiQrUrl = upiQrPreviewUrl || upiQrUrl

  const selectedZoneLabel = useMemo(() => {
    const zone = zones.find((z) => String(z?._id || z?.id || "") === String(zoneId || ""))
    return zone?.zoneName || zone?.name || zone?.serviceLocation || "Unassigned"
  }, [zones, zoneId])

  const applyProfile = (p) => {
    setProfile(p)
    setZoneId(String(p?.zone?._id || p?.zoneId || ""))
    setForm({
      name: p?.name || "",
      phone: p?.phone || "",
      email: p?.email || "",
      address: p?.location?.addressLine1 || p?.address || "",
      city: p?.location?.city || p?.city || "",
      state: p?.location?.state || p?.state || "",
      vehicleType: p?.vehicle?.type || p?.vehicleType || "",
      vehicleName: p?.vehicle?.brand || p?.vehicleName || "",
      vehicleNumber: p?.vehicle?.number || p?.vehicleNumber || "",
      drivingLicenseNumber: p?.documents?.drivingLicense?.number || p?.drivingLicenseNumber || "",
      aadharNumber: p?.documents?.aadhar?.number || p?.aadharNumber || "",
      panNumber: p?.documents?.pan?.number || p?.panNumber || "",
      accountHolderName: p?.documents?.bankDetails?.accountHolderName || p?.bankAccountHolderName || "",
      accountNumber: p?.documents?.bankDetails?.accountNumber || p?.bankAccountNumber || "",
      ifscCode: p?.documents?.bankDetails?.ifscCode || p?.bankIfscCode || "",
      bankName: p?.documents?.bankDetails?.bankName || p?.bankName || "",
      upiId: p?.documents?.bankDetails?.upiId || p?.upiId || "",
    })
  }

  const refresh = async () => {
    const [profileRes, zoneRes] = await Promise.all([
      deliveryAPI.getProfile(),
      zoneAPI.getPublicZones(),
    ])
    const p =
      profileRes?.data?.data?.profile ||
      profileRes?.data?.data?.user ||
      profileRes?.data?.profile ||
      profileRes?.data?.user
    if (!p) throw new Error("Failed to load profile")
    const zoneList = zoneRes?.data?.data?.zones || zoneRes?.data?.zones || []
    setZones(Array.isArray(zoneList) ? zoneList : [])
    applyProfile(p)
    return p
  }

  useEffect(() => {
    let mounted = true
      ; (async () => {
        try {
          setLoading(true)
          await refresh()
          if (!mounted) return
          if (sessionStorage.getItem(UPI_QR_EDITING_KEY) === "true") {
            const draftFile = await getEditFileFromDB(UPI_QR_DRAFT_KEY)
            if (!mounted) return
            if (draftFile) {
              setEditingBank(true)
              setUpiQrFile(draftFile)
              setUpiQrPreviewUrl(URL.createObjectURL(draftFile))
              setUpiQrUploadState("selected")
            }
          }
          if (sessionStorage.getItem(PROFILE_PHOTO_EDITING_KEY) === "true") {
            const draftFile = await getEditFileFromDB(PROFILE_PHOTO_DRAFT_KEY)
            if (!mounted) return
            if (draftFile) {
              setEditingProfilePhoto(true)
              setProfilePhotoFile(draftFile)
              setProfilePhotoPreviewUrl(URL.createObjectURL(draftFile))
              setProfilePhotoUploadState("selected")
            }
          }
        } catch (e) {
          if (e?.response?.status === 401) {
            toast.error("Session expired. Please login again.")
            navigate("/food/delivery/login", { replace: true })
            return
          }
          toast.error("Failed to load profile")
        } finally {
          if (mounted) setLoading(false)
        }
    })()
    return () => { mounted = false }
  }, [navigate])

  useEffect(() => {
    return () => {
      if (upiQrPreviewUrl) URL.revokeObjectURL(upiQrPreviewUrl)
      if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl)
    }
  }, [profilePhotoPreviewUrl, upiQrPreviewUrl])

  const validateField = (key, value) => {
    let err = ""
    if (key === "name") {
      if (!value || value.trim().length < 3) err = "Name must be at least 3 characters"
    } else if (key === "phone") {
      if (!value || !/^\d{10}$/.test(value)) err = "Invalid 10-digit phone number"
    } else if (key === "email") {
      if (!value || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value)) err = "Invalid email format"
    } else if (key === "address") {
      if (!value || value.trim().length < 5) err = "Address is too short"
    } else if (key === "vehicleNumber") {
      const v = String(value || "").replace(/\s+/g, "").toUpperCase()
      if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,2}[0-9]{4}$/.test(v)) err = "Invalid format (e.g. MH12AB1234)"
    } else if (key === "aadharNumber") {
      if (value && !/^\d{12}$/.test(value)) err = "Aadhar must be 12 digits"
    } else if (key === "panNumber") {
      if (value && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(value.toUpperCase())) err = "Invalid PAN format"
    } else if (key === "accountNumber") {
      if (value && !/^\d{9,18}$/.test(value)) err = "Account number should be 9-18 digits"
    } else if (key === "ifscCode") {
      if (value && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.toUpperCase())) err = "Invalid IFSC"
    } else if (key === "upiId") {
      if (!value || !String(value).trim()) err = "UPI ID is required"
      else if (!/^[\w\.-]+@[\w\.-]+$/.test(value)) err = "Invalid UPI ID"
    }
    setErrors((prev) => ({ ...prev, [key]: err }))
    return err
  }

  const onInput = (key, value) => {
    let filtered = value
    // Only allow letters and spaces for name, city, state, bankName, accountHolderName
    if (["name", "city", "state", "bankName", "accountHolderName"].includes(key)) {
      filtered = value.replace(/[^a-zA-Z\s]/g, "")
    }
    // Only allow digits for phone, accountNumber, aadharNumber
    else if (["phone", "accountNumber", "aadharNumber"].includes(key)) {
      filtered = value.replace(/\D/g, "")
      if (key === "phone") filtered = filtered.slice(0, 10)
      if (key === "aadharNumber") filtered = filtered.slice(0, 12)
      if (key === "accountNumber") filtered = filtered.slice(0, 18)
    }
    // Force uppercase and allow alphanumeric for identifiers
    else if (["ifscCode", "panNumber", "vehicleNumber", "drivingLicenseNumber"].includes(key)) {
      filtered = value.toUpperCase().replace(/[^A-Z0-9]/g, "")
      if (key === "ifscCode") filtered = filtered.slice(0, 11)
      if (key === "panNumber") filtered = filtered.slice(0, 10)
    }

    setForm((prev) => ({ ...prev, [key]: filtered }))
    validateField(key, filtered)
  }

  const preserveCurrentScroll = () => {
    if (typeof window === "undefined") return
    const left = window.scrollX
    const top = window.scrollY
    requestAnimationFrame(() => window.scrollTo(left, top))
    setTimeout(() => window.scrollTo(left, top), 0)
  }

  const resetFromProfile = () => {
    if (profile) applyProfile(profile)
  }

  const handleReapprovalRedirect = (response, message = "Profile updated and sent for approval. Please login again after approval.") => {
    const requiresReapproval =
      response?.data?.data?.partner?.requiresReapproval ||
      response?.data?.data?.requiresReapproval ||
      false
    if (!requiresReapproval) return false
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    toast.success(message)
    navigate("/food/delivery/login", { replace: true })
    return true
  }

  const uploadSingleFile = async (field, file) => {
    if (!file) return
    preserveCurrentScroll()
    if (field === "profilePhoto") {
      if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl)
      setProfilePhotoFile(file)
      setProfilePhotoPreviewUrl(URL.createObjectURL(file))
      setProfilePhotoUploadState("selected")
      setEditingProfilePhoto(true)
      sessionStorage.setItem(PROFILE_PHOTO_EDITING_KEY, "true")
      saveEditFileToDB(PROFILE_PHOTO_DRAFT_KEY, file)
      toast.success("Profile photo selected. Tap Save to upload it.")
      return
    }
    if (field === "upiQrCode") {
      if (upiQrPreviewUrl) URL.revokeObjectURL(upiQrPreviewUrl)
      setUpiQrFile(file)
      setUpiQrPreviewUrl(URL.createObjectURL(file))
      setUpiQrUploadState("selected")
      setEditingBank(true)
      sessionStorage.setItem(UPI_QR_EDITING_KEY, "true")
      saveEditFileToDB(UPI_QR_DRAFT_KEY, file)
      preserveCurrentScroll()
      toast.success("UPI QR selected. Tap Save to update bank details.")
      return
    }
    try {
      setUploading(field)
      const fd = new FormData()
      fd.append(field, file)
      const response = await deliveryAPI.updateProfileMultipart(fd)
      if (response?.data?.success === false) {
        throw new Error(response?.data?.message || "Upload failed")
      }
      if (handleReapprovalRedirect(response)) return
      deliveryAPI.invalidateProfileCache?.()
      const responseProfile =
        response?.data?.data?.profile ||
        response?.data?.data?.user ||
        response?.data?.data?.partner ||
        response?.data?.profile ||
        response?.data?.user ||
        response?.data?.partner ||
        null
      if (field === "profilePhoto" && responseProfile) {
        applyProfile(responseProfile)
      }
      if (field === "profilePhoto") {
        setProfilePhotoUploadState("saved")
        setProfileImageRefreshKey(Date.now())
        window.dispatchEvent(new Event("deliveryProfileRefresh"))
      } else {
        await refresh()
      }
      preserveCurrentScroll()
      toast.success("Updated")
    } catch {
      if (field === "profilePhoto") {
        setProfilePhotoPreviewUrl("")
        setProfilePhotoUploadState("")
      }
      toast.error("Upload failed")
    } finally {
      setUploading("")
      preserveCurrentScroll()
    }
  }

  const handleRemoveProfilePhoto = async () => {
    if (uploading === "profilePhoto") return
    if (profilePhotoPreviewUrl || profilePhotoFile) {
      if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl)
      setProfilePhotoPreviewUrl("")
      setProfilePhotoFile(null)
      setProfilePhotoUploadState("")
      deleteEditFileFromDB(PROFILE_PHOTO_DRAFT_KEY)
      sessionStorage.removeItem(PROFILE_PHOTO_EDITING_KEY)
      preserveCurrentScroll()
      return
    }
    try {
      setUploading("profilePhoto")
      setProfilePhotoPreviewUrl("")
      setProfilePhotoFile(null)
      setProfilePhotoUploadState("")
      deleteEditFileFromDB(PROFILE_PHOTO_DRAFT_KEY)
      sessionStorage.removeItem(PROFILE_PHOTO_EDITING_KEY)
      const response = await deliveryAPI.updateProfileDetails({ profilePhoto: "" })
      if (response?.data?.success === false) {
        throw new Error(response?.data?.message || "Failed to remove photo")
      }
      deliveryAPI.invalidateProfileCache?.()
      await refresh()
      setProfileImageRefreshKey(Date.now())
      window.dispatchEvent(new Event("deliveryProfileRefresh"))
      toast.success("Photo removed")
    } catch {
      toast.error("Failed to remove photo")
    } finally {
      setUploading("")
    }
  }

  const saveProfilePhoto = async () => {
    if (!profilePhotoFile) {
      setEditingProfilePhoto(true)
      return toast.error("Please select a profile photo first")
    }

    try {
      preserveCurrentScroll()
      setUploading("profilePhoto")
      setProfilePhotoUploadState("saving")
      const fd = new FormData()
      fd.append("profilePhoto", profilePhotoFile)
      const response = await deliveryAPI.updateProfileMultipart(fd)
      if (response?.data?.success === false) {
        throw new Error(response?.data?.message || "Upload failed")
      }
      if (handleReapprovalRedirect(response)) return
      deliveryAPI.invalidateProfileCache?.()
      const responseProfile =
        response?.data?.data?.profile ||
        response?.data?.data?.user ||
        response?.data?.data?.partner ||
        response?.data?.profile ||
        response?.data?.user ||
        response?.data?.partner ||
        null
      if (responseProfile) applyProfile(responseProfile)
      setProfilePhotoFile(null)
      deleteEditFileFromDB(PROFILE_PHOTO_DRAFT_KEY)
      sessionStorage.removeItem(PROFILE_PHOTO_EDITING_KEY)
      setProfilePhotoUploadState("saved")
      setProfileImageRefreshKey(Date.now())
      setEditingProfilePhoto(false)
      window.dispatchEvent(new Event("deliveryProfileRefresh"))
      preserveCurrentScroll()
      toast.success("Profile photo updated")
    } catch {
      setProfilePhotoUploadState(profilePhotoFile ? "selected" : "")
      toast.error("Upload failed")
    } finally {
      setUploading("")
      preserveCurrentScroll()
    }
  }

  const saveBasicDetails = async () => {
    const { name, phone, email, address, city, state } = form
    const e1 = validateField("name", name)
    const e2 = validateField("phone", phone)
    const e3 = validateField("email", email)
    const e4 = validateField("address", address)
    if (e1 || e2 || e3 || e4 || !city || !state) {
      return toast.error("Please fix errors before saving")
    }

    try {
      setSaving(true)
      const fd = new FormData()
      fd.append("name", String(name || "").trim())
      fd.append("phone", String(phone || "").trim())
      fd.append("email", String(email || "").trim())
      fd.append("address", String(address || "").trim())
      fd.append("city", String(city || "").trim())
      fd.append("state", String(state || "").trim())
      const response = await deliveryAPI.updateProfileMultipart(fd)
      if (handleReapprovalRedirect(response)) return
      deliveryAPI.invalidateProfileCache?.()
      await refresh()
      toast.success("Basic details updated")
      setEditingBasic(false)
    } catch {
      toast.error("Failed to update basic details")
    } finally {
      setSaving(false)
    }
  }

  const saveVehicleDetails = async () => {
    const { vehicleType, vehicleName, vehicleNumber } = form
    const e1 = validateField("vehicleNumber", vehicleNumber)
    if (e1 || !vehicleType || !vehicleName) return toast.error("Please fix errors")
    const vNum = String(vehicleNumber || "").replace(/\s+/g, "").toUpperCase()

    try {
      setSaving(true)
      const response = await deliveryAPI.updateProfileDetails({
        vehicle: {
          type: String(vehicleType || "").trim(),
          brand: String(vehicleName || "").trim(),
          number: vNum,
        },
      })
      if (handleReapprovalRedirect(response)) return
      deliveryAPI.invalidateProfileCache?.()
      await refresh()
      toast.success("Vehicle details updated")
      setEditingVehicle(false)
    } catch {
      toast.error("Failed to update vehicle details")
    } finally {
      setSaving(false)
    }
  }

  const saveBankDetails = async () => {
    const { accountHolderName, accountNumber, ifscCode, bankName, upiId, panNumber } = form
    if (!String(accountHolderName || "").trim()) return toast.error("Account holder name is required")
    if (!String(accountNumber || "").trim()) return toast.error("Account number is required")
    if (!String(ifscCode || "").trim()) return toast.error("IFSC code is required")
    if (!String(bankName || "").trim()) return toast.error("Bank name is required")
    if (!String(upiId || "").trim()) return toast.error("UPI ID is required")
    if (!visibleUpiQrUrl && !upiQrFile) return toast.error("UPI QR image is required")
    const e1 = validateField("accountNumber", accountNumber)
    const e2 = validateField("ifscCode", ifscCode)
    const e3 = validateField("upiId", upiId)
    const e4 = validateField("panNumber", panNumber)
    if (e1 || e2 || e3 || e4 || !accountHolderName || !bankName) return toast.error("Please fix errors")

    try {
      setSaving(true)
      const bankFd = new FormData()
      bankFd.append("documents[bankDetails][accountHolderName]", String(accountHolderName || "").trim())
      bankFd.append("documents[bankDetails][accountNumber]", String(accountNumber || "").trim())
      bankFd.append("documents[bankDetails][ifscCode]", String(ifscCode || "").trim().toUpperCase())
      bankFd.append("documents[bankDetails][bankName]", String(bankName || "").trim())
      bankFd.append("documents[bankDetails][upiId]", String(upiId || "").trim())
      if (upiQrFile) {
        bankFd.append("upiQrCode", upiQrFile)
      }
      bankFd.append("documents[pan][number]", String(panNumber || "").trim().toUpperCase())
      const response = await deliveryAPI.updateBankDetailsMultipart(bankFd)
      if (handleReapprovalRedirect(response)) return
      deliveryAPI.invalidateProfileCache?.()
      const responseProfile =
        response?.data?.data?.profile ||
        response?.data?.data?.user ||
        response?.data?.data?.partner ||
        response?.data?.profile ||
        response?.data?.user ||
        response?.data?.partner ||
        null
      if (responseProfile) applyProfile(responseProfile)
      const refreshedProfile = await refresh()
      setUpiQrFile(null)
      deleteEditFileFromDB(UPI_QR_DRAFT_KEY)
      sessionStorage.removeItem(UPI_QR_EDITING_KEY)
      if (getUpiQrUrl(responseProfile) || getUpiQrUrl(refreshedProfile)) {
        setUpiQrPreviewUrl("")
      }
      setUpiQrUploadState("saved")
      toast.success("Bank details updated")
      setEditingBank(false)
    } catch {
      setUpiQrUploadState(upiQrFile ? "selected" : "")
      toast.error("Failed to update bank details")
    } finally {
      setSaving(false)
    }
  }

  const saveDocumentDetails = async () => {
    const { aadharNumber, panNumber, drivingLicenseNumber } = form
    const e1 = validateField("aadharNumber", aadharNumber)
    const e2 = validateField("panNumber", panNumber)
    if (e1 || e2 || !drivingLicenseNumber) return toast.error("Please fix errors")

    try {
      setSaving(true)
      const fd = new FormData()
      fd.append("aadharNumber", String(aadharNumber || "").trim())
      fd.append("panNumber", String(panNumber || "").trim().toUpperCase())
      fd.append("drivingLicenseNumber", String(drivingLicenseNumber || "").trim().toUpperCase())
      const response = await deliveryAPI.updateProfileMultipart(fd)
      if (handleReapprovalRedirect(response)) return
      deliveryAPI.invalidateProfileCache?.()
      await refresh()
      toast.success("Document details updated")
      setEditingDocuments(false)
    } catch {
      toast.error("Failed to update document details")
    } finally {
      setSaving(false)
    }
  }

  const saveZoneOnly = async () => {
    if (!zoneId) return toast.error("Please select a zone")
    try {
      setSaving(true)
      const res = await deliveryAPI.updateProfileDetails({ zoneId })
      const requiresReapproval =
        res?.data?.data?.partner?.requiresReapproval ||
        res?.data?.data?.requiresReapproval ||
        false
      if (requiresReapproval) {
        clearModuleAuth("delivery")
        localStorage.removeItem("app:isOnline")
        toast.success("Zone changed. Sent for approval. Please login again after approval.")
        navigate("/food/delivery/login", { replace: true })
        return
      }
      deliveryAPI.invalidateProfileCache?.()
      await refresh()
      toast.success("Zone updated")
    } catch {
      toast.error("Failed to update zone")
    } finally {
      setSaving(false)
    }
  }

  const onPick = (ref) => {
    if (!ref?.current) return
    ref.current.value = ""
    ref.current.click()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading profile...</span>
        </div>
      </div>
    )
  }

  const inputClass = (key) => `w-full rounded-xl border ${errors[key] ? 'border-red-400' : 'border-slate-200'} bg-white px-3 py-3 text-sm outline-none focus:border-[#005128]`
  const ErrMsg = ({ name }) => errors[name] ? <p className="text-[10px] text-red-500 mt-0.5 ml-1">{errors[name]}</p> : null

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold">Profile Details</h1>
      </div>

      <div className="max-w-xl mx-auto px-3 pt-3 space-y-3">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Profile Photo</h2>
            <button
              onClick={async () => {
                if (!editingProfilePhoto) return setEditingProfilePhoto(true)
                await saveProfilePhoto()
              }}
              disabled={saving || uploading === "profilePhoto"}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingProfilePhoto ? "Save" : "Edit"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-20 h-20 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center overflow-visible">
              <div className="relative w-full h-full overflow-hidden rounded-full">
                <img
                  src={visibleProfileImageUrl}
                  alt="Profile"
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = DEFAULT_USER_AVATAR
                  }}
                />
                {uploading === "profilePhoto" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
                {profilePhotoUploadState === "selected" && uploading !== "profilePhoto" && profilePhotoPreviewUrl && (
                  <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 py-0.5 text-center text-[9px] font-semibold text-white">
                    Preview
                  </div>
                )}
                {profilePhotoUploadState === "saved" && uploading !== "profilePhoto" && profilePhotoPreviewUrl && (
                  <div className="absolute bottom-0 left-0 right-0 bg-emerald-600/90 py-0.5 text-center text-[9px] font-semibold text-white">
                    Saved
                  </div>
                )}
              </div>
              {hasRealProfileImage && uploading !== "profilePhoto" && (
                <button
                  type="button"
                  onClick={handleRemoveProfilePhoto}
                  className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-slate-900 text-white shadow-md transition-colors hover:bg-slate-700"
                  aria-label="Remove profile photo"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2">
              {editingProfilePhoto ? (
                <>
                  <div className="flex gap-2">
                    <button disabled={uploading === "profilePhoto"} onClick={() => openCamera({ onSelectFile: (f) => uploadSingleFile("profilePhoto", f), fileNamePrefix: "profile-photo" })} className="px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50">Use Camera</button>
                    <button
                      disabled={uploading === "profilePhoto"}
                      onClick={() => openGallery({ onSelectFile: (f) => uploadSingleFile("profilePhoto", f), fileNamePrefix: "profile-photo" })}
                      className="px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50"
                    >
                      Upload from Device
                    </button>
                  </div>
                  {profilePhotoPreviewUrl && (
                    <p className="text-[10px] font-medium text-slate-500">Preview is shown now. Save to upload it.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">Tap Edit to change profile photo.</p>
              )}
            </div>
          </div>
          <input
            ref={profilePhotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              uploadSingleFile("profilePhoto", e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Basic Details</h2>
            <button
              onClick={async () => {
                if (!editingBasic) return setEditingBasic(true)
                await saveBasicDetails()
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingBasic ? "Save" : "Edit"}
            </button>
          </div>
          <div>
            <input disabled={!editingBasic} className={`${inputClass("name")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Full Name" value={form.name} onChange={(e) => onInput("name", e.target.value)} />
            <ErrMsg name="name" />
          </div>
          <div>
            <input disabled={!editingBasic} className={`${inputClass("phone")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Phone" value={form.phone} onChange={(e) => onInput("phone", e.target.value)} inputMode="numeric" maxLength={10} />
            <ErrMsg name="phone" />
          </div>
          <div>
            <input disabled={!editingBasic} className={`${inputClass("email")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Email" value={form.email} onChange={(e) => onInput("email", e.target.value)} />
            <ErrMsg name="email" />
          </div>
          <div>
            <input disabled={!editingBasic} className={`${inputClass("address")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Address" value={form.address} onChange={(e) => onInput("address", e.target.value)} />
            <ErrMsg name="address" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input disabled={!editingBasic} className={`${inputClass("city")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="City" value={form.city} onChange={(e) => onInput("city", e.target.value)} />
              <ErrMsg name="city" />
            </div>
            <div>
              <input disabled={!editingBasic} className={`${inputClass("state")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="State" value={form.state} onChange={(e) => onInput("state", e.target.value)} />
              <ErrMsg name="state" />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-amber-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Zone Edit (Group)</h2>
            <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">Approval Required</span>
          </div>
          <p className="text-xs text-amber-700">If you change zone, profile will go for admin approval.</p>
          <p className="text-xs text-slate-500">Current zone: {selectedZoneLabel}</p>
          <select className={inputClass("zoneId")} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">Select zone</option>
            {zones.map((z) => {
              const id = String(z?._id || z?.id || "")
              if (!id) return null
              return <option key={id} value={id}>{z?.zoneName || z?.name || z?.serviceLocation}</option>
            })}
          </select>
          <button onClick={saveZoneOnly} disabled={saving} className="w-full rounded-xl bg-amber-600 text-white py-3 text-sm font-semibold disabled:opacity-60">
            {saving ? "Saving..." : "Update Zone"}
          </button>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Vehicle Details</h2>
            <button
              onClick={async () => {
                if (!editingVehicle) return setEditingVehicle(true)
                await saveVehicleDetails()
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingVehicle ? "Save" : "Edit"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input disabled={!editingVehicle} className={`${inputClass("vehicleType")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Vehicle Type" value={form.vehicleType} onChange={(e) => onInput("vehicleType", e.target.value)} />
            <input disabled={!editingVehicle} className={`${inputClass("vehicleName")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Vehicle Brand/Name" value={form.vehicleName} onChange={(e) => onInput("vehicleName", e.target.value)} />
          </div>
          <div>
            <input disabled={!editingVehicle} className={`${inputClass("vehicleNumber")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Vehicle Number" value={form.vehicleNumber} onChange={(e) => onInput("vehicleNumber", e.target.value.toUpperCase())} />
            <ErrMsg name="vehicleNumber" />
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Documents</h2>
            <button
              onClick={async () => {
                if (!editingDocuments) return setEditingDocuments(true)
                await saveDocumentDetails()
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingDocuments ? "Save" : "Edit"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Aadhar</p>
            <div>
              <input
                disabled={!editingDocuments}
                className={`${inputClass("aadharNumber")} disabled:bg-slate-50 disabled:text-slate-500`}
                placeholder="Aadhar Number"
                value={form.aadharNumber}
                onChange={(e) => onInput("aadharNumber", e.target.value)}
                inputMode="numeric"
                maxLength={12}
              />
              <ErrMsg name="aadharNumber" />
            </div>
            {editingDocuments && (
              <DocumentUploadActions
                onFileSelect={(file) => uploadSingleFile("aadharPhoto", file)}
                fileNamePrefix="aadhar-photo"
                galleryInputRef={aadharInputRef}
              />
            )}
            {aadharPhotoUrl ? (
              <img src={aadharPhotoUrl} alt="Aadhar" className="w-full h-24 object-cover rounded-lg border border-slate-200" />
            ) : (
              <div className="w-full h-24 rounded-lg bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center">No Aadhar photo</div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">PAN</p>
            <div>
              <input
                disabled={!editingDocuments}
                className={`${inputClass("panNumber")} disabled:bg-slate-50 disabled:text-slate-500`}
                placeholder="PAN Number"
                value={form.panNumber}
                onChange={(e) => onInput("panNumber", e.target.value.toUpperCase())}
                maxLength={10}
              />
              <ErrMsg name="panNumber" />
            </div>
            {editingDocuments && (
              <DocumentUploadActions
                onFileSelect={(file) => uploadSingleFile("panPhoto", file)}
                fileNamePrefix="pan-photo"
                galleryInputRef={panInputRef}
              />
            )}
            {panPhotoUrl ? (
              <img src={panPhotoUrl} alt="PAN" className="w-full h-24 object-cover rounded-lg border border-slate-200" />
            ) : (
              <div className="w-full h-24 rounded-lg bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center">No PAN photo</div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Driving License</p>
            <div>
              <input
                disabled={!editingDocuments}
                className={`${inputClass("drivingLicenseNumber")} disabled:bg-slate-50 disabled:text-slate-500`}
                placeholder="Driving License Number"
                value={form.drivingLicenseNumber}
                onChange={(e) => onInput("drivingLicenseNumber", e.target.value.toUpperCase())}
              />
              <ErrMsg name="drivingLicenseNumber" />
            </div>
            {editingDocuments && (
              <DocumentUploadActions
                onFileSelect={(file) => uploadSingleFile("drivingLicensePhoto", file)}
                fileNamePrefix="driving-license"
                galleryInputRef={drivingInputRef}
              />
            )}
            {drivingPhotoUrl ? (
              <img src={drivingPhotoUrl} alt="Driving License" className="w-full h-24 object-cover rounded-lg border border-slate-200" />
            ) : (
              <div className="w-full h-24 rounded-lg bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center">No License photo</div>
            )}
          </div>
          <input ref={aadharInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("aadharPhoto", e.target.files?.[0])} />
          <input ref={panInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("panPhoto", e.target.files?.[0])} />
          <input ref={drivingInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("drivingLicensePhoto", e.target.files?.[0])} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Bank & Payments</h2>
            <button
              onClick={async () => {
                if (!editingBank) return setEditingBank(true)
                await saveBankDetails()
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingBank ? "Save" : "Edit"}
            </button>
          </div>
          <input disabled={!editingBank} className={`${inputClass("accountHolderName")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Account Holder Name" value={form.accountHolderName} onChange={(e) => onInput("accountHolderName", e.target.value)} />
          <div>
            <input disabled={!editingBank} className={`${inputClass("accountNumber")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Account Number" value={form.accountNumber} onChange={(e) => onInput("accountNumber", e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={18} />
            <ErrMsg name="accountNumber" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input disabled={!editingBank} className={`${inputClass("ifscCode")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="IFSC Code" value={form.ifscCode} onChange={(e) => onInput("ifscCode", e.target.value.toUpperCase())} maxLength={11} />
              <ErrMsg name="ifscCode" />
            </div>
            <input disabled={!editingBank} className={`${inputClass("bankName")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Bank Name" value={form.bankName} onChange={(e) => onInput("bankName", e.target.value)} />
          </div>
          <div>
            <input disabled={!editingBank} className={`${inputClass("upiId")} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="UPI ID" value={form.upiId} onChange={(e) => onInput("upiId", e.target.value)} />
            <ErrMsg name="upiId" />
          </div>

          {editingBank && (
            <DocumentUploadActions
              onFileSelect={(file) => uploadSingleFile("upiQrCode", file)}
              fileNamePrefix="upi-qr"
              galleryInputRef={upiQrInputRef}
            />
          )}
          {visibleUpiQrUrl && (
            <div className={`rounded-xl border p-2 ${upiQrPreviewUrl ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold text-slate-500">
                  {upiQrPreviewUrl ? "New UPI QR preview" : "Existing UPI QR"}
                </p>
                {upiQrUploadState === "selected" && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700">Ready to save</span>
                )}
                {upiQrUploadState === "saved" && !upiQrPreviewUrl && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">Saved</span>
                )}
              </div>
              <div className="relative h-44 w-full max-w-xs overflow-hidden rounded-lg border border-slate-200 bg-white">
                <img src={visibleUpiQrUrl} alt="UPI QR" className="h-full w-full object-contain" />
                {saving && upiQrFile && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/75">
                    <Loader2 className="h-5 w-5 animate-spin text-[#005128]" />
                  </div>
                )}
              </div>
              {upiQrPreviewUrl && (
                <p className="mt-1 text-[10px] font-medium text-slate-500">Preview is shown now. Save to upload it.</p>
              )}
            </div>
          )}
          <input
            ref={upiQrInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              uploadSingleFile("upiQrCode", e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </section>
      </div>
    </div>
  )
}

export default EditDeliveryBoy
