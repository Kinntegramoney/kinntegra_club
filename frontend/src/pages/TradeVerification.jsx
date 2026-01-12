import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Check, X, Clock, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function TradeVerification() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [allTrades, setAllTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [processingTrade, setProcessingTrade] = useState(null);
  const [brokerNotes, setBrokerNotes] = useState("");

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== "broker") {
      navigate("/sub-broker/opportunities");
      return;
    }
    
    setUser(parsedUser);
    fetchTrades();
  }, [navigate]);

  const fetchTrades = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [pendingRes, allRes] = await Promise.all([
        axios.get(`${API}/trades/pending`, { headers }),
        axios.get(`${API}/trades`, { headers })
      ]);
      
      setPendingTrades(pendingRes.data);
      setAllTrades(allRes.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching trades:", error);
      setLoading(false);
    }
  };

  const handleVerify = async (tradeId, status) => {
    setProcessingTrade(tradeId);
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/trades/${tradeId}/verify`, {
        status,
        broker_notes: brokerNotes
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(`Trade ${status === 'approved' ? 'approved' : 'rejected'} successfully`);
      setBrokerNotes("");
      fetchTrades();
    } catch (error) {
      console.error("Error verifying trade:", error);
      toast.error(error.response?.data?.detail || "Failed to verify trade");
    } finally {
      setProcessingTrade(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1"><Check className="h-3 w-3" /> Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1"><X className="h-3 w-3" /> Rejected</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{status}</span>;
    }
  };

  if (!user) return null;

  const displayTrades = activeTab === 'pending' ? pendingTrades : allTrades;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="trade-verification-title">Trade Verification</h1>
              <p className="text-sm text-gray-500 mt-1">Review and approve trade requests from sub-brokers</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-full font-medium">
                {pendingTrades.length} Pending
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-6">
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "pending" 
                  ? "border-amber-600 text-amber-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-pending"
            >
              Pending ({pendingTrades.length})
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "all" 
                  ? "border-amber-600 text-amber-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-all"
            >
              All Trades ({allTrades.length})
            </button>
          </div>
        </div>

        {/* Trades List */}
        <div className="p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : displayTrades.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {activeTab === 'pending' ? "No pending trades to verify" : "No trades found"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayTrades.map((trade) => (
                <div 
                  key={trade.id} 
                  className="bg-white rounded-lg border border-gray-200 p-6"
                  data-testid={`trade-card-${trade.id}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">{trade.bond_name}</h3>
                      <p className="text-sm text-gray-500">
                        Created by {trade.created_by_name} ({trade.created_by_role === 'sub_broker' ? 'Sub-Broker' : 'Broker'})
                      </p>
                    </div>
                    {getStatusBadge(trade.status)}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Client</p>
                      <p className="font-medium">{trade.client_name}</p>
                      <p className="text-xs text-gray-500 font-mono">{trade.client_pan}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Units</p>
                      <p className="font-mono font-bold text-lg">{trade.units}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Price/Unit</p>
                      <p className="font-mono">₹{trade.calculated_price?.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Total Amount</p>
                      <p className="font-mono font-bold text-amber-600">₹{trade.total_amount?.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Investment Date</p>
                      <p className="font-mono">{format(new Date(trade.investment_date), "MMM dd, yyyy")}</p>
                    </div>
                  </div>

                  {(trade.payment_reference || trade.payment_notes) && (
                    <div className="bg-gray-50 p-3 rounded-md mb-4">
                      <p className="text-xs text-gray-500 uppercase mb-1">Payment Details</p>
                      {trade.payment_reference && (
                        <p className="text-sm"><span className="text-gray-500">Reference:</span> {trade.payment_reference}</p>
                      )}
                      {trade.payment_notes && (
                        <p className="text-sm"><span className="text-gray-500">Notes:</span> {trade.payment_notes}</p>
                      )}
                    </div>
                  )}

                  {trade.broker_notes && (
                    <div className="bg-blue-50 p-3 rounded-md mb-4">
                      <p className="text-xs text-blue-600 uppercase mb-1">Broker Notes</p>
                      <p className="text-sm">{trade.broker_notes}</p>
                    </div>
                  )}

                  {trade.status === 'pending' && (
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <div className="mb-3">
                        <label className="text-xs text-gray-500 uppercase block mb-1">Add Notes (Optional)</label>
                        <Textarea
                          value={processingTrade === trade.id ? brokerNotes : ""}
                          onChange={(e) => {
                            setProcessingTrade(trade.id);
                            setBrokerNotes(e.target.value);
                          }}
                          placeholder="Add verification notes..."
                          rows={2}
                          data-testid={`broker-notes-${trade.id}`}
                        />
                      </div>
                      <div className="flex gap-3">
                        <Button
                          onClick={() => handleVerify(trade.id, 'approved')}
                          disabled={processingTrade === trade.id}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          data-testid={`approve-trade-${trade.id}`}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleVerify(trade.id, 'rejected')}
                          disabled={processingTrade === trade.id}
                          variant="destructive"
                          className="flex-1"
                          data-testid={`reject-trade-${trade.id}`}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  {trade.approved_at && (
                    <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
                      {trade.status === 'approved' ? 'Approved' : 'Rejected'} on {format(new Date(trade.approved_at), "MMM dd, yyyy 'at' HH:mm")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
