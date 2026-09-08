import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import CreateRealEstateModal from "@/components/CreateRealEstateModal";
import CreateNCDModal from "@/components/CreateNCDModal";
import HorizontalPaymentTimeline from "@/components/HorizontalPaymentTimeline";
import ClientKYCModal from "@/components/ClientKYCModal";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, MapPin, TrendingUp, Plus, Pencil, Share2, Eye, Users, Lock, Download, X, Calculator, Trash2, Heart, UserCheck, Coins, TrendingDown, ChevronDown, ChevronLeft, ChevronRight, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// XIRR Calculation Function
const calculateXIRR = (cashflows) => {
  // cashflows is array of {date: Date, amount: number} where negative = outflow, positive = inflow
  if (!cashflows || cashflows.length < 2) return null;
  
  // Need at least one positive and one negative cashflow
  const hasPositive = cashflows.some(cf => cf.amount > 0);
  const hasNegative = cashflows.some(cf => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;
  
  const daysBetween = (d1, d2) => (d2 - d1) / (1000 * 60 * 60 * 24);
  const firstDate = cashflows[0].date;
  
  // Newton-Raphson method to find XIRR
  let rate = 0.1; // Initial guess 10%
  
  for (let iteration = 0; iteration < 100; iteration++) {
    let npv = 0;
    let dnpv = 0;
    
    for (const cf of cashflows) {
      const years = daysBetween(firstDate, cf.date) / 365;
      const factor = Math.pow(1 + rate, years);
      npv += cf.amount / factor;
      dnpv -= (years * cf.amount) / (factor * (1 + rate));
    }
    
    if (Math.abs(npv) < 0.0001) {
      return Math.round(rate * 10000) / 100; // Return as percentage with 2 decimals
    }
    
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < 0.0001) {
      return Math.round(newRate * 10000) / 100;
    }
    rate = newRate;
    
    // Prevent extreme values
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }
  
  return Math.round(rate * 10000) / 100;
};

// Unified Real-Estate XIRR — same logic as View Details > XIRR Calculator so
// the value shown on the card matches what's rendered inside when opening the
// modal with default Sale Settings (estimated_sell_date / expected_sale_rate /
// eligible_to_sell_after_percentage).
//
// Logic rules (mirrors RealEstateDetails.calculateXIRRWithParams):
//  * Base price is `unit_price` (NOT total_cost)
//  * `saleStagePercent` defaults to `eligible_to_sell_after_percentage` (or 100)
//  * Payments on/after the sale date are NOT paid; the unpaid portion is
//    treated as "outstanding" and deducted from gross sale proceeds
//  * Payments up to saleStagePercent are paid in full; a milestone crossing
//    the stage is partially counted
//  * First included payment date carries DLD + Admin fees
//  * Sale proceeds = (saleRate * total_area) − sellingFee − outstanding
const _buildRealEstateXirrCashflows = (opp, saleStagePercent, saleDateStr, saleRatePerSqft) => {
  if (!opp || !opp.unit_price || !opp.payment_schedule || opp.payment_schedule.length === 0) return null;
  if (!saleRatePerSqft || !opp.total_area || !saleDateStr) return null;

  const sortedSchedule = [...opp.payment_schedule]
    .filter(p => p.date && p.percentage)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sortedSchedule.length === 0) return null;

  const cashFlows = [];
  const unitPrice = opp.unit_price;
  const upfrontFees = (opp.dld_fee || 0) + (opp.admin_fee || 0);
  const saleDate = new Date(saleDateStr);

  // 1) DLD + Admin fees — paid up-front at booking. Always included as a
  //    separate, dated outflow so they cannot be accidentally dropped.
  if (upfrontFees > 0) {
    const firstDate = new Date(sortedSchedule[0].date);
    cashFlows.push({
      date: firstDate,
      amount: -upfrontFees,
      description: `DLD Fee + Admin Fee (₹${(opp.dld_fee || 0).toLocaleString()} + ₹${(opp.admin_fee || 0).toLocaleString()})`,
      type: 'outflow',
    });
  }

  let totalPaidTowardsUnit = 0;
  let cumulativePercent = 0;

  sortedSchedule.forEach(milestone => {
    const pct = parseFloat(milestone.percentage) || 0;
    const prevCumulative = cumulativePercent;
    const milestoneDate = new Date(milestone.date);

    if (milestoneDate >= saleDate) {
      // Milestone falls on/after sale — treat as outstanding
      cumulativePercent += pct;
      return;
    }

    cumulativePercent += pct;
    if (prevCumulative < saleStagePercent) {
      let effectivePct = pct;
      if (cumulativePercent > saleStagePercent) {
        effectivePct = saleStagePercent - prevCumulative;
      }
      const paymentAmount = unitPrice * effectivePct / 100;
      totalPaidTowardsUnit += paymentAmount;

      cashFlows.push({
        date: milestoneDate,
        amount: -paymentAmount,
        description: milestone.description || `Payment (${effectivePct}%)`,
        percentage: effectivePct,
        type: 'outflow',
      });
    }
  });

  if (cashFlows.length === 0) return null;

  const grossSaleValue = parseFloat(saleRatePerSqft) * opp.total_area;
  const sellingFee = grossSaleValue * (opp.unit_selling_fee_percentage || 0) / 100;
  const outstandingAmount = Math.max(0, unitPrice - totalPaidTowardsUnit);
  const netSaleProceeds = grossSaleValue - sellingFee - outstandingAmount;

  cashFlows.push({
    date: saleDate,
    amount: netSaleProceeds,
    description: 'Sale Proceeds (Net)',
    grossSale: grossSaleValue,
    sellingFee,
    outstandingDeducted: outstandingAmount,
    type: 'inflow',
  });

  cashFlows.sort((a, b) => a.date - b.date);
  return { cashFlows, totalPaidTowardsUnit, upfrontFees, grossSaleValue, sellingFee, outstandingAmount, netSaleProceeds };
};

// Find the cumulative payment-schedule percentage paid up to (and including)
// the **last installment before "on completion"**.
//
//  * The final milestone of a Real_Estate_Master payment schedule is
//    typically tagged "on completion" / "completion" / "handover" /
//    "possession". That portion is paid only when the asset is handed over
//    at the end of the build cycle — it is NOT paid by an investor who sells
//    before completion.
//  * This function therefore returns the cumulative % of every milestone
//    that appears before such a row (date-sorted).
//  * If no completion row is tagged, falls back to the total cumulative %.
//
// Example — Hyde Residences apt 2001 has "60% On Completion". The
// pre-completion cumulative is 40%, so XIRR is computed at saleStage = 40%.
const getPreHandoverSaleStage = (opp) => {
  const schedule = (opp?.payment_schedule || [])
    .filter(p => p.date && p.percentage)
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (schedule.length === 0) return 100;

  const isCompletion = (m) => {
    const label = `${m.description || ''} ${m.name || ''} ${m.milestone || ''}`.toLowerCase();
    return (
      label.includes('on completion') ||
      label.includes('completion') ||
      label.includes('handover') ||
      label.includes('hand-over') ||
      label.includes('possession')
    );
  };

  let cumulative = 0;
  let preCompletionCumulative = null;
  for (const m of schedule) {
    const pct = parseFloat(m.percentage) || 0;
    if (isCompletion(m)) {
      preCompletionCumulative = cumulative; // percent BEFORE the completion row
      break;
    }
    cumulative += pct;
  }

  if (preCompletionCumulative === null) {
    // No explicit completion row → fall back to total cumulative (often 100%)
    return cumulative || 100;
  }
  return preCompletionCumulative || 100;
};

// Calculate Expected XIRR for a property (used on the Opportunities card)
const calculatePropertyXIRR = (opp) => {
  if (!opp) return null;
  const saleStage = getPreHandoverSaleStage(opp);
  const built = _buildRealEstateXirrCashflows(opp, saleStage, opp.estimated_sell_date, opp.expected_sale_rate);
  if (!built) return null;
  return calculateXIRR(built.cashFlows.map(cf => ({ date: cf.date, amount: cf.amount })));
};

// Get detailed cashflows for XIRR calculation display (modal popup from the card)
const getXirrCashflowsBreakdown = (opp) => {
  if (!opp) return null;
  const saleStage = getPreHandoverSaleStage(opp);
  const built = _buildRealEstateXirrCashflows(opp, saleStage, opp.estimated_sell_date, opp.expected_sale_rate);
  if (!built) return null;
  const xirr = calculateXIRR(built.cashFlows.map(cf => ({ date: cf.date, amount: cf.amount })));

  return {
    property: opp.building_name,
    unit: opp.unit_no,
    cashflows: built.cashFlows,
    xirr,
    saleStagePercent: saleStage,
    totalOutflow: built.cashFlows.filter(cf => cf.amount < 0).reduce((sum, cf) => sum + Math.abs(cf.amount), 0),
    totalInflow: built.cashFlows.filter(cf => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0),
  };
};

export default function Opportunities() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [realEstateOpps, setRealEstateOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRealEstateModal, setShowRealEstateModal] = useState(false);
  const [showNCDModal, setShowNCDModal] = useState(false);
  const [editingBond, setEditingBond] = useState(null);
  const [editingRealEstate, setEditingRealEstate] = useState(null);
  const [clientInvestments, setClientInvestments] = useState([]); // Track which properties client has invested in
  const [xirrModalData, setXirrModalData] = useState(null); // For XIRR calculation popup
  const [interestModal, setInterestModal] = useState(null); // For client interest modal {type: 'bond'/'real_estate', opportunity: {...}}
  
  // Client profile state for KYC and passport info
  const [clientProfile, setClientProfile] = useState(null);
  const [kycStatus, setKycStatus] = useState(null);
  const [requestingKyc, setRequestingKyc] = useState(false);
  const [showKycModal, setShowKycModal] = useState(false);
  
  // Currency state for payment schedule display
  const [selectedCurrency, setSelectedCurrency] = useState("AED");
  const [currencyRates, setCurrencyRates] = useState({ 
    AED: 1, INR: 24.72, USD: 0.27, EUR: 0.25, GBP: 0.21, SGD: 0.36,
    CNY: 1.97, JPY: 40.5, CHF: 0.24, CAD: 0.37, AUD: 0.42, HKD: 2.12,
    SAR: 1.02, KWD: 0.083, QAR: 0.99, BHD: 0.10, OMR: 0.10
  });
  const [projectedRates, setProjectedRates] = useState(null);
  const [loadingRates, setLoadingRates] = useState(false);
  
  // Scroll refs for arrow navigation
  const availableREScrollRef = useRef(null);
  const availableBondsScrollRef = useRef(null);
  const fundedREScrollRef = useRef(null);
  const fundedBondsScrollRef = useRef(null);
  const closedREScrollRef = useRef(null);
  const closedBondsScrollRef = useRef(null);
  
  // Scroll handler for arrow buttons
  const handleScroll = (ref, direction) => {
    if (ref.current) {
      const scrollAmount = 400; // Scroll by one card width approximately
      ref.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };
  
  // Share percentage for payment calculations - same options as View Details
  const presetPercentages = [12.5, 25, 37.5, 50];
  const [selectedSharePercent, setSelectedSharePercent] = useState(25);
  const [customShareInput, setCustomShareInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  
  // Permission checks
  const canCreateBond = hasPermission("opportunities_bonds", "create");
  const canEditBond = hasPermission("opportunities_bonds", "edit");
  const canDeleteBond = hasPermission("opportunities_bonds", "delete");
  const canCreateRealEstate = hasPermission("opportunities_real_estate", "create");
  const canEditRealEstate = hasPermission("opportunities_real_estate", "edit");
  const canDeleteRealEstate = hasPermission("opportunities_real_estate", "delete");

  // Set page title
  useEffect(() => {
    document.title = "Kinntegraa | Opportunities";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchData(parsedUser);
  }, [navigate]);

  const fetchData = async (currentUser) => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [bondsRes, realEstateRes] = await Promise.all([
        axios.get(`${API}/bonds`, { headers }).catch(() => ({ data: { data: [], pagination: {} } })),
        axios.get(`${API}/real-estate-opportunities`, { headers }).catch(() => ({ data: { data: [], pagination: {} } }))
      ]);
      
      // Handle both old format (array) and new paginated format (object with data property)
      const bondsData = Array.isArray(bondsRes.data) 
        ? bondsRes.data 
        : (bondsRes.data?.data || []);
      setBonds(bondsData);
      
      const realEstateData = Array.isArray(realEstateRes.data) 
        ? realEstateRes.data 
        : (realEstateRes.data?.data || []);
      setRealEstateOpps(realEstateData);
      
      // For clients, fetch profile (for passport type, KYC status) and investments
      if (currentUser?.role === 'client') {
        try {
          // Fetch client profile for KYC status and passport info
          const profileRes = await axios.get(`${API}/client/profile`, { headers });
          setClientProfile(profileRes.data?.client);
          setKycStatus(profileRes.data?.kyc_status);
          
          // Fetch investments
          if (currentUser?.client_id) {
            const investmentsRes = await axios.get(`${API}/holdings/client/${currentUser.client_id}`, { headers });
            const investedPropertyIds = (investmentsRes.data?.real_estate_holdings || []).map(h => h.property_id);
            setClientInvestments(investedPropertyIds);
          }
        } catch (err) {
          console.error("Error fetching client profile:", err);
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  // Fetch projected currency rates when currency changes
  const fetchProjectedRates = async (currency) => {
    if (currency === "AED") {
      setCurrencyRates({ AED: 1 });
      setProjectedRates(null);
      return;
    }
    
    setLoadingRates(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/currency/projected-rates`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { target: currency, years_ahead: 5 }
      });
      
      if (response.data) {
        setCurrencyRates(prev => ({ ...prev, [currency]: response.data.current_rate }));
        setProjectedRates(response.data);
      }
    } catch (error) {
      console.error("Error fetching projected rates:", error);
      // Use default rates
      const defaults = { 
        INR: 24.72, USD: 0.27, EUR: 0.25, GBP: 0.21, SGD: 0.36,
        CNY: 1.97, JPY: 40.5, CHF: 0.24, CAD: 0.37, AUD: 0.42, HKD: 2.12,
        SAR: 1.02, KWD: 0.083, QAR: 0.99, BHD: 0.10, OMR: 0.10
      };
      setCurrencyRates(prev => ({ ...prev, [currency]: defaults[currency] || 1 }));
    } finally {
      setLoadingRates(false);
    }
  };

  // Handle currency change
  const handleCurrencyChange = (currency) => {
    setSelectedCurrency(currency);
    fetchProjectedRates(currency);
  };

  // Handle custom share input
  const handleCustomShareSubmit = () => {
    const value = parseFloat(customShareInput);
    if (value > 0 && value <= 100) {
      setSelectedSharePercent(value);
      setShowCustomInput(false);
      setCustomShareInput('');
    } else {
      toast.error("Please enter a valid percentage between 0 and 100");
    }
  };

  // Check if user has detailed access to a property
  // All logged-in users (broker, sub_broker, client) can see full opportunity details
  const hasDetailedAccess = (propertyId) => {
    if (!user) return false;
    // All authenticated users can view full opportunity details
    return true;
  };

  // Share functionality for sub-brokers
  const handleShare = (item, type) => {
    let shareText = "";
    if (type === 'bond') {
      shareText = `Investment Opportunity: ${item.name}\n\nPrincipal: ₹${item.principal_amount?.toLocaleString()}\nIRR: ${item.secondary_irr}%\nUnits Available: ${(item.total_units || 1) - (item.units_sold || 0)}\n\nView details and calculate returns on our NCD platform!`;
    } else {
      shareText = `Real Estate Opportunity: ${item.building_name}\n\nUnit: ${item.unit_no}\nPrice: ${item.total_cost ? `AED ${item.total_cost.toLocaleString()}` : 'Contact for details'}\nType: ${item.unit_type || 'N/A'}\n\nView details!`;
    }
    
    if (navigator.share) {
      navigator.share({ title: item.name || item.building_name, text: shareText }).catch(() => {
        navigator.clipboard.writeText(shareText);
        toast.success("Details copied to clipboard!");
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success("Details copied to clipboard!");
    }
  };

  // Delete NCD functionality for broker
  const handleDeleteBond = async (bondId) => {
    if (!window.confirm("Are you sure you want to delete this NCD? This action cannot be undone.")) {
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/bonds/${bondId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("NCD deleted successfully");
      // Refresh the bonds list
      const response = await axios.get(`${API}/bonds`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBonds(response.data.data || []);
    } catch (error) {
      console.error("Error deleting NCD:", error);
      toast.error(error.response?.data?.detail || "Failed to delete NCD");
    }
  };

  // Handle client interest submission
  const handleInterestSubmit = async (e) => {
    e.preventDefault();
    if (!interestModal) return;
    
    const formData = new FormData(e.target);
    const amount = formData.get('amount');
    const percentage = formData.get('percentage');
    
    if (interestModal.type === 'bond' && (!amount || parseFloat(amount) <= 0)) {
      toast.error("Please enter a valid investment amount");
      return;
    }
    
    if (interestModal.type === 'real_estate' && (!percentage || parseFloat(percentage) <= 0 || parseFloat(percentage) > 100)) {
      toast.error("Please enter a valid percentage (1-100)");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/leads`, {
        opportunity_type: interestModal.type,
        opportunity_id: interestModal.opportunity.id,
        investment_amount: interestModal.type === 'bond' ? parseFloat(amount.replace(/,/g, '')) : null,
        interest_percentage: interestModal.type === 'real_estate' ? parseFloat(percentage) : null,
        notes: formData.get('notes') || ''
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Your interest has been recorded! A representative will contact you soon.");
      setInterestModal(null);
      // Refresh data to update interested count
      fetchData(user);
    } catch (error) {
      console.error("Error submitting interest:", error);
      toast.error(error.response?.data?.detail || "Failed to submit interest");
    }
  };

  // Handle KYC completion request
  const handleRequestKycCompletion = async () => {
    setRequestingKyc(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API}/client/request-kyc-completion`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("KYC completion request sent to your broker. They will contact you shortly.");
    } catch (error) {
      console.error("Error requesting KYC:", error);
      toast.error(error.response?.data?.detail || "Failed to send KYC request");
    } finally {
      setRequestingKyc(false);
    }
  };

  // Check if client can see NCD opportunities
  // Indian passport + Indian residency = Both RE & NCD
  // Foreign passport = Only RE
  const canSeeNcdOpportunities = () => {
    if (user?.role !== 'client') return true; // Brokers and sub-brokers see all
    if (!clientProfile) return true; // Loading state, show all
    
    const passportType = clientProfile?.passport_type?.toLowerCase();
    const residency = clientProfile?.country_of_residency?.toLowerCase() || '';
    
    // Indian passport AND Indian residency = can see NCDs
    if (passportType === 'indian' && residency === 'india') {
      return true;
    }
    
    // Foreign passport = cannot see NCDs (only RE)
    return false;
  };

  // Check if KYC is complete
  const isKycComplete = () => {
    if (user?.role !== 'client') return true; // Not applicable for non-clients
    return kycStatus?.complete === true;
  };

  // Filter bonds based on passport type for clients
  const filteredBonds = canSeeNcdOpportunities() ? bonds : [];

  // Categorize by status
  const availableBonds = filteredBonds.filter(b => b.status === 'available');
  const fundedBonds = filteredBonds.filter(b => b.status === 'funded');
  const closedBonds = filteredBonds.filter(b => b.status === 'closed');

  // Real Estate: available OR partially_invested should show in "Open" section
  const availableRE = realEstateOpps.filter(r => r.status === 'available' || r.status === 'partially_invested');
  const investedRE = realEstateOpps.filter(r => r.status === 'fully_invested');
  const closedRE = realEstateOpps.filter(r => r.status === 'closed' || r.status === 'sold');

  // Combined counts
  const availableCount = availableBonds.length + availableRE.length;
  const fundedCount = fundedBonds.length + investedRE.length;
  const closedCount = closedBonds.length + closedRE.length;

  const formatCurrency = (amount, currency = 'INR') => {
    if (currency === 'AED') {
      return `AED ${new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0)}`;
    }
    return `₹${(amount || 0).toLocaleString()}`;
  };

  const getDetailPath = (type, id) => {
    const prefix = user?.role === 'broker' ? '/broker' : user?.role === 'sub_broker' ? '/sub-broker' : '/client';
    if (type === 'bond') return `/bonds/${id}`;
    return `${prefix}/real-estate/${id}`;
  };

  // NCD Card - Same layout for all roles (matching Real Estate card style)
  const BondCard = ({ bond, status }) => {
    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
    const daysToMaturity = Math.ceil((new Date(bond.end_date) - new Date()) / (1000 * 60 * 60 * 24));
    const isBroker = user?.role === 'broker';
    const isSubBroker = user?.role === 'sub_broker';
    const isClient = user?.role === 'client';
    
    // Face value per unit
    const faceValue = bond.face_value || (bond.principal_amount / (bond.total_units || 1));
    
    // Calculate today's price per unit using secondary IRR
    // Price = NPV of remaining cashflows discounted at secondary IRR
    // Uses cutoff_days logic: payments are included when the record date
    // (payment_date - cutoff_days) is on or after today. Investors on the
    // register on the record date itself still receive that payment.
    const calculateTodayPrice = () => {
      // Use date-only (no time component) to match backend calculator
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const secondaryIRR = (bond.secondary_irr || bond.primary_irr || 12) / 100; // Annual rate
      const cutoffDays = bond.cutoff_days ?? 15; // Default 15 days cutoff, use ?? to handle 0
      
      // If bond has cashflows_per_unit, use those with cutoff logic
      if (bond.cashflows_per_unit && bond.cashflows_per_unit.length > 0) {
        let npv = 0;
        for (const cf of bond.cashflows_per_unit) {
          const cfDateStr = cf.date.split('T')[0].split(' ')[0];
          const cfDate = new Date(cfDateStr + 'T00:00:00');
          
          // Calculate record date (cutoff_days BEFORE payment date)
          const recordDate = new Date(cfDate);
          recordDate.setDate(recordDate.getDate() - cutoffDays);
          
          // Include cashflow only if the record date has NOT yet strictly
          // passed today. Investors on the register on the record date
          // itself still receive that payment, so `recordDate >= today`
          // must include the payment (matches backend
          // `calculate_secondary_market_price_and_units` at server.py:11461).
          if (recordDate >= today) {
            const daysFromToday = Math.floor((cfDate - today) / (1000 * 60 * 60 * 24));
            const yearsToPayment = daysFromToday / 365;
            const totalCashflow = (cf.interest_per_unit || cf.interest || 0) + (cf.principal_per_unit || cf.principal || 0);
            // Discount formula: CF / (1 + IRR)^years
            npv += totalCashflow / Math.pow(1 + secondaryIRR, yearsToPayment);
          }
        }
        return npv > 0 ? npv : faceValue;
      }
      
      // Fallback: Simple calculation based on remaining time and IRR
      // Price = Face Value / (1 + IRR)^years_remaining
      const maturityDate = new Date(bond.end_date);
      if (maturityDate <= today) return faceValue; // Already matured
      
      const yearsToMaturity = (maturityDate - today) / (1000 * 60 * 60 * 24 * 365);
      
      // Estimate remaining interest payments
      const couponRate = (bond.coupon_rate || 0) / 100;
      const annualInterest = faceValue * couponRate;
      
      // NPV of remaining interest + principal at maturity
      let npv = 0;
      const paymentsPerYear = bond.interest_payment_frequency === 'monthly' ? 12 : 
                              bond.interest_payment_frequency === 'quarterly' ? 4 : 
                              bond.interest_payment_frequency === 'semi-annual' ? 2 : 1;
      
      const paymentAmount = annualInterest / paymentsPerYear;
      const totalPayments = Math.ceil(yearsToMaturity * paymentsPerYear);
      
      for (let i = 1; i <= totalPayments; i++) {
        const yearsToPayment = i / paymentsPerYear;
        // Include the payment when the record date has not yet strictly
        // passed today: (days_to_payment - cutoffDays) >= 0. This is the
        // same inclusive boundary the backend uses (`record_date >= today`).
        if (yearsToPayment * 365 >= cutoffDays) { // Apply cutoff (inclusive boundary)
          npv += paymentAmount / Math.pow(1 + secondaryIRR, yearsToPayment);
        }
      }
      
      // Add principal at maturity
      npv += faceValue / Math.pow(1 + secondaryIRR, yearsToMaturity);
      
      return npv > 0 ? npv : faceValue;
    };
    
    const todayPrice = calculateTodayPrice();
    
    // Get today's date string for display (matches calculation date)
    const todayDateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    
    // Calculate maturity date display
    const maturityDate = new Date(bond.end_date);
    const startDate = new Date(bond.start_date);

    return (
      <div className="bg-white border border-gray-200 rounded-lg hover:border-etihad-gold-500 transition-colors flex flex-col h-full">
        {/* Card Content - Removed image/presentation section */}
        <div className="p-5 flex-1 flex flex-col">
        
        {/* Header - NCD Name */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-etihad-gold-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-etihad-gold-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{bond.name}</h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="bg-etihad-gold-100 text-etihad-gold-700 hover:bg-etihad-gold-100">NCD</Badge>
            {status === 'available' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Open</span>
            )}
            {status === 'closed' && (
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">Matured</span>
            )}
          </div>
        </div>

        {/* Deal ID + Expected IRR - One Line */}
        <div className="bg-slate-50 rounded-lg p-3 mb-4 flex justify-between items-center">
          <div>
            <p className="text-xs text-gray-500 mb-1">Deal ID</p>
            <p className="font-semibold text-slate-700">{bond.bond_code}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Expected IRR</p>
            <p className="font-semibold text-green-700">{bond.secondary_irr || bond.primary_irr}%</p>
          </div>
        </div>

        {/* Price/Unit OR Repayment Count - Full Width */}
        {(status === 'funded' || status === 'closed') && bond.total_cashflows_count > 0 ? (() => {
          const repaid = bond.repaid_cashflows_count || 0;
          const expected = bond.total_cashflows_count;
          const ratio = expected > 0 ? repaid / expected : 0;
          // Color + width tier: under < 50% red, 50-99% amber, 100% green,
          // > 100% (prepayment overshoot) indigo. Bar caps at 100% width with
          // a small "prepaid" badge so the width still represents completion.
          const tier =
            ratio > 1   ? 'overshoot' :
            ratio >= 1  ? 'done'      :
            ratio >= 0.5 ? 'mid'       :
            ratio > 0   ? 'low'       : 'zero';
          const palette = {
            overshoot: { wrap: 'bg-indigo-50',  label: 'text-indigo-700', bar: 'bg-indigo-500' },
            done:      { wrap: 'bg-emerald-50', label: 'text-emerald-700', bar: 'bg-emerald-500' },
            mid:       { wrap: 'bg-amber-50',   label: 'text-amber-700',  bar: 'bg-amber-500' },
            low:       { wrap: 'bg-rose-50',    label: 'text-rose-700',   bar: 'bg-rose-500' },
            zero:      { wrap: 'bg-gray-50',    label: 'text-gray-600',   bar: 'bg-gray-400' },
          }[tier];
          const barWidth = Math.min(100, Math.max(0, ratio * 100));
          return (
            <div className={`${palette.wrap} rounded-lg p-3 mb-4`} data-testid="repayment-progress">
              <p className="text-xs text-gray-500 mb-1">Repayment Progress</p>
              <div className="flex items-center gap-2">
                <p className={`font-semibold ${palette.label} text-lg whitespace-nowrap`}>
                  {repaid} / {expected} Repaid
                </p>
                {tier === 'overshoot' && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded"
                    title={`Received ${repaid - expected} more than originally expected (prepayments)`}
                    data-testid="prepaid-badge"
                  >
                    +{repaid - expected} Prepaid
                  </span>
                )}
                <div className="flex-1 bg-gray-200 rounded-full h-2 ml-2 overflow-hidden">
                  <div
                    className={`${palette.bar} h-2 rounded-full transition-all`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })() : (
          <div className="bg-etihad-gold-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-500 mb-1">
              Price/Unit ({todayDateStr})
            </p>
            <p className="font-semibold text-etihad-gold-700">{formatCurrency(Math.round(todayPrice))}</p>
          </div>
        )}

        {/* NCD Info Grid - Row 1 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Face Value */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Face Value/Unit</p>
            <p className="font-semibold text-gray-800">{formatCurrency(faceValue)}</p>
          </div>
          
          {/* Units Available */}
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Units Available</p>
            <p className="font-semibold text-purple-700">
              {status === 'available' ? `${unitsAvailable} of ${bond.total_units || 1}` : `${bond.total_units || 1} (Sold)`}
            </p>
          </div>
        </div>

        {/* Interested / Investors Row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className={`rounded-lg p-3 text-center ${bond.in_demand ? 'bg-orange-100 border border-orange-300' : 'bg-orange-50'}`}>
            <div className="flex items-center justify-center gap-1 mb-1">
              <p className="text-xs text-gray-500">Interested</p>
              {bond.in_demand && (
                <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[8px] rounded font-bold animate-pulse">
                  IN DEMAND
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-orange-500">{bond.interested_count || 0}</p>
            {bond.interested_amount > 0 && (
              <p className="text-xs text-orange-600 font-medium">
                ₹{(bond.interested_amount / 100000).toFixed(1)}L
              </p>
            )}
          </div>
          <div className="bg-indigo-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Investors</p>
            <p className="text-2xl font-bold text-etihad-maroon-600">
              {bond.unique_investors || bond.investor_count || 0}
            </p>
          </div>
        </div>

        {/* Maturity - Full Width */}
        <div className="bg-rose-50 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-500 mb-1">Maturity Date</p>
          <p className="font-semibold text-rose-700">
            {maturityDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            <span className="text-xs text-gray-500 font-normal ml-2">
              ({status === 'closed' ? 'Completed' : `${daysToMaturity} days left`})
            </span>
          </p>
        </div>

        {/* Quick Calculator - Units OR Amount Input */}
        {status === 'available' && (
          <div className="bg-gradient-to-r from-blue-50 to-etihad-maroon-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
              <Calculator className="h-3 w-3" />
              Quick Calculator (Price/Unit: {formatCurrency(Math.round(todayPrice))})
            </p>
            <div className="flex gap-2 items-center">
              <input 
                type="number" 
                min="1" 
                max={unitsAvailable}
                placeholder="Units"
                className="w-20 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-400 focus:outline-none"
                data-testid={`calc-units-${bond.id}`}
                onChange={(e) => {
                  const units = parseInt(e.target.value) || 0;
                  const resultEl = e.target.parentElement.querySelector('.calc-result');
                  const boundsEl = e.target.parentElement.parentElement.querySelector('.range-bounds');
                  const amountInput = e.target.parentElement.querySelector('.amount-input');
                  
                  // Clear amount input when units is filled
                  if (amountInput && units > 0) {
                    amountInput.value = '';
                  }
                  
                  // Hide bounds when using units
                  if (boundsEl) {
                    boundsEl.style.display = 'none';
                  }
                  
                  if (resultEl && units > 0) {
                    const total = Math.round(todayPrice * units);
                    resultEl.textContent = `₹${total.toLocaleString('en-IN')}`;
                    resultEl.classList.remove('text-gray-400');
                    resultEl.classList.add('text-emerald-700');
                  } else if (resultEl) {
                    resultEl.textContent = 'Enter units or amount';
                    resultEl.classList.add('text-gray-400');
                    resultEl.classList.remove('text-emerald-700');
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-gray-400 text-xs">or</span>
              <input 
                type="text" 
                placeholder="Amount (₹)"
                className="amount-input w-28 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-400 focus:outline-none"
                data-testid={`calc-amount-${bond.id}`}
                onChange={(e) => {
                  const rawValue = e.target.value.replace(/,/g, '');
                  const amount = parseInt(rawValue) || 0;
                  const resultEl = e.target.parentElement.querySelector('.calc-result');
                  const boundsEl = e.target.parentElement.parentElement.querySelector('.range-bounds');
                  const unitsInput = e.target.parentElement.querySelector('input[type="number"]');
                  
                  // Clear units input when amount is filled
                  if (unitsInput && amount > 0) {
                    unitsInput.value = '';
                  }
                  
                  // Format display with commas
                  if (amount > 0) {
                    e.target.value = amount.toLocaleString('en-IN');
                  }
                  
                  if (amount > 0 && todayPrice > 0) {
                    const lowerUnits = Math.floor(amount / todayPrice);
                    const upperUnits = Math.ceil(amount / todayPrice);
                    const lowerAmount = Math.round(lowerUnits * todayPrice);
                    const upperAmount = Math.round(upperUnits * todayPrice);
                    
                    // Show range bounds
                    if (boundsEl) {
                      boundsEl.style.display = 'block';
                      boundsEl.innerHTML = `
                        <div class="grid grid-cols-2 gap-2 mt-2">
                          <div class="bg-white rounded p-2 border border-emerald-200 text-center">
                            <p class="text-[10px] text-gray-500">Lower Bound</p>
                            <p class="font-mono font-bold text-sm text-emerald-700">${lowerUnits} units</p>
                            <p class="text-[10px] text-gray-500">₹${lowerAmount.toLocaleString('en-IN')}</p>
                          </div>
                          <div class="bg-white rounded p-2 border border-emerald-200 text-center">
                            <p class="text-[10px] text-gray-500">Upper Bound</p>
                            <p class="font-mono font-bold text-sm text-emerald-700">${upperUnits} units</p>
                            <p class="text-[10px] text-gray-500">₹${upperAmount.toLocaleString('en-IN')}</p>
                          </div>
                        </div>
                      `;
                    }
                    
                    if (resultEl) {
                      resultEl.textContent = `${lowerUnits}-${upperUnits} units`;
                      resultEl.classList.remove('text-gray-400');
                      resultEl.classList.add('text-emerald-700');
                    }
                  } else {
                    if (boundsEl) {
                      boundsEl.style.display = 'none';
                    }
                    if (resultEl) {
                      resultEl.textContent = 'Enter units or amount';
                      resultEl.classList.add('text-gray-400');
                      resultEl.classList.remove('text-emerald-700');
                    }
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-gray-400 text-xs">=</span>
              <span className="calc-result flex-1 font-mono font-semibold text-sm text-gray-400">Enter units or amount</span>
            </div>
            {/* Range bounds container - shown when amount is entered */}
            <div className="range-bounds" style={{ display: 'none' }}></div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-auto">
          {isClient && !isKycComplete() ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setShowKycModal(true)}
              data-testid="complete-kyc-btn"
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              Complete KYC
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/bonds/${bond.id}`)}>
              <Eye className="h-4 w-4 mr-1" />
              View Details
            </Button>
          )}
          {canEditBond && (
            <Button 
              variant="outline" 
              size="sm" 
              className="px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
              onClick={(e) => { e.stopPropagation(); setEditingBond(bond); }}
              title="Edit NCD"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDeleteBond && (
            <Button 
              variant="outline" 
              size="sm" 
              className="px-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              onClick={(e) => { e.stopPropagation(); handleDeleteBond(bond.id); }}
              title="Delete NCD"
              data-testid={`delete-bond-${bond.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {isSubBroker && (
            <Button 
              variant="outline" 
              size="sm" 
              className="px-3 text-teal-600 hover:text-teal-700 hover:bg-teal-50 border-teal-200"
              onClick={(e) => { e.stopPropagation(); handleShare(bond, 'bond'); }}
              title="Share"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}
          {isClient && status === 'available' && (
            <Button 
              size="sm" 
              className="bg-rose-500 hover:bg-rose-600 text-white"
              onClick={(e) => { e.stopPropagation(); setInterestModal({ type: 'bond', opportunity: bond }); }}
              title="I'm Interested"
              data-testid={`interest-bond-${bond.id}`}
            >
              <Heart className="h-4 w-4 mr-1" />
              Interested
            </Button>
          )}
        </div>
        </div>
      </div>
    );
  };

  // Real Estate Card - Same layout for all roles, with conditional details
  const RealEstateCard = ({ opp, status }) => {
    const isBroker = user?.role === 'broker';
    const isSubBroker = user?.role === 'sub_broker';
    const isClient = user?.role === 'client';
    const canSeeDetails = hasDetailedAccess(opp.id);
    
    // Per-card state for custom share input
    const [cardSharePercent, setCardSharePercent] = useState(25);
    const [cardCustomInput, setCardCustomInput] = useState('');
    const [showCardCustomInput, setShowCardCustomInput] = useState(false);
    
    // Handle custom share for this card
    const handleCardCustomSubmit = () => {
      const value = parseFloat(cardCustomInput);
      if (value > 0 && value <= 100) {
        setCardSharePercent(value);
        setShowCardCustomInput(false);
        setCardCustomInput('');
      } else {
        toast.error("Please enter a valid percentage between 0 and 100");
      }
    };

    // Cost breakdown for tooltip (only for users with access)
    const costBreakdown = canSeeDetails ? [
      { label: "Unit Price", value: opp.unit_price },
      { label: "DLD Fee", value: opp.dld_fee },
      { label: "Admin Fee", value: opp.admin_fee },
      { label: "Brokerage", value: opp.broker_fee },
      { label: "Other Fees", value: opp.other_fees },
    ].filter(item => item.value > 0) : [];

    // State for image carousel
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    const nextImage = () => {
      if (opp.images && opp.images.length > 1) {
        setCurrentImageIndex((prev) => (prev + 1) % opp.images.length);
      }
    };
    
    const prevImage = () => {
      if (opp.images && opp.images.length > 1) {
        setCurrentImageIndex((prev) => (prev - 1 + opp.images.length) % opp.images.length);
      }
    };
    
    const getImageSrc = (img) => {
      if (!img) return '';
      if (typeof img === 'string') return img;
      if (img.data) return `data:${img.content_type || 'image/jpeg'};base64,${img.data}`;
      return img.url || '';
    };

    return (
      <div className="bg-white border border-gray-200 rounded-lg hover:border-teal-500 transition-colors flex flex-col h-full">
        {/* Property Images Carousel - Always show placeholder area for alignment */}
        <div className="relative h-44 overflow-hidden rounded-t-lg bg-gray-100 flex-shrink-0">
          {opp.images && opp.images.length > 0 ? (
            <>
              {/* Current Image */}
              <img 
                src={getImageSrc(opp.images[currentImageIndex])}
                alt={`${opp.building_name} - Image ${currentImageIndex + 1}`}
                className="w-full h-full object-cover transition-opacity duration-300"
                onError={(e) => { e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12">No Image</text></svg>'; }}
              />
              
              {/* Navigation Arrows - only show if multiple images */}
              {opp.images.length > 1 && (
                <>
                  {/* Left Arrow */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </button>
                  
                  {/* Right Arrow */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors z-10"
                  >
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </button>
                  
                  {/* Image Counter */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                    {currentImageIndex + 1} / {opp.images.length}
                  </div>
                  
                  {/* Dot Indicators */}
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    {opp.images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          idx === currentImageIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
              
              {/* Single image indicator */}
              {opp.images.length === 1 && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  1 photo
                </div>
              )}
            </>
          ) : (
            /* Placeholder for cards without images */
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50">
              <div className="text-center">
                <Building2 className="h-10 w-10 text-teal-300 mx-auto mb-1" />
                <p className="text-[10px] text-teal-400">No images</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Card Content */}
        <div className="p-5 flex-1 flex flex-col">
        
        {/* Header - Property Name */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 whitespace-nowrap" title={opp.building_name}>
                {(opp.building_name || '')
                  .replace(/Hyde Residences Dubai Hills/i, 'Hyde Residences')
                  .replace(/25\s*HOURS?\s*HEIMAT\s*DUBAI/i, '25H Heimat')}
              </h3>
              <p className="text-sm text-gray-500">Unit {opp.unit_no} • Floor {opp.floor}</p>
              {opp.unit_type && (
                <p className="text-xs text-teal-600 font-medium">{opp.unit_type}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {(() => {
              const pt = (opp.property_type || 'off_plan').toLowerCase();
              const map = {
                off_plan:  { label: 'Off-Plan',  cls: 'bg-purple-100 text-purple-700 hover:bg-purple-100' },
                ready:     { label: 'Ready',     cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
                secondary: { label: 'Secondary', cls: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
                rental:    { label: 'Rental',    cls: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
              };
              const m = map[pt] || map.off_plan;
              return <Badge className={m.cls} data-testid={`property-type-badge-${opp.id}`}>{m.label}</Badge>;
            })()}
            {status === 'available' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Open</span>
            )}
            {status === 'invested' && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Invested</span>
            )}
            {status === 'closed' && (
              <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">Closed</span>
            )}
          </div>
        </div>

        {/* Property Info Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Size - Area only */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Size</p>
            <p className="font-semibold text-gray-800">{opp.total_area?.toLocaleString()} sqft</p>
          </div>
          
          {/* Total Cost with Tooltip (detailed for authorized users) */}
          <div className="bg-gray-50 rounded-lg p-3 relative group cursor-help">
            <p className="text-xs text-gray-500 mb-1">
              Total Cost {canSeeDetails && <span className="text-orange-500">*</span>}
            </p>
            <p className="font-semibold text-teal-700">{formatCurrency(opp.total_cost, 'AED')}</p>
            
            {/* Tooltip on hover - only for users with detailed access */}
            {canSeeDetails && costBreakdown.length > 0 && (
              <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded-lg p-3 w-48 -right-2 top-full mt-1 shadow-lg">
                <p className="font-medium mb-2 text-gray-200">Cost Breakdown</p>
                {costBreakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-0.5">
                    <span className="text-gray-400">{item.label}</span>
                    <span>{formatCurrency(item.value, 'AED')}</span>
                  </div>
                ))}
                <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between font-medium">
                  <span>Total</span>
                  <span>{formatCurrency(opp.total_cost, 'AED')}</span>
                </div>
                <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
              </div>
            )}
          </div>
        </div>

        {/* Price & Returns Info - Second Row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Price per sqft with calculation tooltip (portal-rendered so it isn't clipped by card/scroll container) */}
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-blue-50 rounded-lg p-3 cursor-help" data-testid={`price-per-sqft-${opp.id}`}>
                  <p className="text-xs text-gray-500 mb-1">Price/sqft</p>
                  <p className="font-semibold text-blue-700">{formatCurrency(opp.price_per_sqft || (opp.total_cost / opp.total_area), 'AED')}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="bg-gray-900 text-white border-0 p-3 w-64">
                <p className="font-medium mb-2 text-gray-200">How it's derived</p>
                {opp.price_per_sqft ? (
                  <>
                    <div className="flex justify-between py-0.5">
                      <span className="text-gray-400">Entered directly</span>
                      <span>{formatCurrency(opp.price_per_sqft, 'AED')}/sqft</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">Set on the property; not derived from Total Cost ÷ Area.</p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between py-0.5">
                      <span className="text-gray-400">Total Cost</span>
                      <span>{formatCurrency(opp.total_cost, 'AED')}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-gray-400">÷ Total Area</span>
                      <span>{opp.total_area?.toLocaleString() || 0} sqft</span>
                    </div>
                    <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between font-medium">
                      <span>= Price/sqft</span>
                      <span>{formatCurrency(opp.total_cost / (opp.total_area || 1), 'AED')}/sqft</span>
                    </div>
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Expected Sale Price - hover to see total sale value + projected profit */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-green-50 rounded-lg p-3 cursor-help">
                  <p className="text-xs text-gray-500 mb-1">Expected Sale/sqft</p>
                  <p className="font-semibold text-green-700">
                    {opp.expected_sale_rate ? formatCurrency(opp.expected_sale_rate, 'AED') : 'TBD'}
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-gray-900 text-white p-3 rounded-lg shadow-xl border border-gray-700 max-w-xs">
                {(() => {
                  const totalCost = opp.total_cost || 0;
                  const expectedSale = (opp.expected_sale_rate || 0) * (opp.total_area || 0);
                  const projectedProfit = expectedSale - totalCost;
                  const hasSale = opp.expected_sale_rate && opp.total_area;
                  return (
                    <div className="space-y-1.5 text-xs">
                      <p className="font-semibold text-amber-400 border-b border-gray-700 pb-1 mb-1">
                        Sale Projection
                      </p>
                      {hasSale ? (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-400">Expected Sale:</span>
                            <span className="font-mono text-green-400">AED {formatCurrency(expectedSale, 'AED')}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-400">Total Cost:</span>
                            <span className="font-mono text-red-400">-AED {formatCurrency(totalCost, 'AED')}</span>
                          </div>
                          <div className="flex justify-between gap-4 border-t border-gray-700 pt-1 mt-1">
                            <span className="text-gray-300 font-medium">Expected Profit:</span>
                            <span className={`font-mono font-bold ${projectedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {projectedProfit >= 0 ? '+' : ''}AED {formatCurrency(Math.abs(projectedProfit), 'AED')}
                            </span>
                          </div>
                          {opp.estimated_sell_date && (
                            <p className="text-[10px] text-gray-500 pt-1">
                              Est. sale date: {new Date(opp.estimated_sell_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-400">Sale details not yet set.</p>
                      )}
                    </div>
                  );
                })()}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Sale & Returns Info - Third Row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Expected Sale Date */}
          <div className="bg-etihad-gold-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Expected Sale Date</p>
            <p className="font-semibold text-etihad-gold-700">
              {opp.estimated_sell_date 
                ? new Date(opp.estimated_sell_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) 
                : (opp.handover_date 
                  ? new Date(opp.handover_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                  : 'TBD')}
            </p>
          </div>
          
          {/* Expected XIRR - Calculated from payment schedule and expected sale */}
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 mb-1">Expected XIRR</p>
              {(() => {
                const breakdown = getXirrCashflowsBreakdown(opp);
                if (breakdown) {
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setXirrModalData(breakdown);
                      }}
                      className="text-purple-600 hover:text-purple-800 p-1 rounded hover:bg-purple-100 transition-colors"
                      title="View XIRR calculation"
                      data-testid={`view-xirr-${opp.id}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  );
                }
                return null;
              })()}
            </div>
            <p className="font-semibold text-purple-700">
              {(() => {
                const calculatedXirr = calculatePropertyXIRR(opp);
                if (calculatedXirr !== null) {
                  return `${calculatedXirr}%`;
                }
                return opp.expected_xirr ? `${opp.expected_xirr}%` : 'Set sale details';
              })()}
            </p>
          </div>
        </div>

        {/* Location if present */}
        {opp.location && (
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
            <MapPin className="h-4 w-4" />
            {opp.location}
          </div>
        )}

        {/* Interest & Confirmed Participants - Only for available, not funded */}
        {status === 'available' && (
          <div className="flex items-center justify-between mb-4 py-3 border-t border-b border-gray-100">
            {canSeeDetails ? (
              <>
                <div className="text-center flex-1">
                  <p className="text-xs text-gray-500">Interested</p>
                  <p className="font-bold text-etihad-gold-600">{opp.interested_count || 0}</p>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center flex-1">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <UserCheck className="h-3 w-3 text-emerald-500" />
                    <p className="text-xs text-gray-500">Confirmed</p>
                  </div>
                  <p className="font-bold text-emerald-600">
                    {opp.current_investors || 0} <span className="text-gray-400 font-normal">participants</span>
                  </p>
                  <p className="text-[10px] text-emerald-500 font-medium">
                    {((opp.current_investors || 0) * 25)}% committed
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="text-center flex-1">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-medium text-gray-700 capitalize">{status}</p>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center flex-1 flex items-center justify-center gap-1">
                  <Lock className="h-3 w-3 text-gray-400" />
                  <p className="text-xs text-gray-400">Invest to view details</p>
                </div>
              </>
            )}
          </div>
        )}
        
        {/* For funded/invested - Show participants in the same Confirmed column style as Available */}
        {(status === 'invested' || status === 'funded') && canSeeDetails && (
          <div className="flex items-center justify-center mb-4 py-3 border-t border-b border-gray-100">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <UserCheck className="h-3 w-3 text-emerald-500" />
                <p className="text-xs text-gray-500">Confirmed</p>
              </div>
              <p className="font-bold text-emerald-600">
                {opp.current_investors || 4} <span className="text-gray-400 font-normal">participants</span>
              </p>
              <p className="text-[10px] text-emerald-500 font-medium">Fully Invested • 100% committed</p>
            </div>
          </div>
        )}

        {/* Payment Schedule Timeline - show for AVAILABLE, FUNDED and INVESTED */}
        {canSeeDetails && (status === 'available' || status === 'funded' || status === 'invested') && opp.payment_schedule && opp.payment_schedule.length > 0 && (
          <div className="mb-3">
            {/* Currency & Share Selector Header */}
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-gray-400 text-[9px]">Schedule</span>
                
                {/* Share Percentage Pills - matching View Details */}
                <div className="flex items-center gap-0.5">
                  {presetPercentages.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => { setCardSharePercent(pct); setShowCardCustomInput(false); }}
                      className={`px-1 py-0.5 text-[8px] rounded transition-all ${
                        cardSharePercent === pct && !showCardCustomInput
                          ? 'bg-purple-500 text-white font-medium'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  
                  {/* Custom input toggle/field */}
                  {showCardCustomInput ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={cardCustomInput}
                        onChange={(e) => setCardCustomInput(e.target.value)}
                        placeholder="Enter %"
                        className="w-14 px-2 py-1 text-[10px] border border-purple-300 rounded focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200"
                        onKeyDown={(e) => e.key === 'Enter' && handleCardCustomSubmit()}
                        autoFocus
                        min="0"
                        max="100"
                        step="0.5"
                      />
                      <button
                        onClick={handleCardCustomSubmit}
                        className="px-2 py-1 text-[10px] bg-purple-500 text-white rounded hover:bg-purple-600"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => { setShowCardCustomInput(false); setCardCustomInput(''); }}
                        className="px-2 py-1 text-[10px] bg-gray-200 text-gray-500 rounded hover:bg-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCardCustomInput(true)}
                      className={`px-2 py-1 text-[9px] rounded transition-all ${
                        !presetPercentages.includes(cardSharePercent)
                          ? 'bg-purple-500 text-white font-medium'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                      title="Enter custom percentage"
                    >
                      {!presetPercentages.includes(cardSharePercent) ? `${cardSharePercent}%` : 'Custom'}
                    </button>
                  )}
                </div>
                
                <div className="w-px h-3 bg-gray-300 mx-0.5"></div>
                
                {/* Currency Selector */}
                <div className="relative">
                  <select
                    value={selectedCurrency}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="appearance-none bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 text-[9px] font-medium text-gray-600 cursor-pointer hover:bg-gray-100 pr-4"
                    data-testid="currency-selector"
                  >
                    <option value="AED">AED (د.إ)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="CNY">CNY (¥)</option>
                    <option value="JPY">JPY (¥)</option>
                    <option value="CHF">CHF (Fr)</option>
                    <option value="CAD">CAD (C$)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="SGD">SGD (S$)</option>
                    <option value="HKD">HKD (HK$)</option>
                    <option value="SAR">SAR (ريال)</option>
                    <option value="KWD">KWD (د.ك)</option>
                    <option value="QAR">QAR (ريال)</option>
                    <option value="BHD">BHD (د.ب.)</option>
                    <option value="OMR">OMR (ريال)</option>
                  </select>
                  <ChevronDown className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-2.5 w-2.5 text-gray-400 pointer-events-none" />
                </div>
                {loadingRates && (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[9px] text-gray-400">Loading rates</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Loading overlay for currency change */}
            {loadingRates && selectedCurrency !== "AED" && (
              <div className="mb-2 px-2 py-3 bg-gray-50 rounded border border-gray-100 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] text-gray-500">Fetching {selectedCurrency} exchange rates...</span>
                </div>
              </div>
            )}
            
            {/* Projected Rate Info - with 5-year history */}
            {selectedCurrency !== "AED" && projectedRates && !loadingRates && (
              <div className="mb-2 px-2 py-1.5 bg-gray-50 rounded border border-gray-100">
                <div className="flex items-center justify-between text-[9px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-500">Today:</span>
                    <span className="font-medium text-gray-700">1 AED = {projectedRates.current_rate?.toFixed(2)} {selectedCurrency}</span>
                    {projectedRates.trend && (
                      <span className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] ${
                        projectedRates.trend.direction === 'increasing' 
                          ? 'bg-green-50 text-green-600' 
                          : projectedRates.trend.direction === 'decreasing'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-gray-100 text-gray-500'
                      }`}>
                        {projectedRates.trend.direction === 'increasing' ? (
                          <TrendingUp className="h-2 w-2" />
                        ) : projectedRates.trend.direction === 'decreasing' ? (
                          <TrendingDown className="h-2 w-2" />
                        ) : null}
                        {projectedRates.trend.avg_annual_change_percent > 0 ? '+' : ''}{projectedRates.trend.avg_annual_change_percent?.toFixed(1)}%/yr
                      </span>
                    )}
                  </div>
                </div>
                
                {/* 5-Year History - Appreciation/Depreciation (skip for USD - pegged) */}
                {projectedRates.historical_summary && selectedCurrency !== 'USD' && (
                  <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-gray-200">
                    <span className="text-[8px] text-gray-400">5yr History:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                        Min: {projectedRates.historical_summary.min_rate?.toFixed(2)}
                      </span>
                      <span className="text-[8px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">
                        Max: {projectedRates.historical_summary.max_rate?.toFixed(2)}
                      </span>
                      {(() => {
                        const minRate = projectedRates.historical_summary.min_rate;
                        const currentRate = projectedRates.current_rate;
                        const totalChange = ((currentRate - minRate) / minRate * 100).toFixed(1);
                        const isPositive = totalChange > 0;
                        return (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${
                            isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                          }`}>
                            {isPositive ? '↑' : '↓'} {isPositive ? '+' : ''}{totalChange}% (5yr)
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
                
                {/* USD Pegged Note */}
                {selectedCurrency === 'USD' && projectedRates.note && (
                  <div className="mt-1.5 pt-1.5 border-t border-gray-200">
                    <span className="text-[8px] text-gray-500 italic">{projectedRates.note}</span>
                  </div>
                )}
                
                {/* Projected rates from today */}
                {projectedRates.projected_rates && projectedRates.projected_rates.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-200 text-[8px]">
                    <span className="text-gray-400">Future:</span>
                    {projectedRates.projected_rates.filter(pr => pr.is_projected).slice(0, 4).map((pr, idx) => (
                      <span 
                        key={idx} 
                        className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded"
                      >
                        '{pr.year.toString().slice(-2)}: {pr.rate?.toFixed(1)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <HorizontalPaymentTimeline 
              milestones={opp.payment_schedule.map((p, idx) => ({
                date: p.date,
                description: p.description || `Payment ${idx + 1}`,
                percentage: p.percentage,
                amount: (p.percentage / 100) * (opp.investment_amount || opp.total_cost || 0),
                isPaid: idx < (opp.payments_completed || 0)
              }))}
              totalAmount={opp.investment_amount || opp.total_cost || 0}
              showShareValues={true}
              sharePercent={cardSharePercent}
              compact={true}
              currency={selectedCurrency}
              conversionRate={currencyRates[selectedCurrency] || 1}
            />
          </div>
        )}

        {/* Projected Future Value - only for FUNDED opportunities */}
        {canSeeDetails && (status === 'invested' || status === 'funded') && (
          <div className="mb-3">
            {/* Projected Sale Value & Profit */}
            {(() => {
              const totalCost = opp.total_cost || 0;
              const expectedSaleValue = (opp.expected_sale_rate || 0) * (opp.total_area || 0);
              const projectedProfit = expectedSaleValue - totalCost;
              
              const currentRate = currencyRates[selectedCurrency] || 1;
              const convertedSaleValue = expectedSaleValue * currentRate;
              const convertedProfit = projectedProfit * currentRate;
              
              const currencySymbol = selectedCurrency === 'INR' ? '₹' : selectedCurrency === 'USD' ? '$' : selectedCurrency === 'EUR' ? '€' : selectedCurrency === 'GBP' ? '£' : selectedCurrency;
              
              const formatValue = (val) => {
                if (selectedCurrency === 'INR') {
                  if (val >= 10000000) return `${(val / 10000000).toFixed(2)} Cr`;
                  if (val >= 100000) return `${(val / 100000).toFixed(2)} L`;
                }
                return val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
              };
              
              // Calculate currency gain/loss based on projected vs current rate
              // Get the projected rate for the sale year
              const saleYear = opp.estimated_sell_date ? new Date(opp.estimated_sell_date).getFullYear() : null;
              const projectedRateForSaleYear = projectedRates?.projected_rates?.find(pr => pr.year === saleYear)?.rate;
              
              // Currency gain/loss calculation
              let currencyGainLoss = 0;
              let currencyGainLossPercent = 0;
              
              if (selectedCurrency !== 'AED' && projectedRateForSaleYear && currentRate) {
                // If projected rate at sale time is higher than today's rate, it's a gain (currency depreciation favorable)
                // If projected rate at sale time is lower than today's rate, it's a loss
                const saleValueAtProjectedRate = expectedSaleValue * projectedRateForSaleYear;
                const saleValueAtCurrentRate = expectedSaleValue * currentRate;
                currencyGainLoss = saleValueAtProjectedRate - saleValueAtCurrentRate;
                currencyGainLossPercent = ((projectedRateForSaleYear - currentRate) / currentRate * 100);
              }
              
              return (
                <div className="space-y-1.5 mt-2">
                  {/* Currency Gain/Loss - only show for non-AED currencies */}
                  {selectedCurrency !== 'AED' && projectedRateForSaleYear && Math.abs(currencyGainLoss) > 0 && (
                    <div className={`rounded px-2 py-1.5 border ${
                      currencyGainLoss > 0 
                        ? 'bg-emerald-50 border-emerald-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`text-[9px] font-medium ${currencyGainLoss > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            Currency {currencyGainLoss > 0 ? 'Gain' : 'Loss'}
                          </span>
                          <span className="text-[8px] text-gray-500 ml-1">
                            (Projected vs Today)
                          </span>
                        </div>
                        <span className={`text-xs font-bold ${currencyGainLoss > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {currencyGainLoss > 0 ? '+' : ''}{currencySymbol} {formatValue(Math.abs(currencyGainLoss))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[8px]">
                        <span className="text-gray-500">
                          Rate: {currentRate.toFixed(2)} → {projectedRateForSaleYear.toFixed(2)} ({saleYear})
                        </span>
                        <span className={`font-medium ${currencyGainLoss > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {currencyGainLossPercent > 0 ? '+' : ''}{currencyGainLossPercent.toFixed(1)}% movement
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <div className="flex gap-2 mt-auto">
          {isClient && !isKycComplete() ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setShowKycModal(true)}
              data-testid="complete-kyc-btn-re"
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              Complete KYC
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1" 
              onClick={() => navigate(getDetailPath('real-estate', opp.id))}
            >
              <Eye className="h-4 w-4 mr-1" />
              View Details
            </Button>
          )}
          {canEditRealEstate && (
            <Button 
              variant="outline" 
              size="sm" 
              className="px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
              onClick={async (e) => { 
                e.stopPropagation(); 
                // Fetch full opportunity details for editing
                try {
                  const token = localStorage.getItem("token");
                  const response = await axios.get(`${API}/real-estate-opportunities/${opp.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                  });
                  setEditingRealEstate(response.data);
                } catch (error) {
                  console.error("Error fetching opportunity details:", error);
                  toast.error("Failed to load property details");
                }
              }}
              title="Edit Property"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {isSubBroker && (
            <Button 
              variant="outline" 
              size="sm" 
              className="px-3 text-teal-600 hover:text-teal-700 hover:bg-teal-50 border-teal-200"
              onClick={(e) => { e.stopPropagation(); handleShare(opp, 'real-estate'); }}
              title="Share"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}
          {isClient && (status === 'available' || status === 'partially_invested') && (
            <Button 
              size="sm" 
              className="bg-rose-500 hover:bg-rose-600 text-white"
              onClick={(e) => { e.stopPropagation(); setInterestModal({ type: 'real_estate', opportunity: opp }); }}
              title="I'm Interested"
              data-testid={`interest-re-${opp.id}`}
            >
              <Heart className="h-4 w-4 mr-1" />
              Interested
            </Button>
          )}
        </div>
        </div>
      </div>
    );
  };

  if (!user) return null;

  // Select sidebar based on role
  const SidebarComponent = user.role === 'broker' ? Sidebar : user.role === 'client' ? ClientSidebar : SubBrokerSidebar;
  const isBroker = user.role === 'broker';

  return (
    <div className="flex h-screen bg-gray-50">
      <SidebarComponent user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header with Add Buttons (Broker only) */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="page-title">Opportunities</h1>
              <p className="text-sm text-gray-500 mt-1">All investment opportunities - NCD and Real Estate</p>
            </div>
            {(canCreateBond || canCreateRealEstate) && (
              <div className="flex items-center gap-3">
                {canCreateBond && (
                  <Button 
                    onClick={() => setShowNCDModal(true)} 
                    className="bg-etihad-gold-500 hover:bg-etihad-gold-600 text-white gap-2"
                    data-testid="add-ncd-btn"
                  >
                    <Plus className="h-4 w-4" />
                    Add NCD
                  </Button>
                )}
                {canCreateRealEstate && (
                  <Button 
                    onClick={() => setShowRealEstateModal(true)} 
                    variant="outline"
                    className="border-teal-500 text-teal-600 hover:bg-teal-50 gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Real Estate
                  </Button>
                )}
              </div>
            )}
            {!isBroker && !canCreateBond && !canCreateRealEstate && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-teal-100 text-teal-700 text-sm rounded-full font-medium">
                  {availableCount + fundedCount + closedCount} Total
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Edit NCD — reuses the Add NCD modal shell with a `bond` prop */}
        {editingBond && (
          <CreateNCDModal
            bond={editingBond}
            onClose={() => setEditingBond(null)}
            onSuccess={() => { setEditingBond(null); fetchData(user); }}
          />
        )}

        {/* Real Estate Modal */}
        {showRealEstateModal && (
          <CreateRealEstateModal 
            onClose={() => setShowRealEstateModal(false)} 
            onSuccess={() => fetchData(user)}
          />
        )}

        {/* NCD Modal */}
        {showNCDModal && (
          <CreateNCDModal
            onClose={() => setShowNCDModal(false)}
            onSuccess={() => fetchData(user)}
          />
        )}

        {/* Edit Real Estate Modal */}
        {editingRealEstate && (
          <CreateRealEstateModal 
            opportunity={editingRealEstate}
            onClose={() => setEditingRealEstate(null)} 
            onSuccess={() => { setEditingRealEstate(null); fetchData(user); }}
          />
        )}

        {/* Tabs by Asset Type: NCD | Real Estate */}
        <div className="p-8">
          <Tabs defaultValue="ncd" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="ncd" className="px-8" data-testid="tab-ncd">
                <TrendingUp className="h-4 w-4 mr-2" />
                NCD ({availableBonds.length})
              </TabsTrigger>
              <TabsTrigger value="real-estate" className="px-8" data-testid="tab-real-estate">
                <Building2 className="h-4 w-4 mr-2" />
                Real Estate ({availableRE.length})
              </TabsTrigger>
            </TabsList>

            {/* Real Estate Tab Content */}
            <TabsContent value="real-estate">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : (availableRE.length + investedRE.length + closedRE.length) === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No real estate opportunities</p>
                  {canCreateRealEstate && (
                    <Button onClick={() => setShowRealEstateModal(true)} variant="outline">Add Real Estate</Button>
                  )}
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Open Real Estate - First */}
                  {availableRE.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-green-50 to-transparent py-3 px-4 rounded-lg">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <h3 className="text-xl font-bold text-gray-800">Open ({availableRE.length})</h3>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => handleScroll(availableREScrollRef, 'left')}
                          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronLeft className="h-6 w-6 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleScroll(availableREScrollRef, 'right')}
                          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronRight className="h-6 w-6 text-gray-600" />
                        </button>
                        <div ref={availableREScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                            {availableRE.map(opp => (
                              <div key={opp.id} className="w-[380px] flex-shrink-0">
                                <RealEstateCard opp={opp} status="available" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Funded/Invested Real Estate - Second */}
                  {investedRE.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-blue-50 to-transparent py-3 px-4 rounded-lg">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <h3 className="text-xl font-bold text-gray-800">Funded ({investedRE.length})</h3>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => handleScroll(fundedREScrollRef, 'left')}
                          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronLeft className="h-6 w-6 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleScroll(fundedREScrollRef, 'right')}
                          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronRight className="h-6 w-6 text-gray-600" />
                        </button>
                        <div ref={fundedREScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                            {investedRE.map(opp => (
                              <div key={opp.id} className="w-[380px] flex-shrink-0">
                                <RealEstateCard opp={opp} status="invested" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Closed Real Estate - Third */}
                  {closedRE.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-gray-100 to-transparent py-3 px-4 rounded-lg">
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <h3 className="text-xl font-bold text-gray-800">Closed ({closedRE.length})</h3>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => handleScroll(closedREScrollRef, 'left')}
                          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronLeft className="h-6 w-6 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleScroll(closedREScrollRef, 'right')}
                          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronRight className="h-6 w-6 text-gray-600" />
                        </button>
                        <div ref={closedREScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                            {closedRE.map(opp => (
                              <div key={opp.id} className="w-[380px] flex-shrink-0">
                                <RealEstateCard opp={opp} status="closed" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* NCD Tab Content */}
            <TabsContent value="ncd">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : (availableBonds.length + fundedBonds.length + closedBonds.length) === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No NCD opportunities</p>
                  {canCreateBond && (
                    <Button onClick={() => setShowNCDModal(true)}>Add NCD</Button>
                  )}
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Open NCDs - First */}
                  {availableBonds.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-green-50 to-transparent py-3 px-4 rounded-lg">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <h3 className="text-xl font-bold text-gray-800">Open ({availableBonds.length})</h3>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => handleScroll(availableBondsScrollRef, 'left')}
                          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronLeft className="h-6 w-6 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleScroll(availableBondsScrollRef, 'right')}
                          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronRight className="h-6 w-6 text-gray-600" />
                        </button>
                        <div ref={availableBondsScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                            {availableBonds.map(bond => (
                              <div key={bond.id} className="w-[380px] flex-shrink-0">
                                <BondCard bond={bond} status="available" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Funded NCDs - Second */}
                  {fundedBonds.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-blue-50 to-transparent py-3 px-4 rounded-lg">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <h3 className="text-xl font-bold text-gray-800">Funded ({fundedBonds.length})</h3>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => handleScroll(fundedBondsScrollRef, 'left')}
                          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronLeft className="h-6 w-6 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleScroll(fundedBondsScrollRef, 'right')}
                          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronRight className="h-6 w-6 text-gray-600" />
                        </button>
                        <div ref={fundedBondsScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                            {fundedBonds.map(bond => (
                              <div key={bond.id} className="w-[380px] flex-shrink-0">
                                <BondCard bond={bond} status="funded" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Closed NCDs - Third */}
                  {closedBonds.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4 bg-gradient-to-r from-gray-100 to-transparent py-3 px-4 rounded-lg">
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <h3 className="text-xl font-bold text-gray-800">Closed ({closedBonds.length})</h3>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => handleScroll(closedBondsScrollRef, 'left')}
                          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronLeft className="h-6 w-6 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleScroll(closedBondsScrollRef, 'right')}
                          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-200"
                        >
                          <ChevronRight className="h-6 w-6 text-gray-600" />
                        </button>
                        <div ref={closedBondsScrollRef} className="overflow-x-auto pb-4 scrollbar-hide px-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                          <div className="flex gap-6" style={{ minWidth: 'max-content' }}>
                            {closedBonds.map(bond => (
                              <div key={bond.id} className="w-[380px] flex-shrink-0">
                                <BondCard bond={bond} status="closed" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* XIRR Calculation Modal */}
      {xirrModalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setXirrModalData(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-purple-600 to-etihad-maroon-600 text-white">
              <div className="flex items-center gap-3">
                <Calculator className="h-6 w-6" />
                <div>
                  <h2 className="text-lg font-semibold">XIRR Calculation</h2>
                  <p className="text-sm text-purple-200">{xirrModalData.property} - Unit {xirrModalData.unit}</p>
                </div>
              </div>
              <button onClick={() => setXirrModalData(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total Investment</p>
                  <p className="font-bold text-red-600">AED {xirrModalData.totalOutflow.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Sale Proceeds</p>
                  <p className="font-bold text-green-600">AED {xirrModalData.totalInflow.toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Expected XIRR</p>
                  <p className="font-bold text-purple-600">{xirrModalData.xirr}%</p>
                </div>
              </div>
              
              {/* Cashflows Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-600">Date</th>
                      <th className="text-left p-3 font-medium text-gray-600">Description</th>
                      <th className="text-right p-3 font-medium text-gray-600">Amount (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {xirrModalData.cashflows.map((cf, idx) => (
                      <tr key={idx} className={`border-t ${cf.type === 'inflow' ? 'bg-green-50' : ''}`}>
                        <td className="p-3 text-gray-700">
                          {cf.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-3 text-gray-600 text-xs">{cf.description}</td>
                        <td className={`p-3 text-right font-medium ${cf.type === 'inflow' ? 'text-green-600' : 'text-red-600'}`}>
                          {cf.type === 'inflow' ? '+' : '-'}{Math.abs(cf.amount).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Profit */}
              <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Net Profit</span>
                  <span className="font-bold text-green-700 text-lg">
                    AED {(xirrModalData.totalInflow - xirrModalData.totalOutflow).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t bg-gray-50 flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  // Generate CSV content
                  let csv = 'Date,Description,Amount (AED),Type\n';
                  xirrModalData.cashflows.forEach(cf => {
                    csv += `${cf.date.toISOString().split('T')[0]},"${cf.description}",${cf.amount},${cf.type}\n`;
                  });
                  csv += `\nTotal Investment,,${-xirrModalData.totalOutflow},outflow\n`;
                  csv += `Total Sale Proceeds,,${xirrModalData.totalInflow},inflow\n`;
                  csv += `Net Profit,,${xirrModalData.totalInflow - xirrModalData.totalOutflow},\n`;
                  csv += `Expected XIRR,,${xirrModalData.xirr}%,\n`;
                  
                  // Download
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `XIRR_${xirrModalData.property}_Unit${xirrModalData.unit}.csv`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                  toast.success('XIRR calculation downloaded');
                }}
                data-testid="download-xirr-btn"
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
              <Button 
                className="flex-1 bg-purple-600 hover:bg-purple-700"
                onClick={() => setXirrModalData(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Interest Modal for Clients */}
      <Dialog open={!!interestModal} onOpenChange={() => setInterestModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-rose-500" />
              Express Interest
            </DialogTitle>
            <DialogDescription>
              {interestModal?.type === 'bond' 
                ? `Share your potential investment amount for ${interestModal?.opportunity?.name}`
                : `Share your interest percentage in ${interestModal?.opportunity?.building_name} - Unit ${interestModal?.opportunity?.unit_no}`
              }
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleInterestSubmit} className="space-y-4">
            {interestModal?.type === 'bond' ? (
              <div className="space-y-2">
                <Label htmlFor="amount">Potential Investment Amount (₹)</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="text"
                  placeholder="e.g., 5,00,000"
                  className="text-lg"
                  data-testid="interest-amount-input"
                  onChange={(e) => {
                    const value = e.target.value.replace(/,/g, '');
                    if (!isNaN(value) && value !== '') {
                      e.target.value = parseInt(value).toLocaleString('en-IN');
                    }
                  }}
                />
                <p className="text-xs text-gray-500">
                  Enter the approximate amount you are considering to invest
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="percentage">Interest Percentage (%)</Label>
                <Input
                  id="percentage"
                  name="percentage"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  placeholder="e.g., 25"
                  className="text-lg"
                  data-testid="interest-percentage-input"
                />
                <p className="text-xs text-gray-500">
                  Enter the share percentage you are interested in (1-100%)
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes (Optional)</Label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                placeholder="Any specific questions or requirements..."
                className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500"
                data-testid="interest-notes-input"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1"
                onClick={() => setInterestModal(null)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="flex-1 bg-rose-500 hover:bg-rose-600"
                data-testid="submit-interest-btn"
              >
                <Heart className="h-4 w-4 mr-2" />
                Submit Interest
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Client KYC Modal */}
      <ClientKYCModal
        isOpen={showKycModal}
        onClose={() => setShowKycModal(false)}
        clientProfile={clientProfile}
        onSuccess={() => fetchData(user)}
      />
    </div>
  );
}
