// Export utility functions for reports
export const exportReportsToCSV = (data, headers, filename = "report") => {
  const rows = data.map((item, index) => {
    return headers.map(header => {
      const value = item[header.key] || item[header] || ""
      return typeof value === 'object' ? JSON.stringify(value) : value
    })
  })
  
  const headerRow = headers.map(h => typeof h === 'string' ? h : h.label).join(",")
  const csvContent = [
    headerRow,
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
  ].join("\n")
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportReportsToExcel = (data, headers, filename = "report") => {
  const rows = data.map((item) => {
    return headers.map(header => {
      const value = item[header.key] || item[header] || ""
      let val = typeof value === 'object' ? JSON.stringify(value) : value
      if (typeof val === 'string') {
        val = val.replace(/₹\s?/g, '')
      }
      return val
    })
  })
  
  const headerRow = headers.map(h => typeof h === 'string' ? h : h.label).join("\t")
  const csvContent = [
    headerRow,
    ...rows.map(row => row.join("\t"))
  ].join("\n")
  
  const blob = new Blob(["\uFEFF" + csvContent], { type: "application/vnd.ms-excel;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportReportsToPDF = async (data, headers, filename = "report", title = "Report") => {
  try {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF("landscape");
    
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    
    const headerRow = headers.map(h => typeof h === 'string' ? h : h.label);
    const bodyRows = data.map(item => {
      return headers.map(header => {
        const value = item[header.key] || item[header] || "";
        let val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        val = val.replace(/₹\s?/g, '');
        return val;
      });
    });

    autoTable(doc, {
      startY: 35,
      head: [headerRow],
      body: bodyRows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 }
    });

    doc.save(`${filename}_${new Date().toISOString().split("T")[0]}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
  }
}

export const exportReportsToJSON = (data, filename = "report") => {
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Specific export functions for Transaction Report
export const exportTransactionReportToCSV = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Coupon By Admin", "Coupon By Restaurant", "Offer By Restaurant", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
  const rows = transactions.map((transaction, index) => [
    index + 1,
    transaction.orderId,
    transaction.restaurant,
    transaction.customerName,
    transaction.totalItemAmount.toFixed(2),
    (transaction.couponByAdmin || 0).toFixed(2),
    (transaction.couponByRestaurant || 0).toFixed(2),
    (transaction.offerByRestaurant || 0).toFixed(2),
    transaction.vatTax.toFixed(2),
    transaction.deliveryCharge.toFixed(2),
    Number(transaction.platformFee || 0).toFixed(2),
    transaction.orderAmount.toFixed(2)
  ])
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n")
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportTransactionReportToExcel = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Coupon By Admin", "Coupon By Restaurant", "Offer By Restaurant", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
  const rows = transactions.map((transaction, index) => [
    index + 1,
    transaction.orderId,
    transaction.restaurant,
    transaction.customerName,
    transaction.totalItemAmount.toFixed(2),
    (transaction.couponByAdmin || 0).toFixed(2),
    (transaction.couponByRestaurant || 0).toFixed(2),
    (transaction.offerByRestaurant || 0).toFixed(2),
    transaction.vatTax.toFixed(2),
    transaction.deliveryCharge.toFixed(2),
    Number(transaction.platformFee || 0).toFixed(2),
    transaction.orderAmount.toFixed(2)
  ])
  
  const csvContent = [
    headers.join("\t"),
    ...rows.map(row => row.join("\t"))
  ].join("\n")
  
  const blob = new Blob(["\uFEFF" + csvContent], { type: "application/vnd.ms-excel;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportTransactionReportToPDF = async (transactions, filename = "transaction_report") => {
  try {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Coupon By Admin", "Coupon By Restaurant", "Offer By Restaurant", "VAT/Tax", "Delivery Charge", "Platform Fee", "Order Amount"]
    
    const doc = new jsPDF("landscape");
    
    doc.setFontSize(18);
    doc.text("Transaction Report", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    
    const bodyRows = transactions.map((transaction, index) => [
      index + 1,
      transaction.orderId,
      transaction.restaurant,
      transaction.customerName,
      transaction.totalItemAmount.toFixed(2),
      (transaction.couponByAdmin || 0).toFixed(2),
      (transaction.couponByRestaurant || 0).toFixed(2),
      (transaction.offerByRestaurant || 0).toFixed(2),
      transaction.vatTax.toFixed(2),
      transaction.deliveryCharge.toFixed(2),
      Number(transaction.platformFee || 0).toFixed(2),
      transaction.orderAmount.toFixed(2)
    ]);

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: bodyRows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 }
    });

    doc.save(`${filename}_${new Date().toISOString().split("T")[0]}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
  }
}

export const exportTransactionReportToJSON = (transactions, filename = "transaction_report") => {
  const jsonContent = JSON.stringify(transactions, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
