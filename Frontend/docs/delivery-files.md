# Delivery module file map (for theming work)

## Core (DeliveryV2)
- Frontend/src/modules/DeliveryV2/DeliveryV2Router.jsx
- Frontend/src/modules/DeliveryV2/components/DeliveryLayout.jsx
- Frontend/src/modules/DeliveryV2/components/DeliveryRouter.jsx
- Frontend/src/modules/DeliveryV2/hooks/useDeliveryBackNavigation.js
- Frontend/src/modules/DeliveryV2/store/useDeliveryStore.js

## Food module – delivery pages/components
- Frontend/src/modules/Food/pages/delivery/ (directory present; inspect for routes as needed)
- Frontend/src/modules/Food/pages/admin/delivery-partners/ (directory)
- Frontend/src/modules/Food/pages/admin/DeliveryBoyCommission.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryBoyWallet.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryCashLimit.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryEmergencyHelp.jsx
- Frontend/src/modules/Food/pages/admin/DeliverySupportTickets.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryWithdrawal.jsx
- Frontend/src/modules/Food/pages/admin/OrderDetectDelivery.jsx
- Frontend/src/modules/Food/pages/restaurant/DeliverySettings.jsx

## Shared stores/hooks/utils/assets
- Frontend/src/modules/Food/store/deliveryStore.js
- Frontend/src/modules/Food/hooks/useDeliveryNotifications.js
- Frontend/src/modules/Food/utils/deliveryNotifications.js
- Frontend/src/modules/Food/utils/deliveryOrderStatus.js
- Frontend/src/modules/Food/utils/deliveryWalletState.js
- Frontend/src/modules/Food/components/user/DeliveryTrackingMap.jsx
- Frontend/src/modules/Food/components/user/DeliveryTrackingMap.css
- Frontend/src/modules/Food/assets/deliveryloginbanner.png
- Frontend/src/modules/Food/assets/Transaction-report-icons/deliveryman-earning.png

## Admin delivery components
- Frontend/src/modules/Food/components/admin/deliveryman/ (directory)

## Notes
- Use this list to centralize theming (import `BRAND_THEME` etc.).
- Verify contents of the delivery directories (`pages/delivery`, `components/admin/deliveryman/`) before editing; they may contain multiple files not enumerated above.

## Completed (centralized)
- Frontend/src/modules/DeliveryV2/pages/auth/Welcome.jsx
- Frontend/src/modules/DeliveryV2/pages/auth/OTP.jsx
- Frontend/src/modules/DeliveryV2/pages/auth/SignIn.jsx
- Frontend/src/modules/DeliveryV2/pages/auth/Signup.jsx
- Frontend/src/modules/DeliveryV2/pages/auth/SignupStep1.jsx
- Frontend/src/modules/DeliveryV2/pages/auth/SignupStep2.jsx
- Frontend/src/modules/DeliveryV2/pages/DeliveryHomeV2.jsx
- Frontend/src/modules/DeliveryV2/components/BottomNavigation.jsx
- Frontend/src/modules/DeliveryV2/components/modals/DeliveryVerificationModal.jsx
- Frontend/src/modules/DeliveryV2/pages/PocketV2.jsx
- Frontend/src/modules/DeliveryV2/pages/ProfileV2.jsx
- Frontend/src/modules/DeliveryV2/pages/pocket/PocketBalanceV2.jsx
- Frontend/src/modules/DeliveryV2/pages/pocket/PocketDetailsV2.jsx
- Frontend/src/modules/DeliveryV2/pages/pocket/PocketStatementV2.jsx
- Frontend/src/modules/DeliveryV2/pages/pocket/LimitSettlementV2.jsx
- Frontend/src/modules/DeliveryV2/pages/pocket/DeductionStatementV2.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryBoyCommission.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryBoyWallet.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryCashLimit.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryEmergencyHelp.jsx
- Frontend/src/modules/Food/pages/admin/DeliverySupportTickets.jsx
- Frontend/src/modules/Food/pages/admin/DeliveryWithdrawal.jsx
- Frontend/src/modules/Food/pages/admin/OrderDetectDelivery.jsx
