const normalizePath = (value = "") => {
    const raw = String(value || "").trim();
    if (!raw) return "/";
    const withoutTrailing = raw.replace(/\/+$/, "");
    return withoutTrailing || "/";
};

export const ADMIN_PERMISSION_PATHS = {
    DASHBOARD: "/admin/food",
    POINT_OF_SALE: "/admin/food/point-of-sale",
    FOOD_APPROVAL: "/admin/food/food-approval",
    FOODS: "/admin/food/foods",
    ADDONS: "/admin/food/addons",
    CATEGORIES: "/admin/food/categories",
    ZONE_SETUP: "/admin/food/zone-setup",
    RESTAURANTS: "/admin/food/restaurants",
    RESTAURANT_JOINING_REQUEST: "/admin/food/restaurants/joining-request",
    RESTAURANT_COMMISSION: "/admin/food/restaurants/commission",
    RESTAURANT_REVIEWS: "/admin/food/restaurants/reviews",
    RESTAURANT_COMPLAINTS: "/admin/food/restaurants/complaints",
    ORDERS: "/admin/food/orders/all",
    ORDER_DETECT_DELIVERY: "/admin/food/order-detect-delivery",
    CUSTOMERS: "/admin/food/customers",
    SUPPORT_TICKETS: "/admin/food/support-tickets",
    DELIVERY_PARTNERS: "/admin/food/delivery-partners",
    DELIVERY_CASH_LIMIT: "/admin/food/delivery-cash-limit",
    DELIVERY_WITHDRAWAL: "/admin/food/delivery-withdrawal",
    DELIVERY_SUPPORT_TICKETS: "/admin/food/delivery-support-tickets",
    TRANSACTION_REPORT: "/admin/food/transaction-report",
    TAX_REPORT: "/admin/food/tax-report",
    RESTAURANT_REPORT: "/admin/food/restaurant-report",
    RESTAURANT_WITHDRAWS: "/admin/food/restaurant-withdraws",
    HERO_BANNER_MANAGEMENT: "/admin/food/hero-banner-management",
    BROADCAST_NOTIFICATION: "/admin/food/broadcast-notification",
    BUSINESS_SETUP: "/admin/food/business-setup",
    STORE_PRODUCTS: "/admin/food/store/products",
    STORE_ORDERS: "/admin/food/store/orders",
    MANAGE_ADMINS: "/admin/food/manage-admins",
};

const API_PERMISSION_MAP = [
    { methods: ["GET"], pattern: /^\/dashboard-stats$/, permission: ADMIN_PERMISSION_PATHS.DASHBOARD },
    { methods: ["GET"], pattern: /^\/customers(\/|$)/, permission: ADMIN_PERMISSION_PATHS.CUSTOMERS },
    { methods: ["PATCH"], pattern: /^\/customers\/[^/]+\/status$/, permission: ADMIN_PERMISSION_PATHS.CUSTOMERS },
    { methods: ["GET"], pattern: /^\/restaurants(\/|$)/, permission: ADMIN_PERMISSION_PATHS.RESTAURANTS },
    { methods: ["POST"], pattern: /^\/restaurants$/, permission: ADMIN_PERMISSION_PATHS.RESTAURANTS },
    { methods: ["PATCH"], pattern: /^\/restaurants\/[^/]+(\/|$)/, permission: ADMIN_PERMISSION_PATHS.RESTAURANTS },
    { methods: ["GET"], pattern: /^\/zones(\/|$)/, permission: ADMIN_PERMISSION_PATHS.ZONE_SETUP },
    { methods: ["POST"], pattern: /^\/zones$/, permission: ADMIN_PERMISSION_PATHS.ZONE_SETUP },
    { methods: ["PATCH"], pattern: /^\/zones\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.ZONE_SETUP },
    { methods: ["DELETE"], pattern: /^\/zones\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.ZONE_SETUP },
    { methods: ["GET"], pattern: /^\/orders(\/|$)/, permission: ADMIN_PERMISSION_PATHS.ORDERS },
    { methods: ["PATCH"], pattern: /^\/orders\/[^/]+\/status$/, permission: ADMIN_PERMISSION_PATHS.ORDERS },
    { methods: ["DELETE"], pattern: /^\/orders\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.ORDERS },
    { methods: ["GET"], pattern: /^\/categories(\/|$)/, permission: ADMIN_PERMISSION_PATHS.CATEGORIES },
    { methods: ["POST"], pattern: /^\/categories$/, permission: ADMIN_PERMISSION_PATHS.CATEGORIES },
    { methods: ["PATCH"], pattern: /^\/categories\/[^/]+(\/|$)/, permission: ADMIN_PERMISSION_PATHS.CATEGORIES },
    { methods: ["DELETE"], pattern: /^\/categories\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.CATEGORIES },
    { methods: ["GET"], pattern: /^\/foods(\/|$)/, permission: ADMIN_PERMISSION_PATHS.FOODS },
    { methods: ["POST"], pattern: /^\/foods$/, permission: ADMIN_PERMISSION_PATHS.FOODS },
    { methods: ["PATCH"], pattern: /^\/foods\/[^/]+(\/|$)/, permission: ADMIN_PERMISSION_PATHS.FOODS },
    { methods: ["DELETE"], pattern: /^\/foods\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.FOODS },
    { methods: ["GET"], pattern: /^\/addons(\/|$)/, permission: ADMIN_PERMISSION_PATHS.ADDONS },
    { methods: ["PATCH"], pattern: /^\/addons\/[^/]+(\/|$)/, permission: ADMIN_PERMISSION_PATHS.ADDONS },
    { methods: ["GET"], pattern: /^\/support-tickets(\/|$)/, permission: ADMIN_PERMISSION_PATHS.SUPPORT_TICKETS },
    { methods: ["PATCH"], pattern: /^\/support-tickets\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.SUPPORT_TICKETS },
    { methods: ["GET"], pattern: /^\/delivery\/partners(\/|$)/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_PARTNERS },
    { methods: ["GET"], pattern: /^\/delivery\/join-requests$/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_PARTNERS },
    { methods: ["PATCH"], pattern: /^\/delivery\/[^/]+\/(approve|reject)$/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_PARTNERS },
    { methods: ["GET"], pattern: /^\/delivery-cash-limit$/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_CASH_LIMIT },
    { methods: ["PATCH"], pattern: /^\/delivery-cash-limit$/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_CASH_LIMIT },
    { methods: ["GET"], pattern: /^\/delivery\/withdrawals$/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_WITHDRAWAL },
    { methods: ["PATCH"], pattern: /^\/delivery\/withdrawals\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_WITHDRAWAL },
    { methods: ["GET"], pattern: /^\/delivery\/support-tickets(\/|$)/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_SUPPORT_TICKETS },
    { methods: ["PATCH"], pattern: /^\/delivery\/support-tickets\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.DELIVERY_SUPPORT_TICKETS },
    { methods: ["GET"], pattern: /^\/transaction-report$/, permission: ADMIN_PERMISSION_PATHS.TRANSACTION_REPORT },
    { methods: ["GET"], pattern: /^\/tax-report(\/|$)/, permission: ADMIN_PERMISSION_PATHS.TAX_REPORT },
    { methods: ["GET"], pattern: /^\/restaurant-report$/, permission: ADMIN_PERMISSION_PATHS.RESTAURANT_REPORT },
    { methods: ["GET"], pattern: /^\/restaurant-withdraws$/, permission: ADMIN_PERMISSION_PATHS.RESTAURANT_WITHDRAWS },
    { methods: ["GET"], pattern: /^\/notifications\/broadcast$/, permission: ADMIN_PERMISSION_PATHS.BROADCAST_NOTIFICATION },
    { methods: ["POST"], pattern: /^\/notifications\/broadcast$/, permission: ADMIN_PERMISSION_PATHS.BROADCAST_NOTIFICATION },
    { methods: ["DELETE"], pattern: /^\/notifications\/broadcast\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.BROADCAST_NOTIFICATION },
    { methods: ["GET"], pattern: /^\/business-settings$/, permission: ADMIN_PERMISSION_PATHS.BUSINESS_SETUP },
    { methods: ["PATCH"], pattern: /^\/business-settings$/, permission: ADMIN_PERMISSION_PATHS.BUSINESS_SETUP },
    { methods: ["GET"], pattern: /^\/store\/products(\/|$)/, permission: ADMIN_PERMISSION_PATHS.STORE_PRODUCTS },
    { methods: ["POST"], pattern: /^\/store\/products$/, permission: ADMIN_PERMISSION_PATHS.STORE_PRODUCTS },
    { methods: ["PATCH"], pattern: /^\/store\/products\/[^/]+(\/stock)?$/, permission: ADMIN_PERMISSION_PATHS.STORE_PRODUCTS },
    { methods: ["DELETE"], pattern: /^\/store\/products\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.STORE_PRODUCTS },
    { methods: ["GET"], pattern: /^\/store\/orders$/, permission: ADMIN_PERMISSION_PATHS.STORE_ORDERS },
    { methods: ["PUT"], pattern: /^\/store\/orders\/[^/]+\/status$/, permission: ADMIN_PERMISSION_PATHS.STORE_ORDERS },
    { methods: ["GET"], pattern: /^\/admins(\/|$)/, permission: ADMIN_PERMISSION_PATHS.MANAGE_ADMINS },
    { methods: ["POST"], pattern: /^\/admins$/, permission: ADMIN_PERMISSION_PATHS.MANAGE_ADMINS },
    { methods: ["PATCH"], pattern: /^\/admins\/[^/]+(\/status)?$/, permission: ADMIN_PERMISSION_PATHS.MANAGE_ADMINS },
    { methods: ["DELETE"], pattern: /^\/admins\/[^/]+$/, permission: ADMIN_PERMISSION_PATHS.MANAGE_ADMINS },
];

export const normalizeAdminPermissions = (permissions = []) => {
    if (!Array.isArray(permissions)) return [];
    return [...new Set(permissions.map((p) => normalizePath(p)).filter(Boolean))];
};

export const canAccessPermissionPath = (permissions = [], requiredPath = "") => {
    const normalizedRequired = normalizePath(requiredPath);
    const normalizedPermissions = normalizeAdminPermissions(permissions);
    return normalizedPermissions.some((permissionPath) => (
        normalizedRequired === permissionPath ||
        normalizedRequired.startsWith(`${permissionPath}/`) ||
        permissionPath.startsWith(`${normalizedRequired}/`)
    ));
};

export const getRequiredPermissionForApiRoute = (method = "GET", path = "") => {
    const normalizedMethod = String(method || "GET").toUpperCase();
    const normalizedPathname = normalizePath(path);
    const match = API_PERMISSION_MAP.find((item) => (
        item.methods.includes(normalizedMethod) && item.pattern.test(normalizedPathname)
    ));
    return match?.permission || null;
};
