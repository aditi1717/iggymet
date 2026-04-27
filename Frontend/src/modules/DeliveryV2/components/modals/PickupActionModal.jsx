import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ChefHat, MapPin, Phone, 
  ChevronDown, ChevronUp, Package, 
  Navigation
} from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { BRAND_THEME } from '@/config/brandTheme';

/**
 * PickupActionModal - Unified White/Green Theme with slider actions.
 * Flow: Reach pickup -> Picked up (no bill upload).
 */
export const PickupActionModal = ({ 
  order, 
  status, 
  isWithinRange, 
  distanceToTarget,
  eta,
  onReachedPickup, 
  onPickedUp,
  onMinimize
}) => {
  const [showItems, setShowItems] = useState(false);

  if (!order) return null;

  const isAtPickup = status === 'REACHED_PICKUP';
  const restaurantName = order.restaurantName || order.restaurant_name || 'Restaurant';
  const restaurantAddress = order.restaurantAddress || order.restaurant_address || order.restaurantLocation?.address || 'Address not available';
  const restaurantPhone = order.restaurantPhone || order.restaurant_phone || order.restaurantId?.phone || '';
  const items = order.items || [];
  const restaurantLogo = order.restaurantImage || order.restaurant?.logo || order.restaurant?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3170/3170733.png';

  return (
    <div className="absolute inset-x-0 bottom-0 z-[110] p-0 sm:p-4 h-full flex items-end">
      {/* Background Dim */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/40 -z-10"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full bg-white rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] p-5 pb-8 max-h-[90vh] overflow-y-auto"
      >
        {/* Handle / Minimize */}
        <div className="w-full flex justify-center pb-2 pt-1">
          <button onClick={onMinimize} className="p-1 hover:bg-gray-100 active:scale-95 transition-all rounded-full flex flex-col items-center">
             <ChevronDown className="w-6 h-6 text-gray-300 stroke-[3]" />
          </button>
        </div>

        {/* Restaurant Header */}
        <div className="flex items-start justify-between mb-5 pb-3 border-b border-gray-50">
          <div className="flex gap-3">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg shadow-black/5 overflow-hidden border border-gray-100">
              <img src={restaurantLogo} alt="Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-gray-950 text-lg font-extrabold leading-none">{restaurantName}</h3>
              <p className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 mt-2">
                {isAtPickup ? (
                  <span style={{ color: BRAND_THEME.colors.semantic.success }}>Reached Location</span>
                ) : (
                  <span style={{ color: BRAND_THEME.colors.brand.primary }}>
                    {(distanceToTarget / 1000).toFixed(1)} km • {eta || '--'} min
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {restaurantPhone && (
              <button
                onClick={() => window.location.href = `tel:${restaurantPhone}`}
                className="w-9 h-9 rounded-full flex items-center justify-center border transition-opacity hover:opacity-80"
                style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft, color: BRAND_THEME.colors.brand.primary, borderColor: BRAND_THEME.colors.brand.primary + '33' }}
              >
                <Phone className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantAddress)}`, '_blank')}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-lg"
              style={{ backgroundColor: BRAND_THEME.colors.neutral.textPrimary }}
            >
              <Navigation className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Sliders */}
        <div className="space-y-5">
          {!isAtPickup ? (
            <div>
              <p 
                className="text-center text-[10px] font-bold uppercase tracking-widest mb-3 transition-colors"
                style={{ color: isWithinRange ? BRAND_THEME.colors.semantic.success : BRAND_THEME.colors.brand.primary }}
              >
                {isWithinRange ? 'Ready - Swipe to confirm arrival' : 'Get closer to restaurant'}
              </p>
              <ActionSlider 
                key="action-reach"
                label="Slide to Reach" 
                successLabel="Reached!"
                disabled={!isWithinRange}
                onConfirm={onReachedPickup}
                containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
                style={{ background: BRAND_THEME.gradients.primary }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p 
                  className="text-center text-[10px] font-bold uppercase tracking-widest mb-3"
                  style={{ color: BRAND_THEME.colors.semantic.success }}
                >
                  Swipe to confirm pickup
                </p>
                <ActionSlider 
                  key="action-pickup"
                  label="Slide to Pick Up" 
                  successLabel="Picked Up!"
                  disabled={false}
                  onConfirm={() => onPickedUp()}
                  containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
                  style={{ background: BRAND_THEME.gradients.primary }}
                />
              </div>
            </div>
          )}

          {/* Delivery Instructions (User Note) */}
          {order?.note && (
            <div 
              className="border rounded-2xl p-3.5 flex gap-3 items-start"
              style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft, borderColor: BRAND_THEME.colors.brand.primary + '11' }}
            >
              <ChefHat className="w-4 h-4 mt-0.5 shrink-0" style={{ color: BRAND_THEME.colors.brand.primary }} />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: BRAND_THEME.colors.brand.primary }}>User Instructions</p>
                <p className="text-[13px] font-bold text-gray-800 leading-snug">"{order.note}"</p>
              </div>
            </div>
          )}

          {/* Collapsible Order Summary */}
          <button 
            onClick={() => setShowItems(!showItems)}
            className="w-full flex items-center justify-between p-3.5 bg-gray-50 rounded-2x"
          >
            <div className="flex items-center gap-3 text-gray-900 font-bold text-[10px] uppercase tracking-widest">
              <Package className="w-4 h-4 text-gray-400" />
              <span>Order Details ({items.length || 0})</span>
            </div>
            {showItems ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
          </button>

          {showItems && (
            <div className="overflow-hidden space-y-2 px-1">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700 text-sm font-bold">{item.name || 'Item Name'}</span>
                  <span 
                    className="font-bold px-2.5 py-1 rounded-lg text-xs"
                    style={{ color: BRAND_THEME.colors.brand.primary, backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
                  >x{item.quantity || 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PickupActionModal;
