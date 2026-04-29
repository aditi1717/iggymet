import { Eye, MapPin, Package, User, Phone, Mail, Calendar, Clock, Truck, CreditCard, X, Receipt, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { formatOrderAddressForMap, formatOrderAddressWithLabels } from "@food/utils/orderAddressFormatter"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const formatAddressForMap = (address) => {
  return formatOrderAddressForMap(address)
}

const getGoogleMapsHref = (address) => {
  if (address?.location?.coordinates && Array.isArray(address.location.coordinates) && address.location.coordinates.length === 2) {
    const [lng, lat] = address.location.coordinates
    return `https://www.google.com/maps?q=${lat},${lng}`
  }
  const query = encodeURIComponent(formatAddressForMap(address))
  return query ? `https://www.google.com/maps/search/?api=1&query=${query}` : ""
}


const getStatusColor = (orderStatus) => {
  const colors = {
    "Delivered": "bg-emerald-100 text-emerald-700",
    "Pending": "bg-brand-100 text-brand-700",
    "Scheduled": "bg-brand-100 text-brand-700",
    "Accepted": "bg-green-100 text-green-700",
    "Processing": "bg-orange-100 text-orange-700",
    "Ready": "bg-violet-100 text-violet-700",
    "Food On The Way": "bg-yellow-100 text-yellow-700",
    "Picked Up": "bg-yellow-100 text-yellow-700",
    "User Unavailable Review": "bg-orange-100 text-orange-700",
    "Canceled": "bg-rose-100 text-rose-700",
    "Cancelled by Admin": "bg-rose-100 text-rose-700",
    "Cancelled by Restaurant": "bg-red-100 text-red-700",
    "Cancelled - User Unavailable": "bg-red-100 text-red-700",
    "Cancelled by User": "bg-orange-100 text-orange-700",
    "Payment Failed": "bg-red-100 text-red-700",
    "Refunded": "bg-sky-100 text-sky-700",
    "Dine In": "bg-indigo-100 text-indigo-700",
    "Offline Payments": "bg-slate-100 text-slate-700",
  }
  return colors[orderStatus] || "bg-slate-100 text-slate-700"
}

const getPaymentStatusColor = (paymentStatus) => {
  const normalized = String(paymentStatus || "").toLowerCase()
  if (normalized.includes("no due")) return "text-emerald-600"
  if (normalized.startsWith("paid") || normalized.includes("collected") || normalized.includes("recovered")) return "text-emerald-600"
  if (normalized.includes("not collected")) return "text-amber-600"
  if (normalized.startsWith("unpaid") || normalized.includes("failed") || normalized.includes("due")) return "text-red-600"
  return "text-slate-600"
}

export default function ViewOrderDialog({
  isOpen,
  onOpenChange,
  order,
  onApproveUserUnavailable,
  onRejectUserUnavailable,
  actionLoading,
}) {
  if (!order) return null

  // Debug: Log order data to check billImageUrl
  if (order.billImageUrl) {
    debugLog('?? Bill Image URL found:', order.billImageUrl)
  } else {
    debugLog('?? Bill Image URL not found in order:', {
      orderId: order.orderId,
      hasBillImageUrl: !!order.billImageUrl,
      orderKeys: Object.keys(order)
    })
  }

  // Format address for display
  const formatAddress = (address) => {
    const formatted = formatOrderAddressWithLabels(address)
    return formatted === "Address not available" ? "N/A" : formatted
  }

  const parseAddressSegments = (formattedAddressText) => {
    const text = String(formattedAddressText || "").trim()
    if (!text || text === "N/A") return []

    const knownLabels = [
      "Type",
      "Building",
      "Floor/Flat",
      "Street",
      "Area",
      "Landmark",
      "City",
      "State",
      "Pincode",
    ]
    const labelPattern = new RegExp(`(${knownLabels.map((l) => l.replace("/", "\\/")).join("|")}):`, "g")

    const matches = [...text.matchAll(labelPattern)]
    if (matches.length === 0) return [{ label: "", value: text }]

    return matches
      .map((match, index) => {
        const label = String(match[1] || "").trim()
        const start = match.index + match[0].length
        const end = index + 1 < matches.length ? matches[index + 1].index : text.length
        const value = String(text.slice(start, end) || "")
          .trim()
          .replace(/^,\s*/, "")
          .replace(/,\s*$/, "")
        return { label, value }
      })
      .filter((segment) => segment.value)
  }

  // Get coordinates if available
  const getCoordinates = (address) => {
    if (address?.location?.coordinates && Array.isArray(address.location.coordinates) && address.location.coordinates.length === 2) {
      const [lng, lat] = address.location.coordinates
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }
    return null
  }

  const pickFirstText = (...values) => {
    for (const value of values) {
      const text = String(value ?? "").trim()
      if (text) return text
    }
    return ""
  }

  const recipientSourceAddress = order.address || order.deliveryAddress || order.customerAddress || {}
  const recipientName = pickFirstText(
    order.recipientName,
    order.deliveryRecipient?.name,
    recipientSourceAddress.fullName,
    recipientSourceAddress.name,
    recipientSourceAddress.recipientName,
    recipientSourceAddress.receiverName,
  )
  const recipientPhone = pickFirstText(
    order.recipientPhone,
    order.deliveryRecipient?.phone,
    recipientSourceAddress.phone,
    recipientSourceAddress.recipientPhone,
    recipientSourceAddress.receiverPhone,
    recipientSourceAddress.contactPersonPhone,
    recipientSourceAddress.mobile,
    recipientSourceAddress.contactNumber,
  )
  const reviewProofUrl =
    order?.userUnavailableRequest?.proofImageUrl ||
    order?.noResponseMeta?.proofImageUrl ||
    ""
  const isUserUnavailableReview = String(order?.orderStatus || "").toLowerCase() === "user unavailable review"
  const loadingOrderId = actionLoading?.orderId || null
  const loadingActionType = actionLoading?.type || null
  const isActionLoading = loadingOrderId === (order.id || order._id || order.orderId)

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-white p-0 overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-orange-600" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            View complete information about this order
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-6 space-y-6">
          {/* Basic Order Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order ID
                </p>
                <p className="text-sm font-medium text-slate-900">{order.orderId || order.id || order.subscriptionId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Order Date
                </p>
                <p className="text-sm font-medium text-slate-900">{order.date}{order.time ? `, ${order.time}` : ""}</p>
              </div>
              {order.orderOtp && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Handover Code (OTP)
                  </p>
                  <p className="text-lg font-bold text-slate-950 tracking-[0.2em]">{order.orderOtp}</p>
                </div>
              )}
              {order.estimatedDeliveryTime && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Estimated Delivery Time
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.estimatedDeliveryTime} minutes</p>
                </div>
              )}
              {order.deliveredAt && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Delivered At
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(order.deliveredAt).toLocaleString('en-GB', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).toUpperCase()}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {order.orderStatus && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.orderStatus)}`}>
                    {order.orderStatus}
                  </span>
                  {order.cancellationReason && (
                    <p className="text-xs text-red-600 mt-1">
                      <span className="font-medium">
                        {order.cancelledBy === 'user' ? 'Cancelled by User - ' : 
                         order.cancelledBy === 'restaurant' ? 'Cancelled by Restaurant - ' : 
                         order.cancelledBy === 'admin' ? 'Cancelled by Admin - ' :
                         'Cancellation '}Reason:
                      </span> {order.cancellationReason}
                    </p>
                  )}
                  {order.cancelledAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cancelled: {new Date(order.cancelledAt).toLocaleString('en-GB', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).toUpperCase()}
                    </p>
                  )}
                </div>
              )}
              {isUserUnavailableReview && (
                <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">
                    User Unavailable Proof
                  </p>
                  {order?.userUnavailableRequest?.reason ? (
                    <p className="text-sm text-slate-700">{order.userUnavailableRequest.reason}</p>
                  ) : null}
                  {reviewProofUrl ? (
                    <a href={reviewProofUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-orange-200 bg-white">
                      <img src={reviewProofUrl} alt="User unavailable proof" className="h-40 w-full object-cover" />
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500">Proof image not uploaded</p>
                  )}
                </div>
              )}
              {(order.paymentStatus || order.paymentCollectionStatus != null) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Status
                  </p>
                  {(() => {
                    const isCod =
                      order.paymentType === 'Cash on Delivery' ||
                      order.payment?.method === 'cash' ||
                      order.payment?.method === 'cod'
                    const orderStatusRaw = String(order.orderStatus || order.status || '').toLowerCase()
                    const normalizedPaymentStatus = String(order.paymentStatus || '').toLowerCase()
                    const isCodMarkedPaid =
                      normalizedPaymentStatus === 'paid' ||
                      normalizedPaymentStatus === 'collected'
                    const isOrderDelivered =
                      orderStatusRaw === 'delivered' || orderStatusRaw.includes('delivered')
                    const codDisplayStatus = order.paymentCollectionStatus
                      ? order.paymentCollectionStatus
                      : (isCodMarkedPaid || isOrderDelivered ? 'Collected' : 'Not Collected')
                    const displayPaymentStatus = isCod ? codDisplayStatus : order.paymentStatus

                    return (
                      <p className={`text-sm font-medium ${getPaymentStatusColor(displayPaymentStatus)}`}>
                        {displayPaymentStatus}
                      </p>
                    )
                  })()}
                </div>
              )}
              {order.deliveryType && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Delivery Type
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.deliveryType}</p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</p>
                <p className="text-sm font-medium text-slate-900">{order.customerName || "N/A"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipient Name</p>
                <p className="text-sm font-medium text-slate-900">{recipientName || "N/A"}</p>
              </div>
              {order.customerPhone && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerPhone}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Recipient Phone
                </p>
                <p className="text-sm font-medium text-slate-900">{recipientPhone || "N/A"}</p>
              </div>
              {order.customerEmail && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </p>
                  <p className="text-sm font-medium text-slate-900">{order.customerEmail}</p>
                </div>
              )}
            </div>
          </div>

          {/* Restaurant Information */}
          {order.restaurant && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Restaurant Information</h3>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant Name</p>
                <p className="text-sm font-medium text-slate-900">{order.restaurant}</p>
              </div>
            </div>
          )}

          {/* Order Items */}
          {order.items && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Items ({order.items.length})
              </h3>
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-1 rounded">
                          {item.quantity || 1}x
                        </span>
                        <p className="text-sm font-medium text-slate-900">
                          {item.name || "Unknown Item"}
                          {item.variantLabel ? (
                            <span className="text-slate-500 font-normal"> ({item.variantLabel})</span>
                          ) : null}
                        </p>
                        {item.isVeg !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${item.isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.isVeg ? 'Veg' : 'Non-Veg'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 ml-8">{item.description}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bill Image (Captured by Delivery Boy) */}
          {(order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                Bill Image (Captured by Delivery Boy)
              </h3>
              <div className="space-y-3">
                <div className="relative w-full max-w-2xl border-2 border-slate-300 rounded-xl overflow-hidden bg-white shadow-sm">
                  <img
                    src={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    alt="Order Bill"
                    className="w-full h-auto object-contain max-h-[500px] mx-auto block"
                    loading="lazy"
                    onError={(e) => {
                      debugError('? Failed to load bill image:', e.target.src)
                      e.target.style.display = 'none';
                      const errorDiv = e.target.parentElement.querySelector('.error-message');
                      if (errorDiv) errorDiv.style.display = 'block';
                    }}
                    onLoad={() => {
                      debugLog('? Bill image loaded successfully')
                    }}
                  />
                  <div className="error-message hidden p-6 text-center text-slate-500 text-sm bg-slate-50">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    Failed to load bill image
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View Full Size
                  </a>
                  <a
                    href={order.billImageUrl || order.billImage || order.deliveryState?.billImageUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Package className="w-4 h-4" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {(order.address || order.deliveryAddress) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Delivery Address
              </h3>
              {(() => {
                const deliveryAddress = order.address || order.deliveryAddress
                const mapsHref = getGoogleMapsHref(deliveryAddress)
                const formattedAddress = formatAddress(deliveryAddress)
                const addressSegments = parseAddressSegments(formattedAddress)
                return (
              <div className="space-y-2 p-4 bg-slate-50 rounded-lg">
                {addressSegments.length > 0 ? (
                  <div className="space-y-1.5">
                    {addressSegments.map((segment, idx) => (
                      <p
                        key={`${segment.label}-${idx}`}
                        className={`text-sm text-slate-900 leading-6 ${
                          segment.label.toLowerCase() === "street" ? "whitespace-nowrap" : ""
                        }`}
                      >
                        {segment.label ? (
                          <span className="mr-1.5 text-sm font-bold text-indigo-700">
                            {segment.label}
                          </span>
                        ) : null}
                        <span>{segment.value}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-900">{formattedAddress}</p>
                )}
                {getCoordinates(deliveryAddress) && (
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-semibold text-indigo-700">Coordinates:</span> {getCoordinates(deliveryAddress)}
                  </p>
                )}
                {deliveryAddress.label && (
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold text-emerald-700">Label:</span> {deliveryAddress.label}
                  </p>
                )}
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-brand-600"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    Open delivery route
                  </a>
                )}
              </div>
                )
              })()}
            </div>
          )}

          {/* Delivery Partner Information */}
          {(order.deliveryPartnerName || order.deliveryPartnerPhone) && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Delivery Partner
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {order.deliveryPartnerName && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerName}</p>
                  </div>
                )}
                {order.deliveryPartnerPhone && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm font-medium text-slate-900">{order.deliveryPartnerPhone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Breakdown */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pricing Breakdown</h3>
            <div className="space-y-2">
              {order.totalItemAmount !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium text-slate-900">₹{order.totalItemAmount.toFixed(2)}</span>
                </div>
              )}
              {order.itemDiscount !== undefined && order.itemDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.itemDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.couponDiscount !== undefined && order.couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Coupon Discount</span>
                  <span className="font-medium text-emerald-600">-₹{order.couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {order.dueAmount !== undefined && Number(order.dueAmount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">{order.dueLabel || "Previous Due"}</span>
                  <span className="font-medium text-slate-900">â‚¹{Number(order.dueAmount).toFixed(2)}</span>
                </div>
              )}
              {order.deliveryCharge !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Delivery Charge</span>
                  <span className="font-medium text-slate-900">
                    {order.deliveryCharge > 0 ? `₹${order.deliveryCharge.toFixed(2)}` : <span className="text-emerald-600">Free delivery</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Platform Fee</span>
                <span className="font-medium text-slate-900">
                  {order.platformFee !== undefined && order.platformFee > 0 
                    ? `₹${order.platformFee.toFixed(2)}` 
                    : <span className="text-slate-400">₹0.00</span>}
                </span>
              </div>
              {order.vatTax !== undefined && order.vatTax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax (GST)</span>
                  <span className="font-medium text-slate-900">₹{order.vatTax.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-base font-semibold text-slate-700">Total Amount</span>
                  <span className="text-xl font-bold text-emerald-600">
                    ₹{(order.totalAmount || order.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {isUserUnavailableReview && (
          <div className="border-t border-slate-200 px-6 py-4">
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onRejectUserUnavailable?.(order)}
                disabled={!onRejectUserUnavailable || isActionLoading}
                className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActionLoading && loadingActionType === "reject" ? "Rejecting..." : "Reject"}
              </button>
              <button
                type="button"
                onClick={() => onApproveUserUnavailable?.(order)}
                disabled={!onApproveUserUnavailable || isActionLoading}
                className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActionLoading && loadingActionType === "accept" ? "Approving..." : "Approve User Unavailable"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


