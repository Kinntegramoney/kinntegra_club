import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Check, X, Clock, FileText, FileImage, Tag, ChevronDown, ChevronUp, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function TradeVerification() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [pendingTrades, setPendingTrades] = useState([]);
  const [allTrades, setAllTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "all");
  const [processingTrade, setProcessingTrade] = useState(null);
  const [brokerNotes, setBrokerNotes] = useState("");
  
  // Reinvestment state
  const [reinvestmentData, setReinvestmentData] = useState(null);
  const [loadingReinvestment, setLoadingReinvestment] = useState(false);
  const [reinvestmentSection, setReinvestmentSection] = useState("untagged"); // "untagged" or "tagged"
  const [expandedClients, setExpandedClients] = useState({});
  const [localTags, setLocalTags] = useState({});
  const [customAmounts, setCustomAmounts] = useState({});
  const [savingClient, setSavingClient] = useState(null);

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

  useEffect(() => {
    if (activeTab === "reinvestment" && !reinvestmentData) {
      fetchReinvestmentData();
    }
  }, [activeTab]);

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

  const fetchReinvestmentData = async () => {
    setLoadingReinvestment(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/reinvestment/upcoming`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReinvestmentData(response.data);
      
      // Initialize local tags
      const tags = {};
      response.data.months.forEach(month => {
        month.items.forEach(item => {
          tags[item.cashflow_id] = item.reinvestment_tag || 'not_tagged';
        });
      });
      setLocalTags(tags);
    } catch (error) {
      console.error("Error fetching reinvestment data:", error);
      toast.error("Failed to load reinvestment data");
    } finally {
      setLoadingReinvestment(false);
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

  const handleTagChange = (cashflowId, tag) => {
    setLocalTags(prev => ({ ...prev, [cashflowId]: tag }));
    // Clear custom amount if switching away from "other"
    if (tag !== 'other') {
      setCustomAmounts(prev => {
        const newAmounts = { ...prev };
        delete newAmounts[cashflowId];
        return newAmounts;
      });
    }
  };

  const handleCustomAmountChange = (cashflowId, amount) => {
    setCustomAmounts(prev => ({ ...prev, [cashflowId]: amount }));
  };

  const handleSaveClientTags = async (clientId, cashflowIds) => {
    setSavingClient(clientId);
    try {
      const token = localStorage.getItem("token");
      
      // Save all tags for this client
      await Promise.all(
        cashflowIds.map(cfId => 
          axios.put(`${API}/reinvestment/tag/${cfId}`, 
            { reinvestment_tag: localTags[cfId] },
            { headers: { Authorization: `Bearer ${token}` }}
          )
        )
      );
      
      toast.success("Tags saved successfully");
      fetchReinvestmentData(); // Refresh data
    } catch (error) {
      console.error("Error saving tags:", error);
      toast.error("Failed to save tags");
    } finally {
      setSavingClient(null);
    }
  };

  const toggleClientExpand = (clientId) => {
    setExpandedClients(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  // Get all entries separated by tagged status (per-entry, not per-client)
  const getEntriesByTagStatus = () => {
    if (!reinvestmentData) return { tagged: [], untagged: [] };
    
    const allEntries = [];
    reinvestmentData.months.forEach(month => {
      month.items.forEach(item => {
        allEntries.push(item);
      });
    });
    
    // Separate by tag status
    const tagged = allEntries.filter(item => {
      const tag = localTags[item.cashflow_id] || item.reinvestment_tag || 'not_tagged';
      return tag && tag !== 'not_tagged';
    });
    
    const untagged = allEntries.filter(item => {
      const tag = localTags[item.cashflow_id] || item.reinvestment_tag || 'not_tagged';
      return !tag || tag === 'not_tagged';
    });
    
    return { tagged, untagged };
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

  const getTagColor = (tag) => {
    switch(tag) {
      case 'principal': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'interest': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'net_amount': return 'bg-green-100 text-green-700 border-green-200';
      case 'not_invest': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getTagLabel = (tag) => {
    const labels = {
      'principal': 'Principal',
      'interest': 'Interest',
      'net_amount': 'Net Amount',
      'not_invest': 'Not Invest',
      'not_tagged': 'Not Tagged'
    };
    return labels[tag] || tag;
  };

  const formatINR = (amount) => {
    return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Save a single entry's tag
  const handleSaveEntryTag = async (cashflowId) => {
    const tag = localTags[cashflowId];
    const customAmount = customAmounts[cashflowId];
    
    // Validate custom amount if "other" is selected
    if (tag === 'other' && (!customAmount || parseFloat(customAmount) <= 0)) {
      toast.error("Please enter a valid custom amount");
      return;
    }
    
    setSavingClient(cashflowId);
    try {
      const token = localStorage.getItem("token");
      const payload = { 
        reinvestment_tag: tag,
        custom_amount: tag === 'other' ? parseFloat(customAmount) : null
      };
      
      await axios.put(`${API}/reinvestment/tag/${cashflowId}`, 
        payload,
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success("Tag saved successfully");
      fetchReinvestmentData();
    } catch (error) {
      console.error("Error saving tag:", error);
      toast.error("Failed to save tag");
    } finally {
      setSavingClient(null);
    }
  };

  if (!user) return null;

  const displayTrades = activeTab === 'pending' ? pendingTrades : allTrades;
  const { tagged, untagged } = getEntriesByTagStatus();
  const displayEntries = reinvestmentSection === 'tagged' ? tagged : untagged;

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
            <button
              onClick={() => setActiveTab("reinvestment")}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "reinvestment" 
                  ? "border-amber-600 text-amber-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tab-reinvestment"
            >
              <Tag className="h-4 w-4" />
              Reinvestment Tagging
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {/* Trades Content */}
          {(activeTab === "pending" || activeTab === "all") && (
            <>
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
                      className="bg-white rounded-lg border border-gray-200 p-4 md:p-6"
                      data-testid={`trade-card-${trade.id}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base md:text-lg truncate">{trade.bond_name}</h3>
                          <p className="text-xs md:text-sm text-gray-500">
                            Created by {trade.created_by_name} ({trade.created_by_role === 'sub_broker' ? 'Sub-Broker' : 'Broker'})
                          </p>
                        </div>
                        {getStatusBadge(trade.status)}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Client</p>
                          <p className="font-medium text-sm md:text-base truncate">{trade.client_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{trade.client_pan}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Units</p>
                          <p className="font-mono font-bold text-base md:text-lg">{trade.units}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Price/Unit</p>
                          <p className="font-mono text-sm">₹{trade.calculated_price?.toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Total</p>
                          <p className="font-mono font-bold text-amber-600 text-sm md:text-base">₹{trade.total_amount?.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <p className="text-xs text-gray-500 uppercase">Investment Date</p>
                          <p className="font-mono text-sm">{format(new Date(trade.investment_date), "MMM dd, yyyy")}</p>
                        </div>
                      </div>

                      {(trade.payment_reference || trade.payment_notes || trade.payment_proof_filename) && (
                        <div className="bg-gray-50 p-3 rounded-md mb-4">
                          <p className="text-xs text-gray-500 uppercase mb-2 font-medium">Payment Details</p>
                          <div className="space-y-1 text-sm">
                            {trade.payment_reference && (
                              <p><span className="text-gray-500">Reference:</span> <span className="font-mono">{trade.payment_reference}</span></p>
                            )}
                            {trade.payment_proof_filename && (
                              <p className="flex items-center gap-2">
                                <FileImage className="h-4 w-4 text-green-600" />
                                <span className="text-gray-500">Proof:</span> 
                                <span className="text-green-700 truncate max-w-[200px]">{trade.payment_proof_filename}</span>
                              </p>
                            )}
                            {trade.payment_notes && (
                              <p><span className="text-gray-500">Notes:</span> {trade.payment_notes}</p>
                            )}
                          </div>
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
            </>
          )}

          {/* Reinvestment Tagging Content */}
          {activeTab === "reinvestment" && (
            <div>
              {/* Sub-tabs: Untagged / Tagged */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setReinvestmentSection("untagged")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      reinvestmentSection === "untagged"
                        ? "bg-white text-amber-700 shadow-sm"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Untagged ({untagged.length})
                  </button>
                  <button
                    onClick={() => setReinvestmentSection("tagged")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      reinvestmentSection === "tagged"
                        ? "bg-white text-amber-700 shadow-sm"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Tagged ({tagged.length})
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={fetchReinvestmentData} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${loadingReinvestment ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {loadingReinvestment ? (
                <div className="text-center py-12 text-gray-500">Loading reinvestment data...</div>
              ) : displayEntries.length === 0 ? (
                <div className="text-center py-12">
                  <Tag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">
                    {reinvestmentSection === "untagged" 
                      ? "No untagged entries found" 
                      : "No tagged entries found"}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Client</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Opportunity</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Expected Date</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Principal Net</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Interest Net</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net Amount</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
                          <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayEntries.map((entry) => (
                          <tr key={entry.cashflow_id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-amber-700 font-semibold text-sm">
                                    {entry.client_name?.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-800 text-sm truncate">{entry.client_name}</p>
                                  <p className="text-xs text-gray-500 font-mono">{entry.client_pan}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-sm font-medium text-gray-800">
                                {entry.bond_name?.slice(0, 20) || 'N/A'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-sm font-mono">{format(new Date(entry.expected_date), "dd-MMM-yyyy")}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(entry.principal_net)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm">{formatINR(entry.interest_net)}</td>
                            <td className="py-3 px-4 text-right font-mono text-sm font-medium text-green-600">{formatINR(entry.net_amount)}</td>
                            <td className="py-3 px-4 text-center">
                              <select
                                value={localTags[entry.cashflow_id] || 'not_tagged'}
                                onChange={(e) => handleTagChange(entry.cashflow_id, e.target.value)}
                                className={`px-2 py-1 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer ${getTagColor(localTags[entry.cashflow_id])}`}
                              >
                                <option value="not_tagged">Not Tagged</option>
                                <option value="principal">Principal</option>
                                <option value="interest">Interest</option>
                                <option value="net_amount">Net Amount</option>
                                <option value="not_invest">Not Invest</option>
                              </select>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveEntryTag(entry.cashflow_id)}
                                disabled={savingClient === entry.cashflow_id}
                                className="h-8 px-3"
                              >
                                {savingClient === entry.cashflow_id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Summary Footer */}
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">
                        Showing {displayEntries.length} {reinvestmentSection} entries
                      </span>
                      <div className="flex gap-4">
                        <span className="text-gray-500">
                          Total: <span className="font-mono font-medium text-green-600">
                            {formatINR(displayEntries.reduce((sum, e) => sum + e.net_amount, 0))}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
