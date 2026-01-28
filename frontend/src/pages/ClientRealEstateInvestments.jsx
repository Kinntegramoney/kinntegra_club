import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { 
  Building2, MapPin, Calendar, Check, DollarSign, 
  CheckCircle2, Clock, Upload, FileText, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logUserActivity } from "@/utils/activityLogger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientRealEstateInvestments() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentIndex, setSelectedPaymentIndex] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "client") {
      navigate("/login");
      return;
    }
    setUser(parsedUser);
    logUserActivity('real-estate-investments', { extra: { action: 'view' } });
    fetchInvestments();
  }, [navigate]);
    fetchInvestments();
  }, [navigate]);

  const fetchInvestments = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/client/real-estate-investments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvestments(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching investments:", error);
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

  const openPaymentModal = (investment, paymentIndex) => {
    setSelectedInvestment(investment);
    setSelectedPaymentIndex(paymentIndex);
    setShowPaymentModal(true);
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <ClientSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-800">My Real Estate Investments</h1>
          <p className="text-sm text-gray-500 mt-1">View and manage your property investments</p>
        </div>

        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : investments.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No real estate investments yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {investments.map((inv) => (
                <div key={inv.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Property Header */}
                  <div className="p-6 border-b border-gray-100">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                          <Building2 className="h-6 w-6 text-teal-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-800">{inv.building_name}</h3>
                            {inv.property_type === 'off_plan' ? (
                              <Badge className="bg-purple-100 text-purple-700">Off-Plan</Badge>
                            ) : (
                              <Badge className="bg-teal-100 text-teal-700">Fractional</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">
                            Unit {inv.unit_no}
                            {inv.location && <span> • <MapPin className="h-3 w-3 inline" /> {inv.location}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">My Investment</p>
                        <p className="text-xl font-bold text-teal-600">
                          AED {formatCurrency(inv.my_investment?.amount)}
                        </p>
                        <p className="text-sm text-gray-500">{inv.my_investment?.share_percentage}% share</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Schedule */}
                  {inv.payment_schedule && inv.payment_schedule.length > 0 && (
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-gray-800 flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-teal-600" />
                          Payment Schedule
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">Progress:</span>
                          <span className="font-bold text-teal-600">{inv.total_payment_percentage_completed || 0}%</span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                        <div 
                          className="bg-teal-500 h-2 rounded-full" 
                          style={{ width: `${inv.total_payment_percentage_completed || 0}%` }}
                        />
                      </div>

                      {inv.is_eligible_to_sell && (
                        <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Eligible to sell</span>
                        </div>
                      )}

                      <div className="space-y-2">
                        {inv.payment_schedule.map((payment, idx) => (
                          <div 
                            key={idx}
                            className={`flex items-center justify-between p-3 rounded-lg ${
                              payment.completed ? 'bg-green-50' : 'bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                                payment.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                              }`}>
                                {payment.completed ? <Check className="h-4 w-4" /> : idx + 1}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{payment.description || `Payment ${idx + 1}`}</p>
                                <p className="text-xs text-gray-500">{formatDate(payment.date)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="font-bold text-gray-800">{payment.percentage}%</p>
                                <p className="text-xs text-gray-500">AED {formatCurrency(payment.amount)}</p>
                              </div>
                              {!payment.completed && (
                                <Button size="sm" onClick={() => openPaymentModal(inv, idx)}>
                                  Record Payment
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sale Info */}
                  {(inv.expected_sale_rate || inv.estimated_sell_date) && (
                    <div className="px-6 pb-6">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-700 mb-2">Sale Projection</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          {inv.expected_sale_rate && (
                            <div>
                              <p className="text-gray-500">Expected Rate</p>
                              <p className="font-medium">AED {formatCurrency(inv.expected_sale_rate)}/sqft</p>
                            </div>
                          )}
                          {inv.estimated_sell_date && (
                            <div>
                              <p className="text-gray-500">Est. Sell Date</p>
                              <p className="font-medium">{formatDate(inv.estimated_sell_date)}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-gray-500">Status</p>
                            {inv.is_eligible_to_sell ? (
                              <p className="font-medium text-green-600">Ready to Sell</p>
                            ) : (
                              <p className="font-medium text-etihad-gold-600">Not yet eligible</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvestment && selectedPaymentIndex !== null && (
        <ClientPaymentModal
          investment={selectedInvestment}
          paymentIndex={selectedPaymentIndex}
          payment={selectedInvestment.payment_schedule[selectedPaymentIndex]}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvestment(null);
            setSelectedPaymentIndex(null);
          }}
          onSuccess={() => {
            setShowPaymentModal(false);
            setSelectedInvestment(null);
            setSelectedPaymentIndex(null);
            fetchInvestments();
          }}
        />
      )}
    </div>
  );
}


function ClientPaymentModal({ investment, paymentIndex, payment, onClose, onSuccess }) {
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
        `${API}/real-estate-opportunities/${investment.id}/record-payment`,
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
          `${API}/real-estate-opportunities/${investment.id}/payments/${paymentIndex}/swift-copy`,
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
