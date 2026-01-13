import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  Building2, MapPin, ArrowLeft, Calendar, Users, Check, 
  DollarSign, Ruler, Car, CheckCircle2, Clock, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function RealEstateDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
    fetchOpportunity();
  }, [id, navigate]);

  const fetchOpportunity = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/real-estate-opportunities/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOpportunity(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching opportunity:", error);
      toast.error("Failed to load property details");
      setLoading(false);
    }
  };

  const handleMarkPayment = async (paymentIndex) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/real-estate-opportunities/${id}/record-payment?payment_index=${paymentIndex}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Payment milestone marked as completed");
      fetchOpportunity();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record payment");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Main Details */}
            <div className="col-span-2 space-y-6">
              {/* Financial Summary */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-teal-600" />
                  Financial Summary
                </h2>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-500">Unit Price</p>
                    <p className="text-2xl font-bold text-gray-800">AED {formatCurrency(opp.unit_price)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Cost (incl. fees)</p>
                    <p className="text-2xl font-bold text-teal-600">AED {formatCurrency(opp.total_cost)}</p>
                  </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Fee Breakdown</h3>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-blue-600 font-medium">DLD Fee</p>
                      <p className="text-lg font-bold text-blue-800">{opp.dld_fee_percentage}%</p>
                      <p className="text-xs text-blue-600">AED {formatCurrency(opp.dld_fee)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-green-600 font-medium">Admin Fee</p>
                      <p className="text-lg font-bold text-green-800">{opp.admin_fee_percentage}%</p>
                      <p className="text-xs text-green-600">AED {formatCurrency(opp.admin_fee)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-amber-600 font-medium">Broker Fee</p>
                      <p className="text-lg font-bold text-amber-800">AED {formatCurrency(opp.broker_fee)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-gray-600 font-medium">Other Fees</p>
                      <p className="text-lg font-bold text-gray-800">AED {formatCurrency(opp.other_fees)}</p>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Progress:</span>
                      <span className="font-bold text-teal-600">{opp.total_payment_percentage_completed || 0}%</span>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-100 rounded-full h-3 mb-6">
                    <div 
                      className="bg-teal-500 h-3 rounded-full transition-all" 
                      style={{ width: `${opp.total_payment_percentage_completed || 0}%` }}
                    />
                  </div>

                  {opp.is_eligible_to_sell && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Eligible to sell (threshold: {opp.eligible_to_sell_after_percentage}% reached)</span>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    {opp.payment_schedule.map((payment, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          payment.completed 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            payment.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                          }`}>
                            {payment.completed ? <Check className="h-5 w-5" /> : <span>{idx + 1}</span>}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {payment.description || `Payment ${idx + 1}`}
                            </p>
                            <p className="text-sm text-gray-500">{formatDate(payment.date)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">{payment.percentage}%</p>
                          <p className="text-sm text-gray-500">AED {formatCurrency(payment.amount)}</p>
                        </div>
                        {!payment.completed && user?.role === 'broker' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleMarkPayment(idx)}
                            className="ml-4"
                          >
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Investors */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-teal-600" />
                  Investors ({opp.current_investors || 0}{opp.property_type === 'off_plan' ? '/4' : ''})
                </h2>
                
                {opp.investors && opp.investors.length > 0 ? (
                  <div className="space-y-3">
                    {opp.investors.map((investor, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{investor.client_name}</p>
                          <p className="text-sm text-gray-500">Invested on {formatDate(investor.invested_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">AED {formatCurrency(investor.amount)}</p>
                          <p className="text-sm text-gray-500">{investor.share_percentage}% share</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No investors yet</p>
                )}
              </div>
            </div>

            {/* Right Column - Property Details & Sale Settings */}
            <div className="space-y-6">
              {/* Property Details */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Ruler className="h-5 w-5 text-teal-600" />
                  Property Details
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Area</span>
                    <span className="font-medium">{opp.total_area} sqft</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Carpet Area</span>
                    <span className="font-medium">{opp.carpet_area} sqft</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Balcony Area</span>
                    <span className="font-medium">{opp.balcony_area || 0} sqft</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Balcony Ratio</span>
                    <span className="font-medium">{((opp.balcony_ratio || 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Parking</span>
                    <span className="font-medium flex items-center gap-1">
                      <Car className="h-4 w-4" /> {opp.parking_spaces || 0}
                    </span>
                  </div>
                  {opp.developer_name && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Developer</span>
                      <span className="font-medium">{opp.developer_name}</span>
                    </div>
                  )}
                  {opp.handover_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Handover</span>
                      <span className="font-medium">{formatDate(opp.handover_date)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sale Settings */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-teal-600" />
                  Sale Settings
                </h2>
                <div className="space-y-4">
                  {opp.expected_sale_rate ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Expected Rate</span>
                        <span className="font-medium">AED {formatCurrency(opp.expected_sale_rate)}/sqft</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Expected Sale Value</span>
                        <span className="font-bold text-teal-600">
                          AED {formatCurrency(opp.expected_sale_rate * opp.total_area)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Est. Profit</span>
                        <span className="font-bold text-green-600">
                          AED {formatCurrency((opp.expected_sale_rate * opp.total_area) - opp.total_cost)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-400 text-sm">No sale rate set</p>
                  )}
                  
                  {opp.estimated_sell_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Est. Sell Date</span>
                      <span className="font-medium">{formatDate(opp.estimated_sell_date)}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Eligible After</span>
                    <span className="font-medium">{opp.eligible_to_sell_after_percentage || 100}% payments</span>
                  </div>
                  
                  <div className="pt-2">
                    {opp.is_eligible_to_sell ? (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Ready to Sell</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
                        <Clock className="h-5 w-5" />
                        <span className="font-medium">Not yet eligible</span>
                      </div>
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
                    <p className="text-gray-500">Each investor: 25% share</p>
                    <p className="font-medium text-purple-600">
                      Per investor: AED {formatCurrency(opp.total_cost / 4)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-gray-500">Max per investor:</p>
                    <p className="font-medium text-teal-600">$50,000 USD (~AED 183,500)</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Remaining: AED {formatCurrency(opp.total_cost - (opp.total_invested || 0))}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
