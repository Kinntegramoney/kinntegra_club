import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import REBrokerSidebar from "@/components/REBrokerSidebar";
import CreateRealEstateModal from "@/components/CreateRealEstateModal";
import { 
  Building2, MapPin, ArrowLeft, Calendar, Users, 
  DollarSign, Ruler, Car, CheckCircle2, Clock, Plus,
  Calculator, TrendingUp, Edit2, ChevronLeft, ChevronRight, Handshake, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function REBrokerPropertyDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [brokerProfile, setBrokerProfile] = useState(null);
  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // XIRR Calculator state
  const [xirrSaleStage, setXirrSaleStage] = useState(100);
  const [xirrSaleDate, setXirrSaleDate] = useState("");
  const [xirrSaleRate, setXirrSaleRate] = useState("");
  const [calculatedXirr, setCalculatedXirr] = useState(null);
  
  // Currency state
  const [selectedCurrency, setSelectedCurrency] = useState('AED');
  const currencyRates = {
    AED: 1, INR: 22.75, USD: 0.27, EUR: 0.25, GBP: 0.21
  };
  const currencySymbols = {
    AED: 'د.إ', INR: '₹', USD: '$', EUR: '€', GBP: '£'
  };

  useEffect(() => {
    document.title = "Kinntegraa | Property Details";
    
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    
    if (!userData || !token) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "re_broker") {
      navigate("/login");
      return;
    }
    
    setUser(parsedUser);
    fetchBrokerProfile(token);
    fetchOpportunity(token);
  }, [navigate, id]);

  const fetchBrokerProfile = async (token) => {
    try {
      const response = await axios.get(`${API}/re-broker/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBrokerProfile(response.data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchOpportunity = async (token) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/real-estate-opportunities/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOpportunity(response.data);
      
      // Initialize XIRR values
      if (response.data?.eligible_to_sell_after_percentage) {
        setXirrSaleStage(response.data.eligible_to_sell_after_percentage);
      }
      if (response.data?.expected_sale_rate) {
        setXirrSaleRate(response.data.expected_sale_rate.toString());
      }
      if (response.data?.estimated_sell_date) {
        setXirrSaleDate(response.data.estimated_sell_date);
      }
    } catch (error) {
      console.error("Error fetching opportunity:", error);
      toast.error("Failed to load property details");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'AED') => {
    if (!amount) return '-';
    const rate = currencyRates[currency] || 1;
    const converted = amount * rate;
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(converted);
  };

  // XIRR Calculation
  const calculateXIRR = useCallback(() => {
    if (!opportunity || !xirrSaleDate || !xirrSaleRate) {
      setCalculatedXirr(null);
      return;
    }

    const totalArea = opportunity.total_area || 0;
    const unitPrice = opportunity.unit_price || opportunity.total_cost || 0;
    const salePrice = parseFloat(xirrSaleRate) * totalArea;
    const profit = salePrice - unitPrice;
    
    // Simple ROI calculation
    const paymentSchedule = opportunity.payment_schedule || [];
    const today = new Date();
    const sellDate = new Date(xirrSaleDate);
    const yearsDiff = (sellDate - today) / (365 * 24 * 60 * 60 * 1000);
    
    if (yearsDiff <= 0) {
      setCalculatedXirr(null);
      return;
    }

    // Calculate XIRR using Newton-Raphson approximation
    let totalInvestment = 0;
    const cashFlows = [];
    const dates = [];

    // Payment outflows
    paymentSchedule.forEach(payment => {
      const paymentAmount = (unitPrice * payment.percentage) / 100;
      const paymentDate = new Date(payment.date);
      
      // Only include payments up to the sale stage percentage
      const cumulativePercentage = paymentSchedule
        .filter(p => new Date(p.date) <= paymentDate)
        .reduce((sum, p) => sum + p.percentage, 0);
      
      if (cumulativePercentage <= xirrSaleStage) {
        totalInvestment += paymentAmount;
        cashFlows.push(-paymentAmount);
        dates.push(paymentDate);
      }
    });

    // Sale inflow
    const adjustedSalePrice = salePrice * (xirrSaleStage / 100);
    cashFlows.push(adjustedSalePrice);
    dates.push(sellDate);

    // Calculate XIRR
    const xirr = calculateXIRRValue(cashFlows, dates);
    setCalculatedXirr({
      xirr: xirr,
      totalInvestment: totalInvestment,
      salePrice: adjustedSalePrice,
      profit: adjustedSalePrice - totalInvestment,
      roi: ((adjustedSalePrice - totalInvestment) / totalInvestment) * 100
    });
  }, [opportunity, xirrSaleDate, xirrSaleRate, xirrSaleStage]);

  // XIRR calculation helper
  const calculateXIRRValue = (cashFlows, dates) => {
    if (cashFlows.length !== dates.length || cashFlows.length < 2) return null;
    
    const yearFrac = (d1, d2) => (d2 - d1) / (365 * 24 * 60 * 60 * 1000);
    
    let guess = 0.1;
    const maxIterations = 100;
    const tolerance = 0.0001;
    
    for (let i = 0; i < maxIterations; i++) {
      let npv = 0;
      let dnpv = 0;
      
      for (let j = 0; j < cashFlows.length; j++) {
        const t = yearFrac(dates[0], dates[j]);
        const factor = Math.pow(1 + guess, t);
        npv += cashFlows[j] / factor;
        dnpv -= t * cashFlows[j] / (factor * (1 + guess));
      }
      
      const newGuess = guess - npv / dnpv;
      
      if (Math.abs(newGuess - guess) < tolerance) {
        return newGuess * 100; // Return as percentage
      }
      
      guess = newGuess;
    }
    
    return guess * 100;
  };

  useEffect(() => {
    calculateXIRR();
  }, [calculateXIRR]);

  const getImageSrc = (img) => {
    if (!img) return '';
    if (typeof img === 'string') return img;
    if (img.data) return `data:${img.content_type || 'image/jpeg'};base64,${img.data}`;
    return img.url || '';
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Property not found</p>
            <Button onClick={() => navigate('/re-broker/opportunities')} className="mt-4">
              Back to Opportunities
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <REBrokerSidebar user={user} brokerProfile={brokerProfile} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate('/re-broker/opportunities')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">{opportunity.building_name}</h1>
                <p className="text-sm text-gray-500">Unit {opportunity.unit_no} • {opportunity.location}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                onClick={() => setShowEditModal(true)}
                className="gap-2"
              >
                <Edit2 className="h-4 w-4" />
                Edit Property
              </Button>
              <Button 
                variant="outline"
                className="gap-2 text-purple-600 border-purple-200 hover:bg-purple-50"
                onClick={() => toast.info("Request platform support - coming soon")}
              >
                <Handshake className="h-4 w-4" />
                Request Support
              </Button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column - Property Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Image Gallery */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="relative h-80 bg-gray-100">
                  {opportunity.images && opportunity.images.length > 0 ? (
                    <>
                      <img 
                        src={getImageSrc(opportunity.images[currentImageIndex])}
                        alt={`${opportunity.building_name}`}
                        className="w-full h-full object-cover"
                      />
                      {opportunity.images.length > 1 && (
                        <>
                          <button 
                            onClick={() => setCurrentImageIndex(prev => (prev - 1 + opportunity.images.length) % opportunity.images.length)}
                            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center"
                          >
                            <ChevronLeft className="h-6 w-6" />
                          </button>
                          <button 
                            onClick={() => setCurrentImageIndex(prev => (prev + 1) % opportunity.images.length)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center"
                          >
                            <ChevronRight className="h-6 w-6" />
                          </button>
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                            {opportunity.images.map((_, idx) => (
                              <button
                                key={idx}
                                onClick={() => setCurrentImageIndex(idx)}
                                className={`w-2 h-2 rounded-full ${idx === currentImageIndex ? 'bg-white' : 'bg-white/50'}`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="h-20 w-20 text-gray-300" />
                    </div>
                  )}
                </div>
              </div>

              {/* Property Info */}
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Property Details</h2>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Building2 className="h-5 w-5 text-teal-600" />
                    <div>
                      <p className="text-xs text-gray-500">Unit Type</p>
                      <p className="font-medium">{opportunity.unit_type || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Ruler className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-xs text-gray-500">Total Area</p>
                      <p className="font-medium">{opportunity.total_area?.toLocaleString()} sqft</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <MapPin className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="text-xs text-gray-500">Floor</p>
                      <p className="font-medium">{opportunity.floor || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Car className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="text-xs text-gray-500">Parking</p>
                      <p className="font-medium">{opportunity.parking_spaces || 0} spaces</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Calendar className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="text-xs text-gray-500">Handover</p>
                      <p className="font-medium">{opportunity.handover_date || 'TBD'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Users className="h-5 w-5 text-indigo-600" />
                    <div>
                      <p className="text-xs text-gray-500">Developer</p>
                      <p className="font-medium">{opportunity.developer_name || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Schedule */}
              {opportunity.payment_schedule && opportunity.payment_schedule.length > 0 && (
                <div className="bg-white rounded-xl border p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-4">Payment Schedule</h2>
                  
                  <div className="space-y-3">
                    {opportunity.payment_schedule
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                      .map((payment, idx) => {
                        const amount = (opportunity.unit_price || 0) * payment.percentage / 100;
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center text-sm font-medium text-teal-700">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">
                                  {payment.description || `Milestone ${idx + 1}`}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {new Date(payment.date).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-teal-700">{payment.percentage}%</p>
                              <p className="text-sm text-gray-500">{formatCurrency(amount)}</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Pricing & XIRR */}
            <div className="space-y-6">
              {/* Pricing Card */}
              <div className="bg-white rounded-xl border p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Pricing</h2>
                
                <div className="space-y-4">
                  <div className="p-4 bg-teal-50 rounded-lg">
                    <p className="text-sm text-gray-500">Unit Price</p>
                    <p className="text-2xl font-bold text-teal-700">
                      {formatCurrency(opportunity.unit_price || opportunity.total_cost)}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">DLD Fee</p>
                      <p className="font-semibold">{formatCurrency(
                        (opportunity.unit_price || 0) * (opportunity.dld_fee_percentage || 4) / 100
                      )}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Admin Fee</p>
                      <p className="font-semibold">{formatCurrency(opportunity.admin_fee)}</p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 rounded-lg relative group cursor-help">
                    <p className="text-sm text-gray-500">Price per sqft</p>
                    <p className="text-xl font-bold text-blue-700">
                      {formatCurrency(
                        (opportunity.unit_price || opportunity.total_cost || 0) / (opportunity.total_area || 1)
                      )}/sqft
                    </p>

                    <div className="absolute z-20 invisible group-hover:visible bg-gray-900 text-white text-xs rounded-lg p-3 w-64 -right-2 top-full mt-1 shadow-lg">
                      <p className="font-medium mb-2 text-gray-200">How it's derived</p>
                      <div className="flex justify-between py-0.5">
                        <span className="text-gray-400">Unit Price</span>
                        <span>{formatCurrency(opportunity.unit_price || opportunity.total_cost)}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-gray-400">÷ Total Area</span>
                        <span>{opportunity.total_area?.toLocaleString() || 0} sqft</span>
                      </div>
                      <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between font-medium">
                        <span>= Price/sqft</span>
                        <span>{formatCurrency((opportunity.unit_price || opportunity.total_cost || 0) / (opportunity.total_area || 1))}/sqft</span>
                      </div>
                      <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-500">Expected Sale Rate</p>
                    <p className="text-xl font-bold text-green-700">
                      {opportunity.expected_sale_rate 
                        ? `${formatCurrency(opportunity.expected_sale_rate)}/sqft`
                        : 'TBD'}
                    </p>
                  </div>
                </div>
              </div>

              {/* XIRR Calculator */}
              <div className="bg-white rounded-xl border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calculator className="h-5 w-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-gray-800">XIRR Calculator</h2>
                </div>
                
                <div className="space-y-4">
                  {/* Sale Stage Slider */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <Label className="text-sm">Sale at Payment Stage</Label>
                      <span className="text-sm font-medium text-purple-600">{xirrSaleStage}%</span>
                    </div>
                    <Slider
                      value={[xirrSaleStage]}
                      onValueChange={(val) => setXirrSaleStage(val[0])}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Eligible to sell after: {opportunity.eligible_to_sell_after_percentage || 100}%
                    </p>
                  </div>
                  
                  {/* Expected Sale Date */}
                  <div>
                    <Label className="text-sm">Expected Sale Date</Label>
                    <Input
                      type="date"
                      value={xirrSaleDate}
                      onChange={(e) => setXirrSaleDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  
                  {/* Expected Sale Rate */}
                  <div>
                    <Label className="text-sm">Expected Sale Rate (AED/sqft)</Label>
                    <Input
                      type="number"
                      value={xirrSaleRate}
                      onChange={(e) => setXirrSaleRate(e.target.value)}
                      placeholder="e.g., 2500"
                      className="mt-1"
                    />
                  </div>
                  
                  {/* Results */}
                  {calculatedXirr && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100">
                      <div className="text-center mb-3">
                        <p className="text-sm text-gray-500">Projected XIRR</p>
                        <p className={`text-3xl font-bold ${calculatedXirr.xirr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {calculatedXirr.xirr?.toFixed(2)}%
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white/50 p-2 rounded">
                          <p className="text-xs text-gray-500">Total Investment</p>
                          <p className="font-semibold">{formatCurrency(calculatedXirr.totalInvestment)}</p>
                        </div>
                        <div className="bg-white/50 p-2 rounded">
                          <p className="text-xs text-gray-500">Sale Price</p>
                          <p className="font-semibold">{formatCurrency(calculatedXirr.salePrice)}</p>
                        </div>
                        <div className="bg-white/50 p-2 rounded">
                          <p className="text-xs text-gray-500">Profit</p>
                          <p className={`font-semibold ${calculatedXirr.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(calculatedXirr.profit)}
                          </p>
                        </div>
                        <div className="bg-white/50 p-2 rounded">
                          <p className="text-xs text-gray-500">ROI</p>
                          <p className={`font-semibold ${calculatedXirr.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {calculatedXirr.roi?.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Visibility Status</span>
                  <Badge className="bg-green-100 text-green-700">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
                    Private
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Property Modal */}
      {showEditModal && (
        <CreateRealEstateModal 
          opportunity={opportunity}
          onClose={() => setShowEditModal(false)} 
          onSuccess={() => {
            setShowEditModal(false);
            fetchOpportunity(localStorage.getItem("token"));
          }}
        />
      )}
    </div>
  );
}
