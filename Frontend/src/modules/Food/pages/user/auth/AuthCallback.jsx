import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, CheckCircle, XCircle } from "lucide-react"

export default function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const status = params.get("status") || ""
  const token = params.get("token") || ""
  const redirect = params.get("redirect") || "/"

  useEffect(() => {
    // Basic handling: if token present, store and redirect; otherwise go home
    if (token) {
      try {
        localStorage.setItem("user_accessToken", token)
      } catch (e) {}
      navigate(redirect, { replace: true })
    } else {
      navigate(redirect || "/", { replace: true })
    }
  }, [token, redirect, navigate])

  const isSuccess = status.toLowerCase() === "success" || Boolean(token)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-10 text-center space-y-3">
      {isSuccess ? (
        <>
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 mb-2">
            <CheckCircle className="w-6 h-6" />
          </div>
          <p className="text-lg font-semibold text-gray-900">Signing you in…</p>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-2">
            <XCircle className="w-6 h-6" />
          </div>
          <p className="text-lg font-semibold text-gray-900">Unable to sign in</p>
          <p className="text-sm text-gray-500">We could not verify your login. Please try again.</p>
        </>
      )}
      {!isSuccess && (
        <button
          onClick={() => navigate("/food/user/login", { replace: true })}
          className="mt-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
        >
          Go to Login
        </button>
      )}
      {isSuccess && <Loader2 className="w-5 h-5 animate-spin text-gray-500" />}
    </div>
  )
}
