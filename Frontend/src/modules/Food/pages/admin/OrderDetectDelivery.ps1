
$path = "c:\Users\aditi\OneDrive\Desktop\company project\iggymet main\Frontend\src\modules\Food\pages\admin\OrderDetectDelivery.jsx"
$content = [System.IO.File]::ReadAllText($path)

$oldStats = '  // Statistics
  const stats = useMemo(() => {
    const total = orders.length
    const ordered = filteredData.filter(o => o.status === "Ordered").length
    const restaurantAccepted = filteredData.filter(o => o.status === "Restaurant Accepted" || o.status === "Accepted").length
    const rejected = filteredData.filter(o => o.status === "Rejected").length
    const userUnavailable = filteredData.filter(
      (o) => o.status === "User Unavailable Review" || o.status === "User Unavailable"
    ).length
    const readyForAssignment = filteredData.filter(o => o.status === "Ready for Assignment").length
    const deliveryBoyAssigned = filteredData.filter(o => o.status === "Delivery Boy Assigned").length
    const assignmentAccepted = filteredData.filter(o => o.status === "Assignment Accepted").length
    const reachedPickup = filteredData.filter(o => o.status === "Delivery Boy Reached Pickup" || o.status === "Reached Pickup").length
    const orderIdAccepted = filteredData.filter(o => o.status === "Order ID Accepted").length
    const reachedDrop = filteredData.filter(o => o.status === "Reached Drop").length
    const delivered = filteredData.filter(o => o.status === "Ordered Delivered").length
    
    return { total, ordered, restaurantAccepted, rejected, userUnavailable, readyForAssignment, deliveryBoyAssigned, assignmentAccepted, reachedPickup, orderIdAccepted, reachedDrop, delivered }
  }, [filteredData, orders.length])'

$newStats = '  // Statistics
  const stats = useMemo(() => {
    const total = filteredData.length
    const pendingAssignment = filteredData.filter(o => 
      ["Ordered", "Ready for Assignment", "Delivery Request Timed Out", "Delivery Boy Passed"].includes(o.status)
    ).length
    const inTransit = filteredData.filter(o => 
      ["Delivery Boy Assigned", "Assignment Accepted", "Delivery Boy Reached Pickup", "Reached Pickup", "Order ID Accepted", "Reached Drop"].includes(o.status)
    ).length
    const delivered = filteredData.filter(o => o.status === "Ordered Delivered").length
    const userUnavailable = filteredData.filter(
      (o) => o.status === "User Unavailable Review" || o.status === "User Unavailable"
    ).length
    const rejected = filteredData.filter(o => o.status === "Rejected").length
    
    return { total, pendingAssignment, inTransit, delivered, userUnavailable, rejected }
  }, [filteredData])'

$oldCards = '      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="p-3 bg-brand-50 rounded-lg">
              <Package className="w-6 h-6" style={{ color: BRAND_THEME.colors.brand.primary }} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Ordered</p>
              <p className="text-2xl font-bold" style={{ color: BRAND_THEME.colors.brand.primary }}>{stats.ordered}</p>
            </div>
            <div className="p-3 bg-brand-50 rounded-lg">
              <Clock className="w-6 h-6" style={{ color: BRAND_THEME.colors.brand.primary }} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Restaurant Accepted</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.restaurantAccepted}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Rejected</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">User Unavailable</p>
              <p className="text-2xl font-bold text-amber-600">{stats.userUnavailable}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Ready For Assignment</p>
              <p className="text-2xl font-bold text-violet-600">{stats.readyForAssignment}</p>
            </div>
            <div className="p-3 rounded-lg bg-violet-50">
              <Truck className="w-6 h-6 text-violet-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivery Boy Assigned</p>
              <p className="text-2xl font-bold text-purple-600">{stats.deliveryBoyAssigned}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Truck className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Assignment Accepted</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.assignmentAccepted}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivery Boy Reached Pickup</p>
              <p className="text-2xl font-bold text-orange-600">{stats.reachedPickup}</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Order ID Accepted</p>
              <p className="text-2xl font-bold text-indigo-600">{stats.orderIdAccepted}</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Reached Drop</p>
              <p className="text-2xl font-bold text-amber-600">{stats.reachedDrop}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <Truck className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivered</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.delivered}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>'

$newCards = '      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="p-3 bg-brand-50 rounded-lg">
              <Package className="w-6 h-6" style={{ color: BRAND_THEME.colors.brand.primary }} />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Pending Assignment</p>
              <p className="text-2xl font-bold text-violet-600">{stats.pendingAssignment}</p>
            </div>
            <div className="p-3 bg-violet-50 rounded-lg">
              <Truck className="w-6 h-6 text-violet-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">In Transit</p>
              <p className="text-2xl font-bold text-orange-600">{stats.inTransit}</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Truck className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivered</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.delivered}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">User Unavailable</p>
              <p className="text-2xl font-bold text-amber-600">{stats.userUnavailable}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Rejected/Cancelled</p>
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>'

# Normalize line endings for replacement
$content = $content.Replace($oldStats.Replace("`n", "`r`n"), $newStats.Replace("`n", "`r`n"))
$content = $content.Replace($oldStats, $newStats)
$content = $content.Replace($oldCards.Replace("`n", "`r`n"), $newCards.Replace("`n", "`r`n"))
$content = $content.Replace($oldCards, $newCards)

[System.IO.File]::WriteAllText($path, $content)
Write-Host "Success"
