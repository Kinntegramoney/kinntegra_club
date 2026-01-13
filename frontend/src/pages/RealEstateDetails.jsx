import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { 
  Building2, MapPin, ArrowLeft, Calendar, Users, Check, 
  DollarSign, Ruler, Car, CheckCircle2, Clock, AlertCircle,
  Plus, Upload, FileText, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentIndex, setSelectedPaymentIndex] = useState(null);

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

  const openPaymentModal = (index) => {
    setSelectedPaymentIndex(index);
    setShowPaymentModal(true);
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
  const availableClients = clients.filter(c => 
    !opp.investors?.some(inv => inv.client_id === c.id)
  );

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
            {opp.status === 'available' && (
              <Button onClick={() => setShowAllocateModal(true)} className="bg-teal-600 hover:bg-teal-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Investor
              </Button>
            )}
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Column */}
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
                  
                  <div className="w-full bg-gray-100 rounded-full h-3 mb-6">
                    <div className="bg-teal-500 h-3 rounded-full" style={{ width: `${opp.total_payment_percentage_completed || 0}%` }} />
                  </div>

                  {opp.is_eligible_to_sell && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Eligible to sell</span>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    {opp.payment_schedule.map((payment, idx) => (
                      <div 
                        key={idx} 
                        className={`p-4 rounded-lg border ${payment.completed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${payment.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                              {payment.completed ? <Check className="h-5 w-5" /> : <span>{idx + 1}</span>}
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{payment.description || `Payment ${idx + 1}`}</p>
                              <p className="text-sm text-gray-500">{formatDate(payment.date)}</p>
                            </div>
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <div>
                              <p className="font-bold text-gray-800">{payment.percentage}%</p>
                              <p className="text-sm text-gray-500">AED {formatCurrency(payment.amount)}</p>
                            </div>
                            {!payment.completed && (
                              <Button size="sm" onClick={() => openPaymentModal(idx)}>
                                Record Payment
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {/* Payment Details if completed */}
                        {payment.completed && payment.payment_details && (
                          <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-4 gap-4 text-sm">
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
                        )}
                        
                        {/* Swift Copies */}
                        {payment.swift_copies && payment.swift_copies.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-sm text-gray-500 mb-2">SWIFT Copies:</p>
                            <div className="flex flex-wrap gap-2">
                              {payment.swift_copies.map((sc, scIdx) => (
                                <div key={scIdx} className="flex items-center gap-2 bg-white px-3 py-1 rounded border text-sm">
                                  <FileText className="h-4 w-4 text-gray-400" />
                                  <span>{sc.filename}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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
                    Investors ({opp.current_investors || 0}{opp.property_type === 'off_plan' ? '/4' : ''})
                  </h2>
                  {opp.status === 'available' && (
                    <Button size="sm" variant="outline" onClick={() => setShowAllocateModal(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
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
                          <p className="font-bold text-gray-800">AED {formatCurrency(investor.amount)}</p>
                          <p className="text-sm text-gray-500">{investor.share_percentage}% share</p>
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

              {/* Sale Settings */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Sale Settings</h2>
                <div className="space-y-4">
                  {opp.expected_sale_rate ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Expected Rate</span><span className="font-medium">AED {formatCurrency(opp.expected_sale_rate)}/sqft</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Expected Value</span><span className="font-bold text-teal-600">AED {formatCurrency(opp.expected_sale_rate * opp.total_area)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Est. Profit</span><span className="font-bold text-green-600">AED {formatCurrency((opp.expected_sale_rate * opp.total_area) - opp.total_cost)}</span></div>
                    </>
                  ) : (
                    <p className="text-gray-400 text-sm">No sale rate set</p>
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
                    <p className="text-gray-500">Each investor: 25% share</p>
                    <p className="font-medium text-purple-600">Per investor: AED {formatCurrency(opp.total_cost / 4)}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-gray-500">Max per investor:</p>
                    <p className="font-medium text-teal-600">$50,000 USD (~AED 183,500)</p>
                    <p className="text-sm text-gray-400 mt-2">Remaining: AED {formatCurrency(opp.total_cost - (opp.total_invested || 0))}</p>
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
          onClose={() => setShowAllocateModal(false)}
          onSuccess={() => {
            setShowAllocateModal(false);
            fetchData();
          }}
        />
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedPaymentIndex !== null && (
        <RecordPaymentModal
          opportunity={opp}
          paymentIndex={selectedPaymentIndex}
          payment={opp.payment_schedule[selectedPaymentIndex]}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedPaymentIndex(null);
          }}
          onSuccess={() => {
            setShowPaymentModal(false);
            setSelectedPaymentIndex(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}


// Allocate Investor Modal Component
function AllocateInvestorModal({ opportunity, clients, onClose, onSuccess }) {
  const [selectedClient, setSelectedClient] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClient) {
      toast.error("Please select a client");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      let investmentAmount;
      if (opportunity.property_type === 'off_plan') {
        investmentAmount = opportunity.total_cost / 4;
      } else {
        investmentAmount = parseFloat(amount);
        if (!investmentAmount || investmentAmount <= 0) {
          toast.error("Please enter a valid amount");
          setLoading(false);
          return;
        }
      }

      await axios.post(
        `${API}/real-estate-opportunities/${opportunity.id}/invest`,
        { client_id: selectedClient, investment_amount: investmentAmount },
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
          <h2 className="text-lg font-semibold">Add Investor</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

          {opportunity.property_type === 'off_plan' ? (
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-purple-600">Off-Plan Investment (25% share)</p>
              <p className="text-2xl font-bold text-purple-800">AED {formatCurrency(opportunity.total_cost / 4)}</p>
            </div>
          ) : (
            <div>
              <Label>Investment Amount (AED) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Max: 183,500 (≈$50,000)"
                max={183500}
              />
              <p className="text-xs text-gray-500 mt-1">Maximum: $50,000 USD (~AED 183,500)</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-teal-600 hover:bg-teal-700">
              {loading ? "Adding..." : "Add Investor"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Record Payment Modal Component
function RecordPaymentModal({ opportunity, paymentIndex, payment, onClose, onSuccess }) {
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
      
      // Record payment
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

      // Upload SWIFT copy if provided
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
          <div className="bg-teal-50 p-4 rounded-lg mb-4">
            <p className="text-sm text-teal-600">Expected Amount</p>
            <p className="text-2xl font-bold text-teal-800">AED {formatCurrency(payment.amount)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Date *</Label>
              <Input
                type="date"
                value={formData.payment_date}
                onChange={(e) => handleChange("payment_date", e.target.value)}
                required
              />
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
              <Input
                type="number"
                value={formData.transaction_amount}
                onChange={(e) => handleChange("transaction_amount", e.target.value)}
                placeholder="Amount paid"
                required
              />
            </div>
            <div>
              <Label>Currency Rate (to AED)</Label>
              <Input
                type="number"
                step="0.0001"
                value={formData.currency_rate}
                onChange={(e) => handleChange("currency_rate", e.target.value)}
                placeholder="1.0"
              />
            </div>
          </div>

          <div>
            <Label>Transaction Fees</Label>
            <Input
              type="number"
              value={formData.transaction_fees}
              onChange={(e) => handleChange("transaction_fees", e.target.value)}
              placeholder="Bank/transfer fees"
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
            />
          </div>

          {/* SWIFT Copy Upload */}
          <div>
            <Label>SWIFT Copy</Label>
            <div className="mt-1">
              {swiftFile ? (
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <span className="text-sm">{swiftFile.name}</span>
                  </div>
                  <button type="button" onClick={() => setSwiftFile(null)} className="text-red-500 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors">
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-sm text-gray-500 mt-1">Upload SWIFT copy (PDF, Image)</span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setSwiftFile(e.target.files[0])}
                    className="hidden"
                  />
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
