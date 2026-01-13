import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  Building2, MapPin, ArrowLeft, Calendar, Users, Check, 
  DollarSign, Ruler, Car, CheckCircle2, Clock, Plus, Upload, FileText, X, CreditCard, TrendingUp,
  Calculator, Heart, UserPlus, Info
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
  
  // XIRR Calculator state
  const [xirrSaleStage, setXirrSaleStage] = useState(100); // % of payment completed when sold
  const [xirrSaleDate, setXirrSaleDate] = useState("");
  const [xirrSaleRate, setXirrSaleRate] = useState(""); // per sqft

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
    fetchData();
  }, [id, navigate]);

  const fetchData = async () => {
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
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // XIRR Calculation Function - flexible version for calculator
  const calculateXIRRWithParams = (opp, saleStagePercent, saleDateStr, saleRatePerSqft) => {
    if (!opp || !opp.unit_price || !opp.payment_schedule || opp.payment_schedule.length === 0) return null;
    if (!saleRatePerSqft || !opp.total_area || !saleDateStr) return null;
    
    const sortedSchedule = [...opp.payment_schedule]
      .filter(p => p.date && p.percentage)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sortedSchedule.length === 0) return null;

    const cashFlows = [];
    const unitPrice = opp.unit_price;
    const upfrontAmount = (opp.dld_fee || 0) + (opp.admin_fee || 0);
    
    // Calculate cumulative percentage to determine which payments are made before sale
    let cumulativePercent = 0;
    let isFirstPayment = true;
    
    sortedSchedule.forEach(milestone => {
      const pct = parseFloat(milestone.percentage) || 0;
      cumulativePercent += pct;
      
      // Only include payments up to the sale stage
      if (cumulativePercent <= saleStagePercent) {
        const amount = unitPrice * pct / 100;
        const totalAmount = isFirstPayment ? amount + upfrontAmount : amount;
        cashFlows.push({ date: new Date(milestone.date), amount: -totalAmount });
        isFirstPayment = false;
      } else if (cumulativePercent - pct < saleStagePercent) {
        // Partial payment for the milestone that crosses the threshold
        const remainingPct = saleStagePercent - (cumulativePercent - pct);
        if (remainingPct > 0) {
          const amount = unitPrice * remainingPct / 100;
          const totalAmount = isFirstPayment ? amount + upfrontAmount : amount;
          cashFlows.push({ date: new Date(milestone.date), amount: -totalAmount });
          isFirstPayment = false;
        }
      }
    });

    if (cashFlows.length === 0) return null;

    // Add sale proceeds
    const expectedSaleValue = parseFloat(saleRatePerSqft) * opp.total_area;
    const sellingFee = expectedSaleValue * (opp.unit_selling_fee_percentage || 0) / 100;
    cashFlows.push({ date: new Date(saleDateStr), amount: expectedSaleValue - sellingFee });

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
        if (Math.abs(newRate - rate) < tol) return newRate * 100;
        rate = newRate;
      }
      return rate * 100;
    } catch (e) { return null; }
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
            <div className="grid grid-cols-5 gap-3 text-sm">
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
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                <p className="text-purple-600 font-medium">Selling Fee</p>
                <p className="text-lg font-bold text-purple-800">{opp.unit_selling_fee_percentage || 0}%</p>
                <p className="text-xs text-purple-500">of sale price</p>
              </div>
            </div>
          </div>

          {/* Payment Schedule */}
          {opp.payment_schedule && opp.payment_schedule.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-teal-600" />
                  Payment Schedule
                </h2>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">Progress: <span className="font-bold text-teal-600">{opp.total_payment_percentage_completed || 0}%</span></span>
                  <Button size="sm" variant="outline" onClick={() => setShowPaymentManagement(true)}>
                    Manage
                  </Button>
                </div>
              </div>
              
              <div className="w-full bg-gray-100 rounded-full h-3 mb-6">
                <div className="bg-teal-500 h-3 rounded-full transition-all" style={{ width: `${opp.total_payment_percentage_completed || 0}%` }} />
              </div>

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
                    <Label className="text-sm font-medium text-gray-700">Sale Stage (% of payments completed)</Label>
                    <div className="mt-2">
                      <Slider
                        value={[xirrSaleStage]}
                        onValueChange={(v) => setXirrSaleStage(v[0])}
                        max={100}
                        min={10}
                        step={10}
                        className="mb-2"
                      />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>10%</span>
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
                      placeholder={`e.g., ${Math.round((opp.unit_price / opp.total_area) * 1.2)}`}
                      value={xirrSaleRate}
                      onChange={(e) => setXirrSaleRate(e.target.value)}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Current rate: AED {formatCurrency(Math.round(opp.unit_price / opp.total_area))}/sqft
                    </p>
                  </div>
                </div>

                {/* Results */}
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Projected Returns</h3>
                  
                  {xirrSaleDate && xirrSaleRate ? (
                    <>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Sale Value</span>
                          <span className="font-bold text-gray-800">AED {formatCurrency(parseFloat(xirrSaleRate) * opp.total_area)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Amount Invested ({xirrSaleStage}%)</span>
                          <span className="font-medium text-gray-800">AED {formatCurrency(opp.unit_price * xirrSaleStage / 100 + opp.dld_fee + opp.admin_fee)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-gray-600">Gross Profit</span>
                          <span className={`font-bold ${(parseFloat(xirrSaleRate) * opp.total_area) - (opp.unit_price * xirrSaleStage / 100 + opp.dld_fee + opp.admin_fee) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            AED {formatCurrency((parseFloat(xirrSaleRate) * opp.total_area) - (opp.unit_price * xirrSaleStage / 100 + opp.dld_fee + opp.admin_fee))}
                          </span>
                        </div>
                      </div>
                      
                      {/* XIRR Result */}
                      {(() => {
                        const xirr = calculateXIRRWithParams(opp, xirrSaleStage, xirrSaleDate, parseFloat(xirrSaleRate));
                        if (xirr !== null) {
                          return (
                            <div className={`mt-4 p-4 rounded-lg ${xirr >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
                              <p className={`text-sm ${xirr >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Expected XIRR</p>
                              <p className={`text-4xl font-bold ${xirr >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{xirr.toFixed(2)}%</p>
                              <p className="text-xs text-gray-600 mt-1">Annualized return</p>
                            </div>
                          );
                        }
                        return (
                          <div className="mt-4 p-4 rounded-lg bg-yellow-50">
                            <p className="text-sm text-yellow-700">Unable to calculate XIRR. Check payment schedule dates.</p>
                          </div>
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

          {/* Interest & Participation Section */}
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
        </div>
                  </div>
                  {/* Show Units only for FRACTIONAL properties */}
                  {opp.property_type === 'fractional' && (
                    <div>
                      <p className="text-sm text-gray-500">Total Units</p>
                      <p className="text-2xl font-bold text-indigo-600">{formatCurrency(opp.total_units || Math.floor(opp.total_cost / 500))} units</p>
                      <p className="text-xs text-gray-400">@ 500 AED per unit</p>
                    </div>
                  )}
                  {/* Show Max Investors for OFF-PLAN properties */}
                  {opp.property_type === 'off_plan' && (
                    <div>
                      <p className="text-sm text-gray-500">Max Investors</p>
                      <p className="text-2xl font-bold text-orange-600">{opp.max_investors || 4}</p>
                      <p className="text-xs text-gray-400">percentage-based</p>
                    </div>
                  )}
                </div>
                
                {/* Fee Breakdown - Absolute Amounts */}
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Fee Breakdown (Absolute Amounts)
                    {opp.property_type === 'off_plan' && <span className="text-xs text-orange-600 ml-2">* DLD excluded from payment schedule</span>}
                  </h3>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className={`rounded-lg p-3 ${opp.property_type === 'off_plan' ? 'bg-orange-50 border border-orange-200' : 'bg-blue-50'}`}>
                      <p className={`font-medium ${opp.property_type === 'off_plan' ? 'text-orange-600' : 'text-blue-600'}`}>DLD Fee *</p>
                      <p className={`text-lg font-bold ${opp.property_type === 'off_plan' ? 'text-orange-800' : 'text-blue-800'}`}>AED {formatCurrency(opp.dld_fee)}</p>
                      <p className={`text-xs ${opp.property_type === 'off_plan' ? 'text-orange-500' : 'text-blue-500'}`}>({opp.dld_fee_percentage}%)</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-green-600 font-medium">Admin Fee</p>
                      <p className="text-lg font-bold text-green-800">AED {formatCurrency(opp.admin_fee)}</p>
                      <p className="text-xs text-green-500">({opp.admin_fee_percentage}%)</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-amber-600 font-medium">Brokerage</p>
                      <p className="text-lg font-bold text-amber-800">AED {formatCurrency(opp.broker_fee)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-gray-600 font-medium">Other Fees</p>
                      <p className="text-lg font-bold text-gray-800">AED {formatCurrency(opp.other_fees)}</p>
                    </div>
                  </div>
                </div>

                {/* Management Fees */}
                {(opp.upfront_fee || opp.trailer_fee || opp.management_fee || opp.unit_selling_fee) && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Management Fees</h3>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-purple-600 font-medium">Upfront Fee</p>
                        <p className="text-lg font-bold text-purple-800">AED {formatCurrency(opp.upfront_fee || 0)}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-purple-600 font-medium">Trailer Fee</p>
                        <p className="text-lg font-bold text-purple-800">AED {formatCurrency(opp.trailer_fee || 0)}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-purple-600 font-medium">Management Fee</p>
                        <p className="text-lg font-bold text-purple-800">AED {formatCurrency(opp.management_fee || 0)}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-purple-600 font-medium">Unit Selling Fee</p>
                        <p className="text-lg font-bold text-purple-800">AED {formatCurrency(opp.unit_selling_fee || 0)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Schedule Overview (Read-only) */}
              {opp.payment_schedule && opp.payment_schedule.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-teal-600" />
                      Payment Schedule
                    </h2>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">Progress: <span className="font-bold text-teal-600">{opp.total_payment_percentage_completed || 0}%</span></span>
                      <Button size="sm" variant="outline" onClick={() => setShowPaymentManagement(true)}>
                        Manage
                      </Button>
                    </div>
                  </div>
                  
                  <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
                    <div className="bg-teal-500 h-3 rounded-full" style={{ width: `${opp.total_payment_percentage_completed || 0}%` }} />
                  </div>

                  {opp.is_eligible_to_sell && (
                    <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Eligible to sell</span>
                    </div>
                  )}

                  {/* Simple timeline view */}
                  <div className="flex items-center justify-between gap-2">
                    {opp.payment_schedule.map((payment, idx) => (
                      <div key={idx} className="flex-1 text-center">
                        <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-sm ${
                          payment.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {payment.completed ? <Check className="h-4 w-4" /> : idx + 1}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{payment.percentage}%</p>
                        <p className="text-xs text-gray-400">{payment.description || `P${idx + 1}`}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Investors Section */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Users className="h-5 w-5 text-teal-600" />
                    Investors ({opp.current_investors || 0}{opp.property_type === 'off_plan' ? `/${opp.max_investors || 4}` : ''})
                  </h2>
                  {opp.status === 'available' && (
                    (opp.property_type === 'fractional' && (opp.units_available > 0)) ||
                    (opp.property_type === 'off_plan' && remainingPercentage > 0 && (opp.current_investors || 0) < (opp.max_investors || 4))
                  ) && (
                    <Button size="sm" variant="outline" onClick={() => setShowAllocateModal(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  )}
                </div>

                {/* Investment Progress - Different display based on property type */}
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  {opp.property_type === 'fractional' ? (
                    <>
                      {/* FRACTIONAL: Units-based progress */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Units Sold</span>
                        <span className="font-medium">{formatCurrency(opp.units_sold || 0)} / {formatCurrency(opp.total_units || 0)} units</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${opp.total_units ? ((opp.units_sold || 0) / opp.total_units) * 100 : 0}%` }} />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Invested: AED {formatCurrency(opp.total_invested || 0)}</span>
                        <span className="text-teal-600 font-medium">Available: {formatCurrency(opp.units_available || 0)} units</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* OFF-PLAN: Percentage-based progress */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Investment Allocation</span>
                        <span className="font-medium">{(100 - remainingPercentage).toFixed(1)}% allocated</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${100 - remainingPercentage}%` }} />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Invested: AED {formatCurrency(opp.total_invested || 0)}</span>
                        <span className="text-orange-600 font-medium">Remaining: {remainingPercentage.toFixed(1)}% (AED {formatCurrency(remainingAmount)})</span>
                      </div>
                    </>
                  )}
                </div>
                
                {opp.investors && opp.investors.length > 0 ? (
                  <div className="space-y-3">
                    {opp.investors.map((investor, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{investor.client_name}</p>
                          <p className="text-sm text-gray-500">Invested on {formatDate(investor.invested_at)}</p>
                        </div>
                        <div className="text-right">
                          {opp.property_type === 'fractional' && investor.units && (
                            <p className="font-bold text-indigo-600">{formatCurrency(investor.units)} units</p>
                          )}
                          <p className={`${opp.property_type === 'off_plan' ? 'font-bold text-orange-600' : 'text-sm text-gray-500'}`}>
                            {investor.share_percentage}%
                          </p>
                          <p className="text-sm text-gray-500">AED {formatCurrency(investor.amount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No investors yet</p>
                    <Button size="sm" className="mt-3" onClick={() => setShowAllocateModal(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Add First Investor
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Property Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Ruler className="h-5 w-5 text-teal-600" />
                  Property Details
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between"><span className="text-gray-500">Total Area</span><span className="font-medium">{opp.total_area} sqft</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Carpet Area</span><span className="font-medium">{opp.carpet_area} sqft</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Balcony Area</span><span className="font-medium">{opp.balcony_area || 0} sqft</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Parking</span><span className="font-medium flex items-center gap-1"><Car className="h-4 w-4" /> {opp.parking_spaces || 0}</span></div>
                  {opp.developer_name && <div className="flex justify-between"><span className="text-gray-500">Developer</span><span className="font-medium">{opp.developer_name}</span></div>}
                  {opp.handover_date && <div className="flex justify-between"><span className="text-gray-500">Handover</span><span className="font-medium">{formatDate(opp.handover_date)}</span></div>}
                </div>
              </div>

              {/* Sale Settings & Returns */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-teal-600" />
                  Expected Returns
                </h2>
                <div className="space-y-4">
                  {opp.expected_sale_rate ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Expected Rate</span><span className="font-medium">AED {formatCurrency(opp.expected_sale_rate)}/sqft</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Expected Value</span><span className="font-bold text-teal-600">AED {formatCurrency(opp.expected_sale_rate * opp.total_area)}</span></div>
                      
                      {/* Expected Profit */}
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <p className="text-sm text-green-600 mb-1">Estimated Profit</p>
                        <p className="text-2xl font-bold text-green-700">AED {formatCurrency((opp.expected_sale_rate * opp.total_area) - opp.total_cost)}</p>
                      </div>
                      
                      {/* XIRR Display */}
                      {(() => {
                        const xirr = calculateXIRR(opp);
                        if (xirr !== null) {
                          return (
                            <div className={`rounded-lg p-4 border ${xirr >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                              <p className={`text-sm mb-1 ${xirr >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Expected XIRR</p>
                              <p className={`text-2xl font-bold ${xirr >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{xirr.toFixed(2)}%</p>
                              <p className="text-xs text-gray-500 mt-1">Annualized return based on payment schedule</p>
                            </div>
                          );
                        } else if (opp.payment_schedule?.length > 0 && opp.estimated_sell_date) {
                          return (
                            <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                              <p className="text-sm text-yellow-700">XIRR requires complete payment schedule with dates</p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </>
                  ) : (
                    <p className="text-gray-400 text-sm">Set expected sale rate to view returns</p>
                  )}
                  {opp.estimated_sell_date && <div className="flex justify-between"><span className="text-gray-500">Est. Sell Date</span><span className="font-medium">{formatDate(opp.estimated_sell_date)}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Eligible After</span><span className="font-medium">{opp.eligible_to_sell_after_percentage || 100}%</span></div>
                  <div className="pt-2">
                    {opp.is_eligible_to_sell ? (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg"><CheckCircle2 className="h-5 w-5" /><span className="font-medium">Ready to Sell</span></div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg"><Clock className="h-5 w-5" /><span className="font-medium">Not yet eligible</span></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Investment Limits */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Investment Limits</h2>
                {opp.property_type === 'off_plan' ? (
                  <div className="space-y-2">
                    <p className="text-gray-500">Maximum 4 investors</p>
                    <p className="text-gray-500">Custom allocation (1-100%)</p>
                    <div className="pt-2 border-t">
                      <p className="text-sm text-gray-500">Available for investment:</p>
                      <p className="text-xl font-bold text-purple-600">{remainingPercentage.toFixed(1)}%</p>
                      <p className="text-sm text-gray-500">AED {formatCurrency(remainingAmount)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-gray-500">Max per investor:</p>
                    <p className="font-medium text-teal-600">$50,000 USD (~AED 183,500)</p>
                    <p className="text-sm text-gray-400 mt-2">Remaining: AED {formatCurrency(remainingAmount)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
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
