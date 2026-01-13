import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  Building2, MapPin, ArrowLeft, Calendar, Users, Check, 
  DollarSign, Ruler, Car, CheckCircle2, Clock, Plus, Upload, FileText, X, CreditCard, TrendingUp,
  Calculator, Heart, UserPlus, Info, Download, Send, Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function RealEstateDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [opportunity, setOpportunity] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showPaymentManagement, setShowPaymentManagement] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [showParticipateModal, setShowParticipateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPaymentRecordModal, setShowPaymentRecordModal] = useState(false);
  const [selectedPaymentMilestone, setSelectedPaymentMilestone] = useState(null);
  const [showOqoodUpload, setShowOqoodUpload] = useState(false);
  
  // XIRR Calculator state
  const [xirrSaleStage, setXirrSaleStage] = useState(100); // % of payment completed when sold
  const [xirrSaleDate, setXirrSaleDate] = useState("");
  const [xirrSaleRate, setXirrSaleRate] = useState(""); // per sqft

  // Update xirrSaleStage to eligible percentage when opportunity loads
  useEffect(() => {
    if (opportunity?.eligible_to_sell_after_percentage) {
      setXirrSaleStage(opportunity.eligible_to_sell_after_percentage);
    }
  }, [opportunity]);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const [oppRes, clientsRes] = await Promise.all([
        axios.get(`${API}/real-estate-opportunities/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/clients`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setOpportunity(oppRes.data);
      setClients(clientsRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load property details");
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    // Fetch data after setting user
    const initializeData = async () => {
      await fetchData();
    };
    initializeData();
  }, [id, navigate, fetchData]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // XIRR Calculation Function - CORRECTED VERSION
  // DLD + Admin are upfront costs paid with first payment
  // Outstanding amount (unpaid portion) is deducted from sale proceeds
  const calculateXIRRWithParams = (opp, saleStagePercent, saleDateStr, saleRatePerSqft, returnDetails = false) => {
    if (!opp || !opp.unit_price || !opp.payment_schedule || opp.payment_schedule.length === 0) {
      return returnDetails ? { xirr: null, cashFlows: [] } : null;
    }
    if (!saleRatePerSqft || !opp.total_area || !saleDateStr) {
      return returnDetails ? { xirr: null, cashFlows: [] } : null;
    }
    
    const sortedSchedule = [...opp.payment_schedule]
      .filter(p => p.date && p.percentage)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sortedSchedule.length === 0) {
      return returnDetails ? { xirr: null, cashFlows: [] } : null;
    }

    const cashFlows = [];
    const unitPrice = opp.unit_price;
    const dldFee = opp.dld_fee || 0;
    const adminFee = opp.admin_fee || 0;
    const upfrontFees = dldFee + adminFee;
    
    // Track total paid towards unit price
    let totalPaidTowardsUnit = 0;
    let cumulativePercent = 0;
    let isFirstPayment = true;
    
    sortedSchedule.forEach(milestone => {
      const pct = parseFloat(milestone.percentage) || 0;
      const prevCumulative = cumulativePercent;
      cumulativePercent += pct;
      
      // Only include payments up to the sale stage
      if (prevCumulative < saleStagePercent) {
        let effectivePct = pct;
        // If this milestone crosses the sale stage, only count partial
        if (cumulativePercent > saleStagePercent) {
          effectivePct = saleStagePercent - prevCumulative;
        }
        
        const paymentAmount = unitPrice * effectivePct / 100;
        totalPaidTowardsUnit += paymentAmount;
        
        // First payment includes DLD + Admin fees (upfront costs)
        const totalOutflow = isFirstPayment ? paymentAmount + upfrontFees : paymentAmount;
        
        cashFlows.push({ 
          date: new Date(milestone.date), 
          amount: -totalOutflow,
          description: isFirstPayment ? `${milestone.description || 'Booking'} + DLD + Admin` : (milestone.description || `Payment`),
          percentage: effectivePct,
          isOutflow: true
        });
        isFirstPayment = false;
      }
    });

    if (cashFlows.length === 0) {
      return returnDetails ? { xirr: null, cashFlows: [] } : null;
    }

    // Calculate sale proceeds
    const grossSaleValue = parseFloat(saleRatePerSqft) * opp.total_area;
    const sellingFee = grossSaleValue * (opp.unit_selling_fee_percentage || 0) / 100;
    
    // Outstanding amount = Unit price not yet paid (remaining %)
    const outstandingAmount = unitPrice * (100 - saleStagePercent) / 100;
    
    // Net proceeds = Gross Sale - Selling Fee - Outstanding Amount to Developer
    const netSaleProceeds = grossSaleValue - sellingFee - outstandingAmount;
    
    cashFlows.push({ 
      date: new Date(saleDateStr), 
      amount: netSaleProceeds,
      description: 'Sale Proceeds (Net)',
      grossSale: grossSaleValue,
      sellingFee: sellingFee,
      outstandingDeducted: outstandingAmount,
      isOutflow: false
    });

    // Calculate XIRR using Newton-Raphson
    let xirr = null;
    try {
      const tol = 0.0001, maxIter = 100;
      let rate = 0.1;
      const firstDate = cashFlows[0].date;
      
      for (let i = 0; i < maxIter; i++) {
        let npvVal = 0, dnpvVal = 0;
        cashFlows.forEach(cf => {
          const years = (cf.date - firstDate) / (365 * 24 * 60 * 60 * 1000);
          npvVal += cf.amount / Math.pow(1 + rate, years);
          dnpvVal -= years * cf.amount / Math.pow(1 + rate, years + 1);
        });
        if (Math.abs(dnpvVal) < 1e-10) break;
        const newRate = rate - npvVal / dnpvVal;
        if (Math.abs(newRate - rate) < tol) {
          xirr = newRate * 100;
          break;
        }
        rate = newRate;
      }
      if (xirr === null) xirr = rate * 100;
    } catch (e) { 
      xirr = null;
    }

    if (returnDetails) {
      return {
        xirr,
        cashFlows,
        summary: {
          totalInvested: totalPaidTowardsUnit + upfrontFees,
          unitPricePaid: totalPaidTowardsUnit,
          upfrontFees,
          grossSaleValue,
          sellingFee,
          outstandingAmount,
          netSaleProceeds
        }
      };
    }
    return xirr;
  };

  // Export XIRR calculation to Excel/CSV - Clean format with AED currency
  const exportXIRRToExcel = (opp, saleStagePercent, saleDateStr, saleRatePerSqft) => {
    const result = calculateXIRRWithParams(opp, saleStagePercent, saleDateStr, saleRatePerSqft, true);
    if (!result || !result.cashFlows.length) {
      toast.error("Cannot export - please enter sale date and price first");
      return;
    }

    const { cashFlows, summary, xirr } = result;
    
    // Helper to format currency without commas (for clean CSV)
    const fmtAED = (amt) => `AED ${Math.round(amt || 0)}`;
    
    // Build clean CSV content with proper columns
    let csv = [];
    
    // Header
    csv.push(["XIRR CALCULATION BREAKDOWN"]);
    csv.push([]);
    csv.push(["Property", `${opp.building_name} - Unit ${opp.unit_no}`]);
    csv.push(["Sale Stage", `${saleStagePercent}%`]);
    csv.push(["Expected Sale Date", saleDateStr]);
    csv.push(["Sale Rate", `AED ${saleRatePerSqft}/sqft`]);
    csv.push([]);
    
    // Investment Summary
    csv.push(["INVESTMENT SUMMARY"]);
    csv.push(["Description", "Amount"]);
    csv.push(["Unit Price (Total)", fmtAED(opp.unit_price)]);
    csv.push([`Unit Price Paid (${saleStagePercent}%)`, fmtAED(summary.unitPricePaid)]);
    csv.push(["DLD Fee", fmtAED(opp.dld_fee)]);
    csv.push(["Admin Fee", fmtAED(opp.admin_fee)]);
    csv.push(["Total Invested", fmtAED(summary.totalInvested)]);
    csv.push([]);
    
    // Sale Calculation
    csv.push(["SALE CALCULATION"]);
    csv.push(["Description", "Amount"]);
    csv.push([`Gross Sale Value (${opp.total_area} sqft × AED ${saleRatePerSqft})`, fmtAED(summary.grossSaleValue)]);
    csv.push([`Less: Selling Fee (${opp.unit_selling_fee_percentage || 0}%)`, fmtAED(-summary.sellingFee)]);
    csv.push([`Less: Outstanding (${100 - saleStagePercent}% of Unit Price)`, fmtAED(-summary.outstandingAmount)]);
    csv.push(["Net Sale Proceeds", fmtAED(summary.netSaleProceeds)]);
    csv.push([]);
    
    // Cash Flows
    csv.push(["CASH FLOWS FOR XIRR"]);
    csv.push(["Date", "Description", "Amount", "Type"]);
    cashFlows.forEach(cf => {
      const dateStr = cf.date.toISOString().split('T')[0];
      csv.push([dateStr, cf.description, fmtAED(cf.amount), cf.isOutflow ? 'Outflow' : 'Inflow']);
    });
    csv.push([]);
    
    // Result
    csv.push(["RESULT"]);
    csv.push(["Expected XIRR", xirr !== null ? `${xirr.toFixed(2)}%` : 'N/A']);
    csv.push(["Net Profit", fmtAED(summary.netSaleProceeds - summary.totalInvested)]);
    
    // Convert to CSV string with proper escaping
    const csvContent = csv.map(row => 
      row.map(cell => {
        const cellStr = String(cell || '');
        // Escape quotes and wrap in quotes if contains comma
        if (cellStr.includes(',') || cellStr.includes('"')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `XIRR_${opp.building_name.replace(/\s+/g, '_')}_Unit${opp.unit_no}_${saleStagePercent}pct.csv`;
    link.click();
    toast.success("XIRR calculation exported!");
  };

  // Simple XIRR for default display
  const calculateXIRR = (opp) => {
    if (!opp || !opp.unit_price || !opp.payment_schedule || opp.payment_schedule.length === 0) return null;
    if (!opp.expected_sale_rate || !opp.total_area || !opp.estimated_sell_date) return null;
    return calculateXIRRWithParams(opp, 100, opp.estimated_sell_date, opp.expected_sale_rate);
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar user={user} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 mb-4">Property not found</p>
            <Button onClick={() => navigate("/broker/opportunities")}>Back to Opportunities</Button>
          </div>
        </div>
      </div>
    );
  }

  const opp = opportunity;
  const availableClients = clients.filter(c => !opp.investors?.some(inv => inv.client_id === c.id));
  const remainingPercentage = opp.remaining_percentage ?? (100 - (opp.invested_percentage || 0));
  const remainingAmount = opp.total_cost * remainingPercentage / 100;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/broker/opportunities")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Opportunities
          </Button>
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-teal-100 rounded-xl flex items-center justify-center">
                <Building2 className="h-7 w-7 text-teal-600" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-800">{opp.building_name}</h1>
                  {opp.property_type === 'off_plan' ? (
                    <Badge className="bg-purple-100 text-purple-700">Off-Plan</Badge>
                  ) : (
                    <Badge className="bg-teal-100 text-teal-700">Fractional</Badge>
                  )}
                  {opp.status === 'available' && <Badge className="bg-green-100 text-green-700">Available</Badge>}
                  {opp.status === 'fully_invested' && <Badge className="bg-blue-100 text-blue-700">Fully Invested</Badge>}
                </div>
                <p className="text-gray-500 mt-1">
                  Unit {opp.unit_no} • {opp.unit_type} • Floor {opp.floor}
                  {opp.location && <span className="ml-2">• <MapPin className="h-4 w-4 inline" /> {opp.location}</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {opp.payment_schedule && opp.payment_schedule.length > 0 && (
                <Button variant="outline" onClick={() => setShowPaymentManagement(true)}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Manage Payments
                </Button>
              )}
              {opp.status === 'available' && remainingPercentage > 0 && (
                <Button onClick={() => setShowAllocateModal(true)} className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Investor
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Property Overview Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-teal-600" />
              Property Information
            </h2>
            <div className="grid grid-cols-4 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Building</p>
                <p className="font-semibold text-gray-800">{opp.building_name}</p>
                {opp.developer_name && <p className="text-sm text-gray-500">by {opp.developer_name}</p>}
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Unit Details</p>
                <p className="font-semibold text-gray-800">Unit {opp.unit_no}</p>
                <p className="text-sm text-gray-500">Floor {opp.floor} • {opp.unit_type}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Size</p>
                <p className="font-semibold text-gray-800">{opp.total_area} sqft</p>
                <p className="text-sm text-gray-500">Carpet: {opp.carpet_area} sqft</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Location</p>
                <p className="font-semibold text-gray-800 flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {opp.location || 'Not specified'}
                </p>
                {opp.handover_date && <p className="text-sm text-gray-500">Handover: {formatDate(opp.handover_date)}</p>}
              </div>
            </div>
            
            {/* Additional Details */}
            <div className="grid grid-cols-4 gap-6 mt-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-blue-600 mb-1">Balcony</p>
                <p className="font-semibold text-blue-800">{opp.balcony_area || 0} sqft</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-xs text-amber-600 mb-1">Parking</p>
                <p className="font-semibold text-amber-800 flex items-center gap-1">
                  <Car className="h-4 w-4" /> {opp.parking_spaces || 0} spaces
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-xs text-purple-600 mb-1">Max Co-owners</p>
                <p className="font-semibold text-purple-800">{opp.max_investors || 4}</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-4">
                <p className="text-xs text-teal-600 mb-1">Status</p>
                <p className="font-semibold text-teal-800">{opp.status === 'available' ? 'Available' : opp.status === 'fully_invested' ? 'Fully Invested' : 'Closed'}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-teal-600" />
              Financial Summary
            </h2>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="bg-orange-50 rounded-lg p-5 border border-orange-200">
                <p className="text-sm text-orange-600 mb-1">Unit Price</p>
                <p className="text-3xl font-bold text-orange-800">AED {formatCurrency(opp.unit_price)}</p>
              </div>
              <div className="bg-teal-50 rounded-lg p-5 border border-teal-200">
                <p className="text-sm text-teal-600 mb-1">Total Cost (incl. all fees)</p>
                <p className="text-3xl font-bold text-teal-800">AED {formatCurrency(opp.total_cost)}</p>
              </div>
            </div>
            
            {/* Fee Breakdown */}
            <h3 className="text-sm font-medium text-gray-700 mb-3">Fee Breakdown</h3>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                <p className="text-orange-600 font-medium">DLD Fee</p>
                <p className="text-lg font-bold text-orange-800">AED {formatCurrency(opp.dld_fee)}</p>
                <p className="text-xs text-orange-500">({opp.dld_fee_percentage}%)</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                <p className="text-green-600 font-medium">Admin Fee</p>
                <p className="text-lg font-bold text-green-800">AED {formatCurrency(opp.admin_fee)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                <p className="text-amber-600 font-medium">Brokerage</p>
                <p className="text-lg font-bold text-amber-800">AED {formatCurrency(opp.broker_fee)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-gray-600 font-medium">Other Fees</p>
                <p className="text-lg font-bold text-gray-800">AED {formatCurrency(opp.other_fees)}</p>
              </div>
            </div>
          </div>

          {/* Payment Schedule */}
          {opp.payment_schedule && opp.payment_schedule.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-teal-600" />
                Payment Schedule
              </h2>

              {/* Payment milestones table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">#</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Date</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Description</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">%</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Amount (AED)</th>
                      <th className="text-center py-2 px-3 text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...opp.payment_schedule].sort((a, b) => new Date(a.date) - new Date(b.date)).map((payment, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-3 px-3 font-medium">{idx + 1}</td>
                        <td className="py-3 px-3">{formatDate(payment.date)}</td>
                        <td className="py-3 px-3">{payment.description || `Payment ${idx + 1}`}</td>
                        <td className="py-3 px-3 text-right font-medium">{payment.percentage}%</td>
                        <td className="py-3 px-3 text-right font-mono">{formatCurrency(opp.unit_price * payment.percentage / 100)}</td>
                        <td className="py-3 px-3 text-center">
                          {payment.completed ? (
                            <Badge className="bg-green-100 text-green-700"><Check className="h-3 w-3 mr-1" />Paid</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600">Pending</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* XIRR Calculator */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              XIRR Calculator
              <span className="text-xs font-normal text-gray-500 ml-2">Estimate returns at different sale scenarios</span>
            </h2>
            
            {opp.payment_schedule && opp.payment_schedule.length > 0 ? (
              <div className="grid grid-cols-2 gap-6">
                {/* Calculator Inputs */}
                <div className="space-y-5">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">
                      Sale Stage (% of payments completed)
                      <span className="text-xs text-orange-600 ml-2">Min: {opp.eligible_to_sell_after_percentage || 100}% (Eligible)</span>
                    </Label>
                    <div className="mt-2">
                      <Slider
                        value={[xirrSaleStage]}
                        onValueChange={(v) => setXirrSaleStage(v[0])}
                        max={100}
                        min={opp.eligible_to_sell_after_percentage || 100}
                        step={10}
                        className="mb-2"
                      />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{opp.eligible_to_sell_after_percentage || 100}%</span>
                        <span className="font-bold text-blue-600">{xirrSaleStage}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      If sold after {xirrSaleStage}% payment: AED {formatCurrency(opp.unit_price * xirrSaleStage / 100)} paid
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="xirr-sale-date" className="text-sm font-medium text-gray-700">Expected Sale Date</Label>
                    <Input
                      id="xirr-sale-date"
                      type="date"
                      value={xirrSaleDate}
                      onChange={(e) => setXirrSaleDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="xirr-sale-rate" className="text-sm font-medium text-gray-700">Sale Price (AED/sqft)</Label>
                    <Input
                      id="xirr-sale-rate"
                      type="number"
                      placeholder={`e.g., ${Math.round(((opp.unit_price + (opp.dld_fee || 0) + (opp.admin_fee || 0)) / opp.total_area) * 1.2)}`}
                      value={xirrSaleRate}
                      onChange={(e) => setXirrSaleRate(e.target.value)}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Current rate (incl. DLD+Admin): AED {formatCurrency(Math.round((opp.unit_price + (opp.dld_fee || 0) + (opp.admin_fee || 0)) / opp.total_area))}/sqft
                    </p>
                  </div>
                </div>

                {/* Results */}
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Projected Returns</h3>
                  
                  {xirrSaleDate && xirrSaleRate ? (
                    <>
                      {(() => {
                        const result = calculateXIRRWithParams(opp, xirrSaleStage, xirrSaleDate, parseFloat(xirrSaleRate), true);
                        const summary = result?.summary;
                        const xirr = result?.xirr;
                        
                        if (!summary) return <p className="text-gray-500">Unable to calculate</p>;
                        
                        return (
                          <>
                            {/* Investment Summary */}
                            <div className="space-y-2 text-sm">
                              <p className="font-medium text-gray-700 border-b pb-1">Investment (Outflows)</p>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Unit Price Paid ({xirrSaleStage}%)</span>
                                <span className="text-red-600">-AED {formatCurrency(summary.unitPricePaid)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">DLD + Admin (Upfront)</span>
                                <span className="text-red-600">-AED {formatCurrency(summary.upfrontFees)}</span>
                              </div>
                              <div className="flex justify-between font-medium border-t pt-1">
                                <span>Total Invested</span>
                                <span className="text-red-700">-AED {formatCurrency(summary.totalInvested)}</span>
                              </div>
                            </div>
                            
                            {/* Sale Calculation */}
                            <div className="space-y-2 text-sm mt-4">
                              <p className="font-medium text-gray-700 border-b pb-1">Sale Proceeds (Inflow)</p>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Gross Sale ({opp.total_area} sqft)</span>
                                <span>AED {formatCurrency(summary.grossSaleValue)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Less: Selling Fee ({opp.unit_selling_fee_percentage || 0}%)</span>
                                <span className="text-red-500">-AED {formatCurrency(summary.sellingFee)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">Less: Outstanding ({100 - xirrSaleStage}%)</span>
                                <span className="text-red-500">-AED {formatCurrency(summary.outstandingAmount)}</span>
                              </div>
                              <div className="flex justify-between font-medium border-t pt-1">
                                <span>Net Proceeds</span>
                                <span className="text-green-700">+AED {formatCurrency(summary.netSaleProceeds)}</span>
                              </div>
                            </div>
                            
                            {/* Net Profit */}
                            <div className={`mt-3 p-3 rounded-lg ${summary.netSaleProceeds - summary.totalInvested >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                              <div className="flex justify-between items-center">
                                <span className="font-medium">Net Profit</span>
                                <span className={`font-bold text-lg ${summary.netSaleProceeds - summary.totalInvested >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                  AED {formatCurrency(summary.netSaleProceeds - summary.totalInvested)}
                                </span>
                              </div>
                            </div>
                            
                            {/* XIRR Result */}
                            {xirr !== null ? (
                              <>
                                <div className={`mt-3 p-4 rounded-lg ${xirr >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
                                  <p className={`text-sm ${xirr >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Expected XIRR</p>
                                  <p className={`text-4xl font-bold ${xirr >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{xirr.toFixed(2)}%</p>
                                  <p className="text-xs text-gray-600 mt-1">Annualized return</p>
                                </div>
                                <Button 
                                  onClick={() => exportXIRRToExcel(opp, xirrSaleStage, xirrSaleDate, parseFloat(xirrSaleRate))}
                                  className="w-full mt-3 bg-green-600 hover:bg-green-700"
                                  size="sm"
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download Excel Breakdown
                                </Button>
                              </>
                            ) : (
                              <div className="mt-3 p-3 rounded-lg bg-yellow-50">
                                <p className="text-sm text-yellow-700">Unable to calculate XIRR. Check dates.</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Calculator className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">Enter sale date and price to calculate XIRR</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Info className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Payment schedule required for XIRR calculation</p>
              </div>
            )}
          </div>

          {/* Interest & Participation Section - Only for Clients */}
          {user?.role === 'client' && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Interested in this Property?</h2>
              <p className="text-gray-600 mb-6">Express your interest or confirm your participation as one of the 4 co-owners.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-auto py-4 border-purple-300 hover:bg-purple-100"
                  onClick={() => setShowInterestModal(true)}
                >
                  <div className="flex items-center gap-3">
                    <Heart className="h-6 w-6 text-purple-600" />
                    <div className="text-left">
                      <p className="font-semibold text-purple-700">Interested to Know More</p>
                      <p className="text-xs text-gray-500 font-normal">Get more details about this opportunity</p>
                    </div>
                  </div>
                </Button>
                
                <Button 
                  size="lg" 
                  className="h-auto py-4 bg-purple-600 hover:bg-purple-700"
                  onClick={() => setShowParticipateModal(true)}
                  disabled={remainingPercentage <= 0 || (opp.current_investors || 0) >= 4}
                >
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-6 w-6" />
                    <div className="text-left">
                      <p className="font-semibold">Confirm to Participate</p>
                      <p className="text-xs opacity-80 font-normal">{remainingPercentage.toFixed(1)}% available • {4 - (opp.current_investors || 0)} spots left</p>
                    </div>
                  </div>
                </Button>
              </div>
            </div>
          )}

          {/* Share with Clients Section - Only for Broker/Sub-broker */}
          {(user?.role === 'broker' || user?.role === 'sub_broker') && (
            <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-xl border border-teal-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <Send className="h-5 w-5 text-teal-600" />
                Share with Clients
              </h2>
              <p className="text-gray-600 mb-4">Send this opportunity to your clients. You'll receive a notification when they show interest.</p>
              
              <Button 
                size="lg" 
                className="bg-teal-600 hover:bg-teal-700"
                onClick={() => setShowShareModal(true)}
              >
                <Send className="h-5 w-5 mr-2" />
                Select Clients & Share
              </Button>
              
              {/* Show recent interests */}
              {opp.interests && opp.interests.length > 0 && (
                <div className="mt-4 pt-4 border-t border-teal-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-500" />
                    Recent Client Interests ({opp.interests.length})
                  </h3>
                  <div className="space-y-2">
                    {opp.interests.slice(0, 3).map((interest, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg border">
                        <div>
                          <p className="font-medium text-gray-800">{interest.user_name}</p>
                          <p className="text-xs text-gray-500">{formatDate(interest.expressed_at)}</p>
                        </div>
                        {interest.message && (
                          <p className="text-sm text-gray-600 italic max-w-xs truncate">"{interest.message}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current Investors */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-600" />
                Current Investors ({opp.current_investors || 0}/4)
              </h2>
              {opp.status === 'available' && remainingPercentage > 0 && (opp.current_investors || 0) < 4 && (
                <Button size="sm" variant="outline" onClick={() => setShowAllocateModal(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Investor
                </Button>
              )}
            </div>

            {/* Investment Progress */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Investment Allocation</span>
                <span className="font-medium">{(100 - remainingPercentage).toFixed(1)}% allocated</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${100 - remainingPercentage}%` }} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Invested: AED {formatCurrency(opp.total_invested || 0)}</span>
                <span className="text-purple-600 font-medium">Remaining: {remainingPercentage.toFixed(1)}%</span>
              </div>
            </div>
            
            {opp.investors && opp.investors.length > 0 ? (
              <div className="space-y-3">
                {opp.investors.map((investor, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{investor.client_name}</p>
                        <p className="text-sm text-gray-500">Invested on {formatDate(investor.invested_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-purple-600 text-lg">{investor.share_percentage}%</p>
                      <p className="text-sm text-gray-500">AED {formatCurrency(investor.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No investors yet. Be the first to participate!</p>
              </div>
            )}
          </div>

          {/* Payment Management Section - Only when all 4 investors are finalized */}
          {(user?.role === 'broker' || user?.role === 'sub_broker') && (opp.current_investors || 0) >= 4 && opp.payment_schedule && opp.payment_schedule.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-green-600" />
                  Payment Management
                </h2>
                <Badge className="bg-green-100 text-green-700">All 4 Investors Finalized</Badge>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Record payments for all investors against each milestone. All 4 investors must pay for each milestone.
              </p>
              
              {/* Payment Milestones */}
              <div className="space-y-4">
                {[...opp.payment_schedule].sort((a, b) => new Date(a.date) - new Date(b.date)).map((milestone, idx) => {
                  const milestonePayments = opp.investor_payments?.filter(p => p.milestone_index === idx) || [];
                  const paidCount = milestonePayments.length;
                  const allPaid = paidCount >= 4;
                  
                  return (
                    <div key={idx} className={`border rounded-lg p-4 ${allPaid ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm ${
                            allPaid ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {allPaid ? <Check className="h-4 w-4" /> : idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{milestone.description || `Payment ${idx + 1}`}</p>
                            <p className="text-sm text-gray-500">{formatDate(milestone.date)} • {milestone.percentage}%</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">AED {formatCurrency(opp.unit_price * milestone.percentage / 100)}</p>
                          <p className="text-sm text-gray-500">{paidCount}/4 investors paid</p>
                        </div>
                      </div>
                      
                      {/* Investor Payment Status */}
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {opp.investors?.map((investor, invIdx) => {
                          const payment = milestonePayments.find(p => p.investor_id === investor.client_id || p.investor_index === invIdx);
                          return (
                            <div key={invIdx} className={`p-2 rounded text-xs ${payment ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              <p className="font-medium truncate">{investor.client_name?.split(' ')[0] || `Inv ${invIdx + 1}`}</p>
                              <p>{payment ? '✓ Paid' : 'Pending'}</p>
                            </div>
                          );
                        })}
                      </div>
                      
                      {!allPaid && (
                        <Button 
                          size="sm" 
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            setSelectedPaymentMilestone({ ...milestone, index: idx });
                            setShowPaymentRecordModal(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Record Payment
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Waiting for Investors Message */}
          {(user?.role === 'broker' || user?.role === 'sub_broker') && (opp.current_investors || 0) < 4 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-amber-500" />
                <div>
                  <h3 className="font-semibold text-amber-800">Payment Management Locked</h3>
                  <p className="text-sm text-amber-700">
                    Payment recording will be available once all 4 investors are finalized. 
                    Currently {opp.current_investors || 0}/4 investors confirmed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Oqood Upload Section */}
          {(user?.role === 'broker' || user?.role === 'sub_broker') && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Oqood Document
                </h2>
                {opp.oqood_document ? (
                  <Badge className="bg-green-100 text-green-700">Uploaded</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-600">Not Uploaded</Badge>
                )}
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Upload the Oqood (property registration) document for client reference.
              </p>
              
              {opp.oqood_document ? (
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-3">
                    <FileText className="h-10 w-10 text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-800">{opp.oqood_document.filename || 'Oqood Document'}</p>
                      <p className="text-sm text-blue-600">Uploaded on {formatDate(opp.oqood_document.uploaded_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => window.open(opp.oqood_document.url, '_blank')}>
                      View
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowOqoodUpload(true)}>
                      Replace
                    </Button>
                  </div>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full border-dashed border-2 h-20"
                  onClick={() => setShowOqoodUpload(true)}
                >
                  <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-gray-400" />
                    <span className="text-gray-600">Upload Oqood Document</span>
                  </div>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Allocate Investor Modal */}
      {showAllocateModal && (
        <AllocateInvestorModal
          opportunity={opp}
          clients={availableClients}
          remainingPercentage={remainingPercentage}
          onClose={() => setShowAllocateModal(false)}
          onSuccess={() => {
            setShowAllocateModal(false);
            fetchData();
          }}
        />
      )}

      {/* Payment Management Modal */}
      {showPaymentManagement && (
        <PaymentManagementModal
          opportunity={opp}
          onClose={() => setShowPaymentManagement(false)}
          onSuccess={() => {
            setShowPaymentManagement(false);
            fetchData();
          }}
        />
      )}

      {/* Interest Modal */}
      {showInterestModal && (
        <InterestModal
          opportunity={opp}
          onClose={() => setShowInterestModal(false)}
          onSuccess={() => {
            setShowInterestModal(false);
            fetchData();
            toast.success("Your interest has been recorded!");
          }}
        />
      )}

      {/* Participate Modal */}
      {showParticipateModal && (
        <ParticipateModal
          opportunity={opp}
          remainingPercentage={remainingPercentage}
          onClose={() => setShowParticipateModal(false)}
          onSuccess={() => {
            setShowParticipateModal(false);
            fetchData();
            toast.success("Participation confirmed!");
          }}
        />
      )}

      {/* Share with Clients Modal */}
      {showShareModal && (
        <ShareWithClientsModal
          opportunity={opp}
          clients={clients}
          onClose={() => setShowShareModal(false)}
          onSuccess={() => {
            setShowShareModal(false);
            toast.success("Opportunity shared with selected clients!");
          }}
        />
      )}

      {/* Payment Record Modal */}
      {showPaymentRecordModal && selectedPaymentMilestone && (
        <PaymentRecordModal
          opportunity={opp}
          milestone={selectedPaymentMilestone}
          onClose={() => {
            setShowPaymentRecordModal(false);
            setSelectedPaymentMilestone(null);
          }}
          onSuccess={() => {
            setShowPaymentRecordModal(false);
            setSelectedPaymentMilestone(null);
            fetchData();
            toast.success("Payment recorded successfully!");
          }}
        />
      )}

      {/* Oqood Upload Modal */}
      {showOqoodUpload && (
        <OqoodUploadModal
          opportunity={opp}
          onClose={() => setShowOqoodUpload(false)}
          onSuccess={() => {
            setShowOqoodUpload(false);
            fetchData();
            toast.success("Oqood document uploaded successfully!");
          }}
        />
      )}
    </div>
  );
}


// Allocate Investor Modal Component
function AllocateInvestorModal({ opportunity, clients, remainingPercentage, onClose, onSuccess }) {
  const [selectedClient, setSelectedClient] = useState("");
  const [units, setUnits] = useState("");
  const [percentage, setPercentage] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const isFractional = opportunity.property_type === 'fractional';
  const unitValue = opportunity.unit_value || 500;
  const totalUnits = opportunity.total_units || 0;
  const unitsAvailable = opportunity.units_available || 0;
  const maxAmount = opportunity.total_cost * remainingPercentage / 100;

  // Calculate investment details for fractional
  const investmentAmount = isFractional && units ? parseInt(units) * unitValue : parseFloat(amount) || 0;
  const sharePercentage = isFractional && totalUnits > 0 
    ? ((parseInt(units) || 0) / totalUnits) * 100 
    : parseFloat(percentage) || (opportunity.total_cost > 0 ? (investmentAmount / opportunity.total_cost) * 100 : 0);

  // Auto-calculate amount from percentage for off-plan
  const handlePercentageChange = (val) => {
    setPercentage(val);
    if (val && opportunity.total_cost) {
      setAmount((opportunity.total_cost * parseFloat(val) / 100).toFixed(0));
    }
  };

  const handleAmountChange = (val) => {
    setAmount(val);
    if (val && opportunity.total_cost) {
      setPercentage(((parseFloat(val) / opportunity.total_cost) * 100).toFixed(2));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClient) {
      toast.error("Please select a client");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      let payload = { client_id: selectedClient };
      
      if (isFractional) {
        const unitsToBuy = parseInt(units);
        if (!unitsToBuy || unitsToBuy <= 0) {
          toast.error("Please enter number of units");
          setLoading(false);
          return;
        }
        if (unitsToBuy > unitsAvailable) {
          toast.error(`Only ${unitsAvailable.toLocaleString()} units available`);
          setLoading(false);
          return;
        }
        payload.units = unitsToBuy;
      } else {
        // Off-plan: percentage or amount
        const investAmt = parseFloat(amount);
        const investPct = parseFloat(percentage);
        if (!investAmt && !investPct) {
          toast.error("Please enter percentage or amount");
          setLoading(false);
          return;
        }
        if (investPct > remainingPercentage) {
          toast.error(`Only ${remainingPercentage.toFixed(1)}% available`);
          setLoading(false);
          return;
        }
        payload.share_percentage = investPct;
        payload.investment_amount = investAmt;
      }

      await axios.post(
        `${API}/real-estate-opportunities/${opportunity.id}/invest`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Investor added successfully");
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add investor");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Add Investor</h2>
            <p className="text-sm text-gray-500">{isFractional ? 'Fractional (Unit-based)' : 'Off-Plan (Percentage-based)'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Available Info */}
          {isFractional ? (
            <div className="bg-indigo-50 p-4 rounded-lg">
              <p className="text-sm text-indigo-600">Available Units</p>
              <p className="text-2xl font-bold text-indigo-800">{formatCurrency(unitsAvailable)} units</p>
              <p className="text-sm text-indigo-600">AED {formatCurrency(unitsAvailable * unitValue)} @ {formatCurrency(unitValue)} AED/unit</p>
            </div>
          ) : (
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-orange-600">Available for Investment</p>
              <p className="text-2xl font-bold text-orange-800">{remainingPercentage.toFixed(1)}%</p>
              <p className="text-sm text-orange-600">AED {formatCurrency(maxAmount)}</p>
              <p className="text-xs text-orange-500 mt-1">Max {opportunity.max_investors || 4} investors</p>
            </div>
          )}

          <div>
            <Label>Select Client *</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.pan_number})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isFractional ? (
            /* FRACTIONAL: Units Input */
            <div>
              <Label>Number of Units *</Label>
              <Input
                type="number"
                min="1"
                max={unitsAvailable}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder={`Max: ${formatCurrency(unitsAvailable)} units`}
              />
              <p className="text-xs text-gray-500 mt-1">Each unit = {formatCurrency(unitValue)} AED</p>
            </div>
          ) : (
            /* OFF-PLAN: Percentage/Amount Input */
            <div className="space-y-3">
              <div>
                <Label>Investment Percentage *</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    max={remainingPercentage}
                    value={percentage}
                    onChange={(e) => handlePercentageChange(e.target.value)}
                    placeholder={`Max: ${remainingPercentage.toFixed(1)}%`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
              </div>
              <div className="text-center text-xs text-gray-400">OR</div>
              <div>
                <Label>Investment Amount (AED)</Label>
                <Input
                  type="number"
                  max={maxAmount}
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder={`Max: ${formatCurrency(maxAmount)}`}
                />
              </div>
            </div>
          )}

          {/* Investment Preview */}
          {((isFractional && units && parseInt(units) > 0) || (!isFractional && (percentage || amount))) && (
            <div className={`p-4 rounded-lg ${isFractional ? 'bg-teal-50' : 'bg-orange-50'}`}>
              <h4 className={`text-sm font-medium mb-2 ${isFractional ? 'text-teal-700' : 'text-orange-700'}`}>Investment Preview</h4>
              <div className="space-y-1 text-sm">
                {isFractional && (
                  <div className="flex justify-between">
                    <span className="text-teal-600">Units</span>
                    <span className="font-medium">{formatCurrency(parseInt(units))}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className={isFractional ? 'text-teal-600' : 'text-orange-600'}>Share</span>
                  <span className="font-medium">{sharePercentage.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className={isFractional ? 'text-teal-600' : 'text-orange-600'}>Amount</span>
                  <span className="font-bold">AED {formatCurrency(isFractional ? investmentAmount : parseFloat(amount))}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className={`flex-1 ${isFractional ? 'bg-teal-600 hover:bg-teal-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
              {loading ? "Adding..." : "Add Investor"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Payment Management Modal Component
function PaymentManagementModal({ opportunity, onClose, onSuccess }) {
  const [selectedPaymentIndex, setSelectedPaymentIndex] = useState(null);
  const [showRecordForm, setShowRecordForm] = useState(false);

  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleRecordPayment = (index) => {
    setSelectedPaymentIndex(index);
    setShowRecordForm(true);
  };

  if (showRecordForm && selectedPaymentIndex !== null) {
    return (
      <RecordPaymentForm
        opportunity={opportunity}
        paymentIndex={selectedPaymentIndex}
        payment={opportunity.payment_schedule[selectedPaymentIndex]}
        onClose={() => {
          setShowRecordForm(false);
          setSelectedPaymentIndex(null);
        }}
        onSuccess={() => {
          setShowRecordForm(false);
          setSelectedPaymentIndex(null);
          onSuccess();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Payment Management</h2>
            <p className="text-sm text-gray-500">{opportunity.building_name} - Unit {opportunity.unit_no}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          {/* Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Overall Progress</span>
              <span className="font-bold text-teal-600">{opportunity.total_payment_percentage_completed || 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className="bg-teal-500 h-3 rounded-full" style={{ width: `${opportunity.total_payment_percentage_completed || 0}%` }} />
            </div>
          </div>

          {/* Payment List */}
          <div className="space-y-4">
            {opportunity.payment_schedule.map((payment, idx) => (
              <div 
                key={idx}
                className={`p-4 rounded-lg border ${payment.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      payment.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {payment.completed ? <Check className="h-5 w-5" /> : idx + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{payment.description || `Payment ${idx + 1}`}</p>
                      <p className="text-sm text-gray-500">Due: {formatDate(payment.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">{payment.percentage}%</p>
                    <p className="text-sm text-gray-500">AED {formatCurrency(payment.amount)}</p>
                  </div>
                </div>

                {/* Payment Details if completed */}
                {payment.completed && payment.payment_details && (
                  <div className="mt-4 pt-4 border-t border-green-200">
                    <p className="text-sm font-medium text-green-700 mb-2">Payment Recorded</p>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Paid On</p>
                        <p className="font-medium">{formatDate(payment.payment_details.payment_date)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Amount</p>
                        <p className="font-medium">{payment.payment_details.currency} {formatCurrency(payment.payment_details.transaction_amount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Fees</p>
                        <p className="font-medium">{formatCurrency(payment.payment_details.transaction_fees)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Rate</p>
                        <p className="font-medium">{payment.payment_details.currency_rate}</p>
                      </div>
                    </div>
                    {payment.payment_details.notes && (
                      <p className="text-sm text-gray-500 mt-2">Notes: {payment.payment_details.notes}</p>
                    )}
                  </div>
                )}

                {/* Swift Copies */}
                {payment.swift_copies && payment.swift_copies.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-500 mb-2">SWIFT Copies:</p>
                    <div className="flex flex-wrap gap-2">
                      {payment.swift_copies.map((sc, scIdx) => (
                        <div key={scIdx} className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded text-sm">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span>{sc.filename}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Record Button for incomplete payments */}
                {!payment.completed && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <Button onClick={() => handleRecordPayment(idx)} className="w-full">
                      Record Payment
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50">
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}


// Record Payment Form Component
function RecordPaymentForm({ opportunity, paymentIndex, payment, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    transaction_amount: payment.amount || "",
    transaction_fees: "",
    currency: "AED",
    currency_rate: "1",
    notes: ""
  });
  const [swiftFile, setSwiftFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.payment_date || !formData.transaction_amount) {
      toast.error("Please fill required fields");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      await axios.post(
        `${API}/real-estate-opportunities/${opportunity.id}/record-payment`,
        {
          payment_index: paymentIndex,
          payment_date: formData.payment_date,
          transaction_amount: parseFloat(formData.transaction_amount),
          transaction_fees: parseFloat(formData.transaction_fees) || 0,
          currency: formData.currency,
          currency_rate: parseFloat(formData.currency_rate) || 1,
          notes: formData.notes || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (swiftFile) {
        const swiftFormData = new FormData();
        swiftFormData.append('file', swiftFile);
        await axios.post(
          `${API}/real-estate-opportunities/${opportunity.id}/payments/${paymentIndex}/swift-copy`,
          swiftFormData,
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
        );
      }

      toast.success("Payment recorded successfully");
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Record Payment</h2>
            <p className="text-sm text-gray-500">{payment.description || `Payment ${paymentIndex + 1}`} - {payment.percentage}%</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-teal-50 p-4 rounded-lg">
            <p className="text-sm text-teal-600">Expected Amount</p>
            <p className="text-2xl font-bold text-teal-800">AED {formatCurrency(payment.amount)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Date *</Label>
              <Input type="date" value={formData.payment_date} onChange={(e) => handleChange("payment_date", e.target.value)} required />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={formData.currency} onValueChange={(v) => handleChange("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="INR">INR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Transaction Amount *</Label>
              <Input type="number" value={formData.transaction_amount} onChange={(e) => handleChange("transaction_amount", e.target.value)} required />
            </div>
            <div>
              <Label>Currency Rate (to AED)</Label>
              <Input type="number" step="0.0001" value={formData.currency_rate} onChange={(e) => handleChange("currency_rate", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Transaction Fees</Label>
            <Input type="number" value={formData.transaction_fees} onChange={(e) => handleChange("transaction_fees", e.target.value)} />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={formData.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={2} />
          </div>

          <div>
            <Label>SWIFT Copy</Label>
            <div className="mt-1">
              {swiftFile ? (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span className="text-sm">{swiftFile.name}</span>
                  </div>
                  <button type="button" onClick={() => setSwiftFile(null)} className="text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400">
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-500">Upload SWIFT copy</span>
                  <input type="file" accept=".pdf,image/*" onChange={(e) => setSwiftFile(e.target.files[0])} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-teal-600 hover:bg-teal-700">
              {loading ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Interest Modal Component
function InterestModal({ opportunity, onClose, onSuccess }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const API = process.env.REACT_APP_BACKEND_URL;
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/interest`,
        { message },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record interest");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Heart className="h-5 w-5 text-purple-600" />
              Express Interest
            </h2>
            <p className="text-sm text-gray-500">{opportunity.building_name} - Unit {opportunity.unit_no}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-purple-50 rounded-lg p-4 text-sm text-purple-700">
            <p className="font-medium mb-1">You&apos;re expressing interest in:</p>
            <p>{opportunity.building_name}, Unit {opportunity.unit_no}</p>
            <p className="text-purple-600 font-bold">Total Cost: AED {new Intl.NumberFormat('en-AE').format(opportunity.total_cost)}</p>
          </div>
          
          <div>
            <Label htmlFor="interest-message">Message (Optional)</Label>
            <Textarea
              id="interest-message"
              placeholder="Any specific questions or requirements?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-purple-600 hover:bg-purple-700">
              {loading ? "Submitting..." : "Submit Interest"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Participate Modal Component
function ParticipateModal({ opportunity, remainingPercentage, onClose, onSuccess }) {
  const [percentage, setPercentage] = useState(25);
  const [loading, setLoading] = useState(false);
  
  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);
  const investmentAmount = opportunity.total_cost * percentage / 100;
  const availableSpots = 4 - (opportunity.current_investors || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (percentage > remainingPercentage) {
      toast.error(`Maximum available is ${remainingPercentage.toFixed(1)}%`);
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const API = process.env.REACT_APP_BACKEND_URL;
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/participate`,
        { percentage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to confirm participation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-purple-600" />
              Confirm Participation
            </h2>
            <p className="text-sm text-gray-500">{opportunity.building_name} - Unit {opportunity.unit_no}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-blue-700">Available</span>
              <span className="font-bold text-blue-800">{remainingPercentage.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-700">Spots Left</span>
              <span className="font-bold text-blue-800">{availableSpots} of 4</span>
            </div>
          </div>
          
          <div>
            <Label className="text-sm font-medium">Your Ownership Percentage</Label>
            <div className="mt-2">
              <Slider
                value={[percentage]}
                onValueChange={(v) => setPercentage(v[0])}
                max={Math.min(remainingPercentage, 100)}
                min={5}
                step={5}
                className="mb-3"
              />
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">5%</span>
                <span className="text-lg font-bold text-purple-600">{percentage}%</span>
                <span className="text-sm text-gray-500">{Math.min(remainingPercentage, 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-purple-700">Ownership</span>
              <span className="font-bold text-purple-800">{percentage}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-purple-700">Investment Amount</span>
              <span className="font-bold text-purple-800">AED {formatCurrency(investmentAmount)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-purple-200">
              <span className="text-purple-700">Co-owners After</span>
              <span className="font-bold text-purple-800">{(opportunity.current_investors || 0) + 1} / 4</span>
            </div>
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-purple-600 hover:bg-purple-700">
              {loading ? "Processing..." : "Confirm Participation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Share with Clients Modal Component
function ShareWithClientsModal({ opportunity, clients, onClose, onSuccess }) {
  const [selectedClients, setSelectedClients] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  
  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);

  const toggleClient = (clientId) => {
    setSelectedClients(prev => 
      prev.includes(clientId) 
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const selectAll = () => {
    if (selectedClients.length === clients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(clients.map(c => c.id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedClients.length === 0) {
      toast.error("Please select at least one client");
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const API = process.env.REACT_APP_BACKEND_URL;
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/share`,
        { 
          client_ids: selectedClients,
          message: message
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to share opportunity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Send className="h-5 w-5 text-teal-600" />
              Share with Clients
            </h2>
            <p className="text-sm text-gray-500">{opportunity.building_name} - Unit {opportunity.unit_no}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="p-6 space-y-4 flex-1 overflow-y-auto">
            {/* Property Summary */}
            <div className="bg-teal-50 rounded-lg p-4">
              <p className="text-sm text-teal-600 mb-1">Sharing Opportunity</p>
              <p className="font-bold text-teal-800">{opportunity.building_name}</p>
              <p className="text-sm text-teal-700">Unit {opportunity.unit_no} • {opportunity.unit_type} • {opportunity.total_area} sqft</p>
              <p className="text-lg font-bold text-teal-800 mt-2">AED {formatCurrency(opportunity.total_cost)}</p>
            </div>
            
            {/* Client Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Select Clients</Label>
                <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                  {selectedClients.length === clients.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              
              {clients.length > 0 ? (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {clients.map((client) => (
                    <div 
                      key={client.id} 
                      className={`flex items-center gap-3 p-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 ${
                        selectedClients.includes(client.id) ? 'bg-teal-50' : ''
                      }`}
                      onClick={() => toggleClient(client.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedClients.includes(client.id)}
                        onChange={() => toggleClient(client.id)}
                        className="h-4 w-4 text-teal-600 rounded"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">{client.name}</p>
                        <p className="text-xs text-gray-500">{client.email || client.phone}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No clients found</p>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">{selectedClients.length} client(s) selected</p>
            </div>
            
            {/* Message */}
            <div>
              <Label htmlFor="share-message">Personal Message (Optional)</Label>
              <Textarea
                id="share-message"
                placeholder="Add a personal note for your clients..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          
          <div className="p-6 border-t bg-gray-50">
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={loading || selectedClients.length === 0} 
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                {loading ? "Sending..." : `Share with ${selectedClients.length} Client(s)`}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}


// Payment Record Modal - Records payment per investor for a milestone
function PaymentRecordModal({ opportunity, milestone, onClose, onSuccess }) {
  const [selectedInvestor, setSelectedInvestor] = useState("");
  const [formData, setFormData] = useState({
    transfer_date: "",
    home_currency: "INR",
    home_currency_amount: "",
    aed_amount: "",
    effective_rate: ""
  });
  const [swiftFile, setSwiftFile] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);
  
  // Get investors who haven't paid for this milestone yet
  const existingPayments = opportunity.investor_payments?.filter(p => p.milestone_index === milestone.index) || [];
  const paidInvestorIds = existingPayments.map(p => p.investor_id || p.investor_index);
  const unpaidInvestors = opportunity.investors?.filter((inv, idx) => 
    !paidInvestorIds.includes(inv.client_id) && !paidInvestorIds.includes(idx)
  ) || [];
  
  // Calculate expected AED amount based on investor's share
  const selectedInv = opportunity.investors?.find((inv, idx) => 
    inv.client_id === selectedInvestor || idx.toString() === selectedInvestor
  );
  const expectedAED = selectedInv 
    ? (opportunity.unit_price * milestone.percentage / 100) * (selectedInv.share_percentage / 100)
    : 0;
  
  // Auto-calculate effective rate
  const calculateEffectiveRate = () => {
    const homeAmt = parseFloat(formData.home_currency_amount) || 0;
    const aedAmt = parseFloat(formData.aed_amount) || 0;
    if (homeAmt > 0 && aedAmt > 0) {
      return (homeAmt / aedAmt).toFixed(4);
    }
    return "";
  };

  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    
    // Auto-calculate effective rate when both amounts are entered
    if (field === 'home_currency_amount' || field === 'aed_amount') {
      const homeAmt = parseFloat(field === 'home_currency_amount' ? value : newData.home_currency_amount) || 0;
      const aedAmt = parseFloat(field === 'aed_amount' ? value : newData.aed_amount) || 0;
      if (homeAmt > 0 && aedAmt > 0) {
        newData.effective_rate = (homeAmt / aedAmt).toFixed(4);
      }
    }
    
    setFormData(newData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInvestor || !formData.transfer_date || !formData.aed_amount) {
      toast.error("Please fill all required fields");
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const API = process.env.REACT_APP_BACKEND_URL;
      
      // Create FormData for file upload
      const submitData = new FormData();
      submitData.append('milestone_index', milestone.index);
      submitData.append('investor_id', selectedInvestor);
      submitData.append('transfer_date', formData.transfer_date);
      submitData.append('home_currency', formData.home_currency);
      submitData.append('home_currency_amount', formData.home_currency_amount || 0);
      submitData.append('aed_amount', formData.aed_amount);
      submitData.append('effective_rate', formData.effective_rate || calculateEffectiveRate());
      
      if (swiftFile) {
        submitData.append('swift_copy', swiftFile);
      }
      
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/investor-payment`,
        submitData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              Record Payment
            </h2>
            <p className="text-sm text-gray-500">{milestone.description || `Payment ${milestone.index + 1}`} - {milestone.percentage}%</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Milestone Info */}
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex justify-between">
              <span className="text-green-700">Total Milestone Amount</span>
              <span className="font-bold text-green-800">AED {formatCurrency(opportunity.unit_price * milestone.percentage / 100)}</span>
            </div>
            <p className="text-xs text-green-600 mt-1">Due: {new Date(milestone.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
          
          {/* Select Investor */}
          <div>
            <Label>Select Investor *</Label>
            {unpaidInvestors.length > 0 ? (
              <Select value={selectedInvestor} onValueChange={setSelectedInvestor}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose investor" />
                </SelectTrigger>
                <SelectContent>
                  {unpaidInvestors.map((inv, idx) => {
                    const originalIdx = opportunity.investors?.findIndex(i => i.client_id === inv.client_id);
                    return (
                      <SelectItem key={inv.client_id || idx} value={inv.client_id || originalIdx.toString()}>
                        {inv.client_name} ({inv.share_percentage}%)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-green-600 p-3 bg-green-50 rounded-lg">All investors have paid for this milestone!</p>
            )}
            {selectedInv && (
              <p className="text-xs text-gray-500 mt-1">
                Expected: AED {formatCurrency(expectedAED)} ({selectedInv.share_percentage}% share)
              </p>
            )}
          </div>
          
          {/* Transfer Date */}
          <div>
            <Label htmlFor="transfer_date">Date of Transfer *</Label>
            <Input
              id="transfer_date"
              type="date"
              value={formData.transfer_date}
              onChange={(e) => handleChange('transfer_date', e.target.value)}
              required
            />
          </div>
          
          {/* Home Currency Selection */}
          <div>
            <Label>Home Currency</Label>
            <Select value={formData.home_currency} onValueChange={(v) => handleChange('home_currency', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="AED">AED - UAE Dirham</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Amount in Home Currency */}
          <div>
            <Label htmlFor="home_currency_amount">Amount Debited ({formData.home_currency})</Label>
            <Input
              id="home_currency_amount"
              type="number"
              step="0.01"
              placeholder={`Amount in ${formData.home_currency}`}
              value={formData.home_currency_amount}
              onChange={(e) => handleChange('home_currency_amount', e.target.value)}
            />
          </div>
          
          {/* AED Amount */}
          <div>
            <Label htmlFor="aed_amount">AED Amount Received *</Label>
            <Input
              id="aed_amount"
              type="number"
              step="0.01"
              placeholder="Amount in AED"
              value={formData.aed_amount}
              onChange={(e) => handleChange('aed_amount', e.target.value)}
              required
            />
          </div>
          
          {/* Effective Rate (Auto-calculated) */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex justify-between items-center">
              <span className="text-blue-700">Effective Exchange Rate</span>
              <span className="font-bold text-blue-800 text-lg">
                {formData.effective_rate || calculateEffectiveRate() || '--'} {formData.home_currency}/AED
              </span>
            </div>
            <p className="text-xs text-blue-600 mt-1">Auto-calculated from amounts</p>
          </div>
          
          {/* SWIFT Copy Upload */}
          <div>
            <Label>SWIFT Copy</Label>
            <div className="mt-1">
              {swiftFile ? (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-gray-500" />
                    <span className="text-sm text-gray-700 truncate max-w-xs">{swiftFile.name}</span>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSwiftFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">Upload SWIFT copy</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setSwiftFile(e.target.files[0])}
                  />
                </label>
              )}
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button 
              type="submit" 
              disabled={loading || !selectedInvestor || unpaidInvestors.length === 0} 
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {loading ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Oqood Upload Modal
function OqoodUploadModal({ opportunity, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const API = process.env.REACT_APP_BACKEND_URL;
      
      const formData = new FormData();
      formData.append('file', file);
      
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/oqood`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to upload Oqood document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Upload Oqood Document
            </h2>
            <p className="text-sm text-gray-500">{opportunity.building_name} - Unit {opportunity.unit_no}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
            <p className="font-medium mb-1">What is Oqood?</p>
            <p>Oqood is the property registration document issued by the Dubai Land Department. Upload it here for client reference.</p>
          </div>
          
          <div>
            {file ? (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-800 truncate max-w-xs">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                <Upload className="h-10 w-10 text-gray-400" />
                <span className="text-gray-600">Click to upload Oqood document</span>
                <span className="text-xs text-gray-400">PDF, JPG, PNG (max 10MB)</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </label>
            )}
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !file} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {loading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
