const normalizeUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "");

export const getApiBaseUrl = () => {
  if (typeof import.meta === "undefined" || !import.meta.env) {
    return "";
  }

  return normalizeUrl(import.meta.env.VITE_API_BASE_URL);
};

export const getApiOrigin = () => {
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return "";
  }

  return apiBaseUrl.replace(/\/api\/v1$/i, "").replace(/\/api$/i, "");
};

export const getSocketUrl = () => {
  if (typeof import.meta === "undefined" || !import.meta.env) {
    return "";
  }

  const explicitSocketUrl = normalizeUrl(import.meta.env.VITE_SOCKET_URL);
  if (explicitSocketUrl) {
    return explicitSocketUrl;
  }

  return getApiOrigin();
};
