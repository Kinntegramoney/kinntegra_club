import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Calculator, TrendingUp, DollarSign, Trash2, Upload, ShoppingCart, FileCheck, FileText, Eye, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function BondDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bond, setBond] = useState(null);
  const [loading, setLoading] = useState(true);
  const [investmentDate, setInvestmentDate] = useState("");
  const [calculation, setCalculation] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [approximateAmount, setApproximateAmount] = useState("");
  const [selectedUnits, setSelectedUnits] = useState(null);
  const [selectedBound, setSelectedBound] = useState(null); // 'lower' or 'upper'
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCashflowModal, setShowCashflowModal] = useState(false);
  
  // Book Units state
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentProof, setPaymentProof] = useState(null);
  const [bookingUnits, setBookingUnits] = useState(false);
  
  // Block Units form fields (editable, not prefilled)
  const [bookingInvestmentDate, setBookingInvestmentDate] = useState("");
  const [bookingUnitsCount, setBookingUnitsCount] = useState("");
  const [bookingAmountTransferred, setBookingAmountTransferred] = useState("");
  
  // Enhanced calculator state
  const [enhancedCalculation, setEnhancedCalculation] = useState(null);
  const [calculatingEnhanced, setCalculatingEnhanced] = useState(false);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Cashflow report modal state
  const [showCashflowReport, setShowCashflowReport] = useState(false);
  const [cashflowReportData, setCashflowReportData] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
    fetchBond();
    fetchClients();
  }, [id]);

  const fetchBond = async () => {
    try {
      const response = await axios.get(`${API}/bonds/${id}`);
      setBond(response.data);
      setLoading(false);
      
      // Set default investment date to today if within bond period
      const today = new Date().toISOString().split('T')[0];
      const startDate = response.data.bond.start_date;
      const endDate = response.data.bond.end_date;
      
      if (today >= startDate && today <= endDate) {
        setInvestmentDate(today);
      } else if (today < startDate) {
        setInvestmentDate(startDate);
      }
    } catch (error) {
      console.error("Error fetching bond:", error);
      toast.error("Failed to load bond details");
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const response = await axios.get(`${API}/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClients(response.data);
    } catch (error) {
      console.error("Error fetching clients:", error);
    }
  };

  const bookUnits = async () => {
    // For clients, they don't need to select a client (they're booking for themselves)
    if (user?.role !== 'client' && !selectedClient) {
      toast.error("Please select a client");
      return;
    }
    if (!bookingInvestmentDate) {
      toast.error("Please select investment date");
      return;
    }
    if (!bookingUnitsCount || parseInt(bookingUnitsCount) < 1) {
      toast.error("Please enter number of units");
      return;
    }
    if (!bookingAmountTransferred) {
      toast.error("Please enter amount transferred");
      return;
    }
    if (!paymentReference) {
      toast.error("Please enter UTR number");
      return;
    }
    if (!paymentProof) {
      toast.error("Please upload UTR copy");
      return;
    }

    // Use editable form values instead of calculator values
    const unitsToBook = parseInt(bookingUnitsCount);
    const totalAmount = parseFloat(bookingAmountTransferred.replace(/,/g, ''));
    
    // Calculate price per unit from entered values (or use calculator if available)
    const calculatedPricePerUnit = enhancedCalculation?.clean_price_per_unit 
      ? Math.ceil(enhancedCalculation.clean_price_per_unit)
      : Math.ceil(totalAmount / unitsToBook);

    setBookingUnits(true);
    try {
      const token = localStorage.getItem("token");
      
      // First upload the payment proof
      let paymentProofUrl = null;
      if (paymentProof) {
        const formData = new FormData();
        formData.append('file', paymentProof);
        const uploadResponse = await axios.post(`${API}/upload`, formData, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        paymentProofUrl = uploadResponse.data.url;
      }
      
      // Different endpoint for clients
      const endpoint = user?.role === 'client' ? `${API}/client/trades` : `${API}/trades`;
      
      await axios.post(endpoint, {
        bond_id: id,
        client_id: selectedClient || null,
        units: unitsToBook,
        investment_date: bookingInvestmentDate,
        calculated_price: calculatedPricePerUnit,
        total_amount: totalAmount,
        payment_reference: paymentReference,
        payment_notes: paymentNotes,
        payment_proof_url: paymentProofUrl,
        // Flag to record future cashflows after broker verification
        record_future_cashflows: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (user?.role === 'broker') {
        toast.success("Units blocked and future cashflows recorded!");
        navigate("/broker/trades");
      } else if (user?.role === 'client') {
        toast.success("Trade request submitted! Your sub-broker has been notified.");
        navigate("/client/trades");
      } else {
        toast.success("Units blocked! Awaiting broker verification for cashflow recording.");
        navigate("/sub-broker/opportunities");
      }
    } catch (error) {
      console.error("Error booking units:", error);
      toast.error(error.response?.data?.detail || "Failed to block units");
    } finally {
      setBookingUnits(false);
    }
  };

  const calculatePrice = async (units) => {
    if (!investmentDate) {
      toast.error("Please select an investment date");
      return;
    }

    if (!units || units < 1) {
      toast.error("Please select number of units");
      return;
    }

    // Check if requested units exceed available units
    if (units > unitsAvailable) {
      toast.error(`Only ${unitsAvailable} units available. You requested ${units} units.`);
      return;
    }

    setCalculating(true);
    setSelectedUnits(units);
    try {
      const response = await axios.post(`${API}/bonds/${id}/calculate`, {
        investment_date: investmentDate,
        units: units
      });
      setCalculation(response.data);
      toast.success("Price calculated successfully!");
    } catch (error) {
      console.error("Error calculating price:", error);
      toast.error(error.response?.data?.detail || "Failed to calculate price");
    } finally {
      setCalculating(false);
    }
  };

  // Enhanced secondary market calculation
  const calculateEnhancedPrice = async (units = 1) => {
    if (!settlementDate) {
      toast.error("Please select a settlement date");
      return;
    }

    setCalculatingEnhanced(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/calculate-enhanced`, {
        settlement_date: settlementDate,
        units: units
      });
      setEnhancedCalculation(response.data);
      // Also set for booking section compatibility - use CLEAN PRICE (principal only)
      // Include stamp duty and total consideration for the order summary
      setCalculation({
        investment_date: settlementDate,
        units_requested: units,
        price_per_unit: response.data.clean_price_per_unit,
        total_price: response.data.total_clean_price,
        stamp_duty: response.data.stamp_duty || 0,
        total_consideration: response.data.total_consideration || response.data.total_clean_price,
        remaining_principal: response.data.total_remaining_principal / units,
        remaining_interest: response.data.total_remaining_interest / units,
        total_inflows: response.data.total_future_cashflows / units,
        secondary_buyer_irr: response.data.secondary_irr,
        days_to_maturity: response.data.days_to_maturity,
        units_available: response.data.units_available,
        tds_rate: 10.0
      });
      setSelectedUnits(units);
      setInvestmentDate(settlementDate);
    } catch (error) {
      console.error("Error calculating enhanced price:", error);
      toast.error(error.response?.data?.detail || "Failed to calculate price");
    } finally {
      setCalculatingEnhanced(false);
    }
  };

  const downloadCashflow = async () => {
    if (!enhancedCalculation) {
      toast.error("Please calculate price first");
      return;
    }

    const unitsToDownload = selectedUnits || enhancedCalculation.units_requested;
    if (!unitsToDownload || unitsToDownload <= 0) {
      toast.error("Please enter units");
      return;
    }

    setDownloading(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/download-cashflow`, {
        investment_date: settlementDate,
        units: unitsToDownload
      });
      
      setCashflowReportData(response.data);
      setShowCashflowReport(true);
    } catch (error) {
      console.error("Error downloading cashflow:", error);
      toast.error("Failed to load cashflow report");
    } finally {
      setDownloading(false);
    }
  };

  const exportCashflowToPDF = async () => {
    if (!cashflowReportData) return;
    
    toast.info("Generating PDF...");
    
    // Build HTML for PDF matching the reference design exactly
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Bond Cashflow Statement - ${cashflowReportData.bond_name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Helvetica Neue', Arial, sans-serif; 
            padding: 30px 40px; 
            color: #000; 
            background: #fff; 
            font-size: 12px; 
          }
          
          /* Title */
          .title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 20px;
            color: #000;
          }
          
          /* Header Cards - 2x4 Grid with gray background */
          .header-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0;
            margin-bottom: 15px;
            border: 1px solid #e0e0e0;
          }
          .header-cell {
            padding: 12px 15px;
            background: #f5f5f5;
            border-right: 1px solid #e0e0e0;
            border-bottom: 1px solid #e0e0e0;
          }
          .header-cell:nth-child(4), .header-cell:nth-child(8) {
            border-right: none;
          }
          .header-cell:nth-child(5), .header-cell:nth-child(6), .header-cell:nth-child(7), .header-cell:nth-child(8) {
            border-bottom: none;
          }
          .header-cell .label {
            font-size: 10px;
            color: #666;
            margin-bottom: 4px;
          }
          .header-cell .value {
            font-size: 13px;
            font-weight: 600;
            color: #000;
          }
          
          /* XIRR Line */
          .xirr-line {
            font-size: 14px;
            margin-bottom: 20px;
            padding: 10px 0;
          }
          .xirr-line .label {
            font-weight: 400;
            color: #000;
          }
          .xirr-line .value {
            font-weight: 700;
            color: #000;
          }
          
          /* Table */
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background: #f5f5f5;
            padding: 10px 12px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            color: #000;
            border-bottom: 2px solid #000;
          }
          th:not(:first-child) {
            text-align: right;
          }
          td {
            padding: 8px 12px;
            font-size: 11px;
            border-bottom: 1px solid #e0e0e0;
          }
          td:not(:first-child) {
            text-align: right;
            font-family: 'SF Mono', 'Consolas', monospace;
          }
          tr:nth-child(even) {
            background: #fafafa;
          }
          
          /* Note */
          .note {
            font-size: 10px;
            color: #666;
            line-height: 1.5;
            padding-top: 10px;
            border-top: 1px solid #e0e0e0;
          }
          .note strong {
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="title">Bond Cashflow Statement (Single Bond)</div>
        
        <!-- Header Cards - 2x4 Grid -->
        <div class="header-grid">
          <!-- Row 1 -->
          <div class="header-cell">
            <div class="label">Bond</div>
            <div class="value">${cashflowReportData.bond_name}</div>
          </div>
          <div class="header-cell">
            <div class="label">Units</div>
            <div class="value">${cashflowReportData.units}</div>
          </div>
          <div class="header-cell">
            <div class="label">Investment Date</div>
            <div class="value">${format(new Date(cashflowReportData.investment_date), 'dd MMM yyyy')}</div>
          </div>
          <div class="header-cell">
            <div class="label">Price Paid</div>
            <div class="value">₹${cashflowReportData.price_paid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <!-- Row 2 -->
          <div class="header-cell">
            <div class="label">Total Principal</div>
            <div class="value">₹${cashflowReportData.total_principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="header-cell">
            <div class="label">Total Interest</div>
            <div class="value">₹${cashflowReportData.total_interest.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="header-cell">
            <div class="label">TDS Deducted</div>
            <div class="value">₹${cashflowReportData.total_tds.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="header-cell">
            <div class="label">Net Received</div>
            <div class="value">₹${cashflowReportData.total_net_received.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
        
        <!-- XIRR -->
        <div class="xirr-line">
          <span class="label">XIRR</span> <span class="value">${bondData?.secondary_irr || '-'}%</span>
        </div>
        
        <!-- Cashflow Table -->
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>TDS</th>
              <th>Net Payment</th>
            </tr>
          </thead>
          <tbody>
            ${cashflowReportData.cashflows.map(cf => `
              <tr>
                <td>${format(new Date(cf.date), 'dd MMM yyyy')}</td>
                <td>${cf.principal_payment > 0 ? '₹' + cf.principal_payment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                <td>₹${cf.interest_payment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>₹${cf.tds_deducted.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>₹${cf.total_net_payment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <!-- Note -->
        <div class="note">
          <strong>Note:</strong> Interest is paid ${bondData?.coupon_frequency || 'monthly'} with ${bondData?.cutoff_days || 15} day cutoff. 
          Principal repayments are highlighted where applicable. TDS is deducted at 10% on interest component.
          Generated on ${format(new Date(), 'dd MMM yyyy HH:mm')}.
        </div>
      </body>
      </html>
    `;
    
    try {
      // Create iframe for PDF generation
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 900px; height: 1200px; border: none;';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const html2pdf = (await import('html2pdf.js')).default;
      
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `Bond_Cashflow_${cashflowReportData.bond_name.replace(/\s+/g, '_')}_${format(new Date(cashflowReportData.investment_date), 'yyyyMMdd')}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2,
            useCORS: true,
            logging: false,
            letterRendering: true,
            backgroundColor: '#ffffff',
            windowWidth: 900
          },
          jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait' 
          },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        })
        .from(iframeDoc.body)
        .save();
      
      document.body.removeChild(iframe);
      toast.success("PDF exported successfully!");
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Failed to export PDF: " + err.message);
    }
  };

  const formatINR = (amount) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getLowerBoundUnits = () => {
    if (!approximateAmount || !calculation || !calculation.price_per_unit) return null;
    return Math.floor(parseFloat(approximateAmount) / calculation.price_per_unit);
  };

  const getUpperBoundUnits = () => {
    if (!approximateAmount || !calculation || !calculation.price_per_unit) return null;
    return Math.ceil(parseFloat(approximateAmount) / calculation.price_per_unit);
  };

  const handleDeleteBond = async () => {
    if (!window.confirm(`Are you sure you want to delete "${bondData.name}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/bonds/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Bond deleted successfully");
      navigate("/broker/admin/bonds");
    } catch (error) {
      console.error("Error deleting bond:", error);
      toast.error(error.response?.data?.detail || "Failed to delete bond");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" data-testid="loading-bond-details">
        <p className="text-muted-foreground">Loading bond details...</p>
      </div>
    );
  }

  if (!bond) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Bond not found</p>
          <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const { bond: bondData, total_cashflows_primary, calculated_primary_irr } = bond;
  
  // Calculate if bond is fully funded or closed
  const totalUnits = bondData.total_units || 1;
  const unitsSold = bondData.units_sold || 0;
  const unitsAvailable = totalUnits - unitsSold;
  const isFullyFunded = unitsAvailable <= 0;
  const isClosed = bondData.status === 'closed';
  const isCalculatorDisabled = isFullyFunded || isClosed;

  // Prepare chart data - prioritize cashflows_per_unit (new format) over legacy arrays
  const chartData = [];
  const hasCashflowsPerUnit = bondData.cashflows_per_unit && bondData.cashflows_per_unit.length > 0;
  
  // Prepare display arrays for the tables
  const displayInterestPayments = [];
  const displayPrincipalPayments = [];
  
  if (hasCashflowsPerUnit) {
    // Use new cashflows_per_unit format
    bondData.cashflows_per_unit.forEach(cf => {
      const cfDate = new Date(cf.date);
      const dateStr = format(cfDate, "MMM dd, yyyy");
      const dateValue = cfDate.getTime();
      
      // Handle both naming conventions: interest/principal or interest_per_unit/principal_per_unit
      const interestAmount = cf.interest_per_unit || cf.interest || 0;
      const principalAmount = cf.principal_per_unit || cf.principal || 0;
      
      chartData.push({
        date: dateStr,
        dateValue: dateValue,
        Interest: interestAmount,
        Principal: principalAmount
      });
      
      // Build display arrays
      if (interestAmount > 0) {
        displayInterestPayments.push({ date: cf.date, amount: interestAmount });
      }
      if (principalAmount > 0) {
        displayPrincipalPayments.push({ date: cf.date, amount: principalAmount });
      }
    });
  } else {
    // Fall back to legacy interest_payments and principal_payments arrays
    const interestPayments = bondData.interest_payments || [];
    const principalPayments = bondData.principal_payments || [];
    
    interestPayments.forEach(ip => {
      chartData.push({
        date: format(new Date(ip.date), "MMM dd, yyyy"),
        dateValue: new Date(ip.date).getTime(),
        Interest: ip.amount,
        Principal: 0
      });
      displayInterestPayments.push({ date: ip.date, amount: ip.amount });
    });

    principalPayments.forEach(pp => {
      const amount = bondData.principal_amount * pp.percentage / 100;
      const existing = chartData.find(d => d.dateValue === new Date(pp.date).getTime());
      if (existing) {
        existing.Principal = amount;
      } else {
        chartData.push({
          date: format(new Date(pp.date), "MMM dd, yyyy"),
          dateValue: new Date(pp.date).getTime(),
          Interest: 0,
          Principal: amount
        });
      }
      displayPrincipalPayments.push({ date: pp.date, amount: amount, percentage: pp.percentage });
    });
  }

  chartData.sort((a, b) => a.dateValue - b.dateValue);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-border bg-primary text-primary-foreground">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                data-testid="back-to-dashboard-from-details"
                variant="ghost"
                size="sm"
                onClick={() => navigate("/broker/opportunities")}
                className="text-primary-foreground hover:bg-primary-foreground/10"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Calculator className="h-8 w-8" />
              <h1 className="text-2xl font-bold tracking-tight" data-testid="bond-details-title">{bondData.name}</h1>
            </div>
            {/* Check if current user is a broker and bond is not funded or closed */}
            {(() => {
              const user = localStorage.getItem("user");
              const userData = user ? JSON.parse(user) : null;
              // Don't show delete button if bond is fully funded or closed
              if (isCalculatorDisabled) return null;
              return userData?.role === "broker" && (
                <Button
                  data-testid="delete-bond-btn"
                  onClick={handleDeleteBond}
                  disabled={deleting}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? "Deleting..." : "Delete Bond"}
                </Button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Bond Description - At Top with View Cashflows Icon (broker only) */}
        {bondData.description && (
          <div className="mb-6 bg-gradient-to-r from-etihad-gold-50 to-orange-50 rounded-xl p-5 border border-etihad-gold-200 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-10 h-10 bg-etihad-gold-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-etihad-gold-600" />
                </div>
                <div>
                  <p className="text-xs text-etihad-gold-700 font-semibold uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{bondData.description}</p>
                </div>
              </div>
              {user?.role === 'broker' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCashflowModal(true)}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                  data-testid="view-cashflows-btn"
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">View Cashflows</span>
                </Button>
              )}
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bond Summary */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Principal Amount</p>
                <p className="text-2xl font-mono font-bold" data-testid="bond-principal-display">₹{bondData.principal_amount.toLocaleString()}</p>
              </div>
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">XIRR</p>
                <p className="text-2xl font-mono font-bold text-accent">{bondData.secondary_irr}%</p>
              </div>
              <div className="metric-card rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Units Available</p>
                <p className="text-2xl font-mono font-bold" data-testid="units-available">
                  {(bondData.total_units || 1) - (bondData.units_sold || 0)}/{bondData.total_units || 1}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sold: {bondData.units_sold || 0} | Min: {bondData.minimum_units || 1}
                </p>
              </div>
            </div>
          </div>

          {/* Secondary Market Calculator - Only show if bond is not fully funded or closed */}
          {isCalculatorDisabled ? (
            <div className="lg:col-span-3 metric-card rounded-md bg-etihad-gold-50 border-etihad-gold-200">
              <div className="flex items-center gap-3 text-etihad-gold-700">
                <div className="w-12 h-12 rounded-full bg-etihad-gold-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  {isClosed ? (
                    <>
                      <h2 className="text-xl font-semibold">Bond Closed</h2>
                      <p className="text-sm text-etihad-gold-600">This bond has matured (end date: {format(new Date(bondData.end_date), "MMM dd, yyyy")}). No more investments can be made.</p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold">Bond Fully Funded</h2>
                      <p className="text-sm text-etihad-gold-600">All {totalUnits} units have been sold. No more investments can be made.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
          <div className="lg:col-span-3 metric-card rounded-md bg-surface">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-accent" />
                <h2 className="text-xl font-semibold">Secondary Market Calculator</h2>
              </div>
              <span className="text-sm font-medium px-3 py-1 bg-green-100 text-green-700 rounded-full">
                {unitsAvailable} of {totalUnits} units available
              </span>
            </div>
            
            {/* Unified Calculator */}
            <div className="bg-gradient-to-r from-blue-50 to-etihad-maroon-50 rounded-lg p-4 mb-4 border border-blue-200">
              <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Bond Price Calculator (Proposed IRR: {bondData.secondary_irr}%)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="settlement_date" className="text-xs text-blue-700">Settlement Date</Label>
                  <Input
                    data-testid="settlement-date-input"
                    id="settlement_date"
                    type="date"
                    value={settlementDate}
                    onChange={(e) => {
                      setSettlementDate(e.target.value);
                      setEnhancedCalculation(null);
                      setCalculation(null);
                      setSelectedUnits(null);
                    }}
                    min={bondData.start_date}
                    max={bondData.end_date}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="calc_units" className="text-xs text-blue-700">Units</Label>
                  <Input
                    data-testid="calc-units-input"
                    id="calc_units"
                    type="number"
                    min={bondData.minimum_units || 1}
                    max={unitsAvailable}
                    defaultValue={bondData.minimum_units || 1}
                    className="bg-white"
                    onChange={() => {
                      setApproximateAmount('');
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="approximate_amount" className="text-xs text-blue-700">Or Amount (₹)</Label>
                  <Input
                    data-testid="approximate-amount-input"
                    id="approximate_amount"
                    type="text"
                    value={approximateAmount ? parseInt(approximateAmount).toLocaleString('en-IN') : ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/,/g, '');
                      if (value === '' || !isNaN(value)) {
                        setApproximateAmount(value);
                        document.getElementById('calc_units').value = '';
                      }
                    }}
                    placeholder="e.g., 10,00,000"
                    className="bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-blue-700">Face Value (per unit)</Label>
                  <div className="h-10 px-3 flex items-center bg-white border rounded-md text-sm font-mono">
                    ₹{(bondData.face_value || bondData.principal_amount).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button
                    data-testid="calculate-price-btn"
                    onClick={() => {
                      const units = parseInt(document.getElementById('calc_units').value);
                      if (units && units > 0) {
                        // Calculate by units
                        calculateEnhancedPrice(units);
                      } else if (approximateAmount) {
                        // Calculate by amount - first get price for 1 unit
                        calculateEnhancedPrice(1);
                      } else {
                        toast.error("Please enter either units or an amount");
                      }
                    }}
                    disabled={calculatingEnhanced || !settlementDate}
                    className="btn-scale w-full bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Calculator className="h-4 w-4 mr-2" />
                    {calculatingEnhanced ? "Calculating..." : "Calculate"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Unit Bounds Display - when amount is entered */}
            {approximateAmount && enhancedCalculation && enhancedCalculation.clean_price_per_unit > 0 && (
              <div className="mb-4 p-4 bg-white border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-blue-800">For approximate amount of ₹{parseInt(approximateAmount).toLocaleString('en-IN')}</p>
                  <div className="bg-emerald-100 px-3 py-1 rounded-full">
                    <p className="text-xs font-mono font-semibold text-emerald-700">Price/Unit: ₹{Math.ceil(enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Lower Bound */}
                  {(() => {
                    const lowerUnits = Math.floor(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit);
                    const lowerAmount = Math.ceil(lowerUnits * enhancedCalculation.clean_price_per_unit) + 1;
                    return (
                      <div 
                        className={`p-4 rounded-lg transition-all cursor-pointer ${
                          selectedBound === 'lower' 
                            ? 'border-2 border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' 
                            : 'border border-gray-200 hover:border-emerald-400 bg-gray-50'
                        }`}
                        onClick={() => {
                          if (lowerUnits >= 1 && lowerUnits <= enhancedCalculation.units_available) {
                            setSelectedBound('lower');
                            setSelectedUnits(lowerUnits);
                            calculateEnhancedPrice(lowerUnits);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">Lower Bound</span>
                          {selectedBound === 'lower' && (
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-1 rounded">✓ Selected</span>
                          )}
                        </div>
                        <p className="text-2xl font-mono font-bold text-gray-800" data-testid="lower-bound-units">
                          {lowerUnits} units
                        </p>
                        <p className="text-xl text-emerald-700 font-mono font-bold mt-1">
                          ₹{lowerAmount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{lowerUnits} × ₹{Math.ceil(enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN')}</p>
                      </div>
                    );
                  })()}
                  {/* Upper Bound */}
                  {(() => {
                    const upperUnits = Math.ceil(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit);
                    const upperAmount = Math.ceil(upperUnits * enhancedCalculation.clean_price_per_unit) + 1;
                    return (
                      <div 
                        className={`p-4 rounded-lg transition-all cursor-pointer ${
                          selectedBound === 'upper' 
                            ? 'border-2 border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' 
                            : 'border border-gray-200 hover:border-emerald-400 bg-gray-50'
                        }`}
                        onClick={() => {
                          if (upperUnits >= 1 && upperUnits <= enhancedCalculation.units_available) {
                            setSelectedBound('upper');
                            setSelectedUnits(upperUnits);
                            calculateEnhancedPrice(upperUnits);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-600">Upper Bound</span>
                          {selectedBound === 'upper' && (
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-1 rounded">✓ Selected</span>
                          )}
                        </div>
                        <p className="text-2xl font-mono font-bold text-gray-800" data-testid="upper-bound-units">
                          {upperUnits} units
                        </p>
                        <p className="text-xl text-emerald-700 font-mono font-bold mt-1">
                          ₹{upperAmount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{upperUnits} × ₹{Math.ceil(enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN')}</p>
                      </div>
                    );
                  })()}
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center">Click on a bound to select and proceed to booking</p>
              </div>
            )}

            {/* Units mode - Show price directly in a compact card */}
            {!approximateAmount && enhancedCalculation && enhancedCalculation.units_requested > 0 && (
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">For {enhancedCalculation.units_requested} unit{enhancedCalculation.units_requested > 1 ? 's' : ''}</p>
                    <p className="text-xs text-gray-500 mt-1">{enhancedCalculation.units_requested} × ₹{Math.ceil(enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-emerald-600 font-medium">Price/Unit</p>
                    <p className="text-lg font-mono font-bold text-emerald-700">₹{Math.ceil(enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right pl-4 border-l border-emerald-200">
                    <p className="text-xs text-emerald-600 font-medium">Total</p>
                    <p className="text-2xl font-mono font-bold text-emerald-700">₹{(Math.ceil(enhancedCalculation.total_clean_price) + 1).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Download Cashflow Report Button - Only show after calculation */}
            {enhancedCalculation && (
              <div className="mb-4 flex justify-center">
                <Button
                  data-testid="download-cashflow-btn"
                  onClick={downloadCashflow}
                  disabled={downloading}
                  variant="outline"
                  className="btn-scale"
                >
                  {downloading ? "Loading..." : "View Cashflow Report"}
                </Button>
              </div>
            )}

            {/* Block Units Section - Always visible for brokers/sub-brokers to tag client investments */}
            {user?.role !== 'client' && (
              <div className="mt-6 pt-6 border-t border-border">
                {/* Book Units Section */}
                <div className="p-4 md:p-6 bg-etihad-gold-50 border border-etihad-gold-200 rounded-md">
                  <h3 className="font-semibold mb-4 flex items-center gap-2 text-base md:text-lg">
                    <ShoppingCart className="h-5 w-5 text-etihad-gold-600" />
                    Block Units for Client
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Client Selection */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Select Client *</Label>
                      <Select value={selectedClient} onValueChange={setSelectedClient}>
                        <SelectTrigger data-testid="select-client-booking" className="w-full">
                          <SelectValue placeholder="Choose a client..." />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.length === 0 ? (
                            <SelectItem value="none" disabled>No clients available</SelectItem>
                          ) : (
                            clients.map(client => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name} ({client.pan_number})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Investment Date - Editable */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Date of Investment *</Label>
                      <Input
                        type="date"
                        value={bookingInvestmentDate}
                        onChange={(e) => setBookingInvestmentDate(e.target.value)}
                        min={bondData.start_date}
                        max={bondData.end_date}
                        placeholder="Select transaction date"
                        data-testid="investment-date-input"
                      />
                    </div>

                    {/* Units and Amount - Editable */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">No. of Units Bought *</Label>
                        <Input
                          type="number"
                          min="1"
                          max={bondData.total_units - (bondData.units_sold || 0)}
                          value={bookingUnitsCount}
                          onChange={(e) => setBookingUnitsCount(e.target.value)}
                          placeholder="Enter units"
                          data-testid="booking-units-input"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Amount Transferred (₹) *</Label>
                        <Input
                          type="text"
                          value={bookingAmountTransferred}
                          onChange={(e) => setBookingAmountTransferred(e.target.value)}
                          placeholder="Enter amount"
                          data-testid="amount-transferred-input"
                          className="font-mono"
                        />
                      </div>
                    </div>

                    {/* Reference Price Info - Show only if calculator was used */}
                    {enhancedCalculation && enhancedCalculation.clean_price_per_unit > 0 && (
                      <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                        <p className="font-medium mb-1">Reference from Calculator:</p>
                        <p>Price/Unit: ₹{Math.ceil(enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN')} | Settlement Date: {settlementDate}</p>
                      </div>
                    )}

                    {/* Payment Reference */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">UTR Number *</Label>
                      <Input
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Transaction ID / UTR Number"
                        data-testid="payment-reference-input"
                      />
                    </div>

                    {/* Payment Proof Upload */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">UTR Copy (Screenshot) *</Label>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                          className="hidden"
                          id="payment-proof-upload"
                          data-testid="payment-proof-upload"
                        />
                        <label 
                          htmlFor="payment-proof-upload" 
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-etihad-gold-300 rounded-lg cursor-pointer hover:border-etihad-gold-500 hover:bg-etihad-gold-100/50 transition-colors"
                        >
                          {paymentProof ? (
                            <>
                              <FileCheck className="h-5 w-5 text-green-600" />
                              <span className="text-sm text-green-700 truncate max-w-[200px]">{paymentProof.name}</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-5 w-5 text-etihad-gold-500" />
                              <span className="text-sm text-etihad-gold-700">Upload UTR screenshot</span>
                            </>
                          )}
                        </label>
                        {paymentProof && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setPaymentProof(null)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Order Summary - Only show when fields are filled */}
                    {bookingUnitsCount && bookingAmountTransferred && (
                    <div className="bg-white p-3 md:p-4 rounded-md border border-etihad-gold-200">
                      <p className="text-xs text-gray-500 uppercase mb-2 font-medium">Order Summary</p>
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-gray-500 text-xs">Units</p>
                            <p className="font-mono font-bold text-lg">{bookingUnitsCount}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs">Amount Transferred</p>
                            <p className="font-mono font-bold text-lg text-etihad-gold-600">₹{bookingAmountTransferred}</p>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-gray-200 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Investment Date</span>
                            <span className="font-mono text-sm">{bookingInvestmentDate || 'Not selected'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500 text-xs">Reference Price/Unit</span>
                            <span className="font-mono text-sm">₹{Math.ceil(enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                        <div className="pt-2">
                          <p className="text-gray-500 text-xs">Status</p>
                          <p className={`font-medium text-sm ${user?.role === 'broker' ? 'text-green-600' : 'text-etihad-gold-600'}`}>
                            {user?.role === 'broker' ? 'Auto-Approved (Future Cashflows Recorded)' : 'Pending Broker Verification'}
                          </p>
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Submit Button */}
                    <Button
                      onClick={bookUnits}
                      disabled={bookingUnits || !bookingInvestmentDate || !bookingUnitsCount || !bookingAmountTransferred || !paymentReference || !paymentProof || (user?.role !== 'client' && (!selectedClient || clients.length === 0))}
                      className="w-full bg-etihad-gold-600 hover:bg-etihad-gold-700 text-white py-3"
                      data-testid="book-units-btn"
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      {bookingUnits ? "Booking..." : 
                        user?.role === 'broker' ? "Book & Approve Units" : 
                        user?.role === 'client' ? "Submit Investment Request" : 
                        "Submit for Approval"}
                    </Button>
                    
                    {user?.role !== 'broker' && (
                      <p className="text-xs text-gray-500 text-center">
                        {user?.role === 'client' 
                          ? "Your investment request will be sent to your sub-broker for processing"
                          : "Trade will be submitted for broker verification before units are allocated"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
      
      {/* Cashflow Modal - Popup for broker */}
      {showCashflowModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-teal-50 to-blue-50">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <svg className="h-5 w-5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
                Cashflow Schedule - {bondData.name}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowCashflowModal(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Modal Body */}
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total Interest</p>
                  <p className="font-bold text-blue-700">
                    ₹{displayInterestPayments.reduce((sum, ip) => sum + (ip.amount || 0), 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total Principal</p>
                  <p className="font-bold text-green-700">
                    ₹{displayPrincipalPayments.reduce((sum, pp) => sum + (pp.amount || 0), 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total Cashflow</p>
                  <p className="font-bold text-purple-700">
                    ₹{(displayInterestPayments.reduce((sum, ip) => sum + (ip.amount || 0), 0) + displayPrincipalPayments.reduce((sum, pp) => sum + (pp.amount || 0), 0)).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              
              {/* Chart */}
              <div className="mb-4 bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3">Cashflow Timeline</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <Tooltip 
                      contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}
                      formatter={(value) => `₹${value.toLocaleString()}`}
                    />
                    <Legend />
                    <Bar dataKey="Interest" fill="#059669" name="Interest" />
                    <Bar dataKey="Principal" fill="#DC2626" name="Principal" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 font-semibold text-gray-700 border-b">Date</th>
                        <th className="text-right p-3 font-semibold text-blue-700 border-b">Interest</th>
                        <th className="text-right p-3 font-semibold text-green-700 border-b">Principal</th>
                        <th className="text-right p-3 font-semibold text-purple-700 border-b">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const allDates = new Set();
                        displayInterestPayments.forEach(ip => allDates.add(ip.date));
                        displayPrincipalPayments.forEach(pp => allDates.add(pp.date));
                        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
                        
                        if (sortedDates.length === 0) {
                          return (
                            <tr><td colSpan="4" className="text-center p-6 text-gray-500">No cashflows scheduled</td></tr>
                          );
                        }
                        
                        return sortedDates.map((date, idx) => {
                          const interest = displayInterestPayments.find(ip => ip.date === date)?.amount || 0;
                          const principal = displayPrincipalPayments.find(pp => pp.date === date)?.amount || 0;
                          const total = interest + principal;
                          const isPast = new Date(date) < new Date();
                          
                          return (
                            <tr key={idx} className={`border-b last:border-0 ${isPast ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}`}>
                              <td className="p-3">
                                <span className="font-medium">{format(new Date(date), "dd MMM yyyy")}</span>
                                {isPast && <span className="ml-2 text-xs text-gray-400">(Past)</span>}
                              </td>
                              <td className="p-3 text-right font-mono">{interest > 0 ? <span className="text-blue-600">₹{interest.toLocaleString('en-IN')}</span> : <span className="text-gray-300">-</span>}</td>
                              <td className="p-3 text-right font-mono">{principal > 0 ? <span className="text-green-600">₹{principal.toLocaleString('en-IN')}</span> : <span className="text-gray-300">-</span>}</td>
                              <td className="p-3 text-right font-mono font-semibold"><span className="text-purple-600">₹{total.toLocaleString('en-IN')}</span></td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Cashflow Report Modal - Matching reference design */}
      {showCashflowReport && cashflowReportData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Bond Cashflow Statement (Single Bond)</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportCashflowToPDF}>
                  <Download className="h-4 w-4 mr-2" /> Export PDF
                </Button>
                <button onClick={() => setShowCashflowReport(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            {/* Report Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div id="cashflow-report-content" className="bg-white">
                
                {/* Header Cards - 2x4 Grid with gray background */}
                <div className="grid grid-cols-4 border border-gray-200 mb-4">
                  {/* Row 1 */}
                  <div className="p-3 bg-gray-100 border-r border-b border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">Bond</p>
                    <p className="text-sm font-semibold text-gray-900">{cashflowReportData.bond_name}</p>
                  </div>
                  <div className="p-3 bg-gray-100 border-r border-b border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">Units</p>
                    <p className="text-sm font-semibold text-gray-900">{cashflowReportData.units}</p>
                  </div>
                  <div className="p-3 bg-gray-100 border-r border-b border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">Investment Date</p>
                    <p className="text-sm font-semibold text-gray-900">{format(new Date(cashflowReportData.investment_date), "dd MMM yyyy")}</p>
                  </div>
                  <div className="p-3 bg-gray-100 border-b border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">Price Paid</p>
                    <p className="text-sm font-semibold text-gray-900">₹{cashflowReportData.price_paid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </div>
                  {/* Row 2 */}
                  <div className="p-3 bg-gray-100 border-r border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">Total Principal</p>
                    <p className="text-sm font-semibold text-gray-900">₹{cashflowReportData.total_principal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 bg-gray-100 border-r border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">Total Interest</p>
                    <p className="text-sm font-semibold text-gray-900">₹{cashflowReportData.total_interest.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 bg-gray-100 border-r border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">TDS Deducted</p>
                    <p className="text-sm font-semibold text-gray-900">₹{cashflowReportData.total_tds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 bg-gray-100">
                    <p className="text-[10px] text-gray-500 mb-1">Net Received</p>
                    <p className="text-sm font-semibold text-gray-900">₹{cashflowReportData.total_net_received.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                
                {/* XIRR Line */}
                <div className="mb-4 py-2">
                  <span className="text-sm text-gray-900">XIRR</span> <span className="text-sm font-bold text-gray-900">{bondData.secondary_irr}%</span>
                </div>
                
                {/* Cashflow Table */}
                <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr className="border-b-2 border-gray-900">
                        <th className="text-left px-3 py-2 font-semibold text-gray-900">Date</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">Principal</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">Interest</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">TDS</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">Net Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashflowReportData.cashflows.map((cf, idx) => (
                        <tr key={idx} className={`border-b border-gray-200 ${idx % 2 === 1 ? 'bg-gray-50' : ''}`}>
                          <td className="px-3 py-2 font-medium text-gray-900">{format(new Date(cf.date), "dd MMM yyyy")}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            {cf.principal_payment > 0 ? `₹${cf.principal_payment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            ₹{cf.interest_payment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            ₹{cf.tds_deducted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">
                            ₹{cf.total_net_payment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Note */}
                <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500">
                  <strong className="text-gray-700">Note:</strong> Interest is paid {bondData?.coupon_frequency || 'monthly'} with {bondData?.cutoff_days || 15} day cutoff. 
                  Principal repayments are highlighted where applicable. TDS is deducted at 10% on interest component.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}