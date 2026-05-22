const DEFAULT_USER_AVATAR_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#e2e8f0"/>
        <stop offset="100%" stop-color="#cbd5e1"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" fill="url(#bg)"/>
    <circle cx="80" cy="62" r="28" fill="#94a3b8"/>
    <path d="M28 142c6-26 29-42 52-42s46 16 52 42" fill="#94a3b8"/>
  </svg>`,
)

export const DEFAULT_USER_AVATAR = `data:image/svg+xml,${DEFAULT_USER_AVATAR_SVG}`

const extractUrl = (value) => {
  if (!value) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "object") {
    return String(value.url || value.secure_url || value.src || "").trim()
  }
  return ""
}

export const resolveProfileAvatar = (entity = {}) => {
  return (
    extractUrl(entity?.profileImage) ||
    extractUrl(entity?.profilePhoto) ||
    extractUrl(entity?.documents?.photo) ||
    extractUrl(entity?.photo) ||
    DEFAULT_USER_AVATAR
  )
}
