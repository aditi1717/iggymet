# Restaurant Module – Page & Component Map

Latest inventory of restaurant-side screens and shared UI (07 Apr 2026). Use this as the master checklist for applying the global brand theme (`@/config/brandTheme`) and hardening UX flows (incl. checkout / order lifecycle).

## Pages (`src/modules/Food/pages/restaurant`)
- AddCouponPage.jsx
- AdDetailsPage.jsx
- AddZone.jsx
- AdvertisementsPage.jsx
- AllFoodPage.jsx
- AllOrdersPage.jsx
- BusinessPlanPage.jsx
- ChatDetailPage.jsx
- ConversationListPage.jsx
- CouponListPage.jsx
- DaySlots.jsx
- DeliverySettings.jsx
- DishRatings.jsx
- DownloadReport.jsx
- EditAdvertisementPage.jsx
- EditCouponPage.jsx
- EditCuisines.jsx
- EditFoodPage.jsx
- EditOwner.jsx
- EditRestaurantAddress.jsx
- EditRestaurantPage.jsx
- ExploreMore.jsx
- Feedback.jsx
- FinanceDetailsPage.jsx
- FoodDetailsPage.jsx
- FssaiDetails.jsx
- FssaiUpdate.jsx
- HelpCentre.jsx
- HubFinance.jsx
- HubMenu.jsx
- Hyperpure.jsx
- Inventory.jsx
- ItemDetailsPage.jsx
- ManageOutlets.jsx
- MenuCategoriesPage.jsx
- NewAdvertisementPage.jsx
- Notifications.jsx
- Onboarding.jsx
- OrderDetails.jsx
- OrdersMain.jsx
- OrdersPage.jsx
- OutletInfo.jsx
- OutletTimings.jsx
- PhoneNumbersPage.jsx
- PrivacyPolicyPage.jsx
- RatingsReviews.jsx
- RestaurantCategoriesPage.jsx
- RestaurantConfigPage.jsx
- RestaurantDetailsPage.jsx
- RestaurantStatus.jsx
- RestaurantSupport.jsx
- ReviewsPage.jsx
- RushHour.jsx
- SettingsPage.jsx
- ShareFeedback.jsx
- TermsAndConditionsPage.jsx
- UpdateBankDetails.jsx
- UpdateReplyPage.jsx
- WalletPage.jsx
- WithdrawalHistoryPage.jsx
- ZoneSetup.jsx
- auth/ (auth flow entry files under `pages/restaurant/auth`)

## Components (`src/modules/Food/components/restaurant`)
- BottomNavbar.jsx
- BottomNavOrders.jsx
- MenuOverlay.jsx
- NewOrderNotification.jsx
- ResendNotificationButton.jsx
- RestaurantNavbar.jsx
- RestaurantRouter.jsx

## Theme & UI alignment (apply everywhere)
- Replace hard-coded colors/spacings with tokens from `@/config/brandTheme` and existing `@/config/colour.js`.
- Ensure heading/body typography matches the user-facing theme (buttons, cards, nav bars).
- Standardize cards, shadows, and rounded radii to match user module defaults.
- Respect light/dark modes: use `brandTheme` tokens instead of literal hex values.

## Checkout / order lifecycle readiness
- Align order creation, tracking, and settlement screens with the user checkout experience (Cart/Checkout/Orders) for visual consistency.
- Verify payment/settlement states, receipt views, and refunds use shared status colors and iconography.
- Confirm notification components (NewOrderNotification, ResendNotificationButton) follow the same tone and spacing as user push prompts.

## Next implementation steps
1) Add a shared `RestaurantThemeProvider` wrapper to inject `brandTheme` styles and reduce per-page overrides.
2) Sweep each page above to replace inline colors with theme tokens; keep diffs small and iterative.
3) Normalize navigation (RestaurantNavbar/BottomNavbar) to mirror user nav spacing, hover/active states, and shadows.
4) Cross-check order detail/receipt screens against user `Orders` and `Checkout` flows for parity.
5) Add visual regression smoke passes after each batch (screenshots on key breakpoints).
