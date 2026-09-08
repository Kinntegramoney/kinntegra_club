import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ClientSidebar from "@/components/ClientSidebar";
import { ClipboardCheck, Check, X, Clock, Tag, RefreshCw, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { logUserActivity } from "@/utils/activityLogger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ClientTradeVerification() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [trades, setTrades] = useState([]);
  const [reinvestment, setReinvestment] = useState({ pending: [], approved: [], rejected: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("trades");
  const [processingId, setProcessingId] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState("");

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
    logUserActivity('trade-verification', { extra: { action: 'view' } });
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [tradesRes, reinvestmentRes] = await Promise.all([
        axios.get(`${API}/client/trades`, { headers }),
        axios.get(`${API}/client/reinvestment`, { headers })
      ]);
      
      setTrades(tradesRes.data);
      setReinvestment(reinvestmentRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveTag = async (cashflowId, approved) => {
    setProcessingId(cashflowId);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/reinvestment/approve/${cashflowId}`,
        { approved, notes: approvalNotes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(approved ? "Reinvestment tag approved" : "Reinvestment tag rejected");
      setApprovalNotes("");
      fetchData();
    } catch (error) {
      console.error("Error updating approval:", error);
      toast.error(error.response?.data?.detail || "Failed to update");
    } finally {
      setProcessingId(null);
    }
  };

  const formatINR = (amount) => {
    return `₹ ${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getTagLabel = (tag) => {
    const labels = {
      'principal': 'Principal',
      'interest': 'Interest',
      'net_amount': 'Net Amount',
      'not_invest': 'Not Invest'
    };
    return labels[tag] || tag;
  };

  const getTagColor = (tag) => {
    const colors = {
      'principal': 'bg-purple-100 text-purple-700',
      'interest': 'bg-blue-100 text-blue-700',
      'net_amount': 'bg-green-100 text-green-700',
      'not_invest': 'bg-red-100 text-red-700'
    };
    return colors[tag] || 'bg-gray-100 text-gray-700';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 bg-etihad-gold-100 text-etihad-gold-700 text-xs rounded-full flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1"><Check className="h-3 w-3" /> Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1"><X className="h-3 w-3" /> Rejected</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{status}</span>;
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <ClientSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="page-title">
                Trade & Reinvestment
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                View your trades and approve reinvestment tags
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-6">
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("trades")}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "trades"
                  ? "border-teal-600 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-trades"
            >
              My Trades ({trades.length})
            </button>
            <button
              onClick={() => setActiveTab("reinvestment")}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "reinvestment"
                  ? "border-teal-600 text-teal-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-reinvestment"
            >
              <Tag className="h-4 w-4" />
              Reinvestment Approval
              {reinvestment.pending.length > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {reinvestment.pending.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Trades Tab */}
              {activeTab === "trades" && (
                <>
                  {trades.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No trades found</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {trades.map((trade) => (
                        <div
                          key={trade.id}
                          className="bg-white rounded-lg border border-gray-200 p-4 md:p-6"
                          data-testid={`trade-card-${trade.id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                            <div>
                              <h3 className="font-semibold text-lg">{trade.bond_name}</h3>
                              <p className="text-sm text-gray-500">
                                Created on {format(new Date(trade.created_at), "MMM dd, yyyy")}
                              </p>
                            </div>
                            {getStatusBadge(trade.status)}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-gray-500 uppercase">Units</p>
                              <p className="font-mono font-bold text-lg">{trade.units}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase">Price/Unit</p>
                              <p className="font-mono">{formatINR(trade.calculated_price)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase">Total Amount</p>
                              <p className="font-mono font-bold text-teal-600">{formatINR(trade.total_amount)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase">Investment Date</p>
                              <p className="font-mono">{format(new Date(trade.investment_date), "MMM dd, yyyy")}</p>
                            </div>
                          </div>

                          {trade.broker_notes && (
                            <div className="mt-4 p-3 bg-blue-50 rounded-md">
                              <p className="text-xs text-blue-600 uppercase mb-1">Broker Notes</p>
                              <p className="text-sm">{trade.broker_notes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Reinvestment Tab */}
              {activeTab === "reinvestment" && (
                <div className="space-y-6">
                  {/* Pending Approvals */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-etihad-gold-500" />
                      Pending Approval ({reinvestment.pending.length})
                    </h3>
                    
                    {reinvestment.pending.length === 0 ? (
                      <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
                        <Check className="h-10 w-10 text-green-400 mx-auto mb-2" />
                        <p className="text-gray-500">No pending approvals</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {reinvestment.pending.map((cf) => (
                          <div
                            key={cf.id}
                            className="bg-white rounded-lg border border-gray-200 p-4"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="font-semibold">{cf.bond_name}</p>
                                <p className="text-sm text-gray-500">
                                  Expected: {format(new Date(cf.date), "MMM dd, yyyy")}
                                </p>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTagColor(cf.reinvestment_tag)}`}>
                                {getTagLabel(cf.reinvestment_tag)}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-md">
                              <div>
                                <p className="text-xs text-gray-500">Principal Net</p>
                                <p className="font-mono font-medium">{formatINR(cf.principal_component)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Interest Net</p>
                                <p className="font-mono font-medium">{formatINR(cf.interest_component - cf.tds_amount)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Net Amount</p>
                                <p className="font-mono font-medium text-green-600">{formatINR(cf.net_amount)}</p>
                              </div>
                            </div>

                            <div className="mb-3">
                              <label className="text-xs text-gray-500 uppercase block mb-1">
                                Notes (Optional)
                              </label>
                              <Textarea
                                placeholder="Add any notes..."
                                value={processingId === cf.id ? approvalNotes : ""}
                                onChange={(e) => {
                                  setProcessingId(cf.id);
                                  setApprovalNotes(e.target.value);
                                }}
                                rows={2}
                              />
                            </div>

                            <div className="flex gap-3">
                              <Button
                                className="flex-1 bg-green-600 hover:bg-green-700"
                                onClick={() => handleApproveTag(cf.id, true)}
                                disabled={processingId === cf.id}
                              >
                                <Check className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                className="flex-1"
                                onClick={() => handleApproveTag(cf.id, false)}
                                disabled={processingId === cf.id}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Approved */}
                  {reinvestment.approved.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-500" />
                        Approved ({reinvestment.approved.length})
                      </h3>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left py-2 px-3">NCD</th>
                              <th className="text-center py-2 px-3">Expected Date</th>
                              <th className="text-right py-2 px-3">Net Amount</th>
                              <th className="text-center py-2 px-3">Tag</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reinvestment.approved.map((cf) => (
                              <tr key={cf.id} className="border-b border-gray-100">
                                <td className="py-2 px-3">{cf.bond_name}</td>
                                <td className="py-2 px-3 text-center font-mono">
                                  {format(new Date(cf.date), "MMM dd, yyyy")}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">{formatINR(cf.net_amount)}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-xs ${getTagColor(cf.reinvestment_tag)}`}>
                                    {getTagLabel(cf.reinvestment_tag)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Rejected */}
                  {reinvestment.rejected.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <X className="h-5 w-5 text-red-500" />
                        Rejected ({reinvestment.rejected.length})
                      </h3>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left py-2 px-3">NCD</th>
                              <th className="text-center py-2 px-3">Expected Date</th>
                              <th className="text-right py-2 px-3">Net Amount</th>
                              <th className="text-center py-2 px-3">Tag</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reinvestment.rejected.map((cf) => (
                              <tr key={cf.id} className="border-b border-gray-100">
                                <td className="py-2 px-3">{cf.bond_name}</td>
                                <td className="py-2 px-3 text-center font-mono">
                                  {format(new Date(cf.date), "MMM dd, yyyy")}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">{formatINR(cf.net_amount)}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-xs ${getTagColor(cf.reinvestment_tag)}`}>
                                    {getTagLabel(cf.reinvestment_tag)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
