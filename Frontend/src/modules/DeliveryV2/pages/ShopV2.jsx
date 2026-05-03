import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { deliveryAPI } from '@food/api';
import { getCachedSettings, loadBusinessSettings } from '@food/utils/businessSettings';
import { initRazorpayPayment } from '@food/utils/razorpay';
import { toast } from 'sonner';
import {
  ChevronRight,
  Download,
  FileText,
  ListOrdered,
  Loader2,
  Package,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  X,
} from 'lucide-react';
import { BRAND_THEME } from '@/config/brandTheme';

const RUPEE = '\u20B9';
const BRAND_PRIMARY = BRAND_THEME?.colors?.brand?.primary || '#2979fb';
const BRAND_PRIMARY_DARK = BRAND_THEME?.colors?.brand?.primaryDark || '#1e5fd1';
const BRAND_SOFT = BRAND_THEME?.colors?.brand?.primarySoft || '#eaf2ff';

const formatCurrency = (value) => `${RUPEE}${Number(value || 0).toFixed(2)}`;
const formatPdfCurrency = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;
const formatInvoiceDate = (value) => {
  if (!value) return '--';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPartnerName = (partner) => {
  if (!partner) return 'Delivery Partner';

  return (
    partner.name ||
    [partner.firstName, partner.lastName].filter(Boolean).join(' ') ||
    partner.fullName ||
    'Delivery Partner'
  );
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const imageUrlToDataUrl = async (url) => {
  if (!url) return null;
  if (String(url).startsWith('data:')) return url;

  try {
    const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
};

const getStatusClasses = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  const statusMap = {
    confirmed: 'bg-sky-50 text-sky-700',
    delivered: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-700',
    pending: 'bg-amber-50 text-amber-700',
  };

  return statusMap[normalizedStatus] || 'bg-slate-100 text-slate-600';
};

const getProductPrice = (product) => {
  if (Array.isArray(product?.variants) && product.variants.length > 0) {
    const firstValidVariant = product.variants.find((variant) => Number(variant?.price) > 0);
    return Number(firstValidVariant?.price ?? product.variants[0]?.price ?? 0);
  }

  return Number(product?.price) || 0;
};

const buildCartKey = (productId, variantId) => `${String(productId || '')}:${String(variantId || '')}`;

const getCartStorageKey = () => 'delivery_shop_cart_v1';

const getVariantStockFromProducts = (products, productId, variantId) => {
  const product = Array.isArray(products)
    ? products.find((entry) => String(entry?._id) === String(productId))
    : null;
  const variant = Array.isArray(product?.variants)
    ? product.variants.find((entry) => String(entry?._id) === String(variantId))
    : null;

  return Math.max(0, Number(variant?.stock) || 0);
};

function ProductCard({ product, onOrder, onQuickAddToCart }) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const hasStock = variants.some((variant) => Number(variant?.stock) > 0);
  const availableVariants = variants.filter((variant) => Number(variant?.stock) > 0);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const selectedVariant =
    availableVariants.find((variant) => String(variant?._id) === String(selectedVariantId)) ||
    availableVariants[0] ||
    variants[0] ||
    null;

  useEffect(() => {
    const preferredVariant = availableVariants[0] || variants[0] || null;
    setSelectedVariantId(preferredVariant?._id ? String(preferredVariant._id) : '');
  }, [product?._id]);

  const selectedVariantStock = Number(selectedVariant?.stock) || 0;
  const canAddSelectedVariant = Boolean(selectedVariant?._id) && selectedVariantStock > 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]">
      <div className="relative h-32 shrink-0 overflow-hidden" style={{ backgroundColor: BRAND_SOFT }}>
        {product?.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center opacity-40">
            <Package className="h-6 w-6" style={{ color: BRAND_PRIMARY }} />
          </div>
        )}

        {!hasStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
            <span className="rounded-md bg-slate-900/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-700">
              Out of Stock
            </span>
          </div>
        )}

        {product?.category && (
          <span
            className="absolute left-2 top-2 rounded-lg bg-white/90 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-md"
            style={{ color: BRAND_PRIMARY }}
          >
            {product.category}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="line-clamp-2 min-w-0 flex-1 text-[12px] font-bold leading-tight text-slate-950">
              {product?.name || 'Store Item'}
            </h3>
            <p className="shrink-0 text-[13px] font-bold" style={{ color: BRAND_PRIMARY }}>
              {selectedVariant ? formatCurrency(selectedVariant?.price) : formatCurrency(getProductPrice(product))}
            </p>
          </div>

          <div className="space-y-2">
            <select
              value={selectedVariant?._id ? String(selectedVariant._id) : ''}
              onChange={(event) => {
                event.stopPropagation();
                setSelectedVariantId(event.target.value);
              }}
              disabled={!hasStock}
              className="h-9 w-full rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-0 text-[11px] font-medium text-slate-600 outline-none transition focus:border-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {variants.length === 0 ? (
                <option value="">No variants</option>
              ) : (
                variants.map((variant) => (
                  <option
                    key={variant._id}
                    value={variant._id}
                    disabled={Number(variant?.stock) <= 0}
                  >
                    {variant?.name || 'Standard'} {Number(variant?.stock) > 0 ? '' : ' (Sold out)'}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              onClick={() => {
                if (!canAddSelectedVariant) {
                  toast.error('Unavailable');
                  return;
                }
                onQuickAddToCart(product, selectedVariant);
              }}
              disabled={!canAddSelectedVariant}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold text-white shadow-sm shadow-brand-primary/10 transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              style={{ backgroundColor: canAddSelectedVariant ? BRAND_PRIMARY : undefined }}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {canAddSelectedVariant ? 'Add' : 'Sold out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductSelectionModal({ product, onClose, onAddToCart, existingCartEntry }) {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const firstAvailableVariant = variants.find((variant) => Number(variant?.stock) > 0) || null;

    if (existingCartEntry?.variantId) {
      const existingVariant =
        variants.find((variant) => String(variant?._id) === String(existingCartEntry.variantId)) || firstAvailableVariant;
      setSelectedVariant(existingVariant);
      setQuantity(Math.max(1, Number(existingCartEntry.quantity) || 1));
      return;
    }

    setSelectedVariant(firstAvailableVariant);
    setQuantity(1);
  }, [product, existingCartEntry]);

  if (!product) return null;

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const maxQuantity = Math.max(0, Number(selectedVariant?.stock) || 0);
  const unitPrice = Number(selectedVariant?.price) || 0;
  const totalAmount = unitPrice * quantity;

  const handleAddItem = () => {
    if (!selectedVariant?._id) {
      toast.error('Please select a variant');
      return;
    }

    onAddToCart({
      cartKey: buildCartKey(product?._id, selectedVariant?._id),
      productId: product?._id,
      productName: product?.name || 'Store Item',
      productImage: product?.image || '',
      category: product?.category || '',
      variantId: selectedVariant?._id,
      variantName: selectedVariant?.name || 'Standard',
      unitPrice,
      quantity,
      stock: Number(selectedVariant?.stock) || 0,
    });

    toast.success(existingCartEntry ? 'Cart item updated' : 'Added to cart');
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[800] flex items-end justify-center px-4 sm:items-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative mb-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl sm:mb-0"
        >
          <div className="flex items-start justify-between border-b border-slate-100 p-4">
            <div className="pr-4">
              <h2 className="text-sm font-bold text-slate-900">{product?.name || 'Store Item'}</h2>
              {product?.category ? (
                <p className="mt-0.5 text-xs text-slate-500">{product.category}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg bg-slate-50 p-1 text-slate-500 transition-colors hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-700">Select Variant</p>

              <div className="space-y-1.5">
                {variants.map((variant) => {
                  const isActive = selectedVariant?._id === variant?._id;
                  const isDisabled = Number(variant?.stock) === 0;

                  return (
                    <button
                      key={variant._id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        setSelectedVariant(variant);
                        setQuantity(1);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all ${
                        isActive ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                      style={{ borderColor: isActive ? BRAND_PRIMARY : undefined }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2"
                          style={{ borderColor: isActive ? BRAND_PRIMARY : '#cbd5e1' }}
                        >
                          {isActive ? (
                            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND_PRIMARY }} />
                          ) : null}
                        </div>

                        <div>
                          <p className="text-[13px] font-semibold text-slate-800">{variant?.name || 'Variant'}</p>
                        </div>
                      </div>

                      <p className="text-sm font-bold text-slate-900">
                        {RUPEE}
                        {Number(variant?.price) || 0}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedVariant ? (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs font-semibold text-slate-700">Quantity</p>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((currentQuantity) => Math.max(1, currentQuantity - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 transition-colors active:bg-slate-100"
                  >
                    -
                  </button>

                  <span className="min-w-[1rem] text-center text-sm font-bold text-slate-900">{quantity}</span>

                  <button
                    type="button"
                    onClick={() => setQuantity((currentQuantity) => Math.min(maxQuantity, currentQuantity + 1))}
                    disabled={quantity >= maxQuantity}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 transition-colors active:bg-slate-100 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}

          </div>

          {selectedVariant ? (
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 p-4">
              <div>
                <p className="text-[10px] font-medium text-slate-500">Order Total</p>
                <p className="text-base font-bold text-slate-900">
                  {RUPEE}
                  {totalAmount}
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: BRAND_PRIMARY }}
              >
                <ShoppingCart className="h-4 w-4" />
                {existingCartEntry ? 'Update Cart' : 'Add to Cart'}
              </button>
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ShopCartSheet({
  cartItems,
  onClose,
  onRemoveItem,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onCheckout,
  processingCart,
}) {
  const cartTotal = cartItems.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0);
  const totalUnits = cartItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[840] flex items-end justify-center px-4 sm:items-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          className="relative w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Partner Shop Order</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                {cartItems.length} item{cartItems.length === 1 ? '' : 's'} selected
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {totalUnits} total unit{totalUnits === 1 ? '' : 's'} ready for order
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-50 p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
            {cartItems.map((item) => (
              <div key={item.cartKey} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {item.productImage ? (
                      <img src={item.productImage} alt={item.productName} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-slate-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="truncate text-sm font-semibold text-slate-900">{item.productName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.variantName}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatCurrency((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0))}
                        </p>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.cartKey)}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-500"
                          aria-label={`Remove ${item.productName}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-500">
                        {formatCurrency(item.unitPrice)} each
                      </span>
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => onDecreaseQuantity(item.cartKey)}
                          disabled={Number(item.quantity) <= 1}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-semibold text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          -
                        </button>
                        <span className="min-w-[22px] text-center text-sm font-semibold text-slate-800">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onIncreaseQuantity(item.cartKey)}
                          disabled={Number(item.quantity) >= Number(item.stock || 0)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-semibold text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50 px-5 py-4">
            <div className="min-w-[110px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Order Total</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrency(cartTotal)}</p>
            </div>

            <button
              type="button"
              onClick={onCheckout}
              disabled={processingCart || cartItems.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: BRAND_PRIMARY }}
            >
              {processingCart ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              {processingCart ? 'Processing Orders' : 'Confirm Order'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}



const generateAndDownloadInvoice = async ({
  orderGroup,
  companyName,
  companyLogoUrl,
  partnerName,
  partnerPhone,
}) => {
  console.log('Generating invoice for group:', orderGroup?.groupKey);
  const downloadToast = toast.loading('Preparing your invoice...');
  try {
    const jspdfModule = await import('jspdf');
    const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
    
    if (!jsPDF) {
      console.error('jsPDF load failed: module is', jspdfModule);
      throw new Error('Could not load PDF library');
    }

    const firstOrder = orderGroup.orders?.[0] || null;
    const invoiceId = orderGroup?.groupKey ? String(orderGroup.groupKey).slice(-8).toUpperCase() : 'STORE001';

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const safeCompanyName = companyName || 'Partner Shop';
    const safePartnerName = partnerName || 'Delivery Partner';
    const safePartnerPhone = partnerPhone || '--';
    const logoDataUrl = await imageUrlToDataUrl(companyLogoUrl);
    const invoiceNumber = `INV-${invoiceId}`;
    const orderedOn = formatInvoiceDate(orderGroup?.createdAt);
    const totalAmount = Number(orderGroup?.totalAmount) || 0;
    const orderStatus = String(orderGroup?.orderStatus || 'pending');
    const paymentMethod = String(firstOrder?.paymentMethod || 'online').toUpperCase();
    const paymentStatus = String(firstOrder?.paymentStatus || 'pending').toUpperCase();
    const orderRows = Array.isArray(orderGroup?.orders) ? orderGroup.orders : [];

    doc.setFillColor(0, 81, 40);
    doc.rect(0, 0, pageWidth, 42, 'F');
    doc.setFillColor(255, 255, 255);
    doc.setGState(new doc.GState({ opacity: 0.08 }));
    doc.circle(pageWidth - 20, 10, 16, 'F');
    doc.circle(pageWidth - 8, 30, 20, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));

    if (logoDataUrl) {
      try {
        const logoFormat = logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(logoDataUrl, logoFormat, 14, 8, 22, 22, undefined, 'FAST');
      } catch {
        // Ignore image rendering issues and continue with text branding.
      }
    } else {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(14, 8, 22, 22, 4, 4, 'F');
      doc.setTextColor(0, 81, 40);
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text((safeCompanyName[0] || 'S').toUpperCase(), 25, 22, { align: 'center' });
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(17);
    doc.text(safeCompanyName, 42, 16);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Delivery Partner Store Invoice', 42, 23);
    doc.text(`Invoice No: ${invoiceNumber}`, pageWidth - 14, 14, { align: 'right' });
    doc.text(`Date: ${orderedOn}`, pageWidth - 14, 20, { align: 'right' });
    doc.text(`Status: ${orderStatus}`, pageWidth - 14, 26, { align: 'right' });
    doc.text(`Payment: ${paymentStatus}`, pageWidth - 14, 32, { align: 'right' });

    const drawCard = (title, x, y, width, rows, accent = [0, 81, 40]) => {
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, width, 34, 3, 3, 'FD');
      doc.setFillColor(...accent);
      doc.roundedRect(x, y, width, 7, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8.5);
      doc.text(title, x + 4, y + 4.8);

      doc.setTextColor(71, 85, 105);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8.5);

      let currentY = y + 12;
      rows.forEach((row) => {
        doc.setFont(undefined, 'bold');
        doc.text(`${row.label}:`, x + 4, currentY);
        doc.setFont(undefined, 'normal');
        const valueLines = doc.splitTextToSize(String(row.value || '--'), width - 26);
        doc.text(valueLines, x + 21, currentY);
        currentY += Math.max(5, valueLines.length * 4);
      });
    };

    drawCard(
      'Company',
      14,
      50,
      58,
      [
        { label: 'App', value: safeCompanyName },
        { label: 'Document', value: 'Store Purchase Invoice' },
        { label: 'Source', value: 'Partner Shop' },
      ],
      [0, 81, 40],
    );

    drawCard(
      'Delivery Boy',
      76,
      50,
      58,
      [
        { label: 'Name', value: safePartnerName },
        { label: 'Phone', value: safePartnerPhone },
        { label: 'Role', value: 'Delivery Partner' },
      ],
      [37, 99, 235],
    );

    drawCard(
      'Order Details',
      138,
      50,
      58,
      [
        { label: 'Items', value: String(orderGroup?.itemCount || 0) },
        { label: 'Units', value: String(orderGroup?.totalUnits || 0) },
        { label: 'Status', value: orderStatus },
      ],
      [249, 115, 22],
    );

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 92, pageWidth - 28, 56, 3, 3, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Invoice Summary', 18, 101);

    const summaryRows = [
      ['Invoice ID', invoiceNumber],
      ['Ordered On', orderedOn],
      ['Payment Method', paymentMethod],
      ['Payment Status', paymentStatus],
      ['Order Status', orderStatus],
    ];

    let summaryY = 111;
    doc.setFontSize(9.5);
    summaryRows.forEach(([label, value]) => {
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, 18, summaryY);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(String(value || '--'), pageWidth - 18, summaryY, { align: 'right' });
      summaryY += 8;
    });

    doc.roundedRect(14, 156, pageWidth - 28, 76, 3, 3, 'S');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Items Breakdown', 18, 166);

    const tableTop = 174;
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Product', 18, tableTop);
    doc.text('Variant', 90, tableTop);
    doc.text('Qty', 145, tableTop, { align: 'center' });
    doc.text('Price', pageWidth - 18, tableTop, { align: 'right' });

    let billY = tableTop + 8;
    doc.setFont(undefined, 'normal');
    doc.setTextColor(15, 23, 42);
    orderRows.slice(0, 4).forEach((entry) => {
      doc.text(String(entry?.productName || 'Store Item'), 18, billY, { maxWidth: 64 });
      doc.text(String(entry?.variantName || 'Standard'), 90, billY, { maxWidth: 42 });
      doc.text(String(entry?.quantity || 1), 145, billY, { align: 'center' });
      doc.text(formatPdfCurrency(entry?.totalAmount), pageWidth - 18, billY, { align: 'right' });
      billY += 8;
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(18, billY - 2, pageWidth - 18, billY - 2);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 81, 40);
    doc.text('Total Amount', 18, billY + 6);
    doc.text(formatPdfCurrency(totalAmount), pageWidth - 18, billY + 6, { align: 'right' });

    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(14, 242, pageWidth - 28, 24, 3, 3, 'FD');
    doc.setTextColor(22, 101, 52);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9.5);
    doc.text('Note', 18, 251);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);
    doc.text(
      'Please keep this invoice ready during delivery confirmation, support queries, or payment reference.',
      18,
      258,
      { maxWidth: pageWidth - 36 },
    );

    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 16, pageWidth - 14, pageHeight - 16);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated by ${safeCompanyName}`, 14, pageHeight - 10);
    doc.text(`Issued for ${safePartnerName}`, pageWidth - 14, pageHeight - 10, { align: 'right' });

    doc.save(`${safeCompanyName.replace(/\s+/g, '_')}_Invoice_${invoiceId}.pdf`);
    toast.success('Invoice downloaded successfully', { id: downloadToast });
    console.log('Invoice download complete');
  } catch (error) {
    console.error('Invoice Download error:', error);
    toast.error('Failed to download invoice PDF', { id: downloadToast });
  }
};

function OrderDetailsModal({ orderGroup, onClose, products, onViewInvoice }) {
  if (!orderGroup) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[850] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          className="relative mb-8 w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl sm:mb-0"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Details</p>
              <h2 className="mt-0.5 text-base font-bold text-slate-900">{orderGroup.itemCount} item{orderGroup.itemCount === 1 ? '' : 's'}</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-50 p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto space-y-2.5 p-3.5">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Order Date</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-900">{formatInvoiceDate(orderGroup.createdAt)}</p>
              </div>
              <span className={`rounded-lg px-2 py-0.5 text-[9px] font-bold uppercase ${getStatusClasses(orderGroup.orderStatus)}`}>
                {orderGroup.orderStatus}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Items</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price</p>
              </div>

              <div className="divide-y divide-slate-100">
                {orderGroup.orders.map((order) => {
                  return (
                    <div key={order._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="flex gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                          <Package className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-slate-900">{order?.productName || 'Item'}</p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                            <span className="font-semibold text-slate-500">{order?.variantName || 'Std'}</span>
                            <span className="font-bold" style={{ color: BRAND_PRIMARY }}>Qty: {order?.quantity || 1}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-bold text-slate-900">
                          {formatCurrency(Number(order?.totalAmount) || (Number(order?.unitPrice) * (order?.quantity || 1)))}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-xs font-semibold text-slate-600">Total Paid</p>
              <p className="text-base font-bold" style={{ color: BRAND_PRIMARY }}>{formatCurrency(orderGroup.totalAmount)}</p>
            </div>

            <button
              type="button"
              onClick={() => onViewInvoice(orderGroup)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-brand-primary/10"
              style={{ backgroundColor: BRAND_PRIMARY }}
            >
              <Download className="h-3.5 w-3.5" />
              Download Invoice
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function OrderHistoryItem({ orderGroup, onViewDetails }) {
  return (
    <div className="group relative mb-3 flex w-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all hover:border-slate-200 hover:shadow-md">
      <button
        type="button"
        onClick={() => onViewDetails(orderGroup)}
        className="text-left active:scale-[0.99] transition-transform"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="relative">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                {orderGroup?.coverImage ? (
                  <img src={orderGroup.coverImage} alt={orderGroup.title} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-5 w-5" style={{ color: BRAND_PRIMARY }} />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="mb-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Order ID: {String(orderGroup.groupKey || '#').slice(-8).toUpperCase()}
              </p>
              <h3 className="truncate text-sm font-bold leading-tight text-slate-900">
                {orderGroup?.title || 'Store Order'}
              </h3>

              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-lg px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getStatusClasses(orderGroup?.orderStatus)}`}>
                  {orderGroup?.orderStatus || 'pending'}
                </span>

                <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                  <span className="h-0.5 w-0.5 rounded-full bg-slate-300" />
                  {orderGroup?.createdAt
                    ? new Date(orderGroup.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                    : '--'}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 pt-0.5 text-right">
            <p className="text-base font-bold tracking-tight" style={{ color: BRAND_PRIMARY_DARK }}>
              {formatCurrency(orderGroup?.totalAmount)}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">Total Paid</p>
          </div>
        </div>
      </button>

      <div className="mt-3.5 flex items-center justify-between rounded-xl bg-slate-50/60 px-3 py-2.5">
        <button 
          type="button" 
          onClick={() => onViewDetails(orderGroup)}
          className="flex items-center gap-2.5 text-left"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-sm">
            <ShoppingBag className="h-3.5 w-3.5" style={{ color: BRAND_PRIMARY }} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-900">{orderGroup.itemCount} Item{orderGroup.itemCount === 1 ? '' : 's'}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onViewDetails(orderGroup)}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" 
          style={{ color: BRAND_PRIMARY }}
        >
          Details
          <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

export default function ShopV2() {
  const [activeTab, setActiveTab] = useState('browse');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingCartItem, setEditingCartItem] = useState(null);
  const [selectedOrderGroup, setSelectedOrderGroup] = useState(null);
  const [shopCart, setShopCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem(getCartStorageKey());
      return savedCart ? JSON.parse(savedCart) : [];
    } catch {
      return [];
    }
  });
  const [showCartSheet, setShowCartSheet] = useState(false);
  const [processingCart, setProcessingCart] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [businessSettings, setBusinessSettings] = useState(() => getCachedSettings());
  const [partnerProfile, setPartnerProfile] = useState(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const response = await deliveryAPI.getStoreProducts({ limit: 100 });
      const productList = response?.data?.data?.products || response?.data?.products || [];
      setProducts(Array.isArray(productList) ? productList : []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const response = await deliveryAPI.getMyStoreOrders({ limit: 50 });
      const orderList = response?.data?.data?.orders || response?.data?.orders || [];
      setOrders(Array.isArray(orderList) ? orderList : []);
      setOrdersLoaded(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const loadInvoiceMeta = async () => {
      try {
        const [settingsResponse, profileResponse] = await Promise.allSettled([
          loadBusinessSettings(),
          deliveryAPI.getProfile(),
        ]);

        if (settingsResponse.status === 'fulfilled' && settingsResponse.value) {
          setBusinessSettings(settingsResponse.value);
        }

        if (profileResponse.status === 'fulfilled') {
          const profile = profileResponse.value?.data?.data?.profile || profileResponse.value?.data?.profile || null;
          setPartnerProfile(profile);
        }
      } catch {
        // Keep invoice metadata best-effort without interrupting the page.
      }
    };

    loadInvoiceMeta();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders' && !ordersLoaded) {
      fetchOrders();
    }
  }, [activeTab, ordersLoaded, fetchOrders]);

  useEffect(() => {
    try {
      localStorage.setItem(getCartStorageKey(), JSON.stringify(shopCart));
    } catch {
      // Ignore storage failures and keep cart in memory.
    }
  }, [shopCart]);

  useEffect(() => {
    if (!products.length) return;

    setShopCart((currentCart) => {
      let hasChanges = false;

      const nextCart = currentCart
        .map((item) => {
          const latestStock = getVariantStockFromProducts(products, item.productId, item.variantId);
          const nextQuantity = Math.min(Math.max(1, Number(item.quantity) || 1), latestStock || 1);

          if (latestStock <= 0) {
            hasChanges = true;
            return null;
          }

          if (Number(item.stock || 0) !== latestStock || Number(item.quantity || 0) !== nextQuantity) {
            hasChanges = true;
            return {
              ...item,
              stock: latestStock,
              quantity: nextQuantity,
            };
          }

          return item;
        })
        .filter(Boolean);

      return hasChanges ? nextCart : currentCart;
    });
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) return products;

    return products.filter((product) => {
      const productName = String(product?.name || '').toLowerCase();
      const categoryName = String(product?.category || '').toLowerCase();
      return productName.includes(normalizedQuery) || categoryName.includes(normalizedQuery);
    });
  }, [products, searchQuery]);

  const cartItemsCount = useMemo(
    () => shopCart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    [shopCart],
  );

  const cartDistinctItemsCount = useMemo(() => shopCart.length, [shopCart]);

  const cartAmount = useMemo(
    () => shopCart.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0),
    [shopCart],
  );

  const groupedOrders = useMemo(() => {
    const groups = new Map();

    orders.forEach((order) => {
      const groupKey = String(order?.checkoutGroupId || order?._id || '');
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.orders.push(order);
        existingGroup.totalAmount += Number(order?.totalAmount) || 0;
        existingGroup.totalUnits += Number(order?.quantity) || 0;
        existingGroup.itemCount += 1;
        return;
      }

      groups.set(groupKey, {
        groupKey,
        orders: [order],
        coverImage: order?.productImage || '',
        title: order?.productName || 'Store Order',
        totalAmount: Number(order?.totalAmount) || 0,
        totalUnits: Number(order?.quantity) || 0,
        itemCount: 1,
        createdAt: order?.createdAt,
        orderStatus: order?.orderStatus || 'pending',
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        title: group.itemCount > 1 ? `${group.orders[0]?.productName || 'Store Order'} +${group.itemCount - 1} more` : (group.orders[0]?.productName || 'Store Order'),
      }))
      .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
  }, [orders]);

  const addOrUpdateCartItem = (item) => {
    setShopCart((currentCart) => {
      const existingIndex = currentCart.findIndex((cartItem) => cartItem.cartKey === item.cartKey);

      if (existingIndex >= 0) {
        const updatedCart = [...currentCart];
        updatedCart[existingIndex] = item;
        return updatedCart;
      }

      return [...currentCart, item];
    });
    setEditingCartItem(null);
  };

  const handleQuickAddToCart = (product, variant) => {
    const normalizedVariantStock = Number(variant?.stock) || 0;

    if (!variant?._id || normalizedVariantStock <= 0) {
      toast.error('This variant is currently unavailable');
      return;
    }

    const cartKey = buildCartKey(product?._id, variant?._id);
    const existingCartItem = shopCart.find((item) => item.cartKey === cartKey);
    const nextQuantity = Math.min(normalizedVariantStock, (Number(existingCartItem?.quantity) || 0) + 1);

    if (existingCartItem && nextQuantity === Number(existingCartItem.quantity || 0)) {
      toast.error('Selected variant is already at maximum stock in your cart');
      return;
    }

    addOrUpdateCartItem({
      cartKey,
      productId: product?._id,
      productName: product?.name || 'Store Item',
      productImage: product?.image || '',
      category: product?.category || '',
      variantId: variant?._id,
      variantName: variant?.name || 'Standard',
      unitPrice: Number(variant?.price) || 0,
      quantity: nextQuantity,
      stock: normalizedVariantStock,
    });

    toast.success(existingCartItem ? 'Cart quantity updated' : 'Added to cart');
  };

  const handleOpenCartItemEditor = (item) => {
    setEditingCartItem(item);
    setSelectedProduct({
      _id: item.productId,
      name: item.productName,
      image: item.productImage,
      category: item.category,
      variants: products.find((product) => String(product?._id) === String(item.productId))?.variants || [],
    });
  };

  const removeCartItem = (cartKey) => {
    setShopCart((currentCart) => currentCart.filter((item) => item.cartKey !== cartKey));
    toast.success('Item removed from cart');
  };

  const increaseCartItemQuantity = (cartKey) => {
    let blockedByStock = false;

    setShopCart((currentCart) =>
      currentCart.map((item) => {
        if (item.cartKey !== cartKey) return item;

        const maxStock = getVariantStockFromProducts(products, item.productId, item.variantId) || Number(item.stock || 0);
        const currentQuantity = Number(item.quantity || 0);

        if (currentQuantity >= maxStock) {
          blockedByStock = true;
          return { ...item, stock: maxStock };
        }

        return { ...item, stock: maxStock, quantity: currentQuantity + 1 };
      }),
    );

    if (blockedByStock) {
      toast.error('Maximum available stock already added');
    }
  };

  const decreaseCartItemQuantity = (cartKey) => {
    setShopCart((currentCart) =>
      currentCart.map((item) => {
        if (item.cartKey !== cartKey) return item;
        const nextQuantity = Math.max(1, Number(item.quantity || 0) - 1);
        return { ...item, quantity: nextQuantity };
      }),
    );
  };

  const handleCheckoutCart = async () => {
    if (shopCart.length === 0) {
      toast.error('Add items to cart first');
      return;
    }

    try {
      setProcessingCart(true);
      const response = await deliveryAPI.placeBulkStoreOrder({
        items: shopCart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        paymentMethod: 'razorpay',
      });

      const sessionData = response?.data?.data || response?.data;
      if (!sessionData?.razorpayOrderId || !sessionData?.checkoutGroupId) {
        throw new Error('Missing bulk payment session data');
      }

      await new Promise((resolve, reject) => {
        initRazorpayPayment({
          key: sessionData.razorpayKeyId,
          amount: sessionData.amount,
          order_id: sessionData.razorpayOrderId,
          name: businessSettings?.companyName || 'Partner Shop',
          description: `${shopCart.length} store item${shopCart.length === 1 ? '' : 's'}`,
          handler: async (paymentResponse) => {
            try {
              await deliveryAPI.verifyBulkStoreOrder({
                checkoutGroupId: sessionData.checkoutGroupId,
                razorpayPaymentId: paymentResponse.razorpay_payment_id,
                razorpaySignature: paymentResponse.razorpay_signature,
              });
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          onError: (error) => {
            reject(error);
          },
          onClose: () => {
            reject(new Error('Payment cancelled'));
          },
        });
      });

      toast.success('Order placed successfully');
      setShopCart([]);
      setShowCartSheet(false);
      setOrdersLoaded(false);
      await Promise.all([fetchProducts(), fetchOrders()]);
      setActiveTab('orders');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.description || error?.message || 'Unable to complete checkout');
    } finally {
      setProcessingCart(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-24 font-poppins">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
        <h1 className="text-base font-bold text-slate-900">Partner Shop</h1>
        <button
          type="button"
          onClick={() => setShowCartSheet(true)}
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
        >
          <ShoppingCart className="h-4 w-4" />
          {cartDistinctItemsCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ backgroundColor: BRAND_PRIMARY }}
            >
              {cartDistinctItemsCount > 9 ? '9+' : cartDistinctItemsCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="sticky top-[49px] z-30 flex border-b border-slate-100 bg-white px-4">
        {[
          { key: 'browse', label: 'Browse', icon: ShoppingBag },
          { key: 'orders', label: 'My Orders', icon: ListOrdered },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-bold transition-all ${
              activeTab === tab.key ? 'text-slate-900' : 'border-transparent text-slate-400'
            }`}
            style={{ borderColor: activeTab === tab.key ? BRAND_PRIMARY : undefined }}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}

            {tab.key === 'orders' && groupedOrders.length > 0 ? (
              <span
                className="ml-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  backgroundColor: activeTab === tab.key ? BRAND_PRIMARY : '#f1f5f9',
                  color: activeTab === tab.key ? '#ffffff' : '#64748b',
                }}
              >
                {groupedOrders.length > 9 ? '9+' : groupedOrders.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="relative z-10 w-full flex-1 overflow-y-auto px-3 pt-3">
        {activeTab === 'browse' ? (
          <>
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search store items..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-slate-300"
                />
              </div>
            </div>

            {loadingProducts ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-[10px] font-medium uppercase tracking-widest">Loading...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
                <Package className="h-8 w-8 opacity-50" />
                <p className="text-xs font-semibold text-slate-600">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pb-4">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product._id}
                    product={product}
                    onQuickAddToCart={handleQuickAddToCart}
                    onOrder={(selected) => {
                      setEditingCartItem(null);
                      setSelectedProduct(selected);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3 pb-4">
            {loadingOrders ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : groupedOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
                <ListOrdered className="h-8 w-8 opacity-50" />
                <p className="text-xs font-semibold text-slate-600">No orders placed</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('browse')}
                  className="mt-2 text-[11px] font-bold underline"
                  style={{ color: BRAND_PRIMARY }}
                >
                  Browse Store
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2.5 rounded-lg border p-3" style={{ backgroundColor: BRAND_SOFT, borderColor: BRAND_PRIMARY }}>
                  <Store className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND_PRIMARY }} />
                  <div>
                    <p className="mb-0.5 text-xs font-bold" style={{ color: BRAND_PRIMARY_DARK }}>
                      Contact Notice
                    </p>
                    <p className="text-[10px] leading-snug text-slate-700">
                      Keep your payment proof ready. Admin will contact you regarding delivery.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {groupedOrders.map((orderGroup) => (
                    <OrderHistoryItem
                      key={orderGroup.groupKey}
                      orderGroup={orderGroup}
                      onViewDetails={setSelectedOrderGroup}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {activeTab === 'browse' && shopCart.length > 0 ? (
        <div className="fixed bottom-5 left-3 right-3 z-20 sm:left-auto sm:right-5 sm:w-[380px]">
          <button
            type="button"
            onClick={() => setShowCartSheet(true)}
            className="flex w-full items-center justify-between rounded-[24px] px-4 py-3 text-left text-white shadow-[0_18px_45px_-20px_rgba(0,81,40,0.55)]"
            style={{ background: `linear-gradient(135deg, ${BRAND_PRIMARY} 0%, ${BRAND_PRIMARY_DARK} 100%)` }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Cart Ready</p>
                <p className="mt-1 text-sm font-bold">
                  {cartDistinctItemsCount} item{cartDistinctItemsCount === 1 ? '' : 's'} • {cartItemsCount} unit{cartItemsCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      {selectedProduct ? (
        <ProductSelectionModal
          product={selectedProduct}
          existingCartEntry={editingCartItem}
          onClose={() => {
            setSelectedProduct(null);
            setEditingCartItem(null);
          }}
          onAddToCart={addOrUpdateCartItem}
        />
      ) : null}

      {showCartSheet ? (
        <ShopCartSheet
          cartItems={shopCart}
          onClose={() => setShowCartSheet(false)}
          onRemoveItem={removeCartItem}
          onIncreaseQuantity={increaseCartItemQuantity}
          onDecreaseQuantity={decreaseCartItemQuantity}
          onCheckout={handleCheckoutCart}
          processingCart={processingCart}
        />
      ) : null}



      {selectedOrderGroup ? (
        <OrderDetailsModal
          orderGroup={selectedOrderGroup}
          products={products}
          onViewInvoice={async (group) => {
            setSelectedOrderGroup(null);
            try {
              await generateAndDownloadInvoice({
                orderGroup: group,
                companyName: businessSettings?.companyName || BRAND_THEME?.brandName || 'Partner Shop',
                companyLogoUrl: businessSettings?.logo?.url || '',
                partnerName: formatPartnerName(partnerProfile),
                partnerPhone: partnerProfile?.phone || '',
              });
            } catch (err) {
              console.error('Error in detail modal download:', err);
              toast.error('Could not download invoice');
            }
          }}
          onClose={() => setSelectedOrderGroup(null)}
        />
      ) : null}
    </div>
  );
}
