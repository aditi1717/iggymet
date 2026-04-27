import { useNavigate, useParams, Link } from "react-router-dom"

import { Download, ArrowLeft, FileText, Printer } from "lucide-react"
import { useRef, useState, useEffect } from "react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Badge } from "@food/components/ui/badge"
import { orderAPI } from "@food/api"
import { useOrders } from "@food/context/OrdersContext"
import { useCompanyName } from "@food/hooks/useCompanyName"
import BRAND_THEME from "@/config/brandTheme"

const toMoneyNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatMoney = (value) => toMoneyNumber(value).toFixed(2)
const formatCurrency = (value) => `Rs ${formatMoney(value)}`

const extractOrderFromDetailsResponse = (response) =>
  response?.data?.data?.order ||
  response?.data?.order ||
  (response?.data?.data && typeof response.data.data === "object" && !Array.isArray(response.data.data)
    ? response.data.data
    : null)

const getInvoiceItems = (order) => (Array.isArray(order?.items) ? order.items : [])

const getOrderDisplayId = (order, fallback = "") =>
  String(order?.orderId || order?.id || order?._id || fallback || "")

const compactText = (...values) =>
  values
    .map((value) => String(value || "").trim())
    .filter(Boolean)

const normalizeAddressPart = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

const splitAddressParts = (value) =>
  String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

const dedupeAddressParts = (parts) => {
  const seen = new Set()
  return parts.filter((part) => {
    const key = normalizeAddressPart(part)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const isAlreadyInAddress = (line, fullAddressParts) => {
  const lineKey = normalizeAddressPart(line)
  if (!lineKey) return true
  return fullAddressParts.some((part) => {
    const partKey = normalizeAddressPart(part)
    return partKey === lineKey || partKey.includes(lineKey) || lineKey.includes(partKey)
  })
}

const getCustomerDetails = (order) => {
  const address = order?.deliveryAddress || order?.address || {}
  const user = order?.userId && typeof order.userId === "object" ? order.userId : order?.user || {}
  const cityLine = compactText(address.city, address.state, address.zipCode || address.postalCode).join(", ")
  const fullAddressParts = dedupeAddressParts(splitAddressParts(address.formattedAddress || address.address))
  const componentLines = compactText(
    address.buildingName,
    address.floor ? `Floor ${address.floor}` : "",
    address.street,
    address.additionalDetails || address.area,
    address.landmark ? `Landmark: ${address.landmark}` : "",
    cityLine,
  ).filter((line) => !isAlreadyInAddress(line, fullAddressParts))
  const addressLines = [
    ...(fullAddressParts.length ? [fullAddressParts.join(", ")] : []),
    ...dedupeAddressParts(componentLines),
  ]

  return {
    name: String(order?.customerName || address.fullName || address.name || user.name || "Customer").trim(),
    phone: String(order?.customerPhone || address.phone || user.phone || "").trim(),
    addressLines,
  }
}

const normalizeOptionName = (option) => {
  if (!option) return ""
  if (typeof option === "string") return option
  return option.name || option.title || option.label || option.variantName || option.addonName || option.optionName || ""
}

const getItemMetaLines = (item) => {
  const variantName =
    item?.variantName ||
    item?.variant?.name ||
    item?.selectedVariant?.name ||
    item?.size ||
    item?.selectedSize

  const addons = [
    ...(Array.isArray(item?.addons) ? item.addons : []),
    ...(Array.isArray(item?.addOns) ? item.addOns : []),
    ...(Array.isArray(item?.selectedAddons) ? item.selectedAddons : []),
    ...(Array.isArray(item?.customizations) ? item.customizations : []),
  ]
    .map(normalizeOptionName)
    .filter(Boolean)

  return [
    variantName ? `Variant: ${variantName}` : "",
    addons.length ? `Add-ons: ${addons.join(", ")}` : "",
    item?.notes ? `Note: ${item.notes}` : "",
  ].filter(Boolean)
}

const getInvoiceSubtotal = (order) => {
  const explicit = order?.subtotal ?? order?.pricing?.subtotal
  if (explicit != null) return toMoneyNumber(explicit)

  return getInvoiceItems(order).reduce((sum, item) => {
    const price = toMoneyNumber(item?.price ?? item?.unitPrice ?? item?.basePrice)
    const quantity = Math.max(1, toMoneyNumber(item?.quantity || 1))
    return sum + price * quantity
  }, 0)
}

export default function OrderInvoice() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const { orderId } = useParams()
  const { getOrderById } = useOrders()
  const [order, setOrder] = useState(() => getOrderById(orderId))
  const [loading, setLoading] = useState(!order)
  const [error, setError] = useState(null)
  const invoiceRef = useRef(null)

  useEffect(() => {
    if (order) return

    const fetchOrder = async () => {
      try {
        setLoading(true)
        const response = await orderAPI.getOrderDetails(orderId)
        const fetchedOrder = extractOrderFromDetailsResponse(response)
        if (fetchedOrder) {
          setOrder(fetchedOrder)
        } else {
          setError("Order not found")
        }
      } catch (err) {
        setError("Failed to load invoice details")
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [orderId, order])

  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] p-4">
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: BRAND_THEME.colors.brand.primary, borderTopColor: "transparent" }} />
          <p className="text-muted-foreground">Generating invoice...</p>
        </div>
      </AnimatedPage>
    )
  }

  if (error || !order) {
    return (
      <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] p-4">
        <div className="max-w-4xl mx-auto text-center py-20">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4">{error || 'Order Not Found'}</h1>
          <Link to="/food/orders">
            <Button>Back to Orders</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return "Date not available"
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    const printContent = invoiceRef.current.innerHTML
    const displayOrderId = getOrderDisplayId(order, orderId)

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${displayOrderId}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              color: #333;
            }
            .invoice-header {
              border-bottom: 2px solid #EB590E;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .invoice-title {
              font-size: 32px;
              font-weight: bold;
              color: #EB590E;
              margin-bottom: 10px;
            }
            .invoice-details {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin: 30px 0;
            }
            .invoice-items {
              margin: 30px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            th, td {
              padding: 12px;
              text-align: left;
              border-bottom: 1px solid #ddd;
            }
            th {
              background-color: #fed7aa;
              font-weight: bold;
            }
            .total-section {
              margin-top: 30px;
              text-align: right;
            }
            .total-row {
              padding: 10px 0;
              font-size: 18px;
            }
            .grand-total {
              font-size: 24px;
              font-weight: bold;
              color: #EB590E;
              border-top: 2px solid #EB590E;
              padding-top: 10px;
            }
            @media print {
              body { margin: 0; padding: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  const handleDownloadPDF = () => {
    handlePrint()
  }

  const invoiceItems = getInvoiceItems(order)
  const invoiceSubtotal = getInvoiceSubtotal(order)
  const pricing = order?.pricing || {}
  const invoiceDeliveryFee = toMoneyNumber(order?.deliveryFee ?? pricing.deliveryFee)
  const invoicePackagingFee = toMoneyNumber(order?.packagingFee ?? pricing.packagingFee)
  const invoicePlatformFee = toMoneyNumber(order?.platformFee ?? pricing.platformFee)
  const invoiceTax = toMoneyNumber(order?.tax ?? order?.gst ?? pricing.tax ?? pricing.gst)
  const invoiceCouponByAdmin = toMoneyNumber(pricing.couponByAdmin ?? order?.couponByAdmin)
  const invoiceCouponByRestaurant = toMoneyNumber(pricing.couponByRestaurant ?? order?.couponByRestaurant)
  const invoiceOfferByRestaurant = toMoneyNumber(pricing.offerByRestaurant ?? order?.offerByRestaurant)
  const invoiceDiscount = toMoneyNumber(order?.discount ?? pricing.discount)
  const shownDiscountBreakdown = invoiceCouponByAdmin + invoiceCouponByRestaurant + invoiceOfferByRestaurant
  const invoiceOtherDiscount = Math.max(0, invoiceDiscount - shownDiscountBreakdown)
  const invoicePreviousDue = toMoneyNumber(order?.previousDue ?? pricing.previousDue)
  const invoiceTotal = toMoneyNumber(
    order?.totalPayable ??
    pricing.totalPayable ??
    order?.total ??
    order?.totalAmount ??
    pricing.total
  ) || (
    invoiceSubtotal +
    invoiceDeliveryFee +
    invoicePackagingFee +
    invoicePlatformFee +
    invoiceTax +
    invoicePreviousDue -
    Math.max(invoiceDiscount, shownDiscountBreakdown)
  )
  const invoiceStatus = String(order?.status || order?.orderStatus || "delivered").toUpperCase()
  const invoicePayment =
    order?.paymentMethod?.type ||
    order?.paymentMethod ||
    order?.payment?.method ||
    "Card"
  const displayOrderId = getOrderDisplayId(order, orderId)
  const customer = getCustomerDetails(order)

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-brand-50/60 via-white to-slate-50 dark:from-[#0a0a0a] dark:via-[#1a1a1a] dark:to-[#0a0a0a] p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
        <ScrollReveal>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Link to={`/food/orders/${orderId}`}>
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Invoice</h1>
                <p className="text-muted-foreground text-sm sm:text-base">Order {displayOrderId}</p>
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <Button
                variant="outline"
                onClick={handlePrint}
                className="flex items-center gap-2 text-xs sm:text-sm h-9 sm:h-10"
              >
                <Printer className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Print</span>
              </Button>
              <Button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 text-xs sm:text-sm h-9 sm:h-10 text-white"
                style={{ background: BRAND_THEME.gradients.primary }}
              >
                <Download className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                <span className="hidden sm:inline text-white">Download PDF</span>
                <span className="sm:hidden text-white">PDF</span>
              </Button>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <Card ref={invoiceRef} className="dark:bg-[#1a1a1a] dark:border-gray-800">
            <CardContent className="p-4 sm:p-6 md:p-8 lg:p-10">
              {/* Invoice Header */}
              <div className="invoice-header">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <FileText className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: BRAND_THEME.colors.brand.primary }} />
                  <h2 className="invoice-title text-xl sm:text-2xl md:text-3xl font-bold" style={{ color: BRAND_THEME.colors.brand.primary }}>INVOICE</h2>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">{companyName}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Food Delivery Platform</p>
                  </div>
                  <Badge className="text-white text-sm sm:text-base md:text-lg px-3 sm:px-4 py-1.5 sm:py-2 w-fit" style={{ background: BRAND_THEME.gradients.primary }}>
                    {invoiceStatus}
                  </Badge>
                </div>
              </div>

              {/* Invoice Details */}
              <div className="invoice-details grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mt-4 sm:mt-6">
                <div>
                  <h3 className="font-bold mb-2 text-sm sm:text-base">Bill To:</h3>
                  <p className="text-xs sm:text-sm font-semibold">{customer.name}</p>
                  {customer.phone ? <p className="text-xs sm:text-sm">{customer.phone}</p> : null}
                  {customer.addressLines.length ? (
                    customer.addressLines.map((line, index) => (
                      <p key={`${line}-${index}`} className="text-xs sm:text-sm">{line}</p>
                    ))
                  ) : (
                    <p className="text-xs sm:text-sm text-muted-foreground">Address not available</p>
                  )}
                </div>
                <div className="text-left sm:text-right">
                  <h3 className="font-bold mb-2 text-sm sm:text-base">Invoice Details:</h3>
                  <p className="text-xs sm:text-sm"><strong>Invoice #:</strong> {displayOrderId}</p>
                  <p className="text-xs sm:text-sm"><strong>Date:</strong> {formatDate(order.createdAt)}</p>
                  <p className="text-xs sm:text-sm"><strong>Payment:</strong> {String(invoicePayment).toUpperCase()}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="invoice-items mt-4 sm:mt-6">
                <h3 className="font-bold mb-3 sm:mb-4 text-sm sm:text-base">Order Items:</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr>
                        <th className="px-2 sm:px-3 py-2 text-left">Item</th>
                        <th className="px-2 sm:px-3 py-2 text-center hidden sm:table-cell">Quantity</th>
                        <th className="px-2 sm:px-3 py-2 text-right hidden md:table-cell">Unit Price</th>
                        <th className="px-2 sm:px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceItems.map((item, index) => {
                        const itemPrice = toMoneyNumber(item?.price ?? item?.unitPrice ?? item?.basePrice)
                        const itemQuantity = Math.max(1, toMoneyNumber(item?.quantity || 1))
                        const itemTotal = toMoneyNumber(item?.total ?? item?.lineTotal) || itemPrice * itemQuantity
                        const itemMetaLines = getItemMetaLines(item)
                        return (
                        <tr key={item?.id || item?._id || item?.itemId || index} className="border-b">
                          <td className="px-2 sm:px-3 py-2 sm:py-3">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <img
                                src={item?.image || ""}
                                alt={item?.name || "Item"}
                                className="w-8 h-8 sm:w-12 sm:h-12 object-cover rounded flex-shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="font-medium block">{item?.name || item?.foodName || "Item"}</span>
                                {itemMetaLines.map((line) => (
                                  <span key={line} className="text-xs text-gray-500 block">{line}</span>
                                ))}
                                <span className="text-muted-foreground sm:hidden text-xs block">
                                  Qty: {itemQuantity} x {formatCurrency(itemPrice)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 py-2 sm:py-3 text-center hidden sm:table-cell">{itemQuantity}</td>
                          <td className="px-2 sm:px-3 py-2 sm:py-3 text-right hidden md:table-cell">{formatCurrency(itemPrice)}</td>
                          <td className="px-2 sm:px-3 py-2 sm:py-3 text-right font-medium">{formatCurrency(itemTotal)}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Section */}
              <div className="total-section mt-4 sm:mt-6">
                <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(invoiceSubtotal)}</span>
                </div>
                <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2">
                  <span>Delivery Fee:</span>
                  <span>{formatCurrency(invoiceDeliveryFee)}</span>
                </div>
                {invoicePackagingFee > 0 ? (
                  <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2">
                    <span>Packaging Fee:</span>
                    <span>{formatCurrency(invoicePackagingFee)}</span>
                  </div>
                ) : null}
                {invoicePlatformFee > 0 ? (
                  <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2">
                    <span>Platform Fee:</span>
                    <span>{formatCurrency(invoicePlatformFee)}</span>
                  </div>
                ) : null}
                <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2">
                  <span>Tax:</span>
                  <span>{formatCurrency(invoiceTax)}</span>
                </div>
                {invoiceCouponByAdmin > 0 ? (
                  <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2 text-green-700">
                    <span>Admin Coupon:</span>
                    <span>-{formatCurrency(invoiceCouponByAdmin)}</span>
                  </div>
                ) : null}
                {invoiceCouponByRestaurant > 0 ? (
                  <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2 text-green-700">
                    <span>Restaurant Coupon:</span>
                    <span>-{formatCurrency(invoiceCouponByRestaurant)}</span>
                  </div>
                ) : null}
                {invoiceOfferByRestaurant > 0 ? (
                  <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2 text-green-700">
                    <span>Restaurant Offer:</span>
                    <span>-{formatCurrency(invoiceOfferByRestaurant)}</span>
                  </div>
                ) : null}
                {invoiceOtherDiscount > 0 ? (
                  <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2 text-green-700">
                    <span>Discount:</span>
                    <span>-{formatCurrency(invoiceOtherDiscount)}</span>
                  </div>
                ) : null}
                {invoicePreviousDue > 0 ? (
                  <div className="total-row flex justify-between text-xs sm:text-sm sm:text-base py-1 sm:py-2">
                    <span>Previous Due:</span>
                    <span>{formatCurrency(invoicePreviousDue)}</span>
                  </div>
                ) : null}
                <div className="grand-total flex justify-between text-base sm:text-lg md:text-xl md:text-2xl pt-2 sm:pt-3 mt-2 sm:mt-3 border-t-2" style={{ borderColor: BRAND_THEME.colors.brand.primary }}>
                  <span>Total:</span>
                  <span>{formatCurrency(invoiceTotal)}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t text-center text-xs sm:text-sm text-muted-foreground">
                <p>Thank you for your order!</p>
                <p className="mt-1 sm:mt-2">For any queries, please contact our support team.</p>
              </div>
            </CardContent>
          </Card>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 no-print">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/food/orders/${encodeURIComponent(String(orderId))}`)}
              className="flex-1 w-full text-sm sm:text-base h-10 sm:h-11"
            >
              Track Order
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/food/orders")}
              className="flex-1 w-full text-sm sm:text-base h-10 sm:h-11"
            >
              Back to Orders
            </Button>
          </div>
        </ScrollReveal>
      </div>
    </AnimatedPage>
  )
}
