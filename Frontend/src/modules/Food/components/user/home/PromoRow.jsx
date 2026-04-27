import React from 'react';
import discountPromoIcon from "@food/assets/category-icons/discount_promo.png";
import vegPromoIcon from "@food/assets/category-icons/veg_promo.png";
import pricePromoIcon from "@food/assets/category-icons/price_promo.png";
import comboPromoIcon from "@food/assets/category-icons/combo_promo.png";
import BRAND_THEME from "@/config/brandTheme";

export default function PromoRow({ handleVegModeChange, navigate, isVegMode, toggleRef }) {
  const { promoCards } = BRAND_THEME.tokens.homepage.home;
  const promoCardsData = [
    {
      id: 'offers',
      title: "MIN.",
      value: "40% off",
      icon: discountPromoIcon,
      gradient: promoCards.offersGradient,
      shadowColor: promoCards.offersShadow,
      textColor: '#ffffff',
      subTextColor: 'rgba(255,255,255,0.80)',
    },
    {
      id: 'pure-veg',
      title: "PURE",
      value: "Veg",
      icon: vegPromoIcon,
      gradient: isVegMode
        ? promoCards.pureVegEnabledGradient
        : promoCards.pureVegDisabledGradient,
      shadowColor: promoCards.pureVegShadow,
      textColor: '#ffffff',
      subTextColor: 'rgba(255,255,255,0.80)',
    },
    {
      id: 'under-250',
      title: "UNDER",
      value: "₹250",
      icon: pricePromoIcon,
      gradient: promoCards.under250Gradient,
      shadowColor: promoCards.under250Shadow,
      textColor: '#ffffff',
      subTextColor: 'rgba(255,255,255,0.80)',
    },
    {
      id: 'combos',
      title: "BEST",
      value: "Combos",
      icon: comboPromoIcon,
      gradient: promoCards.combosGradient,
      shadowColor: promoCards.combosShadow,
      textColor: '#ffffff',
      subTextColor: 'rgba(255,255,255,0.80)',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2.5 px-3.5 pt-4 pb-8 bg-white dark:bg-[#0a0a0a]">
      {promoCardsData.map((promo, idx) => (
        <div
          key={idx}
          ref={promo.id === 'pure-veg' ? toggleRef : null}
          className="rounded-[22px] flex flex-col items-center overflow-hidden cursor-pointer active:scale-95 group transition-all duration-300"
          style={{
            background: promo.gradient,
            boxShadow: `0 6px 20px ${promo.shadowColor}, 0 2px 8px rgba(0,0,0,0.12)`,
            minHeight: '168px',
            border: promo.id === 'pure-veg' && isVegMode ? '2.5px solid rgba(165,214,167,0.7)' : '2px solid rgba(255,255,255,0.10)',
          }}
          onClick={() => {
            if (promo.id === 'pure-veg') handleVegModeChange(!isVegMode);
            else if (promo.id === 'offers') navigate('/food/user/offers');
            else if (promo.id === 'under-250') navigate('/food/under-price');
          }}
        >
          {/* Label Section */}
          <div className="py-3 px-1 flex flex-col items-center text-center">
            <span
              style={{
                fontSize: '8px',
                fontWeight: 800,
                color: promo.subTextColor,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                lineHeight: 1,
                marginBottom: '3px',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {promo.title}
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 900,
                color: promo.textColor,
                lineHeight: 1.1,
                fontFamily: "'Inter', 'Outfit', sans-serif",
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
                paddingLeft: '4px',
                paddingRight: '4px',
              }}
            >
              {promo.value}
            </span>
          </div>

          {/* Image Capsule Container */}
          <div className="flex-1 w-full rounded-t-[0px] rounded-b-[20px] flex items-center justify-center overflow-hidden relative" style={{ background: promoCards.innerSurface }}>
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/10 pointer-events-none" />
            <img
              src={promo.icon}
              alt={promo.value}
              className="w-[90%] h-[90%] object-contain drop-shadow-lg transform group-hover:scale-110 transition-transform duration-500"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
