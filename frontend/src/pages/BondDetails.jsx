import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Calculator, TrendingUp, DollarSign, Trash2, Upload, ShoppingCart, FileCheck, FileText } from "lucide-react";
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
  
  // Book Units state
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentProof, setPaymentProof] = useState(null);
  const [bookingUnits, setBookingUnits] = useState(false);
  
  // Enhanced calculator state
  const [enhancedCalculation, setEnhancedCalculation] = useState(null);
  const [calculatingEnhanced, setCalculatingEnhanced] = useState(false);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);

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
    if (!calculation || !selectedUnits) {
      toast.error("Please calculate price first");
      return;
    }

    setBookingUnits(true);
    try {
      const token = localStorage.getItem("token");
      
      // Different endpoint for clients
      const endpoint = user?.role === 'client' ? `${API}/client/trades` : `${API}/trades`;
      
      await axios.post(endpoint, {
        bond_id: id,
        client_id: selectedClient || null, // null for clients (backend will use their client_id)
        units: selectedUnits,
        investment_date: investmentDate,
        calculated_price: calculation.price_per_unit,
        total_amount: calculation.total_price,
        payment_reference: paymentReference,
        payment_notes: paymentNotes,
        payment_proof_filename: paymentProof?.name || null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (user?.role === 'broker') {
        toast.success("Trade booked and approved successfully!");
        navigate("/broker/trades");
      } else if (user?.role === 'client') {
        toast.success("Trade request submitted! Your sub-broker has been notified.");
        navigate("/client/trades");
      } else {
        toast.success("Trade request submitted for broker approval!");
        navigate("/sub-broker/opportunities");
      }
    } catch (error) {
      console.error("Error booking units:", error);
      toast.error(error.response?.data?.detail || "Failed to book units");
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
      // Also set for booking section compatibility
      setCalculation({
        investment_date: settlementDate,
        units_requested: units,
        price_per_unit: response.data.dirty_price_per_unit,
        total_price: response.data.total_dirty_price,
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
    if (!calculation || !selectedUnits) {
      toast.error("Please calculate price first");
      return;
    }

    setDownloading(true);
    try {
      const response = await axios.post(`${API}/bonds/${id}/download-cashflow`, {
        investment_date: investmentDate,
        units: selectedUnits
      });
      
      // Create CSV content WITHOUT rupee symbol to avoid encoding issues
      const data = response.data;
      let csv = `Bond Name,${data.bond_name}\n`;
      csv += `Investment Date,${data.investment_date}\n`;
      csv += `Units,${data.units}\n`;
      csv += `Price Paid,${data.price_paid.toFixed(2)}\n\n`;
      csv += `Date,Month,Principal Payment,Interest Payment,TDS Deducted (10%),Net Interest,Total Net Payment\n`;
      
      data.cashflows.forEach(cf => {
        csv += `${cf.date},${cf.month},${cf.principal_payment.toFixed(2)},${cf.interest_payment.toFixed(2)},${cf.tds_deducted.toFixed(2)},${cf.net_interest.toFixed(2)},${cf.total_net_payment.toFixed(2)}\n`;
      });
      
      csv += `\nSummary\n`;
      csv += `Total Principal,${data.total_principal.toFixed(2)}\n`;
      csv += `Total Interest,${data.total_interest.toFixed(2)}\n`;
      csv += `Total TDS,${data.total_tds.toFixed(2)}\n`;
      csv += `Total Net Received,${data.total_net_received.toFixed(2)}\n`;
      csv += `\nNote: All amounts are in INR (Indian Rupees)\n`;
      
      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cashflow_${bondData.name.replace(/\s+/g, '_')}_${data.investment_date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("Cashflow downloaded successfully!");
    } catch (error) {
      console.error("Error downloading cashflow:", error);
      toast.error("Failed to download cashflow");
    } finally {
      setDownloading(false);
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

  // Prepare chart data
  const chartData = [];
  
  // Add interest payments
  bondData.interest_payments.forEach(ip => {
    chartData.push({
      date: format(new Date(ip.date), "MMM dd, yyyy"),
      dateValue: new Date(ip.date).getTime(),
      Interest: ip.amount,
      Principal: 0
    });
  });

  // Add principal payments
  bondData.principal_payments.forEach(pp => {
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
  });

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
        {/* Bond Description - At Top */}
        {bondData.description && (
          <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-200 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{bondData.description}</p>
              </div>
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
                <p className="text-xs text-muted-foreground mb-1">Secondary IRR</p>
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

          {/* Cashflow Timeline */}
          <div className="lg:col-span-3 metric-card rounded-md">
            <h2 className="text-xl font-semibold mb-4">Cashflow Timeline</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                <Tooltip 
                  contentStyle={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}
                  formatter={(value) => `₹${value.toLocaleString()}`}
                />
                <Legend />
                <Bar dataKey="Interest" fill="#2563EB" />
                <Bar dataKey="Principal" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Payment Schedules */}
          <div className="lg:col-span-1 metric-card rounded-md">
            <h3 className="text-lg font-semibold mb-3">Principal Payments</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {bondData.principal_payments.map((pp, index) => (
                <div key={index} className="flex justify-between text-sm pb-2 border-b border-border last:border-0">
                  <span className="font-mono text-muted-foreground">{format(new Date(pp.date), "MMM dd, yyyy")}</span>
                  <span className="font-mono font-medium">{pp.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 metric-card rounded-md">
            <h3 className="text-lg font-semibold mb-3">Interest Payments</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <table className="w-full data-grid">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bondData.interest_payments.map((ip, index) => (
                    <tr key={index}>
                      <td>{format(new Date(ip.date), "MMM dd, yyyy")}</td>
                      <td className="text-right">₹{ip.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Secondary Market Calculator - Only show if bond is not fully funded or closed */}
          {isCalculatorDisabled ? (
            <div className="lg:col-span-3 metric-card rounded-md bg-amber-50 border-amber-200">
              <div className="flex items-center gap-3 text-amber-700">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  {isClosed ? (
                    <>
                      <h2 className="text-xl font-semibold">Bond Closed</h2>
                      <p className="text-sm text-amber-600">This bond has matured (end date: {format(new Date(bondData.end_date), "MMM dd, yyyy")}). No more investments can be made.</p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold">Bond Fully Funded</h2>
                      <p className="text-sm text-amber-600">All {totalUnits} units have been sold. No more investments can be made.</p>
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
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border border-blue-200">
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
                  <Label htmlFor="calc_units" className="text-xs text-blue-700">Units (optional)</Label>
                  <Input
                    data-testid="calc-units-input"
                    id="calc_units"
                    type="number"
                    min="1"
                    max={unitsAvailable}
                    placeholder="Enter units"
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
                <p className="text-sm font-medium mb-3 text-blue-800">For approximate amount of ₹{parseFloat(approximateAmount).toLocaleString('en-IN')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div 
                    className={`p-3 rounded-md transition-all cursor-pointer ${
                      selectedBound === 'lower' 
                        ? 'border-2 border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                        : 'border border-gray-200 hover:border-blue-400'
                    }`}
                    onClick={() => {
                      const lowerUnits = Math.floor(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit);
                      if (lowerUnits >= 1 && lowerUnits <= enhancedCalculation.units_available) {
                        setSelectedBound('lower');
                        calculateEnhancedPrice(lowerUnits);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Lower Bound</span>
                      {selectedBound === 'lower' && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded">✓ Selected</span>
                      )}
                    </div>
                    <p className="text-lg font-mono font-bold" data-testid="lower-bound-units">
                      {Math.floor(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit)} units
                    </p>
                    <p className="text-sm text-gray-500 font-mono">
                      ₹{(Math.floor(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit) * enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div 
                    className={`p-3 rounded-md transition-all cursor-pointer ${
                      selectedBound === 'upper' 
                        ? 'border-2 border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                        : 'border border-gray-200 hover:border-blue-400'
                    }`}
                    onClick={() => {
                      const upperUnits = Math.ceil(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit);
                      if (upperUnits >= 1 && upperUnits <= enhancedCalculation.units_available) {
                        setSelectedBound('upper');
                        calculateEnhancedPrice(upperUnits);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-600">Upper Bound</span>
                      {selectedBound === 'upper' && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded">✓ Selected</span>
                      )}
                    </div>
                    <p className="text-lg font-mono font-bold" data-testid="upper-bound-units">
                      {Math.ceil(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit)} units
                    </p>
                    <p className="text-sm text-gray-500 font-mono">
                      ₹{(Math.ceil(parseFloat(approximateAmount) / enhancedCalculation.clean_price_per_unit) * enhancedCalculation.clean_price_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">Click on a bound to select and calculate exact price</p>
              </div>
            )}

            {/* Clean Price Display - Main Result */}
            {enhancedCalculation && (
              <div className="space-y-4">
                {/* Primary Price Display */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-lg shadow-lg">
                    <p className="text-xs text-emerald-100 font-semibold mb-1">PRICE PER UNIT</p>
                    <p className="text-3xl font-mono font-bold text-white" data-testid="clean-price-display">
                      ₹{enhancedCalculation.clean_price_per_unit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-emerald-200 mt-2">Based on {enhancedCalculation.secondary_irr}% IRR • Face Value: ₹{enhancedCalculation.face_value_per_unit.toLocaleString('en-IN')}</p>
                  </div>
                  
                  <div className={`p-4 rounded-lg ${
                    enhancedCalculation.premium_discount_per_unit >= 0 
                      ? 'bg-orange-50 border border-orange-200' 
                      : 'bg-green-50 border border-green-200'
                  }`}>
                    <p className="text-xs font-semibold mb-1 text-gray-600">
                      {enhancedCalculation.premium_discount_per_unit >= 0 ? 'PREMIUM' : 'DISCOUNT'}
                    </p>
                    <p className={`text-2xl font-mono font-bold ${
                      enhancedCalculation.premium_discount_per_unit >= 0 ? 'text-orange-600' : 'text-green-600'
                    }`}>
                      {enhancedCalculation.premium_discount_percentage >= 0 ? '+' : ''}{enhancedCalculation.premium_discount_percentage.toFixed(2)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      ₹{Math.abs(enhancedCalculation.premium_discount_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2 })} per unit
                    </p>
                  </div>
                </div>

                {/* Total for Multiple Units */}
                {enhancedCalculation.units_requested > 0 && (
                  <div className="bg-white p-4 rounded-lg border shadow-sm">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-500">Units</p>
                        <p className="text-xl font-mono font-bold">{enhancedCalculation.units_requested}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Price per Unit</p>
                        <p className="text-xl font-mono font-bold text-emerald-600">₹{enhancedCalculation.clean_price_per_unit.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2">
                        <p className="text-xs text-blue-600 font-semibold">Total Investment</p>
                        <p className="text-xl font-mono font-bold text-blue-700">₹{enhancedCalculation.total_clean_price.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Days to Maturity</p>
                        <p className="text-xl font-mono font-bold">{enhancedCalculation.days_to_maturity}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Future Cashflows Summary */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold mb-3 text-gray-700">Future Cashflows (per unit)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Interest Payments</p>
                      <p className="font-mono font-medium">{enhancedCalculation.remaining_interest_payments}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total Future Interest</p>
                      <p className="font-mono font-medium text-emerald-600">₹{enhancedCalculation.total_remaining_interest.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total Future Principal</p>
                      <p className="font-mono font-medium text-blue-600">₹{enhancedCalculation.total_remaining_principal.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Total Cashflows</p>
                      <p className="font-mono font-bold">₹{enhancedCalculation.total_future_cashflows.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded-lg border text-center">
                    <p className="text-xs text-gray-500">Settlement Date</p>
                    <p className="font-mono font-medium">{format(new Date(enhancedCalculation.settlement_date), "MMM dd, yyyy")}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border text-center">
                    <p className="text-xs text-gray-500">Coupon Rate</p>
                    <p className="font-mono font-medium">{enhancedCalculation.coupon_rate}%</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-center">
                    <p className="text-xs text-blue-600 font-semibold">Proposed IRR</p>
                    <p className="font-mono font-bold text-blue-700">{enhancedCalculation.secondary_irr}%</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border text-center">
                    <p className="text-xs text-gray-500">Units Available</p>
                    <p className="font-mono font-medium">{enhancedCalculation.units_available}</p>
                  </div>
                </div>
              </div>
            )}

            {calculation && selectedUnits && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Units Selected</p>
                    <p className="text-2xl font-mono font-bold">{calculation.units_requested}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Price per Unit</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="price-per-unit">₹{calculation.price_per_unit.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Total Investment</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="total-price">₹{calculation.total_price.toLocaleString('en-IN')}</p>
                  </div>
              </div>
            </div>

            {/* Unit bounds display with selection */}
            {approximateAmount && calculation && calculation.price_per_unit > 0 && (
              <div className="mb-4 p-4 bg-white border border-border rounded-md">
                <p className="text-sm font-medium mb-3">For approximate amount of ₹{parseFloat(approximateAmount).toLocaleString('en-IN')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div 
                    className={`p-3 rounded-md transition-all cursor-pointer ${
                      selectedBound === 'lower' 
                        ? 'border-2 border-accent bg-accent/5 ring-2 ring-accent/20' 
                        : 'border border-border hover:border-accent'
                    }`}
                    onClick={() => {
                      if (getLowerBoundUnits() >= 1 && getLowerBoundUnits() <= calculation.units_available) {
                        setSelectedBound('lower');
                        calculatePrice(getLowerBoundUnits());
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">Lower Bound</span>
                      {selectedBound === 'lower' ? (
                        <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded">✓ Selected</span>
                      ) : (
                        <Button
                          data-testid="select-lower-bound-btn"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBound('lower');
                            calculatePrice(getLowerBoundUnits());
                          }}
                          disabled={calculating || getLowerBoundUnits() < 1 || getLowerBoundUnits() > calculation.units_available}
                          className="btn-scale"
                        >
                          Select
                        </Button>
                      )}
                    </div>
                    <p className="text-lg font-mono font-bold" data-testid="lower-bound-units">
                      {getLowerBoundUnits()} unit{getLowerBoundUnits() !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-muted-foreground font-mono">
                      ₹{(getLowerBoundUnits() * calculation.price_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div 
                    className={`p-3 rounded-md transition-all cursor-pointer ${
                      selectedBound === 'upper' 
                        ? 'border-2 border-accent bg-accent/5 ring-2 ring-accent/20' 
                        : 'border border-border hover:border-accent'
                    }`}
                    onClick={() => {
                      if (getUpperBoundUnits() >= 1 && getUpperBoundUnits() <= calculation.units_available) {
                        setSelectedBound('upper');
                        calculatePrice(getUpperBoundUnits());
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">Upper Bound</span>
                      {selectedBound === 'upper' ? (
                        <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded">✓ Selected</span>
                      ) : (
                        <Button
                          data-testid="select-upper-bound-btn"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBound('upper');
                            calculatePrice(getUpperBoundUnits());
                          }}
                          disabled={calculating || getUpperBoundUnits() < 1 || getUpperBoundUnits() > calculation.units_available}
                          className="btn-scale"
                        >
                          Select
                        </Button>
                      )}
                    </div>
                    <p className="text-lg font-mono font-bold" data-testid="upper-bound-units">
                      {getUpperBoundUnits()} unit{getUpperBoundUnits() !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-muted-foreground font-mono">
                      ₹{(getUpperBoundUnits() * calculation.price_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  {selectedBound ? `${selectedBound === 'lower' ? 'Lower' : 'Upper'} bound selected` : 'Click on a bound or press Select to calculate exact price and cashflow'}
                </p>
              </div>
            )}

            {calculation && selectedUnits && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Units Selected</p>
                    <p className="text-2xl font-mono font-bold">{calculation.units_requested}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Price per Unit</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="price-per-unit">₹{calculation.price_per_unit.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Total Investment</p>
                    <p className="text-2xl font-mono font-bold text-accent" data-testid="total-price">₹{calculation.total_price.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Days to Maturity</p>
                    <p className="text-2xl font-mono font-bold">{calculation.days_to_maturity}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Remaining Principal</p>
                    <p className="text-lg font-mono font-medium">₹{(calculation.remaining_principal * calculation.units_requested).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Remaining Interest</p>
                    <p className="text-lg font-mono font-medium">₹{(calculation.remaining_interest * calculation.units_requested).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">TDS @ {calculation.tds_rate}%</p>
                    <p className="text-lg font-mono font-medium text-destructive">₹{(calculation.remaining_interest * calculation.units_requested * calculation.tds_rate / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="metric-card rounded-md bg-white">
                    <p className="text-xs text-muted-foreground mb-1">Net Receivable</p>
                    <p className="text-lg font-mono font-medium text-success">
                      ₹{((calculation.remaining_principal * calculation.units_requested) + (calculation.remaining_interest * calculation.units_requested * (1 - calculation.tds_rate / 100))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-white border border-border rounded-md">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-success" />
                    Investment Summary
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p>Total investment: <span className="font-mono font-medium text-accent">₹{calculation.total_price.toLocaleString('en-IN')}</span> for <span className="font-mono font-medium">{calculation.units_requested}</span> unit(s) on {format(new Date(calculation.investment_date), "MMM dd, yyyy")}</p>
                    <p>Gross future inflows: <span className="font-mono font-medium">₹{(calculation.total_inflows * calculation.units_requested).toLocaleString('en-IN')}</span></p>
                    <p>Less: TDS deduction: <span className="font-mono font-medium text-destructive">₹{(calculation.remaining_interest * calculation.units_requested * calculation.tds_rate / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> (10% on interest)</p>
                    <p>Net amount in hand: <span className="font-mono font-medium text-success">₹{((calculation.remaining_principal * calculation.units_requested) + (calculation.remaining_interest * calculation.units_requested * (1 - calculation.tds_rate / 100))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                    <p className="pt-2 border-t border-border mt-2">Gross IRR: <span className="font-mono font-medium text-accent">{calculation.secondary_buyer_irr}%</span> (before TDS)</p>
                  </div>
                  <div className="mt-4">
                    <Button
                      data-testid="download-cashflow-btn"
                      onClick={downloadCashflow}
                      disabled={downloading}
                      className="btn-scale bg-primary text-primary-foreground"
                    >
                      {downloading ? "Downloading..." : "Download Monthly Cashflow (CSV)"}
                    </Button>
                  </div>
                </div>

                {/* Book Units Section */}
                <div className="mt-6 p-4 md:p-6 bg-amber-50 border border-amber-200 rounded-md">
                  <h3 className="font-semibold mb-4 flex items-center gap-2 text-base md:text-lg">
                    <ShoppingCart className="h-5 w-5 text-amber-600" />
                    {user?.role === 'client' ? 'Book Units' : 'Book Units for Client'}
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Client Selection - Only for broker/sub-broker */}
                    {user?.role !== 'client' && (
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
                    )}

                    {/* Payment Reference */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Payment Reference / UTR</Label>
                      <Input
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Transaction ID / UTR Number"
                        data-testid="payment-reference-input"
                      />
                    </div>

                    {/* Payment Proof Upload */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Payment Proof (Screenshot)</Label>
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
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-amber-300 rounded-lg cursor-pointer hover:border-amber-500 hover:bg-amber-100/50 transition-colors"
                        >
                          {paymentProof ? (
                            <>
                              <FileCheck className="h-5 w-5 text-green-600" />
                              <span className="text-sm text-green-700 truncate max-w-[200px]">{paymentProof.name}</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-5 w-5 text-amber-500" />
                              <span className="text-sm text-amber-700">Upload payment screenshot</span>
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

                    {/* Payment Notes */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Payment Notes</Label>
                      <Textarea
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        placeholder="Any additional notes about the payment..."
                        rows={2}
                        data-testid="payment-notes-input"
                      />
                    </div>

                    {/* Order Summary */}
                    <div className="bg-white p-3 md:p-4 rounded-md border border-amber-200">
                      <p className="text-xs text-gray-500 uppercase mb-2 font-medium">Order Summary</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Units</p>
                          <p className="font-mono font-bold text-lg">{selectedUnits}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Price/Unit</p>
                          <p className="font-mono font-bold text-sm md:text-base">₹{calculation.price_per_unit.toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Total Amount</p>
                          <p className="font-mono font-bold text-amber-600 text-lg">₹{calculation.total_price.toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Status</p>
                          <p className={`font-medium text-sm ${user?.role === 'broker' ? 'text-green-600' : 'text-amber-600'}`}>
                            {user?.role === 'broker' ? 'Auto-Approved' : 'Pending Approval'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <Button
                      onClick={bookUnits}
                      disabled={bookingUnits || (user?.role !== 'client' && (!selectedClient || clients.length === 0))}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3"
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
    </div>
  );
}