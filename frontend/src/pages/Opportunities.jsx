import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import CreateRealEstateModal from "@/components/CreateRealEstateModal";
import EditBondModal from "@/components/EditBondModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, TrendingUp, Plus, Pencil, Share2, Eye, Users, Lock, Download, X, Calculator, Trash2 } from "lucide-react";
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

// Calculate Expected XIRR for a property
const calculatePropertyXIRR = (opp) => {
  if (!opp.payment_schedule || !opp.estimated_sell_date || !opp.expected_sale_rate || !opp.total_area) {
    return null;
  }
  
  const cashflows = [];
  const totalCost = opp.total_cost || 0;
  
  // Add DLD + Admin fee as first outflow (paid at booking)
  const dldAdminFee = (opp.dld_fee || 0) + (opp.admin_fee || 0);
  if (dldAdminFee > 0) {
    const bookingDate = opp.payment_schedule[0]?.date || opp.created_at;
    cashflows.push({
      date: new Date(bookingDate),
      amount: -dldAdminFee
    });
  }
  
  // Add all installment payments as outflows
  // Calculate amount from percentage if not provided
  for (const payment of opp.payment_schedule || []) {
    if (payment.date) {
      const amount = payment.amount || (totalCost * (payment.percentage || 0) / 100);
      if (amount > 0) {
        cashflows.push({
          date: new Date(payment.date),
          amount: -amount
        });
      }
    }
  }
  
  // Add expected sale proceeds as final inflow
  const expectedSaleProceeds = opp.expected_sale_rate * opp.total_area;
  cashflows.push({
    date: new Date(opp.estimated_sell_date),
    amount: expectedSaleProceeds
  });
  
  // Sort by date
  cashflows.sort((a, b) => a.date - b.date);
  
  return calculateXIRR(cashflows);
};

// Get detailed cashflows for XIRR calculation display
const getXirrCashflowsBreakdown = (opp) => {
  if (!opp.payment_schedule || !opp.estimated_sell_date || !opp.expected_sale_rate || !opp.total_area) {
    return null;
  }
  
  const cashflows = [];
  const totalCost = opp.total_cost || 0;
  
  // Add DLD + Admin fee as first outflow
  const dldFee = opp.dld_fee || 0;
  const adminFee = opp.admin_fee || 0;
  const dldAdminFee = dldFee + adminFee;
  
  if (dldAdminFee > 0) {
    const bookingDate = opp.payment_schedule[0]?.date || opp.created_at;
    cashflows.push({
      date: new Date(bookingDate),
      amount: -dldAdminFee,
      description: `DLD Fee (${dldFee.toLocaleString()}) + Admin Fee (${adminFee.toLocaleString()})`,
      type: 'outflow'
    });
  }
  
  // Add all installment payments - calculate amount from percentage if not provided
  for (const payment of opp.payment_schedule || []) {
    if (payment.date) {
      const amount = payment.amount || (totalCost * (payment.percentage || 0) / 100);
      if (amount > 0) {
        cashflows.push({
          date: new Date(payment.date),
          amount: -amount,
          description: payment.description || `Installment (${payment.percentage}%)`,
          type: 'outflow'
        });
      }
    }
  }
  
  // Add expected sale proceeds
  const expectedSaleProceeds = opp.expected_sale_rate * opp.total_area;
  cashflows.push({
    date: new Date(opp.estimated_sell_date),
    amount: expectedSaleProceeds,
    description: `Sale Proceeds (${opp.expected_sale_rate.toLocaleString()} × ${opp.total_area.toLocaleString()} sqft)`,
    type: 'inflow'
  });
  
  // Sort by date
  cashflows.sort((a, b) => a.date - b.date);
  
  const xirr = calculateXIRR(cashflows.map(cf => ({ date: cf.date, amount: cf.amount })));
  
  return {
    property: opp.building_name,
    unit: opp.unit_no,
    cashflows,
    xirr,
    totalOutflow: cashflows.filter(cf => cf.amount < 0).reduce((sum, cf) => sum + Math.abs(cf.amount), 0),
    totalInflow: cashflows.filter(cf => cf.amount > 0).reduce((sum, cf) => sum + cf.amount, 0)
  };
};

export default function Opportunities() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bonds, setBonds] = useState([]);
  const [realEstateOpps, setRealEstateOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRealEstateModal, setShowRealEstateModal] = useState(false);
  const [editingBond, setEditingBond] = useState(null);
  const [editingRealEstate, setEditingRealEstate] = useState(null);
  const [clientInvestments, setClientInvestments] = useState([]); // Track which properties client has invested in
  const [xirrModalData, setXirrModalData] = useState(null); // For XIRR calculation popup
  const [interestModal, setInterestModal] = useState(null); // For client interest modal {type: 'bond'/'real_estate', opportunity: {...}}

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
      
      // For clients, also fetch their investments to determine access level
      if (currentUser?.role === 'client' && currentUser?.client_id) {
        try {
          const investmentsRes = await axios.get(`${API}/holdings/client/${currentUser.client_id}`, { headers });
          const investedPropertyIds = (investmentsRes.data?.real_estate_holdings || []).map(h => h.property_id);
          setClientInvestments(investedPropertyIds);
        } catch (err) {
          console.error("Error fetching client investments:", err);
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
    }
  };

  // Check if client has detailed access to a property
  const hasDetailedAccess = (propertyId) => {
    if (!user) return false;
    if (user.role === 'broker' || user.role === 'sub_broker') return true;
    // Client only has detailed access to properties they've invested in
    return clientInvestments.includes(propertyId);
  };

  // Share functionality for sub-brokers
  const handleShare = (item, type) => {
    let shareText = "";
    if (type === 'bond') {
      shareText = `Investment Opportunity: ${item.name}\n\nPrincipal: ₹${item.principal_amount?.toLocaleString()}\nIRR: ${item.secondary_irr}%\nUnits Available: ${(item.total_units || 1) - (item.units_sold || 0)}\n\nView details and calculate returns!`;
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

  // Delete bond functionality for broker
  const handleDeleteBond = async (bondId) => {
    if (!window.confirm("Are you sure you want to delete this bond? This action cannot be undone.")) {
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/bonds/${bondId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Bond deleted successfully");
      // Refresh the bonds list
      const response = await axios.get(`${API}/bonds`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBonds(response.data.data || []);
    } catch (error) {
      console.error("Error deleting bond:", error);
      toast.error(error.response?.data?.detail || "Failed to delete bond");
    }
  };

  // Categorize by status
  const availableBonds = bonds.filter(b => b.status === 'available');
  const fundedBonds = bonds.filter(b => b.status === 'funded');
  const closedBonds = bonds.filter(b => b.status === 'closed');

  // Real Estate: available OR partially_invested should show in "Available" section
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

  // Bond Card - Same layout for all roles (matching Real Estate card style)
  const BondCard = ({ bond, status }) => {
    const unitsAvailable = (bond.total_units || 1) - (bond.units_sold || 0);
    const daysToMaturity = Math.ceil((new Date(bond.end_date) - new Date()) / (1000 * 60 * 60 * 24));
    const isBroker = user?.role === 'broker';
    const isSubBroker = user?.role === 'sub_broker';
    
    // Face value per unit
    const faceValue = bond.face_value || (bond.principal_amount / (bond.total_units || 1));
    
    // Calculate today's price per unit using secondary IRR
    // Price = NPV of remaining cashflows discounted at secondary IRR
    // Uses cutoff_days logic: only include payments more than cutoff_days from today
    const calculateTodayPrice = () => {
      const today = new Date();
      const secondaryIRR = (bond.secondary_irr || bond.primary_irr || 12) / 100; // Annual rate
      const cutoffDays = bond.cutoff_days ?? 15; // Default 15 days cutoff, use ?? to handle 0
      
      // If bond has cashflows_per_unit, use those with cutoff logic
      if (bond.cashflows_per_unit && bond.cashflows_per_unit.length > 0) {
        let npv = 0;
        for (const cf of bond.cashflows_per_unit) {
          const cfDate = new Date(cf.date);
          const daysFromToday = Math.floor((cfDate - today) / (1000 * 60 * 60 * 24));
          
          // Only include cashflows that are MORE than cutoff_days away
          // (payments within cutoff period go to seller, not buyer)
          if (daysFromToday > cutoffDays) {
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
        if (yearsToPayment * 365 > cutoffDays) { // Apply cutoff
          npv += paymentAmount / Math.pow(1 + secondaryIRR, yearsToPayment);
        }
      }
      
      // Add principal at maturity
      npv += faceValue / Math.pow(1 + secondaryIRR, yearsToMaturity);
      
      return npv > 0 ? npv : faceValue;
    };
    
    const todayPrice = calculateTodayPrice();
    
    // Calculate maturity date display
    const maturityDate = new Date(bond.end_date);
    const startDate = new Date(bond.start_date);

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-amber-500 transition-colors">
        {/* Header - Bond Name */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{bond.name}</h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Bond</Badge>
            {status === 'available' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Available</span>
            )}
            {status === 'funded' && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Fully Subscribed</span>
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

        {/* Price/Unit - Full Width */}
        <div className="bg-amber-50 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-500 mb-1">
            Price/Unit ({new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})
          </p>
          <p className="font-semibold text-amber-700">{formatCurrency(Math.round(todayPrice))}</p>
        </div>

        {/* Bond Info Grid - Row 1 */}
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
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Interested</p>
            <p className="text-2xl font-bold text-orange-500">{bond.interested_count || 0}</p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Investors</p>
            <p className="text-2xl font-bold text-indigo-600">
              {bond.current_investors || bond.units_sold || 0}
              <span className="text-gray-400 text-lg">/{bond.total_units || 1}</span>
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
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 mb-4">
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/bonds/${bond.id}`)}>
            <Eye className="h-4 w-4 mr-1" />
            View Details
          </Button>
          {isBroker && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="px-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                onClick={(e) => { e.stopPropagation(); setEditingBond(bond); }}
                title="Edit Bond"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="px-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={(e) => { e.stopPropagation(); handleDeleteBond(bond.id); }}
                title="Delete Bond"
                data-testid={`delete-bond-${bond.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
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

    // Cost breakdown for tooltip (only for users with access)
    const costBreakdown = canSeeDetails ? [
      { label: "Unit Price", value: opp.unit_price },
      { label: "DLD Fee", value: opp.dld_fee },
      { label: "Admin Fee", value: opp.admin_fee },
      { label: "Brokerage", value: opp.broker_fee },
      { label: "Other Fees", value: opp.other_fees },
    ].filter(item => item.value > 0) : [];

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 hover:border-teal-500 transition-colors">
        {/* Header - Property Name */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{opp.building_name}</h3>
              <p className="text-sm text-gray-500">Unit {opp.unit_no} • Floor {opp.floor}</p>
              {opp.unit_type && (
                <p className="text-xs text-teal-600 font-medium">{opp.unit_type}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Off-Plan</Badge>
            {status === 'available' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Available</span>
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
          {/* Price per sqft */}
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Price/sqft</p>
            <p className="font-semibold text-blue-700">{formatCurrency(opp.price_per_sqft || (opp.total_cost / opp.total_area), 'AED')}</p>
          </div>
          
          {/* Expected Sale Price */}
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Expected Sale/sqft</p>
            <p className="font-semibold text-green-700">
              {opp.expected_sale_rate ? formatCurrency(opp.expected_sale_rate, 'AED') : 'TBD'}
            </p>
          </div>
        </div>

        {/* Sale & Returns Info - Third Row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Expected Sale Date */}
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Expected Sale Date</p>
            <p className="font-semibold text-amber-700">
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

        {/* Interest & Investors - Different visibility based on role */}
        <div className="flex items-center justify-between mb-4 py-3 border-t border-b border-gray-100">
          {canSeeDetails ? (
            <>
              <div className="text-center flex-1">
                <p className="text-xs text-gray-500">Interested</p>
                <p className="font-bold text-amber-600">{opp.interested_count || 0}</p>
              </div>
              <div className="w-px h-8 bg-gray-200"></div>
              <div className="text-center flex-1">
                <p className="text-xs text-gray-500">Investors</p>
                <p className="font-bold text-purple-600">{opp.current_investors || 0} <span className="text-gray-400 font-normal">/ 4</span></p>
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

        {/* Payment Progress - only show for users with detailed access */}
        {canSeeDetails && opp.payment_schedule && opp.payment_schedule.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">Payment Progress</span>
              <span className="font-medium text-teal-600">{opp.total_payment_percentage_completed || 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${opp.total_payment_percentage_completed || 0}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1" 
            onClick={() => navigate(getDetailPath('real-estate', opp.id))}
          >
            <Eye className="h-4 w-4 mr-1" />
            View Details
          </Button>
          {isBroker && (
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
              <p className="text-sm text-gray-500 mt-1">All investment opportunities - Bonds and Real Estate</p>
            </div>
            {isBroker && (
              <div className="flex items-center gap-3">
                <Button 
                  onClick={() => navigate("/bonds/create")} 
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Bonds
                </Button>
                <Button 
                  onClick={() => setShowRealEstateModal(true)} 
                  variant="outline"
                  className="border-teal-500 text-teal-600 hover:bg-teal-50 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Real Estate
                </Button>
              </div>
            )}
            {!isBroker && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-teal-100 text-teal-700 text-sm rounded-full font-medium">
                  {availableCount + fundedCount + closedCount} Total
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Edit Bond Modal */}
        {editingBond && (
          <EditBondModal 
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

        {/* Edit Real Estate Modal */}
        {editingRealEstate && (
          <CreateRealEstateModal 
            opportunity={editingRealEstate}
            onClose={() => setEditingRealEstate(null)} 
            onSuccess={() => { setEditingRealEstate(null); fetchData(user); }}
          />
        )}

        {/* Tabs by Status */}
        <div className="p-8">
          <Tabs defaultValue="available" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="available" className="px-8" data-testid="tab-available">
                Available ({availableCount})
              </TabsTrigger>
              <TabsTrigger value="funded" className="px-8" data-testid="tab-funded">
                Funded/Invested ({fundedCount})
              </TabsTrigger>
              <TabsTrigger value="closed" className="px-8" data-testid="tab-closed">
                Closed/Exited ({closedCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="available">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : availableCount === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No available opportunities</p>
                  {isBroker && (
                    <>
                      <Button onClick={() => navigate("/bonds/create")} className="mr-2">Add Bond</Button>
                      <Button onClick={() => setShowRealEstateModal(true)} variant="outline">Add Real Estate</Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="available" />
                  ))}
                  {availableRE.map(opp => (
                    <RealEstateCard key={opp.id} opp={opp} status="available" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="funded">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : fundedCount === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No funded/invested opportunities yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fundedBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="funded" />
                  ))}
                  {investedRE.map(opp => (
                    <RealEstateCard key={opp.id} opp={opp} status="invested" />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="closed">
              {loading ? (
                <p className="text-center text-gray-500 py-12">Loading...</p>
              ) : closedCount === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No closed opportunities yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {closedBonds.map(bond => (
                    <BondCard key={bond.id} bond={bond} status="closed" />
                  ))}
                  {closedRE.map(opp => (
                    <RealEstateCard key={opp.id} opp={opp} status="closed" />
                  ))}
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
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
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
    </div>
  );
}
