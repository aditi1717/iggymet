import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { 
  Wallet, 
  DollarSign, 
  Hand, 
  SlidersHorizontal,
  Home,
  ShoppingBag,
  Store,
  Menu,
  Clock,
  CheckCircle,
  TrendingUp,
  X,
  ChevronDown
} from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import { Input } from "@food/components/ui/input"
import { restaurantAPI } from "@food/api"
import { formatCurrency } from "@food/utils/currency"
import BRAND_THEME from "@/config/brandTheme"

export default function WalletPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("withdraw")
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [isBalanceAdjusted, setIsBalanceAdjusted] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("Bank Transfer")
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState("all")
  
  // Real data state
  const [financeData, setFinanceData] = useState(null)
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const paymentMethods = [
    "Bank Transfer",
    "UPI",
    "Payout Wallet"
  ]

  // Fetch real data
  const fetchData = async () => {
    try {
      setLoading(true)
      const finRes = await restaurantAPI.getFinance()

      if (finRes.data?.success) setFinanceData(finRes.data.data)
      setWithdrawals([])
    } catch (error) {
      console.error("Error fetching wallet data:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Derived balances from real data
  const balances = {
    withdrawalBalance: financeData?.currentCycle?.estimatedPayout || 0,
    totalEarning: financeData?.currentCycle?.totalEarnings || 0,
    pendingWithdraw: withdrawals
      .filter(w => String(w.status).toLowerCase() === 'pending')
      .reduce((sum, w) => sum + (w.amount || 0), 0),
    alreadyWithdraw: withdrawals
      .filter(w => String(w.status).toLowerCase() === 'approved')
      .reduce((sum, w) => sum + (w.amount || 0), 0),
    cashInHand: 0, // Not explicitly tracked in simple restaurant finance yet
    balanceUnadjusted: 0
  }
  
  // Get transactions based on active tab and filters
  const getFilteredTransactions = () => {
    let filtered = [...withdrawals]
    
    // Apply status filter
    if (filterStatus !== "all") {
      filtered = filtered.filter(t => {
        const s = String(t.status).toLowerCase()
        if (filterStatus === 'Pending') return s === 'pending'
        if (filterStatus === 'Completed') return s === 'approved'
        if (filterStatus === 'Failed') return s === 'rejected'
        return true
      })
    }
    
    return filtered
  }
  
  const transactions = getFilteredTransactions()


  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  // No longer needed: refreshWalletState listener


  // Close payment dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showPaymentDropdown && !event.target.closest('.payment-dropdown-container')) {
        setShowPaymentDropdown(false)
      }
      if (showFilterModal && !event.target.closest('.filter-dropdown-container')) {
        setShowFilterModal(false)
      }
    }

    if (showPaymentDropdown || showFilterModal) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showPaymentDropdown, showFilterModal])


  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
    >
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6 overflow-x-visible">
        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 text-center md:text-left">
          Wallet
        </h1>

        {/* Withdrawal Balance Card - Brand */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl p-4 md:p-6 mb-4 shadow-lg text-white"
          style={{ background: BRAND_THEME.gradients.primary, boxShadow: `0 14px 40px -20px ${BRAND_THEME.colors.brand.primaryDark}` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 rounded-lg p-3">
                <Wallet className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              <div>
                <p className="text-white/90 text-sm md:text-base mb-1">Withdrawal Balance</p>
                <p className="text-white text-2xl md:text-3xl font-bold">{formatCurrency(balances.withdrawalBalance)}</p>
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button 
              className="bg-white hover:bg-white/90 font-semibold px-4 py-2 md:px-6 md:py-3 rounded-lg"
              style={{ color: BRAND_THEME.colors.brand.primary }}
              disabled
            >
              Disabled
            </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Balance Unadjusted Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl p-4 md:p-6 mb-4 shadow-md border"
          style={{
            backgroundColor: isBalanceAdjusted
              ? BRAND_THEME.colors.semantic.successSoft
              : BRAND_THEME.colors.brand.accentRedSoft,
            borderColor: isBalanceAdjusted
              ? BRAND_THEME.colors.semantic.success
              : BRAND_THEME.colors.brand.accentRed,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="rounded-lg p-3"
                style={{
                  backgroundColor: isBalanceAdjusted
                    ? BRAND_THEME.colors.semantic.successSoft
                    : BRAND_THEME.colors.brand.accentRedSoft,
                }}
              >
                <DollarSign
                  className="w-6 h-6 md:w-8 md:h-8"
                  style={{
                    color: isBalanceAdjusted
                      ? BRAND_THEME.colors.semantic.successDark
                      : BRAND_THEME.colors.brand.accentRed,
                  }}
                />
              </div>
              <div>
                <p className="text-gray-800 text-sm md:text-base mb-1 font-medium">{isBalanceAdjusted ? "Balance Adjusted" : "Balance Unadjusted"}</p>
                <p className="text-gray-900 text-2xl md:text-3xl font-bold">{formatCurrency(balances.balanceUnadjusted)}</p>
              </div>
            </div>
            {!isBalanceAdjusted && (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button 
              variant="outline"
              className="font-semibold px-4 py-2 md:px-6 md:py-3 rounded-lg"
              style={{
                backgroundColor: BRAND_THEME.colors.brand.accentRedSoft,
                color: BRAND_THEME.colors.brand.accentRed,
                borderColor: BRAND_THEME.colors.brand.accentRed,
              }}
                  onClick={() => setShowAdjustModal(true)}
            >
              Adjust
            </Button>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Current Balances - Five Cards in Horizontal Scroll */}
        <div className="mb-4 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide md:scrollbar-default md:overflow-x-visible">
          <div className="flex gap-2 min-w-max md:grid md:grid-cols-5 md:min-w-0 md:gap-4 items-stretch">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="flex-shrink-0 w-[95px] md:w-auto flex"
            >
              <Card className="bg-white shadow-md border-0 py-0 gap-0 h-full w-full">
                <CardContent className="p-2 relative flex flex-col px-2 h-full justify-between">
                  <div className="absolute right-1 top-1 opacity-10">
                    <Hand className="w-6 h-6 md:w-8 md:h-8 text-green-500" />
                  </div>
                  <p className="text-gray-600 text-[9px] md:text-xs mb-0.5 leading-tight">Cash in Hand</p>
                  <p className="text-gray-900 text-xs md:text-sm font-bold">{formatCurrency(balances.cashInHand)}</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="flex-shrink-0 w-[95px] md:w-auto flex"
            >
              <Card className="bg-white shadow-md border-0 py-0 gap-0 h-full w-full">
                <CardContent className="p-2 relative flex flex-col px-2 h-full justify-between">
                  <div className="absolute right-1 top-1 opacity-10">
                    <Wallet className="w-6 h-6 md:w-8 md:h-8 text-red-400" />
                  </div>
                  <p className="text-gray-600 text-[9px] md:text-xs mb-0.5 leading-tight">Withdrawable Balance</p>
                  <p className="text-gray-900 text-xs md:text-sm font-bold">{formatCurrency(balances.withdrawalBalance)}</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className="flex-shrink-0 w-[95px] md:w-auto flex"
            >
              <Card className="bg-white shadow-md border-0 py-0 gap-0 h-full w-full">
                <CardContent className="p-2 relative flex flex-col px-2 h-full justify-between">
                  <div className="absolute right-1 top-1 opacity-10">
                    <Clock className="w-6 h-6 md:w-8 md:h-8 text-orange-400" />
                  </div>
                  <p className="text-gray-600 text-[9px] md:text-xs mb-0.5 leading-tight">Pending Withdraw</p>
                  <p className="text-gray-900 text-xs md:text-sm font-bold">{formatCurrency(balances.pendingWithdraw)}</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className="flex-shrink-0 w-[95px] md:w-auto flex"
            >
              <Card className="bg-white shadow-md border-0 py-0 gap-0 h-full w-full">
                <CardContent className="p-2 relative flex flex-col px-2 h-full justify-between">
                  <div className="absolute right-1 top-1 opacity-10">
                    <CheckCircle className="w-6 h-6 md:w-8 md:h-8 text-green-600" />
                  </div>
                  <p className="text-gray-600 text-[9px] md:text-xs mb-0.5 leading-tight">Already Withdraw</p>
                  <p className="text-gray-900 text-xs md:text-sm font-bold">{formatCurrency(balances.alreadyWithdraw)}</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="flex-shrink-0 w-[95px] md:w-auto flex"
            >
              <Card className="bg-white shadow-md border-0 py-0 gap-0 h-full w-full">
                <CardContent className="p-2 relative flex flex-col px-2 h-full justify-between">
                  <div className="absolute right-1 top-1 opacity-10">
                    <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-brand-500" />
                  </div>
                  <p className="text-gray-600 text-[9px] md:text-xs mb-0.5 leading-tight">Total Earning</p>
                  <p className="text-gray-900 text-xs md:text-sm font-bold">{formatCurrency(balances.totalEarning)}</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* Transaction History Section - Full Width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className=" w-full bg-white rounded-xl p-4 md:p-6 shadow-md"
        >
          <div className="w-100%">
            {/* Tabs */}
            <div className="flex gap-4 mb-4 border-b border-gray-200 ">
              <button
                onClick={() => setActiveTab("withdraw")}
                className={`pb-3 px-2 text-sm md:text-base font-medium transition-colors relative ${
                  activeTab === "withdraw"
                    ? "text-brand-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                style={activeTab === "withdraw" ? { color: BRAND_THEME.colors.brand.primary } : undefined}
              >
                Withdraw Request
                {activeTab === "withdraw" && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: BRAND_THEME.colors.brand.primary }}
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab("payment")}
                className={`pb-3 px-2 text-sm md:text-base font-medium transition-colors relative ${
                  activeTab === "payment"
                    ? "text-brand-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                style={activeTab === "payment" ? { color: BRAND_THEME.colors.brand.primary } : undefined}
              >
                Payment History
                {activeTab === "payment" && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: BRAND_THEME.colors.brand.primary }}
                  />
                )}
              </button>
            </div>

            {/* Transaction History Header */}
            <div className="flex items-center justify-between mb-4 relative">
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">Transaction History</h2>
              <div className="relative filter-dropdown-container">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-gray-900"
                  onClick={() => setShowFilterModal(!showFilterModal)}
              >
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                Filter
              </Button>
                
                {/* Filter Dropdown */}
                <AnimatePresence>
                  {showFilterModal && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px]"
                    >
                      <div className="py-1">
                        {["All", "Pending", "Approved", "Denied"].map((option) => (
                          <button
                            key={option}
                            onClick={() => {
                              const statusMap = {
                                "All": "all",
                                "Pending": "Pending",
                                "Approved": "Completed",
                                "Denied": "Failed"
                              }
                              setFilterStatus(statusMap[option])
                              setShowFilterModal(false)
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                              (option === "All" && filterStatus === "all") ||
                              (option === "Pending" && filterStatus === "Pending") ||
                              (option === "Approved" && filterStatus === "Completed") ||
                              (option === "Denied" && filterStatus === "Failed")
                                ? "font-medium"
                                : "text-gray-700"
                            }`}
                            style={
                              (option === "All" && filterStatus === "all") ||
                              (option === "Pending" && filterStatus === "Pending") ||
                              (option === "Approved" && filterStatus === "Completed") ||
                              (option === "Denied" && filterStatus === "Failed")
                                ? {
                                    color: BRAND_THEME.colors.brand.primary,
                                    backgroundColor: `${BRAND_THEME.colors.brand.primary}0D`,
                                  }
                                : undefined
                            }
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Transaction List */}
            <div className="space-y-4">
              {loading ? (
                <div className="py-12 text-center text-gray-500">Loading transactions...</div>
              ) : transactions.length === 0 ? (
                <div className="py-12 text-center text-gray-500">No transactions found</div>
              ) : transactions.map((transaction, index) => (
                <motion.div
                  key={transaction._id || index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + index * 0.05 }}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                >
                  <div className="flex-1">
                    <p className="text-gray-900 font-semibold text-base md:text-lg mb-1">
                      {formatCurrency(transaction.amount)}
                    </p>
                    <p className="text-gray-600 text-sm md:text-base">
                      {transaction.description || `Withdrawal request`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block text-xs md:text-sm font-medium px-3 py-1 rounded-full mb-2 ${
                      String(transaction.status).toLowerCase() === "pending" 
                        ? "bg-brand-100 text-brand-700"
                        : String(transaction.status).toLowerCase() === "approved"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                    </span>
                    <p className="text-gray-500 text-xs md:text-sm">
                      {transaction.createdAt ? new Date(transaction.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

          </div>
        </motion.div>
      </div>

      {/* Balance Adjust Modal */}
      <AnimatePresence>
        {showAdjustModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm px-4"
            style={{ backgroundColor: `${BRAND_THEME.colors.brand.primaryDark}66` }}
            onClick={() => setShowAdjustModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 md:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 text-center">
                Cash Adjustment
              </h2>
              <p className="text-gray-600 text-sm md:text-base mb-6 text-center leading-relaxed">
                To adjust your Cash in Hand balance and Withdrawable Amount please click 'OK' to confirm the adjustments
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200 font-semibold px-4 py-2 md:px-6 md:py-3 rounded-lg"
                  onClick={() => setShowAdjustModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 text-white font-semibold px-4 py-2 md:px-6 md:py-3 rounded-lg"
                  style={{ backgroundColor: BRAND_THEME.colors.brand.primary }}
                  onClick={() => {
                    setIsBalanceAdjusted(true)
                    setShowAdjustModal(false)
                  }}
                >
                  Ok
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar - Mobile Only */}
      <BottomNavOrders />
    </div>
  )
}




