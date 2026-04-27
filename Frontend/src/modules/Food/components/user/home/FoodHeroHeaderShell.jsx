import HomeHeader from "@food/components/user/home/HomeHeader";
import BRAND_THEME from "@/config/brandTheme";

const STICKY_HEADER_SCROLL_COLOR =
  BRAND_THEME.tokens.homepage.home.stickyHeaderScrollColor;

export default function FoodHeroHeaderShell({
  stickyHeaderRef,
  bannerShellRef,
  hasScrolledPastBanner,
  location,
  savedAddressText,
  handleLocationClick,
  handleSearchFocus,
  placeholderIndex,
  placeholders,
  vegMode = false,
  onVegModeChange = () => {},
  showVegMode = true,
  bannerContent = null,
  bannerShellProps = {},
}) {
  const { className = "", style, ...restBannerShellProps } = bannerShellProps;
  const scrolledHeaderColor = hasScrolledPastBanner
    ? STICKY_HEADER_SCROLL_COLOR
    : "transparent";

  return (
    <>
      <div
        ref={stickyHeaderRef}
        className={`md:hidden fixed top-0 left-0 right-0 overflow-x-clip z-[80] transition-all duration-300 ${
          hasScrolledPastBanner ? "opacity-100 pointer-events-auto bg-white dark:bg-[#0a0a0a]" : "opacity-0 pointer-events-none"
        }`}
      >
        <HomeHeader
          activeTab="food"
          setActiveTab={() => {}}
          location={location}
          savedAddressText={savedAddressText}
          handleLocationClick={handleLocationClick}
          handleSearchFocus={handleSearchFocus}
          placeholderIndex={placeholderIndex}
          placeholders={placeholders}
          vegMode={showVegMode ? vegMode : false}
          onVegModeChange={showVegMode ? onVegModeChange : undefined}
          showVegMode={showVegMode}
          compact
          scrolledHeaderColor={scrolledHeaderColor}
        />
      </div>

      <section
        ref={bannerShellRef}
        className={`md:hidden relative overflow-hidden ${className}`.trim()}
        {...restBannerShellProps}
        style={style}
      >
        <HomeHeader
          activeTab="food"
          setActiveTab={() => {}}
          location={location}
          savedAddressText={savedAddressText}
          handleLocationClick={handleLocationClick}
          handleSearchFocus={handleSearchFocus}
          placeholderIndex={placeholderIndex}
          placeholders={placeholders}
          vegMode={showVegMode ? vegMode : false}
          onVegModeChange={showVegMode ? onVegModeChange : undefined}
          showVegMode={showVegMode}
          bannerContent={bannerContent}
        />
      </section>
    </>
  );
}
