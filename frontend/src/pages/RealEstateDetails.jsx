import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  Building2, MapPin, ArrowLeft, Calendar, Users, Check, User,
  DollarSign, Ruler, Car, CheckCircle2, Clock, Plus, Upload, FileText, X, CreditCard, TrendingUp,
  Calculator, Heart, UserPlus, Info, Download, Send, Bell, Eye, Settings, BarChart3, Edit2, Trash2, RefreshCw
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
  const [showInvoiceUploadModal, setShowInvoiceUploadModal] = useState(false);
  const [selectedInvoiceMilestone, setSelectedInvoiceMilestone] = useState(null);
  const [showDeveloperReceiptModal, setShowDeveloperReceiptModal] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null);
  const [showDldAdminModal, setShowDldAdminModal] = useState(false);
  const [selectedDldAdminInvestor, setSelectedDldAdminInvestor] = useState(null);
  const [dldAdminUploadType, setDldAdminUploadType] = useState(null); // 'invoice', 'swift', 'receipt'
  const [showCurrencySettingsModal, setShowCurrencySettingsModal] = useState(false);
  const [showXirrComparisonModal, setShowXirrComparisonModal] = useState(false);
  const [selectedInvestorForXirr, setSelectedInvestorForXirr] = useState(null);
  const [showPassportModal, setShowPassportModal] = useState(false);
  const [selectedInvestorForPassport, setSelectedInvestorForPassport] = useState(null);
  const [showEditInvestorModal, setShowEditInvestorModal] = useState(false);
  const [selectedInvestorForEdit, setSelectedInvestorForEdit] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  
  // XIRR Calculator state
  const [xirrSaleStage, setXirrSaleStage] = useState(100); // % of payment completed when sold
  const [xirrSaleDate, setXirrSaleDate] = useState("");
  const [xirrSaleRate, setXirrSaleRate] = useState(""); // per sqft
  const [currencyProjectionsMissing, setCurrencyProjectionsMissing] = useState(false);

  // Update xirrSaleStage to eligible percentage when opportunity loads
  useEffect(() => {
    if (opportunity?.eligible_to_sell_after_percentage) {
      setXirrSaleStage(opportunity.eligible_to_sell_after_percentage);
    }
  }, [opportunity]);

  // Check if currency projections exist
  useEffect(() => {
    const checkCurrencyProjections = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get(`${API}/settings/currency-projections`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const projections = response.data?.projections || [];
        // Mark as missing if no projections or less than 3 years
        setCurrencyProjectionsMissing(projections.length < 3);
      } catch (error) {
        setCurrencyProjectionsMissing(true);
      }
    };
    checkCurrencyProjections();
  }, [API]);

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

  const handleDeleteOpportunity = async () => {
    setDeleting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/real-estate-opportunities/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Property deleted successfully");
      navigate("/broker/admin/real-estate");
    } catch (error) {
      console.error("Error deleting opportunity:", error);
      toast.error(error.response?.data?.detail || "Failed to delete property");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

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

  // Handle removing an investor
  const handleRemoveInvestor = async (investor) => {
    if (!window.confirm(`Are you sure you want to remove ${investor.client_name || 'this investor'}?`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API}/real-estate-opportunities/${id}/investor/${investor.client_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Investor removed successfully");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to remove investor");
    }
  };

  // Handle updating investor percentage
  const handleUpdateInvestorPercentage = async (investorId, newPercentage) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/real-estate-opportunities/${id}/investor-percentage`,
        { investor_id: investorId, new_percentage: newPercentage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Investor percentage updated successfully");
      setShowEditInvestorModal(false);
      setSelectedInvestorForEdit(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update percentage");
    }
  };

  // Handle recalculating status
  const handleRecalculateStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/real-estate-opportunities/${id}/recalculate-status`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Status updated: ${response.data.old_status} → ${response.data.new_status} (${response.data.total_percentage}% allocated)`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to recalculate status");
    }
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
    const fmtAED = (amt) => `AED ${new Intl.NumberFormat('en-AE').format(Math.round(amt || 0))}`;
    
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

  // Check if current user is a co-owner of this property
  const isCoOwner = useMemo(() => {
    if (!user || !opportunity) return false;
    return opportunity.investors?.some(inv => inv.client_id === user.id || inv.user_id === user.id);
  }, [user, opportunity]);

  // Check if current user is the sub-broker managing any co-owner
  const isManagingSubBroker = useMemo(() => {
    if (!user || user.role !== 'sub_broker' || !opportunity) return false;
    // Check if any investor was added by this sub-broker or if sub-broker manages these clients
    return opportunity.investors?.some(inv => inv.added_by === user.id) || 
           clients.some(c => opportunity.investors?.some(inv => inv.client_id === c.id));
  }, [user, opportunity, clients]);

  // Check if opportunity is fully allocated (100% invested or status is fully_invested)
  const isFullyAllocated = useMemo(() => {
    if (!opportunity) return false;
    // Check by status OR by invested percentage
    return opportunity.status === 'fully_invested' || 
           (opportunity.invested_percentage && opportunity.invested_percentage >= 99.99) ||
           (opportunity.remaining_percentage !== undefined && opportunity.remaining_percentage <= 0.01);
  }, [opportunity]);

  // Check if user can view payment management section
  // Must be fully allocated (100% funded) AND user must be broker, managing sub-broker, or co-owner
  const canViewPaymentManagement = useMemo(() => {
    if (!user || !opportunity) return false;
    if (!isFullyAllocated) return false; // Must be fully allocated (100% funded) first
    if (user.role === 'broker') return true;
    if (user.role === 'sub_broker') return isManagingSubBroker;
    if (user.role === 'client') return isCoOwner;
    return false;
  }, [user, opportunity, isFullyAllocated, isCoOwner, isManagingSubBroker]);

  // Check if user can view/manage Oqood section
  // Oqood section only appears AFTER the first milestone payments are ALL verified by ALL investors
  const canManageOqood = useMemo(() => {
    if (!canViewPaymentManagement) return false;
    if (!opportunity?.payment_schedule?.length || !opportunity?.investors?.length) return false;
    
    // Sort payment schedule to get the first milestone
    const sortedSchedule = [...opportunity.payment_schedule].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    const firstMilestoneIndex = opportunity.payment_schedule.indexOf(sortedSchedule[0]);
    
    // Get all payments for the first milestone
    const investorPayments = opportunity.investor_payments || [];
    const firstMilestonePayments = investorPayments.filter(
      p => p.milestone_index === firstMilestoneIndex
    );
    
    // Check if ALL investors have verified payments for the first milestone
    const verifiedCount = firstMilestonePayments.filter(
      p => p.status === 'verified'
    ).length;
    const totalInvestors = opportunity.investors?.length || 0;
    
    // All investors must have verified payments for the first milestone
    return totalInvestors > 0 && verifiedCount >= totalInvestors;
  }, [canViewPaymentManagement, opportunity]);

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
                  {opp.status === 'partially_invested' && <Badge className="bg-amber-100 text-amber-700">Partially Invested</Badge>}
                  {opp.status === 'fully_invested' && <Badge className="bg-blue-100 text-blue-700">Fully Invested</Badge>}
                  {(opp.status === 'closed' || opp.status === 'sold') && <Badge className="bg-emerald-100 text-emerald-700">Closed - Sold</Badge>}
                </div>
                <p className="text-gray-500 mt-1">
                  Unit {opp.unit_no} • {opp.unit_type} • Floor {opp.floor}
                  {opp.location && <span className="ml-2">• <MapPin className="h-4 w-4 inline" /> {opp.location}</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {(opp.status === 'available' || opp.status === 'partially_invested') && remainingPercentage > 0 && (
                <Button onClick={() => setShowAllocateModal(true)} className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Investor
                </Button>
              )}
              {opp.status === 'fully_invested' && (
                <Button 
                  onClick={() => setShowSellModal(true)} 
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="sell-unit-btn"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Sell Unit
                </Button>
              )}
              <Button 
                variant="outline" 
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="delete-property-btn"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {/* Property Images */}
          {opp.images && opp.images.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-teal-600" />
                Property Images
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {opp.images.map((img, idx) => {
                  // Handle different image formats: base64 data, url string, or object with url
                  const imgSrc = img.data 
                    ? (img.data.startsWith('data:') ? img.data : `data:${img.content_type || 'image/jpeg'};base64,${img.data}`)
                    : (img.url || img);
                  return (
                    <div key={idx} className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
                      <img 
                        src={imgSrc}
                        alt={`${opp.building_name} - Image ${idx + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        onClick={() => window.open(imgSrc, '_blank')}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Presentations Section - Downloadable by clients/sub-brokers */}
          {opp.presentations && opp.presentations.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Property Documents & Presentations
              </h2>
              <p className="text-sm text-gray-500 mb-4">Download brochures, floor plans, and presentation files.</p>
              <div className="grid grid-cols-2 gap-3">
                {opp.presentations.map((pres, idx) => (
                  <a
                    key={idx}
                    href={`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/presentations/${pres.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors group"
                    data-testid={`download-presentation-${idx}`}
                  >
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{pres.filename}</p>
                      <p className="text-xs text-gray-500">{(pres.size / 1024).toFixed(1)} KB • Click to download</p>
                    </div>
                    <Download className="h-5 w-5 text-blue-600 group-hover:scale-110 transition-transform" />
                  </a>
                ))}
              </div>
            </div>
          )}

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
                <p className="font-semibold text-teal-800">
                  {opp.status === 'available' ? 'Available' : 
                   opp.status === 'partially_invested' ? 'Partially Invested' : 
                   opp.status === 'fully_invested' ? 'Fully Invested' : 
                   opp.status === 'sold' ? 'Sold' : 'Closed'}
                </p>
              </div>
            </div>
            
            {/* Property Description */}
            {opp.description && (
              <div className="mt-4 bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-2">Description</p>
                <p className="text-sm text-gray-700 leading-relaxed">{opp.description}</p>
              </div>
            )}
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

          {/* Sale Returns Section - Only shown for closed/sold properties */}
          {(opp.status === 'closed' || opp.status === 'sold') && opp.sale_record && (
            <div className="bg-white rounded-xl border border-emerald-200 p-6" data-testid="sale-returns-section">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                Sale Returns
                <Badge className="bg-emerald-100 text-emerald-700 ml-2">Closed</Badge>
              </h2>
              
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <p className="text-xs text-gray-500 mb-1">Sale Date</p>
                  <p className="font-semibold text-gray-800">{formatDate(opp.sale_record.sale_date)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <p className="text-xs text-blue-600 mb-1">Sale Price</p>
                  <p className="font-bold text-blue-800 text-lg">AED {formatCurrency(opp.sale_record.sale_price)}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                  <p className="text-xs text-orange-600 mb-1">Selling Fee ({opp.sale_record.selling_fee_percentage || 0}%)</p>
                  <p className="font-semibold text-orange-800">AED {formatCurrency(opp.sale_record.brokerage_fee)}</p>
                </div>
                <div className="bg-teal-50 rounded-lg p-4 border border-teal-100">
                  <p className="text-xs text-teal-600 mb-1">Net Proceeds</p>
                  <p className="font-bold text-teal-800 text-lg">AED {formatCurrency(opp.sale_record.net_proceeds)}</p>
                </div>
              </div>
              
              {/* Returns Summary */}
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-5 border border-emerald-200">
                <div className="grid grid-cols-3 gap-6">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Invested</p>
                    <p className="text-xl font-bold text-gray-800">AED {formatCurrency(opp.sale_record.total_invested || (opp.unit_price + opp.dld_fee + opp.admin_fee))}</p>
                  </div>
                  <div className="text-center border-x border-emerald-200 px-6">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Net Profit</p>
                    <p className={`text-2xl font-bold ${(opp.sale_record.net_profit || opp.sale_record.profit_loss || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      AED {formatCurrency(Math.abs(opp.sale_record.net_profit || opp.sale_record.profit_loss || 0))}
                      {(opp.sale_record.net_profit || opp.sale_record.profit_loss || 0) < 0 && ' (Loss)'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(opp.sale_record.profit_percentage || 0).toFixed(2)}% return
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">XIRR</p>
                    <p className={`text-3xl font-bold ${(opp.sale_record.xirr || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {opp.sale_record.xirr ? `${opp.sale_record.xirr.toFixed(2)}%` : 'N/A'}
                    </p>
                    <p className="text-xs text-emerald-500">Annualized return</p>
                  </div>
                </div>
              </div>
              
              {opp.sale_record.notes && (
                <div className="mt-4 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Sale Notes</p>
                  <p className="text-sm text-gray-700">{opp.sale_record.notes}</p>
                </div>
              )}
            </div>
          )}
          {opp.payment_schedule && opp.payment_schedule.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {/* Header - matches other sections */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-green-600" />
                  Payments
                </h2>
                {isFullyAllocated && (
                  <Badge className="bg-green-100 text-green-700">Fully Allocated ({opp.investors?.length || 0} Investors)</Badge>
                )}
              </div>

              {/* Unified Table */}
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-gray-600 font-semibold sticky left-0 bg-gray-50 z-10">Milestone</th>
                      <th className="text-right py-3 px-3 text-gray-600 font-semibold">Amount</th>
                      <th className="text-center py-3 px-3 text-gray-600 font-semibold">Progress</th>
                      <th className="text-center py-3 px-3 text-gray-600 font-semibold">Status</th>
                      {isFullyAllocated && opp.investors?.map((inv, i) => (
                        <th key={i} className="text-center py-2 px-2 text-gray-600 font-medium min-w-[100px]">
                          <div className="text-xs">{inv.client_name?.split(' ')[0]}</div>
                          <div className="text-[10px] text-gray-400">{inv.share_percentage || (100 / opp.investors.length).toFixed(0)}%</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...opp.payment_schedule].sort((a, b) => new Date(a.date) - new Date(b.date)).flatMap((milestone, idx) => {
                      const milestonePayments = opp.investor_payments?.filter(p => p.milestone_index === idx) || [];
                      const verifiedCount = milestonePayments.filter(p => p.status === 'verified').length;
                      const pendingCount = milestonePayments.filter(p => p.status === 'pending_verification').length;
                      const totalInvestors = opp.investors?.length || 0;
                      const invoicesSent = opp.investor_invoices?.filter(inv => inv.milestone_index === idx).length || 0;
                      const receiptsUploaded = milestonePayments.filter(p => p.developer_receipt).length;
                      const allVerified = totalInvestors > 0 && verifiedCount >= totalInvestors;
                      const propertyFullyFunded = isFullyAllocated;
                      
                      // Array to hold rows - milestone row and optionally DLD+Admin row after first milestone
                      const rows = [];
                      
                      // Add the milestone row
                      rows.push(
                        <tr key={`milestone-${idx}`} className={`border-b border-gray-100 hover:bg-gray-50 ${allVerified ? 'bg-green-50/50' : ''}`}>
                          {/* Milestone Info */}
                          <td className="py-4 px-4 sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                allVerified ? 'bg-green-500 text-white' : 
                                pendingCount > 0 ? 'bg-amber-500 text-white' : 
                                'bg-gray-200 text-gray-600'
                              }`}>
                                {allVerified ? <Check className="h-4 w-4" /> : idx + 1}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{milestone.description || `Payment ${idx + 1}`}</p>
                                <p className="text-xs text-gray-500">{formatDate(milestone.date)} • {milestone.percentage}%</p>
                              </div>
                            </div>
                          </td>
                          
                          {/* Amount */}
                          <td className="py-4 px-3 text-right">
                            <p className="font-bold text-gray-800">AED {formatCurrency(opp.unit_price * milestone.percentage / 100)}</p>
                          </td>
                          
                          {/* Progress Bars */}
                          <td className="py-4 px-3">
                            {propertyFullyFunded && totalInvestors > 0 ? (
                              <div className="flex items-center gap-2 justify-center">
                                <div className="flex flex-col items-center" title="Invoices">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(invoicesSent / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-blue-600">{invoicesSent}/{totalInvestors}</span>
                                </div>
                                <div className="flex flex-col items-center" title="Payments">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(verifiedCount / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-green-600">{verifiedCount}/{totalInvestors}</span>
                                </div>
                                <div className="flex flex-col items-center" title="Receipts">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(receiptsUploaded / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-purple-600">{receiptsUploaded}/{totalInvestors}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          
                          {/* Status */}
                          <td className="py-4 px-3 text-center">
                            {!propertyFullyFunded ? (
                              <Badge className="bg-blue-100 text-blue-700">Open</Badge>
                            ) : allVerified ? (
                              <Badge className="bg-green-100 text-green-700"><Check className="h-3 w-3 mr-1" />Complete</Badge>
                            ) : verifiedCount > 0 ? (
                              <Badge className="bg-blue-100 text-blue-700">Partial</Badge>
                            ) : pendingCount > 0 ? (
                              <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-600">Awaiting</Badge>
                            )}
                          </td>
                          
                          {/* Investor Document Status Cells */}
                          {isFullyAllocated && opp.investors?.map((investor, invIdx) => {
                            const invoice = opp.investor_invoices?.find(inv => inv.milestone_index === idx && inv.investor_id === investor.client_id);
                            const payment = milestonePayments.find(p => p.investor_id === investor.client_id || p.investor_index === invIdx);
                            const hasInvoice = !!invoice;
                            const hasSwift = payment?.swift_copy_url;
                            const hasReceipt = payment?.developer_receipt;
                            const hasPayment = !!payment;
                            const isVerified = payment?.status === 'verified';
                            const isPending = payment?.status === 'pending_verification';
                            const receiptApproved = payment?.receipt_approved;
                            const investorShare = investor.share_percentage || (100 / totalInvestors);
                            const investorAmount = (opp.unit_price * milestone.percentage / 100) * (investorShare / 100);
                            
                            // Sequential workflow: Invoice → SWIFT (verify) → Receipt (approve)
                            const canUploadSwift = hasInvoice && !hasSwift;
                            const canUploadReceipt = hasSwift && isVerified && !hasReceipt; // Only after SWIFT is uploaded AND verified
                            
                            return (
                              <td key={invIdx} className="py-2 px-2 text-center border-l border-gray-100">
                                <div className="flex flex-col items-center gap-0.5">
                                  {/* Document Columns */}
                                  <div className="flex items-start gap-1">
                                    {/* 1. Invoice Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasInvoice ? (
                                        <>
                                          <span className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center"><Check className="h-3 w-3" /></span>
                                          <button className="text-[8px] text-blue-600 hover:text-blue-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/invoices/${invoice.id}`, '_blank')}>View</button>
                                        </>
                                      ) : user?.role === 'broker' ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center" onClick={() => { setSelectedInvoiceMilestone({ milestone: { ...milestone, index: idx }, investor, amount: investorAmount }); setShowInvoiceUploadModal(true); }} title="Upload Invoice"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Upload</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* 2. SWIFT Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasSwift ? (
                                        <>
                                          <span className={`w-6 h-6 rounded flex items-center justify-center ${isVerified ? 'bg-teal-100 text-teal-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {isVerified ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                          </span>
                                          <button className="text-[8px] text-teal-600 hover:text-teal-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${payment.swift_copy_url}`, '_blank')}>View</button>
                                          {isPending && user?.role === 'broker' && (
                                            <button 
                                              className="text-[8px] text-green-600 hover:text-green-800 font-medium"
                                              onClick={async () => {
                                                try {
                                                  const token = localStorage.getItem("token");
                                                  await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/verify-payment/${payment.id}`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                                  fetchData();
                                                  toast.success("SWIFT verified!");
                                                } catch (error) {
                                                  toast.error("Failed to verify");
                                                }
                                              }}
                                            >
                                              Verify
                                            </button>
                                          )}
                                          {isPending && user?.role !== 'broker' && (
                                            <span className="text-[8px] text-amber-500">Pending</span>
                                          )}
                                        </>
                                      ) : canUploadSwift ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center" onClick={() => { setSelectedPaymentMilestone({ ...milestone, index: idx, selectedInvestor: investor }); setShowPaymentRecordModal(true); }} title="Upload SWIFT"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Upload</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* 3. Receipt Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasReceipt ? (
                                        <>
                                          <span className={`w-6 h-6 rounded flex items-center justify-center ${receiptApproved ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {receiptApproved ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                          </span>
                                          <button className="text-[8px] text-purple-600 hover:text-purple-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/developer-receipt/${payment.id}`, '_blank')}>View</button>
                                          {!receiptApproved && user?.role === 'broker' && (
                                            <button 
                                              className="text-[8px] text-green-600 hover:text-green-800 font-medium"
                                              onClick={async () => {
                                                try {
                                                  const token = localStorage.getItem("token");
                                                  await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/approve-receipt/${payment.id}`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                                  fetchData();
                                                  toast.success("Receipt approved!");
                                                } catch (error) {
                                                  toast.error("Failed to approve");
                                                }
                                              }}
                                            >
                                              Approve
                                            </button>
                                          )}
                                          {!receiptApproved && user?.role !== 'broker' && (
                                            <span className="text-[8px] text-amber-500">Pending</span>
                                          )}
                                        </>
                                      ) : canUploadReceipt ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center" onClick={() => { setSelectedPaymentForReceipt({ payment, investor, milestone: { ...milestone, index: idx } }); setShowDeveloperReceiptModal(true); }} title="Upload Receipt"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Upload</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Status & Amount */}
                                  <div className="text-[10px]">
                                    <span className={`font-medium ${isVerified ? 'text-green-600' : isPending ? 'text-amber-600' : 'text-gray-400'}`}>
                                      {isVerified ? '✓' : isPending ? '⏳' : '○'}
                                    </span>
                                    <span className="text-gray-500 ml-1">{formatCurrency(investorAmount)}</span>
                                  </div>
                                  
                                  {/* Verify Button for Broker */}
                                  {isPending && user?.role === 'broker' && (
                                    <button 
                                      className="text-[10px] text-green-600 hover:text-green-700 font-medium"
                                      onClick={async () => {
                                        try {
                                          const token = localStorage.getItem("token");
                                          await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/verify-payment/${payment.id}`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                          fetchData();
                                          toast.success("Payment verified!");
                                        } catch (error) {
                                          toast.error("Failed to verify");
                                        }
                                      }}
                                    >
                                      Verify
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                      
                      // Add combined DLD + Admin Fee row AFTER the first milestone (Booking Amount)
                      if (idx === 0 && ((opp.dld_fee > 0 || opp.dld_fee_percentage > 0) || opp.admin_fee > 0)) {
                        const dldFeeAmount = opp.dld_fee || (opp.unit_price * (opp.dld_fee_percentage || 4) / 100);
                        const adminFeeAmount = opp.admin_fee || 0;
                        const combinedAmount = dldFeeAmount + adminFeeAmount;
                        
                        // Combine DLD and Admin payments for tracking
                        const dldPayments = opp.dld_admin_payments?.filter(p => p.type === 'dld') || [];
                        const adminPayments = opp.dld_admin_payments?.filter(p => p.type === 'admin') || [];
                        const totalInvestorsDld = opp.investors?.length || 0;
                        
                        // Count statuses from both types
                        const invoicesSentDld = dldPayments.filter(p => p.invoice_url).length + adminPayments.filter(p => p.invoice_url).length;
                        const verifiedCountDld = dldPayments.filter(p => p.swift_verified).length;
                        const verifiedCountAdmin = adminPayments.filter(p => p.swift_verified).length;
                        const allVerifiedDld = totalInvestorsDld > 0 && verifiedCountDld === totalInvestorsDld && verifiedCountAdmin === totalInvestorsDld;
                        const pendingCountDld = dldPayments.filter(p => p.swift_copy && !p.swift_verified).length + adminPayments.filter(p => p.swift_copy && !p.swift_verified).length;
                        const receiptsUploadedDld = dldPayments.filter(p => p.receipt_url).length + adminPayments.filter(p => p.receipt_url).length;
                        
                        rows.push(
                          <tr key="dld-admin-combined" className={`border-b border-gray-100 hover:bg-amber-50/30 ${allVerifiedDld ? 'bg-green-50/50' : 'bg-amber-50/20'}`}>
                            {/* Combined DLD + Admin Info */}
                            <td className="py-4 px-4 sticky left-0 bg-amber-50/20 z-10">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  allVerifiedDld ? 'bg-green-500 text-white' : 
                                  pendingCountDld > 0 ? 'bg-amber-500 text-white' : 
                                  'bg-amber-200 text-amber-700'
                                }`}>
                                  {allVerifiedDld ? <Check className="h-4 w-4" /> : '$'}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-800">DLD + Admin Fee</p>
                                  <p className="text-xs text-gray-500">
                                    DLD {opp.dld_fee_percentage || 4}% + Admin
                                    {dldFeeAmount > 0 && adminFeeAmount > 0 && (
                                      <span className="ml-1">(AED {formatCurrency(dldFeeAmount)} + {formatCurrency(adminFeeAmount)})</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </td>
                            
                            {/* Combined Amount */}
                            <td className="py-4 px-3 text-right">
                              <p className="font-bold text-amber-700">AED {formatCurrency(combinedAmount)}</p>
                            </td>
                            
                            {/* Progress Bars */}
                            <td className="py-4 px-3">
                              {isFullyAllocated && totalInvestorsDld > 0 ? (
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="flex flex-col items-center" title="Invoices">
                                    <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(invoicesSentDld / (totalInvestorsDld * 2)) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] text-blue-600">{invoicesSentDld}/{totalInvestorsDld * 2}</span>
                                  </div>
                                  <div className="flex flex-col items-center" title="Payments">
                                    <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${((verifiedCountDld + verifiedCountAdmin) / (totalInvestorsDld * 2)) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] text-green-600">{verifiedCountDld + verifiedCountAdmin}/{totalInvestorsDld * 2}</span>
                                  </div>
                                  <div className="flex flex-col items-center" title="Receipts">
                                    <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                      <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(receiptsUploadedDld / (totalInvestorsDld * 2)) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] text-purple-600">{receiptsUploadedDld}/{totalInvestorsDld * 2}</span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                            
                            {/* Status */}
                            <td className="py-4 px-3 text-center">
                              {!isFullyAllocated ? (
                                <Badge className="bg-blue-100 text-blue-700">Open</Badge>
                              ) : allVerifiedDld ? (
                                <Badge className="bg-green-100 text-green-700"><Check className="h-3 w-3 mr-1" />Complete</Badge>
                              ) : (verifiedCountDld + verifiedCountAdmin) > 0 ? (
                                <Badge className="bg-blue-100 text-blue-700">Partial</Badge>
                              ) : pendingCountDld > 0 ? (
                                <Badge className="bg-amber-100 text-amber-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600">Awaiting</Badge>
                              )}
                            </td>
                            
                            {/* Per-Investor columns for combined DLD + Admin */}
                            {opp.investors?.map((investor) => {
                              const invDld = dldPayments.find(p => p.investor_id === investor.client_id);
                              const invAdmin = adminPayments.find(p => p.investor_id === investor.client_id);
                              const sharePercent = investor.share_percentage || (100 / opp.investors.length);
                              const investorDldAmount = dldFeeAmount * sharePercent / 100;
                              const investorAdminAmount = adminFeeAmount * sharePercent / 100;
                              const investorTotalAmount = investorDldAmount + investorAdminAmount;
                              
                              // Determine combined status
                              const hasDldSwift = invDld?.swift_copy;
                              const hasAdminSwift = invAdmin?.swift_copy;
                              const dldVerified = invDld?.swift_verified;
                              const adminVerified = invAdmin?.swift_verified;
                              const bothVerified = dldVerified && adminVerified;
                              const anyPending = (hasDldSwift && !dldVerified) || (hasAdminSwift && !adminVerified);
                              
                              return (
                                <td key={investor.client_id} className="py-3 px-2 text-center">
                                  <div className="flex flex-col items-center gap-1.5">
                                    <div className="flex items-center gap-1">
                                      {/* DLD Payment Status */}
                                      <div 
                                        className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center cursor-pointer ${
                                          dldVerified ? 'bg-green-100 text-green-600' :
                                          hasDldSwift ? 'bg-amber-100 text-amber-600' :
                                          'bg-gray-100 text-gray-400'
                                        }`}
                                        title={`DLD: ${dldVerified ? 'Verified' : hasDldSwift ? 'Pending' : 'Not Paid'}`}
                                        onClick={() => {
                                          if (!dldVerified) {
                                            setSelectedDldAdminPayment({ investor, type: 'dld', existing: invDld });
                                            setShowDldAdminModal(true);
                                          }
                                        }}
                                      >
                                        D
                                      </div>
                                      {/* Admin Payment Status */}
                                      <div 
                                        className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center cursor-pointer ${
                                          adminVerified ? 'bg-green-100 text-green-600' :
                                          hasAdminSwift ? 'bg-amber-100 text-amber-600' :
                                          'bg-gray-100 text-gray-400'
                                        }`}
                                        title={`Admin: ${adminVerified ? 'Verified' : hasAdminSwift ? 'Pending' : 'Not Paid'}`}
                                        onClick={() => {
                                          if (!adminVerified) {
                                            setSelectedDldAdminPayment({ investor, type: 'admin', existing: invAdmin });
                                            setShowDldAdminModal(true);
                                          }
                                        }}
                                      >
                                        A
                                      </div>
                                    </div>
                                    <span className="text-[9px] font-medium text-amber-600">AED {formatCurrency(investorTotalAmount)}</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }
                      
                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Footer Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <span className="font-medium text-gray-600">Legend:</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-100 text-green-600 flex items-center justify-center"><Check className="h-2 w-2" /></span>Uploaded/Verified</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-blue-500 text-white flex items-center justify-center"><Upload className="h-2 w-2" /></span>Upload</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-amber-100 text-amber-600 flex items-center justify-center"><Clock className="h-2 w-2" /></span>Pending Approval</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-2 w-2" /></span>Pending</span>
              </div>
            </div>
          )}

          {/* XIRR Comparison Report Section - Below Payments */}
                          
                          {/* Amount */}
                          <td className="py-4 px-3 text-right">
                            <p className="font-bold text-orange-700">AED {formatCurrency(dldFeeAmount)}</p>
                          </td>
                          
                          {/* Progress Bars */}
                          <td className="py-4 px-3">
                            {isFullyAllocated && totalInvestors > 0 ? (
                              <div className="flex items-center gap-2 justify-center">
                                <div className="flex flex-col items-center" title="Invoices">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(invoicesSent / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-blue-600">{invoicesSent}/{totalInvestors}</span>
                                </div>
                                <div className="flex flex-col items-center" title="Payments">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(verifiedCount / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-green-600">{verifiedCount}/{totalInvestors}</span>
                                </div>
                                <div className="flex flex-col items-center" title="Receipts">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(receiptsUploaded / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-purple-600">{receiptsUploaded}/{totalInvestors}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          
                          {/* Status */}
                          <td className="py-4 px-3 text-center">
                            {!isFullyAllocated ? (
                              <Badge className="bg-blue-100 text-blue-700">Open</Badge>
                            ) : allVerified ? (
                              <Badge className="bg-green-100 text-green-700"><Check className="h-3 w-3 mr-1" />Complete</Badge>
                            ) : verifiedCount > 0 ? (
                              <Badge className="bg-blue-100 text-blue-700">Partial</Badge>
                            ) : pendingCount > 0 ? (
                              <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-600">Awaiting</Badge>
                            )}
                          </td>
                          
                          {/* Investor Document Status Cells */}
                          {isFullyAllocated && opp.investors?.map((investor, invIdx) => {
                            const dldPayment = dldPayments.find(p => p.investor_id === investor.client_id);
                            const hasInvoice = !!dldPayment?.invoice_url;
                            const hasSwift = !!dldPayment?.swift_copy;
                            const hasReceipt = !!dldPayment?.receipt_url;
                            const isVerified = dldPayment?.swift_verified;
                            const isPending = hasSwift && !isVerified;
                            const receiptApproved = dldPayment?.receipt_approved;
                            const investorShare = investor.share_percentage || (100 / totalInvestors);
                            const investorAmount = dldFeeAmount * (investorShare / 100);
                            
                            const canUploadSwift = hasInvoice && !hasSwift;
                            const canUploadReceipt = hasSwift && isVerified && !hasReceipt;
                            
                            return (
                              <td key={invIdx} className="py-2 px-2 text-center border-l border-gray-100">
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="flex items-start gap-1">
                                    {/* 1. Invoice Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasInvoice ? (
                                        <>
                                          <span className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center"><Check className="h-3 w-3" /></span>
                                          <button className="text-[8px] text-blue-600 hover:text-blue-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${dldPayment.invoice_url}`, '_blank')}>View</button>
                                        </>
                                      ) : user?.role === 'broker' ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center" onClick={() => { setSelectedDldAdminInvestor({ ...investor, amount: investorAmount, feeType: 'dld' }); setDldAdminUploadType('invoice'); setShowDldAdminModal(true); }} title="Upload Invoice"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Invoice</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* 2. SWIFT Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasSwift ? (
                                        <>
                                          <span className={`w-6 h-6 rounded flex items-center justify-center ${isVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {isVerified ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                          </span>
                                          <button className="text-[8px] text-teal-600 hover:text-teal-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${dldPayment.swift_copy}`, '_blank')}>View</button>
                                          {!isVerified && user?.role === 'broker' && (
                                            <button 
                                              className="text-[8px] text-green-600 hover:text-green-800 font-medium"
                                              onClick={async () => {
                                                try {
                                                  const token = localStorage.getItem("token");
                                                  await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/dld-admin/${investor.client_id}/verify-swift?fee_type=dld`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                                  fetchData();
                                                  toast.success("DLD SWIFT verified!");
                                                } catch (error) {
                                                  toast.error("Failed to verify");
                                                }
                                              }}
                                            >
                                              Verify
                                            </button>
                                          )}
                                        </>
                                      ) : canUploadSwift ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center" onClick={() => { setSelectedDldAdminInvestor({ ...investor, amount: investorAmount, feeType: 'dld' }); setDldAdminUploadType('swift'); setShowDldAdminModal(true); }} title="Upload SWIFT"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Upload</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* 3. Receipt Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasReceipt ? (
                                        <>
                                          <span className={`w-6 h-6 rounded flex items-center justify-center ${receiptApproved ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {receiptApproved ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                          </span>
                                          <button className="text-[8px] text-purple-600 hover:text-purple-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${dldPayment.receipt_url}`, '_blank')}>View</button>
                                          {!receiptApproved && user?.role === 'broker' && (
                                            <button 
                                              className="text-[8px] text-green-600 hover:text-green-800 font-medium"
                                              onClick={async () => {
                                                try {
                                                  const token = localStorage.getItem("token");
                                                  await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/dld-admin/${investor.client_id}/approve-receipt?fee_type=dld`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                                  fetchData();
                                                  toast.success("DLD Receipt approved!");
                                                } catch (error) {
                                                  toast.error("Failed to approve");
                                                }
                                              }}
                                            >
                                              Approve
                                            </button>
                                          )}
                                        </>
                                      ) : canUploadReceipt ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center" onClick={() => { setSelectedDldAdminInvestor({ ...investor, amount: investorAmount, feeType: 'dld' }); setDldAdminUploadType('receipt'); setShowDldAdminModal(true); }} title="Upload Receipt"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Upload</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[9px] font-medium text-orange-600">AED {formatCurrency(investorAmount)}</span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })()}
                    
                    {/* Admin Fee Row - After DLD (between DLD and milestone 2) */}
                    {opp.admin_fee > 0 && (() => {
                      const adminFeeAmount = opp.admin_fee;
                      const adminPayments = opp.dld_admin_payments?.filter(p => p.type === 'admin') || [];
                      const totalInvestors = opp.investors?.length || 0;
                      const invoicesSent = adminPayments.filter(p => p.invoice_url).length;
                      const verifiedCount = adminPayments.filter(p => p.swift_verified).length;
                      const receiptsUploaded = adminPayments.filter(p => p.receipt_url).length;
                      const allVerified = totalInvestors > 0 && verifiedCount === totalInvestors;
                      const pendingCount = adminPayments.filter(p => p.swift_copy && !p.swift_verified).length;
                      
                      return (
                        <tr className={`border-b border-gray-100 hover:bg-green-50/30 ${allVerified ? 'bg-green-50/50' : 'bg-green-50/20'}`}>
                          {/* Milestone Info */}
                          <td className="py-4 px-4 sticky left-0 bg-green-50/20 z-10">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                allVerified ? 'bg-green-500 text-white' : 
                                pendingCount > 0 ? 'bg-amber-500 text-white' : 
                                'bg-green-200 text-green-700'
                              }`}>
                                {allVerified ? <Check className="h-4 w-4" /> : 'A'}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">Admin Fee</p>
                                <p className="text-xs text-gray-500">Administration Charges</p>
                              </div>
                            </div>
                          </td>
                          
                          {/* Amount */}
                          <td className="py-4 px-3 text-right">
                            <p className="font-bold text-green-700">AED {formatCurrency(adminFeeAmount)}</p>
                          </td>
                          
                          {/* Progress Bars */}
                          <td className="py-4 px-3">
                            {isFullyAllocated && totalInvestors > 0 ? (
                              <div className="flex items-center gap-2 justify-center">
                                <div className="flex flex-col items-center" title="Invoices">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(invoicesSent / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-blue-600">{invoicesSent}/{totalInvestors}</span>
                                </div>
                                <div className="flex flex-col items-center" title="Payments">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(verifiedCount / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-green-600">{verifiedCount}/{totalInvestors}</span>
                                </div>
                                <div className="flex flex-col items-center" title="Receipts">
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(receiptsUploaded / totalInvestors) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-purple-600">{receiptsUploaded}/{totalInvestors}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          
                          {/* Status */}
                          <td className="py-4 px-3 text-center">
                            {!isFullyAllocated ? (
                              <Badge className="bg-blue-100 text-blue-700">Open</Badge>
                            ) : allVerified ? (
                              <Badge className="bg-green-100 text-green-700"><Check className="h-3 w-3 mr-1" />Complete</Badge>
                            ) : verifiedCount > 0 ? (
                              <Badge className="bg-blue-100 text-blue-700">Partial</Badge>
                            ) : pendingCount > 0 ? (
                              <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-600">Awaiting</Badge>
                            )}
                          </td>
                          
                          {/* Investor Document Status Cells */}
                          {isFullyAllocated && opp.investors?.map((investor, invIdx) => {
                            const adminPayment = adminPayments.find(p => p.investor_id === investor.client_id);
                            const hasInvoice = !!adminPayment?.invoice_url;
                            const hasSwift = !!adminPayment?.swift_copy;
                            const hasReceipt = !!adminPayment?.receipt_url;
                            const isVerified = adminPayment?.swift_verified;
                            const isPending = hasSwift && !isVerified;
                            const receiptApproved = adminPayment?.receipt_approved;
                            const investorShare = investor.share_percentage || (100 / totalInvestors);
                            const investorAmount = adminFeeAmount * (investorShare / 100);
                            
                            const canUploadSwift = hasInvoice && !hasSwift;
                            const canUploadReceipt = hasSwift && isVerified && !hasReceipt;
                            
                            return (
                              <td key={invIdx} className="py-2 px-2 text-center border-l border-gray-100">
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="flex items-start gap-1">
                                    {/* 1. Invoice Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasInvoice ? (
                                        <>
                                          <span className="w-6 h-6 rounded bg-blue-100 text-blue-600 flex items-center justify-center"><Check className="h-3 w-3" /></span>
                                          <button className="text-[8px] text-blue-600 hover:text-blue-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${adminPayment.invoice_url}`, '_blank')}>View</button>
                                        </>
                                      ) : user?.role === 'broker' ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center" onClick={() => { setSelectedDldAdminInvestor({ ...investor, amount: investorAmount, feeType: 'admin' }); setDldAdminUploadType('invoice'); setShowDldAdminModal(true); }} title="Upload Invoice"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Invoice</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* 2. SWIFT Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasSwift ? (
                                        <>
                                          <span className={`w-6 h-6 rounded flex items-center justify-center ${isVerified ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {isVerified ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                          </span>
                                          <button className="text-[8px] text-teal-600 hover:text-teal-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${adminPayment.swift_copy}`, '_blank')}>View</button>
                                          {!isVerified && user?.role === 'broker' && (
                                            <button 
                                              className="text-[8px] text-green-600 hover:text-green-800 font-medium"
                                              onClick={async () => {
                                                try {
                                                  const token = localStorage.getItem("token");
                                                  await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/dld-admin/${investor.client_id}/verify-swift?fee_type=admin`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                                  fetchData();
                                                  toast.success("Admin SWIFT verified!");
                                                } catch (error) {
                                                  toast.error("Failed to verify");
                                                }
                                              }}
                                            >
                                              Verify
                                            </button>
                                          )}
                                        </>
                                      ) : canUploadSwift ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center" onClick={() => { setSelectedDldAdminInvestor({ ...investor, amount: investorAmount, feeType: 'admin' }); setDldAdminUploadType('swift'); setShowDldAdminModal(true); }} title="Upload SWIFT"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Upload</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {/* 3. Receipt Column */}
                                    <div className="flex flex-col items-center w-8">
                                      {hasReceipt ? (
                                        <>
                                          <span className={`w-6 h-6 rounded flex items-center justify-center ${receiptApproved ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                            {receiptApproved ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                          </span>
                                          <button className="text-[8px] text-purple-600 hover:text-purple-800 font-medium" onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${adminPayment.receipt_url}`, '_blank')}>View</button>
                                          {!receiptApproved && user?.role === 'broker' && (
                                            <button 
                                              className="text-[8px] text-green-600 hover:text-green-800 font-medium"
                                              onClick={async () => {
                                                try {
                                                  const token = localStorage.getItem("token");
                                                  await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opp.id}/dld-admin/${investor.client_id}/approve-receipt?fee_type=admin`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                                  fetchData();
                                                  toast.success("Admin Receipt approved!");
                                                } catch (error) {
                                                  toast.error("Failed to approve");
                                                }
                                              }}
                                            >
                                              Approve
                                            </button>
                                          )}
                                        </>
                                      ) : canUploadReceipt ? (
                                        <>
                                          <button className="w-6 h-6 rounded bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center" onClick={() => { setSelectedDldAdminInvestor({ ...investor, amount: investorAmount, feeType: 'admin' }); setDldAdminUploadType('receipt'); setShowDldAdminModal(true); }} title="Upload Receipt"><Upload className="h-3 w-3" /></button>
                                          <span className="text-[8px] text-gray-400">Upload</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-6 h-6 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-3 w-3" /></span>
                                          <span className="text-[8px] text-gray-400">Pending</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[9px] font-medium text-green-600">AED {formatCurrency(investorAmount)}</span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              
              {/* Footer Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <span className="font-medium text-gray-600">Legend:</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-100 text-green-600 flex items-center justify-center"><Check className="h-2 w-2" /></span>Uploaded/Verified</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-blue-500 text-white flex items-center justify-center"><Upload className="h-2 w-2" /></span>Upload</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-amber-100 text-amber-600 flex items-center justify-center"><Clock className="h-2 w-2" /></span>Pending Approval</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-gray-200 text-gray-400 flex items-center justify-center"><Clock className="h-2 w-2" /></span>Pending</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-orange-200 text-orange-700 flex items-center justify-center">D</span>DLD Fee</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-200 text-green-700 flex items-center justify-center">A</span>Admin Fee</span>
              </div>
            </div>
          )}

          {/* XIRR Comparison Report Section - Below Payments */}
          {isFullyAllocated && opp.investors && opp.investors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  XIRR Comparison Report
                  <span className="text-xs font-normal text-gray-500 ml-2">Projected vs Actual Currency Rates</span>
                </h2>
                <div className="flex items-center gap-2">
                  {(user?.role === 'broker' || user?.role === 'sub_broker') && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRecalculateStatus}
                      className="flex items-center gap-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      data-testid="recalculate-status-btn"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Fix Status
                    </Button>
                  )}
                  {user?.role === 'broker' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowCurrencySettingsModal(true)}
                      className={`flex items-center gap-2 ${currencyProjectionsMissing ? 'border-amber-400 bg-amber-50' : ''}`}
                    >
                      <Settings className="h-4 w-4" />
                      Currency Settings
                      {currencyProjectionsMissing && (
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                        </span>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Compare expected XIRR (based on projected currency rates) vs actual XIRR (based on actual transaction rates) for each investor.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {opp.investors.map((investor, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800">{investor.client_name || `Investor ${idx + 1}`}</span>
                      <Badge variant="outline">{investor.share_percentage || 25}%</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">Share: AED {formatCurrency(opp.total_cost * (investor.share_percentage || 25) / 100)}</p>
                    
                    {/* Passport Status */}
                    <div className="mb-3">
                      {investor.passport_details?.passport_number ? (
                        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Passport: {investor.passport_details.passport_number}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          <Clock className="h-3 w-3" />
                          <span>Passport details pending</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setSelectedInvestorForPassport(investor);
                          setShowPassportModal(true);
                        }}
                        data-testid={`passport-btn-${idx}`}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Passport
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setSelectedInvestorForXirr(investor);
                          setShowXirrComparisonModal(true);
                        }}
                      >
                        <BarChart3 className="h-4 w-4 mr-1" />
                        XIRR
                      </Button>
                    </div>
                    {/* Edit/Remove buttons for broker and sub_broker */}
                    {(user?.role === 'broker' || user?.role === 'sub_broker') && (
                      <div className="flex gap-2 mt-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => {
                            setSelectedInvestorForEdit(investor);
                            setShowEditInvestorModal(true);
                          }}
                          data-testid={`edit-investor-btn-${idx}`}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit %
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveInvestor(investor)}
                          data-testid={`remove-investor-btn-${idx}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
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

          {/* Share with Clients Section - Only for Broker/Sub-broker when property is NOT fully allocated */}
          {(user?.role === 'broker' || user?.role === 'sub_broker') && !isFullyAllocated && (
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

          {/* Current Investors Section - Visible when not fully allocated */}
          {(user?.role === 'broker' || user?.role === 'sub_broker') && !isFullyAllocated && opp.investors && opp.investors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  Tagged Investors ({opp.investors.length})
                </h2>
                <div className="text-sm text-gray-500">
                  {opp.invested_percentage?.toFixed(1) || 0}% allocated
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {opp.investors.map((investor, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800">{investor.client_name || `Investor ${idx + 1}`}</span>
                      <Badge variant="outline" className="text-blue-600">{investor.share_percentage || 25}%</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">
                      Investment: AED {formatCurrency(opp.total_cost * (investor.share_percentage || 25) / 100)}
                    </p>
                    
                    {/* Edit/Remove buttons */}
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => {
                          setSelectedInvestorForEdit(investor);
                          setShowEditInvestorModal(true);
                        }}
                        data-testid={`edit-investor-btn-${idx}`}
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit %
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemoveInvestor(investor)}
                        data-testid={`remove-investor-btn-${idx}`}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Oqood Upload Section - Only visible after first milestone is fully verified */}
          {canManageOqood && (
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
                {user?.role === 'client' 
                  ? "View the Oqood (property registration) document for this property."
                  : "Upload the Oqood (property registration) document for client reference."
                }
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
                    {user?.role !== 'client' && (
                      <Button size="sm" variant="outline" onClick={() => setShowOqoodUpload(true)}>
                        Replace
                      </Button>
                    )}
                  </div>
                </div>
              ) : user?.role !== 'client' ? (
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
              ) : (
                <div className="text-center py-6 bg-gray-50 rounded-lg">
                  <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No Oqood document uploaded yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Delete Property</h2>
            </div>
            
            <p className="text-gray-600 mb-2">
              Are you sure you want to delete <strong>{opp?.building_name}</strong>?
            </p>
            
            {opp?.investors?.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <p className="text-amber-800 text-sm">
                  <strong>Warning:</strong> This property has {opp.investors.length} investor(s). 
                  Deleting this will remove all investor records associated with it.
                </p>
              </div>
            )}
            
            <p className="text-sm text-gray-500 mb-4">
              This action cannot be undone.
            </p>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleDeleteOpportunity}
                disabled={deleting}
                data-testid="confirm-delete-btn"
              >
                {deleting ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete Property
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Unit Modal */}
      {showSellModal && (
        <SellUnitModal
          opportunity={opp}
          onClose={() => setShowSellModal(false)}
          onSuccess={() => {
            setShowSellModal(false);
            fetchData();
          }}
        />
      )}

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
          selectedInvestor={selectedPaymentMilestone.selectedInvestor}
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

      {/* Invoice Upload Modal */}
      {showInvoiceUploadModal && selectedInvoiceMilestone && (
        <InvoiceUploadModal
          opportunity={opp}
          milestone={selectedInvoiceMilestone.milestone}
          investor={selectedInvoiceMilestone.investor}
          amount={selectedInvoiceMilestone.amount}
          onClose={() => {
            setShowInvoiceUploadModal(false);
            setSelectedInvoiceMilestone(null);
          }}
          onSuccess={() => {
            setShowInvoiceUploadModal(false);
            setSelectedInvoiceMilestone(null);
            fetchData();
            toast.success("Invoice uploaded successfully!");
          }}
        />
      )}

      {/* Developer Receipt Upload Modal */}
      {showDeveloperReceiptModal && selectedPaymentForReceipt && (
        <DeveloperReceiptModal
          opportunity={opp}
          payment={selectedPaymentForReceipt.payment}
          investor={selectedPaymentForReceipt.investor}
          milestone={selectedPaymentForReceipt.milestone}
          onClose={() => {
            setShowDeveloperReceiptModal(false);
            setSelectedPaymentForReceipt(null);
          }}
          onSuccess={() => {
            setShowDeveloperReceiptModal(false);
            setSelectedPaymentForReceipt(null);
            fetchData();
            toast.success("Developer receipt uploaded successfully!");
          }}
        />
      )}
      
      {/* Currency Settings Modal */}
      {showCurrencySettingsModal && (
        <CurrencySettingsModal
          onClose={() => setShowCurrencySettingsModal(false)}
          onSuccess={() => {
            setCurrencyProjectionsMissing(false);
            toast.success("Currency settings updated!");
          }}
        />
      )}
      
      {/* XIRR Comparison Modal */}
      {showXirrComparisonModal && selectedInvestorForXirr && (
        <XirrComparisonModal
          opportunity={opp}
          investor={selectedInvestorForXirr}
          onClose={() => {
            setShowXirrComparisonModal(false);
            setSelectedInvestorForXirr(null);
          }}
        />
      )}
      
      {/* Passport Details Modal */}
      {showPassportModal && selectedInvestorForPassport && (
        <PassportDetailsModal
          opportunity={opp}
          investor={selectedInvestorForPassport}
          onClose={() => {
            setShowPassportModal(false);
            setSelectedInvestorForPassport(null);
          }}
          onSuccess={() => {
            setShowPassportModal(false);
            setSelectedInvestorForPassport(null);
            fetchData();
          }}
        />
      )}

      {/* Edit Investor Percentage Modal */}
      {showEditInvestorModal && selectedInvestorForEdit && (
        <EditInvestorPercentageModal
          opportunity={opp}
          investor={selectedInvestorForEdit}
          onClose={() => {
            setShowEditInvestorModal(false);
            setSelectedInvestorForEdit(null);
          }}
          onUpdate={handleUpdateInvestorPercentage}
        />
      )}

      {/* DLD + Admin Document Upload Modal */}
      {showDldAdminModal && selectedDldAdminInvestor && (
        <DldAdminUploadModal
          opportunity={opp}
          investor={selectedDldAdminInvestor.investor}
          uploadType={dldAdminUploadType}
          amounts={{
            dldFee: selectedDldAdminInvestor.dldFee,
            adminFee: selectedDldAdminInvestor.adminFee,
            total: selectedDldAdminInvestor.total
          }}
          onClose={() => {
            setShowDldAdminModal(false);
            setSelectedDldAdminInvestor(null);
            setDldAdminUploadType(null);
          }}
          onSuccess={() => {
            setShowDldAdminModal(false);
            setSelectedDldAdminInvestor(null);
            setDldAdminUploadType(null);
            fetchData();
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
function PaymentRecordModal({ opportunity, milestone, selectedInvestor, onClose, onSuccess }) {
  const [investorPayments, setInvestorPayments] = useState({});
  const [swiftFiles, setSwiftFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [additionalPayments, setAdditionalPayments] = useState([]); // For partial payments
  
  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);
  
  // Get existing payments for this milestone
  const existingPayments = opportunity.investor_payments?.filter(p => p.milestone_index === milestone.index) || [];
  
  // Calculate milestone totals
  const totalMilestoneAmount = opportunity.unit_price * milestone.percentage / 100;
  
  // If selectedInvestor is provided, only show that investor
  const investors = selectedInvestor 
    ? [selectedInvestor] 
    : (opportunity.investors || []);
  
  // Get investor's expected and recorded amounts
  const getInvestorData = (investor) => {
    const share = investor.share_percentage || (100 / (opportunity.investors?.length || 1));
    const expectedAmount = totalMilestoneAmount * (share / 100);
    const investorPayments = existingPayments.filter(p => p.investor_id === investor.client_id);
    const totalPaid = investorPayments.reduce((sum, p) => sum + (p.aed_amount || 0), 0);
    const latestPayment = investorPayments[investorPayments.length - 1];
    const isFullyPaid = totalPaid >= expectedAmount - 0.01;
    const remainingForInvestor = expectedAmount - totalPaid;
    
    const paymentData = investorPayments[investor.client_id] || {
      transfer_date: "",
      home_currency: "INR",
      home_currency_amount: "",
      aed_rate: "",
      aed_amount: "",
      notes: ""
    };
    return { share, expectedAmount, existingPayments: investorPayments, totalPaid, latestPayment, isFullyPaid, remainingForInvestor, paymentData };
  };
  
  // Handle input change for an investor
  const handleInvestorChange = (clientId, field, value) => {
    setInvestorPayments(prev => ({
      ...prev,
      [clientId]: {
        ...(prev[clientId] || { transfer_date: "", home_currency: "INR", home_currency_amount: "", aed_rate: "", aed_amount: "", notes: "" }),
        [field]: value
      }
    }));
  };
  
  // Handle file change for an investor
  const handleFileChange = (clientId, file) => {
    setSwiftFiles(prev => ({ ...prev, [clientId]: file }));
  };
  
  // Calculate effective rate (auto-derived from home currency and AED amounts)
  const getEffectiveRate = (paymentData) => {
    const homeAmt = parseFloat(paymentData.home_currency_amount) || 0;
    const aedAmt = parseFloat(paymentData.aed_amount) || 0;
    if (homeAmt > 0 && aedAmt > 0) {
      return (homeAmt / aedAmt).toFixed(4);
    }
    return "1";
  };
  
  // Add another payment entry for partial payments
  const addPartialPayment = (clientId) => {
    setAdditionalPayments(prev => [...prev, { 
      clientId, 
      id: Date.now(),
      transfer_date: "",
      home_currency: "INR",
      home_currency_amount: "",
      aed_rate: "",
      aed_amount: "",
      notes: ""
    }]);
  };
  
  // Update additional payment
  const updateAdditionalPayment = (paymentId, field, value) => {
    setAdditionalPayments(prev => prev.map(p => 
      p.id === paymentId ? { ...p, [field]: value } : p
    ));
  };
  
  // Remove additional payment
  const removeAdditionalPayment = (paymentId) => {
    setAdditionalPayments(prev => prev.filter(p => p.id !== paymentId));
  };
  
  // Submit all payments
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Collect all payments to record (main + additional)
    const allPaymentsToRecord = [];
    
    // Main payment entries
    investors.forEach(inv => {
      const data = getInvestorData(inv);
      const aedAmount = parseFloat(investorPayments[inv.client_id]?.aed_amount) || 0;
      if (!data.isFullyPaid && aedAmount > 0) {
        allPaymentsToRecord.push({
          investor: inv,
          paymentData: investorPayments[inv.client_id],
          swiftFile: swiftFiles[inv.client_id]
        });
      }
    });
    
    // Additional partial payments
    additionalPayments.forEach(ap => {
      const aedAmount = parseFloat(ap.aed_amount) || 0;
      if (aedAmount > 0) {
        const investor = investors.find(i => i.client_id === ap.clientId);
        if (investor) {
          allPaymentsToRecord.push({
            investor,
            paymentData: ap,
            swiftFile: null
          });
        }
      }
    });
    
    if (allPaymentsToRecord.length === 0) {
      toast.error("Please enter payment details (AED Amount)");
      return;
    }
    
    setLoading(true);
    const token = localStorage.getItem("token");
    const API = process.env.REACT_APP_BACKEND_URL;
    let successCount = 0;
    let errorCount = 0;
    let errors = [];
    
    // Process all payments sequentially
    for (const { investor, paymentData, swiftFile } of allPaymentsToRecord) {
      try {
        const submitData = new FormData();
        submitData.append('milestone_index', milestone.index);
        submitData.append('investor_id', investor.client_id);
        submitData.append('transfer_date', paymentData.transfer_date || new Date().toISOString().split('T')[0]);
        submitData.append('home_currency', paymentData.home_currency || 'AED');
        submitData.append('home_currency_amount', parseFloat(paymentData.home_currency_amount) || 0);
        submitData.append('aed_amount', parseFloat(paymentData.aed_amount) || 0);
        submitData.append('effective_rate', getEffectiveRate(paymentData) || 1);
        submitData.append('notes', paymentData.notes || '');
        
        if (swiftFile) {
          submitData.append('swift_copy', swiftFile);
        }
        
        await axios.post(
          `${API}/api/real-estate-opportunities/${opportunity.id}/investor-payment`,
          submitData,
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
        );
        successCount++;
      } catch (error) {
        errors.push(`${investor.client_name}: ${error.response?.data?.detail || error.message}`);
        errorCount++;
      }
    }
    
    setLoading(false);
    
    if (successCount > 0) {
      toast.success(`${successCount} payment(s) recorded!`);
      onSuccess();
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} payment(s) failed: ${errors.join(', ')}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              Record Payment - {milestone.description || `Payment ${milestone.index + 1}`}
            </h2>
            <p className="text-sm text-gray-500">{milestone.percentage}% • Due: {new Date(milestone.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          {/* Investor Payment Forms */}
          <div className="space-y-6">
            {investors.map((investor, idx) => {
              const { share, expectedAmount, existingPayments: prevPayments, totalPaid, isFullyPaid, remainingForInvestor, paymentData } = getInvestorData(investor);
              const investorAdditionalPayments = additionalPayments.filter(p => p.clientId === investor.client_id);
              const newPaymentAmount = parseFloat(investorPayments[investor.client_id]?.aed_amount) || 0;
              const additionalTotal = investorAdditionalPayments.reduce((sum, p) => sum + (parseFloat(p.aed_amount) || 0), 0);
              const totalEntered = totalPaid + newPaymentAmount + additionalTotal;
              const stillRemaining = expectedAmount - totalEntered;
              
              return (
                <div 
                  key={investor.client_id || idx} 
                  className={`rounded-xl border p-4 ${isFullyPaid ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
                >
                  {/* Investor Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        isFullyPaid ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {isFullyPaid ? <Check className="h-5 w-5" /> : idx + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{investor.client_name}</p>
                        <p className="text-sm text-gray-500">{share.toFixed(1)}% share</p>
                      </div>
                    </div>
                    {isFullyPaid && (
                      <Badge className="bg-green-100 text-green-700">✓ Fully Paid</Badge>
                    )}
                  </div>
                  
                  {/* Payment Summary */}
                  <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Expected</p>
                      <p className="font-bold text-gray-800">AED {formatCurrency(expectedAmount)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Paid</p>
                      <p className="font-bold text-green-600">AED {formatCurrency(totalPaid)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Remaining</p>
                      <p className={`font-bold ${stillRemaining <= 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                        AED {formatCurrency(Math.max(0, stillRemaining))}
                      </p>
                    </div>
                  </div>
                  
                  {/* Effective Rate Display - shown when home currency and AED amounts are entered */}
                  {investorPayments[investor.client_id]?.home_currency_amount && investorPayments[investor.client_id]?.aed_amount && parseFloat(investorPayments[investor.client_id]?.aed_amount) > 0 && (
                    <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-indigo-700 font-medium">Effective Rate</span>
                        <span className="text-lg font-bold text-indigo-600">
                          1 AED = {(parseFloat(investorPayments[investor.client_id]?.home_currency_amount) / parseFloat(investorPayments[investor.client_id]?.aed_amount)).toFixed(4)} {investorPayments[investor.client_id]?.home_currency || 'INR'}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Previous Payments List */}
                  {prevPayments.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-gray-600 mb-2">Previous Payments:</p>
                      <div className="space-y-2">
                        {prevPayments.map((p, pIdx) => (
                          <div key={pIdx} className="p-2 bg-green-50 rounded border border-green-100">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">{new Date(p.transfer_date).toLocaleDateString()}</span>
                              <span className="font-medium text-green-700">AED {formatCurrency(p.aed_amount)}</span>
                            </div>
                            {p.home_currency_amount && p.aed_amount && (
                              <div className="text-xs text-gray-500 mt-1">
                                Rate: 1 AED = {(parseFloat(p.home_currency_amount) / parseFloat(p.aed_amount)).toFixed(4)} {p.home_currency || 'INR'}
                              </div>
                            )}
                            {p.swift_copy_url && (
                              <button 
                                type="button"
                                className="text-xs text-teal-600 hover:text-teal-800 font-medium mt-1 flex items-center gap-1"
                                onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}${p.swift_copy_url}`, '_blank')}
                              >
                                <Eye className="h-3 w-3" /> View SWIFT
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* New Payment Form */}
                  {!isFullyPaid && (
                    <>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Transfer Date *</Label>
                            <Input
                              type="date"
                              value={investorPayments[investor.client_id]?.transfer_date || ""}
                              onChange={(e) => handleInvestorChange(investor.client_id, 'transfer_date', e.target.value)}
                              className="mt-1"
                              required
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Currency</Label>
                            <select
                              className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
                              value={investorPayments[investor.client_id]?.home_currency || "INR"}
                              onChange={(e) => handleInvestorChange(investor.client_id, 'home_currency', e.target.value)}
                            >
                              <option value="INR">INR</option>
                              <option value="USD">USD</option>
                              <option value="AED">AED</option>
                              <option value="EUR">EUR</option>
                              <option value="GBP">GBP</option>
                            </select>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Home Currency Amount</Label>
                            <Input
                              type="number"
                              placeholder="Amount in home currency"
                              value={investorPayments[investor.client_id]?.home_currency_amount || ""}
                              onChange={(e) => handleInvestorChange(investor.client_id, 'home_currency_amount', e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">AED Amount *</Label>
                            <Input
                              type="number"
                              placeholder="Amount in AED"
                              value={investorPayments[investor.client_id]?.aed_amount || ""}
                              onChange={(e) => handleInvestorChange(investor.client_id, 'aed_amount', e.target.value)}
                              className="mt-1"
                              required
                            />
                          </div>
                        </div>
                        
                        {/* Effective Rate - Auto Calculated (shown in SWIFT upload section) */}
                        {investorPayments[investor.client_id]?.home_currency_amount && investorPayments[investor.client_id]?.aed_amount && parseFloat(investorPayments[investor.client_id]?.aed_amount) > 0 && (
                          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-indigo-700 font-medium">Effective Rate</span>
                              <span className="text-lg font-bold text-indigo-600">
                                1 AED = {(parseFloat(investorPayments[investor.client_id]?.home_currency_amount) / parseFloat(investorPayments[investor.client_id]?.aed_amount)).toFixed(4)} {investorPayments[investor.client_id]?.home_currency || 'INR'}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <Label className="text-xs">SWIFT Copy</Label>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleFileChange(investor.client_id, e.target.files[0])}
                            className="mt-1"
                          />
                        </div>
                        
                        <div>
                          <Label className="text-xs">Notes</Label>
                          <Input
                            placeholder="Optional notes"
                            value={investorPayments[investor.client_id]?.notes || ""}
                            onChange={(e) => handleInvestorChange(investor.client_id, 'notes', e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      
                      {/* Additional Partial Payments */}
                      {investorAdditionalPayments.map((ap, apIdx) => (
                        <div key={ap.id} className="mt-4 p-3 border border-dashed border-gray-300 rounded-lg">
                          <div className="flex justify-between items-center mb-3">
                            <p className="text-sm font-medium text-gray-600">Additional Payment #{apIdx + 2}</p>
                            <button 
                              type="button"
                              onClick={() => removeAdditionalPayment(ap.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Transfer Date</Label>
                              <Input
                                type="date"
                                value={ap.transfer_date}
                                onChange={(e) => updateAdditionalPayment(ap.id, 'transfer_date', e.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">AED Amount</Label>
                              <Input
                                type="number"
                                placeholder="Amount in AED"
                                value={ap.aed_amount}
                                onChange={(e) => updateAdditionalPayment(ap.id, 'aed_amount', e.target.value)}
                                className="mt-1"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Add Another Payment Button */}
                      {stillRemaining > 0.01 && (
                        <button
                          type="button"
                          onClick={() => addPartialPayment(investor.client_id)}
                          className="mt-4 w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center gap-2"
                        >
                          <Plus className="h-4 w-4" /> Add Another Payment Entry
                        </button>
                      )}
                      
                      {/* Total Progress */}
                      {(newPaymentAmount > 0 || additionalTotal > 0) && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">New payment(s) total:</span>
                            <span className="font-bold text-blue-600">AED {formatCurrency(newPaymentAmount + additionalTotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm mt-1">
                            <span className="text-gray-600">After submission:</span>
                            <span className={`font-bold ${stillRemaining <= 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                              {stillRemaining <= 0.01 ? '✓ Fully Paid' : `AED ${formatCurrency(stillRemaining)} remaining`}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Submit Button */}
          <div className="mt-6 flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700">
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


// Invoice Upload Modal Component
function InvoiceUploadModal({ opportunity, milestone, investor, amount, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(milestone.date?.split('T')[0] || "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select an invoice file to upload");
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const API = process.env.REACT_APP_BACKEND_URL;
      
      const formData = new FormData();
      formData.append('milestone_index', milestone.index);
      formData.append('investor_id', investor.client_id);
      formData.append('invoice_number', invoiceNumber);
      formData.append('invoice_date', invoiceDate);
      formData.append('due_date', dueDate);
      formData.append('notes', notes);
      formData.append('invoice_file', file);
      
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/upload-invoice`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to upload invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Upload Invoice
            </h2>
            <p className="text-sm text-gray-500">{milestone.description || `Payment ${milestone.index + 1}`} • {milestone.percentage}%</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Investor and Amount Info */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Invoice For:</p>
                <p className="font-semibold text-gray-800">{investor.client_name}</p>
                <p className="text-xs text-gray-500">{investor.share_percentage?.toFixed(1)}% share</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-600 font-medium">Amount Due:</p>
                <p className="font-bold text-xl text-gray-800">AED {formatCurrency(amount)}</p>
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g., INV-001"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Invoice Date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-xs">Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Notes (Optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes for the investor"
              className="mt-1"
            />
          </div>
          
          {/* File Upload */}
          <div>
            <Label className="text-xs">Invoice Document *</Label>
            {file ? (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border mt-1">
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
              <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 mt-1">
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-gray-600 text-sm">Click to upload invoice</span>
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
              {loading ? "Uploading..." : "Send Invoice"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Developer Receipt Upload Modal Component
function DeveloperReceiptModal({ opportunity, payment, investor, milestone, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0 }).format(amt || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a receipt file to upload");
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const API = process.env.REACT_APP_BACKEND_URL;
      
      const formData = new FormData();
      formData.append('milestone_index', milestone.index);
      formData.append('payment_id', payment.id);
      formData.append('receipt_number', receiptNumber);
      formData.append('receipt_date', receiptDate);
      formData.append('notes', notes);
      formData.append('receipt_file', file);
      
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/upload-developer-receipt`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to upload receipt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              Upload Developer Receipt
            </h2>
            <p className="text-sm text-gray-500">{milestone.description || `Payment ${milestone.index + 1}`} • {milestone.percentage}%</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Payment Info */}
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Receipt For:</p>
                <p className="font-semibold text-gray-800">{investor.client_name}</p>
                <p className="text-xs text-gray-500">{investor.share_percentage?.toFixed(1)}% share</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-purple-600 font-medium">Payment Amount:</p>
                <p className="font-bold text-xl text-gray-800">AED {formatCurrency(payment.aed_amount)}</p>
                <p className="text-xs text-gray-500">Paid on {new Date(payment.transfer_date).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Receipt Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Receipt Number</Label>
              <Input
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="e.g., RCP-001"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Receipt Date</Label>
              <Input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes (Optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about the receipt"
              className="mt-1"
            />
          </div>
          
          {/* File Upload */}
          <div>
            <Label className="text-xs">Developer Receipt Document *</Label>
            {file ? (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border mt-1">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-purple-600" />
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
              <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 mt-1">
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-gray-600 text-sm">Click to upload developer receipt</span>
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
            <Button type="submit" disabled={loading || !file} className="flex-1 bg-purple-600 hover:bg-purple-700">
              {loading ? "Uploading..." : "Upload Receipt"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Currency Settings Modal Component
function CurrencySettingsModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [projections, setProjections] = useState([]);
  const [currencyPairs, setCurrencyPairs] = useState([{ from: "INR", to: "AED" }]);
  const currentYear = new Date().getFullYear();
  
  // Available currency options
  const currencies = ["INR", "USD", "EUR", "GBP", "SGD", "AUD", "CAD", "CHF", "JPY"];
  
  useEffect(() => {
    fetchProjections();
  }, []);
  
  const fetchProjections = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/settings/currency-projections`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.projections && response.data.projections.length > 0) {
        setProjections(response.data.projections);
        // Extract unique currency pairs
        const pairs = [...new Set(response.data.projections.map(p => p.currency))].map(c => ({ from: c, to: "AED" }));
        if (pairs.length > 0) setCurrencyPairs(pairs);
      } else {
        initializeDefaults();
      }
    } catch (error) {
      console.error("Error fetching projections:", error);
      initializeDefaults();
    }
  };
  
  const initializeDefaults = () => {
    const defaults = [];
    for (let i = 0; i < 6; i++) {
      defaults.push({ year: currentYear + i, currency: "INR", projected_rate: 22.5 });
    }
    setProjections(defaults);
  };
  
  const updateProjection = (index, field, value) => {
    const updated = [...projections];
    updated[index] = { ...updated[index], [field]: field === 'projected_rate' || field === 'year' ? parseFloat(value) || 0 : value };
    setProjections(updated);
  };
  
  const addYear = () => {
    const lastYear = projections.length > 0 ? projections[projections.length - 1].year : currentYear - 1;
    // Add for all currency pairs
    currencyPairs.forEach(pair => {
      setProjections(prev => [...prev, { year: lastYear + 1, currency: pair.from, projected_rate: 22.5 }]);
    });
  };
  
  const addCurrencyPair = () => {
    // Find a currency not yet added
    const usedCurrencies = currencyPairs.map(p => p.from);
    const availableCurrency = currencies.find(c => !usedCurrencies.includes(c)) || "USD";
    setCurrencyPairs([...currencyPairs, { from: availableCurrency, to: "AED" }]);
    
    // Add projections for this new currency for all existing years
    const years = [...new Set(projections.map(p => p.year))];
    const newProjections = years.map(year => ({ year, currency: availableCurrency, projected_rate: availableCurrency === "USD" ? 3.67 : availableCurrency === "EUR" ? 4.0 : 22.5 }));
    setProjections([...projections, ...newProjections]);
  };
  
  const removeCurrencyPair = (index) => {
    const pairToRemove = currencyPairs[index];
    setCurrencyPairs(currencyPairs.filter((_, i) => i !== index));
    setProjections(projections.filter(p => p.currency !== pairToRemove.from));
  };
  
  const removeYear = (index) => {
    setProjections(projections.filter((_, i) => i !== index));
  };
  
  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/settings/currency-projections`,
        { projections },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Currency projections saved!");
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save projections");
    } finally {
      setLoading(false);
    }
  };
  
  // Group projections by currency for display
  const groupedProjections = currencyPairs.map(pair => ({
    currency: pair.from,
    projections: projections.filter(p => p.currency === pair.from).sort((a, b) => a.year - b.year)
  }));
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="h-5 w-5 text-indigo-600" />
              Currency Rate Projections
            </h2>
            <p className="text-sm text-gray-500">Set projected exchange rates for XIRR calculations</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
            <strong>Note:</strong> These projected rates are used for XIRR calculations. 
            Rate format: 1 AED = X [Currency]
          </div>
          
          {/* Currency Pairs with Add button */}
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-700">Currency Pairs</h3>
            <button
              type="button"
              onClick={addCurrencyPair}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
            >
              <Plus className="h-4 w-4" /> Add Currency
            </button>
          </div>
          
          {/* Currency Pair Pills */}
          <div className="flex flex-wrap gap-2">
            {currencyPairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full text-sm">
                <span className="font-medium">{pair.from}</span>
                <span className="text-gray-400">→</span>
                <span>AED</span>
                {currencyPairs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCurrencyPair(idx)}
                    className="ml-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          
          {/* Projections by Currency */}
          {groupedProjections.map((group, gIdx) => (
            <div key={gIdx} className="border rounded-lg p-3 space-y-3">
              <h4 className="font-medium text-gray-700 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">{group.currency}</span>
                to AED Rates
              </h4>
              
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
                <div className="col-span-4">Year</div>
                <div className="col-span-6">Rate (1 AED = X {group.currency})</div>
                <div className="col-span-2"></div>
              </div>
              
              {group.projections.map((proj, idx) => {
                const globalIdx = projections.findIndex(p => p.year === proj.year && p.currency === proj.currency);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Input
                        type="number"
                        value={proj.year}
                        onChange={(e) => updateProjection(globalIdx, 'year', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="col-span-6">
                      <Input
                        type="number"
                        step="0.0001"
                        value={proj.projected_rate}
                        onChange={(e) => updateProjection(globalIdx, 'projected_rate', e.target.value)}
                        placeholder="e.g., 22.5"
                        className="text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <button 
                        type="button" 
                        onClick={() => removeYear(globalIdx)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          
          <button
            type="button"
            onClick={addYear}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" /> Add Year (All Currencies)
          </button>
          
          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
              {loading ? "Saving..." : "Save Projections"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// XIRR Comparison Report Modal Component
function XirrComparisonModal({ opportunity, investor, onClose }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [currentRate, setCurrentRate] = useState(null);
  
  useEffect(() => {
    if (investor?.client_id) {
      fetchReport();
    }
  }, [investor]);
  
  // Fetch current rate after report is loaded (to know the currency)
  useEffect(() => {
    if (report?.investor?.currency) {
      fetchCurrentRate(report.investor.currency);
    }
  }, [report]);
  
  const fetchCurrentRate = async (targetCurrency) => {
    try {
      // Default rates for common currencies (AED to X)
      const defaultRates = {
        'INR': 22.5,
        'EUR': 0.25,
        'USD': 0.27,
        'GBP': 0.21
      };
      
      if (targetCurrency === 'INR') {
        // Use our existing forex API for INR
        const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/forex/aed-to-inr`);
        if (response.data?.rate) {
          setCurrentRate(response.data.rate);
          return;
        }
      }
      
      // Try to fetch from free currency API for other currencies
      try {
        const response = await axios.get(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/aed.json`);
        if (response.data?.aed) {
          const currencyKey = targetCurrency.toLowerCase();
          if (response.data.aed[currencyKey]) {
            setCurrentRate(response.data.aed[currencyKey]);
            return;
          }
        }
      } catch (apiErr) {
        console.error("Currency API error:", apiErr);
      }
      
      // Fallback to default rates
      setCurrentRate(defaultRates[targetCurrency] || 22.5);
    } catch (err) {
      console.error("Error fetching current rate:", err);
      setCurrentRate(22.5); // Fallback default
    }
  };
  
  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/real-estate-opportunities/${opportunity.id}/xirr-comparison/${investor.client_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReport(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load report");
      console.error("Error fetching XIRR comparison:", err);
    } finally {
      setLoading(false);
    }
  };
  
  const exportToPDF = async () => {
    if (!report) return;
    
    // Get the report content element
    const reportElement = document.getElementById('xirr-report-content');
    if (!reportElement) {
      toast.error("Unable to generate PDF");
      return;
    }
    
    toast.info("Generating PDF...");
    
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      
      const opt = {
        margin: [5, 5, 5, 5],
        filename: `XIRR_Report_${report.opportunity.building_name.replace(/\s+/g, '_')}_${report.investor.name.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
          scale: 1.5,
          useCORS: true,
          logging: false,
          letterRendering: true,
          scrollY: 0
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a3', 
          orientation: 'landscape' 
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
      
      await html2pdf().set(opt).from(reportElement).save();
      toast.success("PDF exported successfully!");
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Failed to export PDF");
    }
  };
  
  const formatCurrency = (val) => {
    if (val === null || val === undefined) return '0';
    return val.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
      <div className="bg-white rounded-xl w-full max-w-[95vw] max-h-[95vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b p-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              XIRR Comparison Report
            </h2>
            <p className="text-sm text-gray-500">{investor?.client_name || 'Investor'} - {investor?.share_percentage || 25}% Share</p>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <Button variant="outline" size="sm" onClick={exportToPDF}>
                <Download className="h-4 w-4 mr-2" /> Export PDF
              </Button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
          </div>
        </div>
        
        <div className="p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-gray-600">Loading report...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">
              <p>{error}</p>
              <Button variant="outline" onClick={fetchReport} className="mt-4">Retry</Button>
            </div>
          ) : report ? (
            <div id="xirr-report-content" className="bg-white">
              {/* Two Column Layout - Left: Info, Right: Cashflow */}
              <div className="flex gap-4">
                {/* LEFT COLUMN - Property Info & Summary */}
                <div className="w-[320px] flex-shrink-0 space-y-3">
                  {/* Property Details Card */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-3 border border-indigo-100">
                    <h3 className="font-semibold text-gray-800 text-sm mb-2 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                      Property Details
                    </h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Building:</span>
                        <span className="font-medium text-gray-800">{report.opportunity.building_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Unit:</span>
                        <span className="font-medium">{report.opportunity.unit_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Unit Price:</span>
                        <span className="font-medium">AED {report.opportunity.unit_price?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Investor Details Card */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-3 border border-emerald-100">
                    <h3 className="font-semibold text-gray-800 text-sm mb-2 flex items-center gap-2">
                      <User className="h-4 w-4 text-emerald-600" />
                      Investor Details
                    </h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Name:</span>
                        <span className="font-medium text-gray-800">{report.investor.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Share:</span>
                        <span className="font-medium">{report.investor.share_percentage}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Currency:</span>
                        <span className="font-medium">{report.investor.currency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Investment:</span>
                        <span className="font-medium text-emerald-700">AED {formatCurrency(report.summary.total_investment_aed)}</span>
                      </div>
                    </div>
                  </div>

                  {/* XIRR Summary Cards */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-indigo-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-indigo-600 font-medium">Expected XIRR</p>
                      <p className="text-lg font-bold text-indigo-800">
                        {report.summary.xirr_projected !== null ? `${report.summary.xirr_projected.toFixed(1)}%` : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-emerald-600 font-medium">Actual XIRR</p>
                      <p className="text-lg font-bold text-emerald-800">
                        {report.summary.xirr_actual !== null ? `${report.summary.xirr_actual.toFixed(1)}%` : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Currency Impact */}
                  {(() => {
                    const hasActualPayments = report.cashflows_actual?.some(cf => cf.is_paid === true);
                    if (!hasActualPayments || !currentRate) {
                      return (
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-[10px] text-gray-500 font-medium">Currency Impact</p>
                          <p className="text-lg font-bold text-gray-400">-</p>
                          <p className="text-[10px] text-gray-400">No payments yet</p>
                        </div>
                      );
                    }
                    const todayTotal = report.summary.total_investment_aed * currentRate;
                    const currencyImpact = report.summary.total_projected_home_currency - report.summary.total_actual_home_currency + todayTotal;
                    const isPositive = currencyImpact >= 0;
                    return (
                      <div className={`rounded-lg p-2 text-center ${isPositive ? 'bg-green-50' : 'bg-red-50'}`}>
                        <p className="text-[10px] text-gray-600 font-medium">Currency Impact</p>
                        <p className={`text-lg font-bold ${isPositive ? 'text-green-800' : 'text-red-800'}`}>
                          {isPositive ? '+' : ''}{report.investor.currency} {formatCurrency(Math.abs(currencyImpact))}
                        </p>
                        <p className="text-[10px] text-gray-500">Projected - Actual + Today</p>
                      </div>
                    );
                  })()}

                  {/* Investment Totals */}
                  <div className="bg-gray-50 rounded-lg p-3 border">
                    <h4 className="text-xs font-semibold text-gray-700 mb-2">Investment Summary</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total AED:</span>
                        <span className="font-mono font-medium">AED {formatCurrency(report.summary.total_investment_aed)}</span>
                      </div>
                      <div className="flex justify-between text-indigo-700">
                        <span>Projected {report.investor.currency}:</span>
                        <span className="font-mono font-medium">{formatCurrency(report.summary.total_projected_home_currency)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Actual {report.investor.currency}:</span>
                        <span className="font-mono font-medium">{formatCurrency(report.summary.total_actual_home_currency)}</span>
                      </div>
                      {currentRate && (
                        <div className="flex justify-between text-purple-700 pt-1 border-t">
                          <span>Today's {report.investor.currency}:</span>
                          <span className="font-mono font-medium">{formatCurrency(report.summary.total_investment_aed * currentRate)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Current Rate Info */}
                  {currentRate && (
                    <div className="text-center text-[10px] text-gray-500 bg-gray-100 rounded py-1">
                      Today's Rate: 1 AED = {currentRate.toFixed(2)} {report.investor.currency}
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN - Cashflow Table */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 text-sm mb-2">Cashflow Comparison</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-[10px]">
                      {/* Grouped Header Row 1 */}
                      <thead>
                        <tr className="bg-gray-800 text-white">
                          <th colSpan="3" className="p-1.5 text-center font-semibold border-r border-gray-600">Details</th>
                          <th colSpan="2" className="p-1.5 text-center font-semibold border-r border-gray-600 bg-indigo-700">Projected</th>
                          <th colSpan="2" className="p-1.5 text-center font-semibold border-r border-gray-600 bg-emerald-700">Actuals</th>
                          <th colSpan="2" className="p-1.5 text-center font-semibold border-r border-gray-600 bg-purple-700">Today</th>
                          <th className="p-1.5 text-center font-semibold">Status</th>
                        </tr>
                        {/* Sub Header Row */}
                        <tr className="bg-gray-100 text-gray-700">
                          <th className="p-1.5 text-left font-medium">Date</th>
                          <th className="p-1.5 text-left font-medium">Description</th>
                          <th className="p-1.5 text-right font-medium border-r border-gray-300">AED</th>
                          <th className="p-1.5 text-right font-medium text-indigo-700">Rate</th>
                          <th className="p-1.5 text-right font-medium text-indigo-700 border-r border-gray-300">{report.investor.currency}</th>
                          <th className="p-1.5 text-right font-medium text-emerald-700">Rate</th>
                          <th className="p-1.5 text-right font-medium text-emerald-700 border-r border-gray-300">{report.investor.currency}</th>
                          <th className="p-1.5 text-right font-medium text-purple-700">Rate</th>
                          <th className="p-1.5 text-right font-medium text-purple-700 border-r border-gray-300">{report.investor.currency}</th>
                          <th className="p-1.5 text-center font-medium">-</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.cashflows_projected.map((cf, idx) => {
                          const actualCf = report.cashflows_actual[idx];
                          const currentAmount = currentRate ? Math.abs(cf.aed_amount) * currentRate : null;
                          return (
                            <tr key={idx} className={`border-t ${cf.type === 'inflow' ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                              <td className="p-1.5 text-gray-600 whitespace-nowrap">{cf.date || '-'}</td>
                              <td className="p-1.5 font-medium text-gray-800 whitespace-nowrap">{cf.description}</td>
                              <td className="p-1.5 text-right font-mono border-r border-gray-200 whitespace-nowrap">{cf.type === 'outflow' ? '-' : '+'}{formatCurrency(cf.aed_amount)}</td>
                              <td className="p-1.5 text-right text-indigo-600 font-mono whitespace-nowrap">{cf.projected_rate.toFixed(2)}</td>
                              <td className="p-1.5 text-right text-indigo-700 font-mono font-medium border-r border-gray-200 whitespace-nowrap">{formatCurrency(cf.home_currency_amount)}</td>
                              <td className="p-1.5 text-right text-emerald-600 font-mono whitespace-nowrap">{actualCf?.actual_rate?.toFixed(2) || '-'}</td>
                              <td className="p-1.5 text-right text-emerald-700 font-mono font-medium border-r border-gray-200 whitespace-nowrap">{actualCf ? formatCurrency(actualCf.home_currency_amount) : '-'}</td>
                              <td className="p-1.5 text-right text-purple-600 font-mono whitespace-nowrap">{currentRate?.toFixed(2) || '-'}</td>
                              <td className="p-1.5 text-right text-purple-700 font-mono font-medium border-r border-gray-200 whitespace-nowrap">{currentAmount ? formatCurrency(currentAmount) : '-'}</td>
                              <td className="p-1.5 text-center">
                                {actualCf?.is_paid ? (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-100 text-green-700">Paid</span>
                                ) : cf.type === 'inflow' ? (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-blue-100 text-blue-700">Expected</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-100 text-amber-700">Pending</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Totals Row */}
                      <tfoot className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                        <tr>
                          <td colSpan="2" className="p-1.5 text-right text-gray-700 text-[10px]">TOTAL</td>
                          <td className="p-1.5 text-right font-mono border-r border-gray-300">AED {formatCurrency(report.summary.total_investment_aed)}</td>
                          <td className="p-1.5"></td>
                          <td className="p-1.5 text-right text-indigo-700 font-mono border-r border-gray-300">{formatCurrency(report.summary.total_projected_home_currency)}</td>
                          <td className="p-1.5"></td>
                          <td className="p-1.5 text-right text-emerald-700 font-mono border-r border-gray-300">{formatCurrency(report.summary.total_actual_home_currency)}</td>
                          <td className="p-1.5"></td>
                          <td className="p-1.5 text-right text-purple-700 font-mono border-r border-gray-300">{currentRate ? formatCurrency(report.summary.total_investment_aed * currentRate) : '-'}</td>
                          <td className="p-1.5"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
              {/* End Two Column Layout */}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}


// Passport Details Modal Component
function PassportDetailsModal({ opportunity, investor, onClose, onSuccess }) {
  const [passportNumber, setPassportNumber] = useState(investor?.passport_details?.passport_number || '');
  const [dateOfIssue, setDateOfIssue] = useState(investor?.passport_details?.date_of_issue || '');
  const [dateOfExpiry, setDateOfExpiry] = useState(investor?.passport_details?.date_of_expiry || '');
  const [placeOfIssue, setPlaceOfIssue] = useState(investor?.passport_details?.place_of_issue || '');
  const [countryOfIssue, setCountryOfIssue] = useState(investor?.passport_details?.country_of_issue || '');
  const [addressOnPassport, setAddressOnPassport] = useState(investor?.passport_details?.address_on_passport || '');
  const [passportFile, setPassportFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const token = localStorage.getItem("token");
      
      // Save passport details
      await axios.post(
        `${API}/real-estate-opportunities/${opportunity.id}/investor/${investor.id}/passport`,
        {
          passport_number: passportNumber,
          date_of_issue: dateOfIssue,
          date_of_expiry: dateOfExpiry,
          place_of_issue: placeOfIssue,
          country_of_issue: countryOfIssue,
          address_on_passport: addressOnPassport
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Upload passport document if selected
      if (passportFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', passportFile);
        
        await axios.post(
          `${API}/real-estate-opportunities/${opportunity.id}/investor/${investor.id}/passport-upload`,
          formData,
          { 
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            } 
          }
        );
      }
      
      toast.success("Passport details saved successfully");
      onSuccess();
    } catch (error) {
      console.error("Error saving passport details:", error);
      toast.error(error.response?.data?.detail || "Failed to save passport details");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const handleDownloadPassport = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API}/real-estate-opportunities/${opportunity.id}/investor/${investor.id}/passport-download`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', investor?.passport_document?.filename || 'passport.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error("Failed to download passport document");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
          <div>
            <h2 className="text-lg font-semibold text-indigo-900">Passport Details</h2>
            <p className="text-sm text-indigo-600">{investor?.client_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Passport Number *</Label>
              <Input
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value.toUpperCase())}
                placeholder="Enter passport number"
                required
                data-testid="passport-number-input"
              />
            </div>
            
            <div>
              <Label>Date of Issue *</Label>
              <Input
                type="date"
                value={dateOfIssue}
                onChange={(e) => setDateOfIssue(e.target.value)}
                required
                data-testid="passport-issue-date-input"
              />
            </div>
            
            <div>
              <Label>Date of Expiry *</Label>
              <Input
                type="date"
                value={dateOfExpiry}
                onChange={(e) => setDateOfExpiry(e.target.value)}
                required
                data-testid="passport-expiry-date-input"
              />
            </div>
            
            <div>
              <Label>Place of Issue</Label>
              <Input
                value={placeOfIssue}
                onChange={(e) => setPlaceOfIssue(e.target.value)}
                placeholder="City/State"
                data-testid="passport-place-input"
              />
            </div>
            
            <div>
              <Label>Country of Issue *</Label>
              <Input
                value={countryOfIssue}
                onChange={(e) => setCountryOfIssue(e.target.value)}
                placeholder="e.g., India, UAE"
                required
                data-testid="passport-country-input"
              />
            </div>
            
            <div className="col-span-2">
              <Label>Address on Passport</Label>
              <Textarea
                value={addressOnPassport}
                onChange={(e) => setAddressOnPassport(e.target.value)}
                placeholder="Full address as printed on passport"
                rows={3}
                data-testid="passport-address-input"
              />
            </div>
            
            {/* Passport Upload */}
            <div className="col-span-2">
              <Label>Upload Passport Copy</Label>
              <div className="mt-1 flex items-center gap-3">
                <label className="flex-1 cursor-pointer">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-indigo-400 transition-colors">
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <Upload className="h-5 w-5" />
                      <span className="text-sm">
                        {passportFile ? passportFile.name : 'Click to upload PDF or image'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setPassportFile(e.target.files[0])}
                    data-testid="passport-file-input"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">Accepted: PDF, JPG, PNG (Max 10MB)</p>
              
              {/* Show existing passport document */}
              {investor?.passport_document && (
                <div className="mt-2 flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700 flex-1">{investor.passport_document.filename}</span>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={handleDownloadPassport}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button 
              type="submit" 
              disabled={loading || uploading} 
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              data-testid="save-passport-btn"
            >
              {loading ? "Saving..." : uploading ? "Uploading..." : "Save Details"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Edit Investor Percentage Modal
function EditInvestorPercentageModal({ opportunity, investor, onClose, onUpdate }) {
  const [newPercentage, setNewPercentage] = useState(investor?.share_percentage || 25);
  const [loading, setLoading] = useState(false);

  // Calculate other investors total
  const otherInvestorsTotal = (opportunity?.investors || [])
    .filter(inv => inv.client_id !== investor.client_id)
    .reduce((sum, inv) => sum + (inv.share_percentage || 0), 0);
  
  const maxAvailable = 100 - otherInvestorsTotal;
  const newAmount = opportunity?.total_cost ? (opportunity.total_cost * newPercentage / 100) : 0;

  const formatCurrency = (amt) => new Intl.NumberFormat("en-AE", { minimumFractionDigits: 0 }).format(amt || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPercentage < 1 || newPercentage > maxAvailable) {
      return;
    }
    setLoading(true);
    await onUpdate(investor.client_id, newPercentage);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Edit Investor Share</h2>
            <p className="text-sm text-gray-500">{investor?.client_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-600">Current Share</p>
            <p className="text-2xl font-bold text-blue-800">{investor?.share_percentage || 25}%</p>
            <p className="text-sm text-blue-600">AED {formatCurrency(opportunity?.total_cost * (investor?.share_percentage || 25) / 100)}</p>
          </div>

          <div>
            <Label>New Percentage *</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.1"
                min="1"
                max={maxAvailable}
                value={newPercentage}
                onChange={(e) => setNewPercentage(parseFloat(e.target.value) || 0)}
                className="flex-1"
                data-testid="new-percentage-input"
              />
              <span className="text-gray-500">%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Max available: {maxAvailable.toFixed(1)}%</p>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-green-600">New Investment Amount</p>
            <p className="text-2xl font-bold text-green-800">AED {formatCurrency(newAmount)}</p>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button 
              type="submit" 
              disabled={loading || newPercentage < 1 || newPercentage > maxAvailable} 
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              data-testid="update-percentage-btn"
            >
              {loading ? "Updating..." : "Update Share"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// DLD + Admin Document Upload Modal
function DldAdminUploadModal({ opportunity, investor, uploadType, amounts, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const API = process.env.REACT_APP_BACKEND_URL;

  const uploadLabels = {
    invoice: { title: 'Upload DLD + Admin Invoice', description: 'Upload the invoice for DLD and Admin fees' },
    swift: { title: 'Upload SWIFT Copy', description: 'Upload the SWIFT/payment proof for DLD + Admin fees' },
    receipt: { title: 'Upload Receipt', description: 'Upload the receipt from DLD/Admin after payment' }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', uploadType);

      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/dld-admin/${investor.client_id}/upload`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );

      toast.success(`${uploadLabels[uploadType].title.replace('Upload ', '')} uploaded successfully!`);
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to upload document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-orange-50 to-green-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{uploadLabels[uploadType]?.title}</h2>
            <p className="text-sm text-gray-500">{investor?.client_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Amount Summary */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-orange-600">DLD Fee</span>
              <span className="font-medium">AED {amounts?.dldFee?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-600">Admin Fee</span>
              <span className="font-medium">AED {amounts?.adminFee?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t pt-2">
              <span>Total</span>
              <span>AED {amounts?.total?.toLocaleString()}</span>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <Label>{uploadLabels[uploadType]?.description}</Label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files[0])}
              className="mt-2"
              data-testid="dld-admin-file-input"
            />
            {file && (
              <p className="text-sm text-green-600 mt-1">Selected: {file.name}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={loading || !file}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              data-testid="upload-dld-admin-btn"
            >
              {loading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Sell Unit Modal - For closing fully funded opportunities
function SellUnitModal({ opportunity, onClose, onSuccess }) {
  const [saleDate, setSaleDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const API = process.env.REACT_APP_BACKEND_URL;

  // Auto-populate selling fee % from opportunity data
  const sellingFeePercentage = opportunity?.unit_selling_fee_percentage || opportunity?.selling_fee_percentage || 0;
  
  // Format currency helper
  const formatCurrency = (amt) => new Intl.NumberFormat('en-AE').format(Math.round(amt || 0));

  // Calculate XIRR for the sale (reusing the same logic)
  const calculateSaleXIRR = () => {
    if (!opportunity || !opportunity.unit_price || !opportunity.payment_schedule || !saleDate || !salePrice) {
      return null;
    }
    
    const sortedSchedule = [...opportunity.payment_schedule]
      .filter(p => p.date && p.percentage)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (sortedSchedule.length === 0) return null;

    const cashFlows = [];
    const unitPrice = opportunity.unit_price;
    const dldFee = opportunity.dld_fee || 0;
    const adminFee = opportunity.admin_fee || 0;
    const upfrontFees = dldFee + adminFee;
    
    // For sold properties, assume 100% paid (fully invested)
    let totalPaidTowardsUnit = 0;
    let isFirstPayment = true;
    
    sortedSchedule.forEach(milestone => {
      const pct = parseFloat(milestone.percentage) || 0;
      const paymentAmount = unitPrice * pct / 100;
      totalPaidTowardsUnit += paymentAmount;
      
      const totalOutflow = isFirstPayment ? paymentAmount + upfrontFees : paymentAmount;
      
      cashFlows.push({ 
        date: new Date(milestone.date), 
        amount: -totalOutflow,
        description: isFirstPayment ? `${milestone.description || 'Booking'} + DLD + Admin` : (milestone.description || `Payment`),
        percentage: pct,
        isOutflow: true
      });
      isFirstPayment = false;
    });

    // Calculate sale proceeds using actual sale price
    const grossSaleValue = parseFloat(salePrice);
    const sellingFee = grossSaleValue * sellingFeePercentage / 100;
    
    // Outstanding amount = 0 for fully invested properties
    const outstandingAmount = 0;
    
    // Net proceeds = Gross Sale - Selling Fee
    const netSaleProceeds = grossSaleValue - sellingFee;
    
    cashFlows.push({ 
      date: new Date(saleDate), 
      amount: netSaleProceeds,
      description: 'Sale Proceeds (Net)',
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

    return {
      xirr,
      totalInvested: totalPaidTowardsUnit + upfrontFees,
      unitPricePaid: totalPaidTowardsUnit,
      upfrontFees,
      dldFee,
      adminFee,
      grossSaleValue,
      sellingFee,
      outstandingAmount,
      netSaleProceeds,
      netProfit: netSaleProceeds - (totalPaidTowardsUnit + upfrontFees)
    };
  };

  const xirrResult = calculateSaleXIRR();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!saleDate || !salePrice) {
      toast.error("Please fill in sale date and sale price");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/api/real-estate-opportunities/${opportunity.id}/sell`,
        {
          sale_date: saleDate,
          sale_price: parseFloat(salePrice),
          brokerage_fee: xirrResult?.sellingFee || 0,
          selling_fee_percentage: sellingFeePercentage,
          net_proceeds: xirrResult?.netSaleProceeds || parseFloat(salePrice),
          total_invested: xirrResult?.totalInvested || 0,
          net_profit: xirrResult?.netProfit || 0,
          xirr: xirrResult?.xirr || 0,
          notes: notes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Unit sold successfully! Status changed to Closed.");
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record sale");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-emerald-50 to-green-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Sell Unit
            </h2>
            <p className="text-sm text-gray-500">{opportunity?.building_name} - Unit {opportunity?.unit_no}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Property Summary */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-gray-500 text-xs">Purchase Price</span>
                <p className="font-semibold text-gray-800">AED {formatCurrency(opportunity?.unit_price)}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Total Area</span>
                <p className="font-semibold text-gray-800">{opportunity?.total_area?.toLocaleString()} sqft</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Selling Fee</span>
                <p className="font-semibold text-gray-800">{sellingFeePercentage}%</p>
              </div>
            </div>
          </div>

          {/* Sale Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="saleDate">Sale Date *</Label>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                required
                className="mt-1"
                data-testid="sale-date-input"
              />
            </div>
            <div>
              <Label htmlFor="salePrice">Sale Price (AED) *</Label>
              <Input
                id="salePrice"
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="e.g., 4500000"
                required
                className="mt-1"
                data-testid="sale-price-input"
              />
              {salePrice && opportunity?.total_area && (
                <p className="text-xs text-gray-500 mt-1">
                  Rate: AED {formatCurrency(parseFloat(salePrice) / opportunity.total_area)}/sqft
                </p>
              )}
            </div>
          </div>

          {/* XIRR Returns Preview - Shown when sale price entered */}
          {xirrResult && (
            <div className="bg-gray-50 rounded-xl p-4 border" data-testid="xirr-preview">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Projected Returns</h4>
              
              {/* Investment Section */}
              <div className="space-y-1 mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Investment (Outflows)</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Unit Price Paid (100%)</span>
                  <span className="text-red-600 font-medium">-AED {formatCurrency(xirrResult.unitPricePaid)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">DLD + Admin (Upfront)</span>
                  <span className="text-red-600 font-medium">-AED {formatCurrency(xirrResult.upfrontFees)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                  <span className="text-gray-800">Total Invested</span>
                  <span className="text-red-600">-AED {formatCurrency(xirrResult.totalInvested)}</span>
                </div>
              </div>
              
              {/* Sale Proceeds Section */}
              <div className="space-y-1 mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Proceeds (Inflow)</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Gross Sale ({opportunity?.total_area?.toLocaleString()} sqft)</span>
                  <span className="text-gray-800">AED {formatCurrency(xirrResult.grossSaleValue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Less: Selling Fee ({sellingFeePercentage}%)</span>
                  <span className="text-red-600">-AED {formatCurrency(xirrResult.sellingFee)}</span>
                </div>
                {xirrResult.outstandingAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Less: Outstanding</span>
                    <span className="text-red-600">-AED {formatCurrency(xirrResult.outstandingAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold border-t pt-1 mt-1">
                  <span className="text-gray-800">Net Proceeds</span>
                  <span className="text-gray-800">+AED {formatCurrency(xirrResult.netSaleProceeds)}</span>
                </div>
              </div>
              
              {/* Net Profit */}
              <div className="bg-white rounded-lg p-3 border flex justify-between items-center mb-3">
                <span className="font-semibold text-gray-800">Net Profit</span>
                <span className={`text-xl font-bold ${xirrResult.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  AED {formatCurrency(Math.abs(xirrResult.netProfit))}
                  {xirrResult.netProfit < 0 && ' (Loss)'}
                </span>
              </div>
              
              {/* Expected XIRR */}
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <p className="text-xs text-blue-600 uppercase tracking-wider mb-1">Expected XIRR</p>
                <p className={`text-3xl font-bold ${xirrResult.xirr >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {xirrResult.xirr !== null ? `${xirrResult.xirr.toFixed(2)}%` : 'N/A'}
                </p>
                <p className="text-xs text-blue-500">Annualized return</p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about the sale..."
              rows={2}
              className="mt-1"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !saleDate || !salePrice}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              data-testid="confirm-sell-btn"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirm Sale
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
