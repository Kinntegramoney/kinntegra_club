import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Check, X, Clock, FileText, FileImage, Tag, ChevronDown, ChevronUp, Save, RefreshCw, Mail, Users, CheckCircle, AlertCircle } from "lucide-react";
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
  const [reinvestmentSection, setReinvestmentSection] = useState("untagged"); // "untagged", "tagged", "byClient"
  const [expandedClients, setExpandedClients] = useState({});
  const [localTags, setLocalTags] = useState({});
  const [customAmounts, setCustomAmounts] = useState({});
  const [savingClient, setSavingClient] = useState(null);
  const [sendingApproval, setSendingApproval] = useState(null);
  const [selectedClientEntries, setSelectedClientEntries] = useState({});

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

  // Get clients grouped by their tagging status
  const getClientsByStatus = () => {
    if (!reinvestmentData?.by_client) return { untagged: [], tagged: [], sent: [] };
    
    const untagged = []; // Clients with at least one untagged entry
    const tagged = [];   // Clients with ALL entries tagged but not yet sent for approval
    const sent = [];     // Clients whose entries have been sent for approval
    
    reinvestmentData.by_client.forEach(client => {
      // Check current tags (including local changes)
      const entriesWithTags = client.entries.map(entry => ({
        ...entry,
        currentTag: localTags[entry.cashflow_id] || entry.reinvestment_tag || 'not_tagged'
      }));
      
      const untaggedEntries = entriesWithTags.filter(e => e.currentTag === 'not_tagged');
      const taggedEntries = entriesWithTags.filter(e => e.currentTag !== 'not_tagged');
      const sentEntries = client.entries.filter(e => e.approval_status && e.approval_status !== 'not_sent');
      
      // Calculate amounts based on tags
      let taggedAmount = 0;
      taggedEntries.forEach(e => {
        if (e.currentTag === 'other') {
          taggedAmount += parseFloat(customAmounts[e.cashflow_id] || e.custom_amount || 0);
        } else if (e.currentTag === 'principal') {
          taggedAmount += e.principal_net || 0;
        } else if (e.currentTag === 'interest') {
          taggedAmount += e.interest_net || 0;
        } else if (e.currentTag === 'net_amount') {
          taggedAmount += e.net_amount || 0;
        }
      });
      
      const clientData = {
        ...client,
        entries: entriesWithTags,
        untaggedCount: untaggedEntries.length,
        taggedCount: taggedEntries.length,
        sentCount: sentEntries.length,
        taggedAmount: taggedAmount,
        allTagged: untaggedEntries.length === 0 && taggedEntries.length > 0,
        hasSentEntries: sentEntries.length > 0
      };
      
      // Categorize client
      if (sentEntries.length > 0) {
        // If any entry has been sent, show in "sent" section
        sent.push(clientData);
      } else if (untaggedEntries.length === 0 && taggedEntries.length > 0) {
        // All entries tagged but not sent
        tagged.push(clientData);
      } else if (untaggedEntries.length > 0) {
        // Has untagged entries
        untagged.push(clientData);
      }
    });
    
    return { untagged, tagged, sent };
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
      case 'other': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'not_invest': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getTagLabel = (tag) => {
    switch(tag) {
      case 'principal': return 'Principal';
      case 'interest': return 'Interest';
      case 'net_amount': return 'Net Amount';
      case 'other': return 'Custom';
      case 'not_invest': return 'Not Invest';
      default: return 'Not Tagged';
    }
  };

  const formatINR = (amount) => {
    return `₹ ${amount?.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || 0}`;
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

  // Send approval email to client
  const handleSendApprovalEmail = async (clientId, clientName, entries) => {
    const taggedEntries = entries.filter(e => 
      e.reinvestment_tag && e.reinvestment_tag !== 'not_tagged' && e.approval_status !== 'approved'
    );
    
    if (taggedEntries.length === 0) {
      toast.error("No tagged entries to send for approval");
      return;
    }

    setSendingApproval(clientId);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/reinvestment/send-approval-email`, 
        {
          client_id: clientId,
          cashflow_ids: taggedEntries.map(e => e.cashflow_id)
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      toast.success(`Approval email sent to ${clientName}`);
      fetchReinvestmentData();
    } catch (error) {
      console.error("Error sending approval email:", error);
      toast.error(error.response?.data?.detail || "Failed to send approval email");
    } finally {
      setSendingApproval(null);
    }
  };

  // Get approval status badge
  const getApprovalStatusBadge = (status) => {
    switch(status) {
      case 'approved':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Approved</span>;
      case 'pending':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 flex items-center gap-1"><X className="h-3 w-3" /> Rejected</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">Not Sent</span>;
    }
  };

  if (!user) return null;

  const displayTrades = activeTab === 'pending' ? pendingTrades : allTrades;
  const { untagged: untaggedClients, tagged: taggedClients, sent: sentClients } = getClientsByStatus();

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
              {/* Sub-tabs: Untagged / Tagged / Sent for Approval */}
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
                    Untagged ({untaggedClients.length} clients)
                  </button>
                  <button
                    onClick={() => setReinvestmentSection("tagged")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      reinvestmentSection === "tagged"
                        ? "bg-white text-amber-700 shadow-sm"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Tagged ({taggedClients.length} clients)
                  </button>
                  <button
                    onClick={() => setReinvestmentSection("sent")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${
                      reinvestmentSection === "sent"
                        ? "bg-white text-amber-700 shadow-sm"
                        : "text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    <Mail className="h-4 w-4" />
                    Sent for Approval ({sentClients.length})
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={fetchReinvestmentData} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${loadingReinvestment ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {loadingReinvestment ? (
                <div className="text-center py-12 text-gray-500">Loading reinvestment data...</div>
              ) : (
                <div className="space-y-4">
                  {/* UNTAGGED SECTION - Client-wise, must tag all entries */}
                  {reinvestmentSection === "untagged" && (
                    untaggedClients.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
                        <p className="text-gray-500">All clients have been tagged!</p>
                        <p className="text-sm text-gray-400 mt-2">Move to "Tagged" section to send for approval</p>
                      </div>
                    ) : (
                      untaggedClients.map((client) => (
                        <div key={client.client_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          {/* Client Header */}
                          <div 
                            className="px-4 py-3 bg-amber-50 flex items-center justify-between cursor-pointer hover:bg-amber-100"
                            onClick={() => setExpandedClients(prev => ({...prev, [client.client_id]: !prev[client.client_id]}))}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center">
                                <span className="text-amber-800 font-semibold">{client.client_name?.charAt(0).toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{client.client_name}</p>
                                <p className="text-xs text-gray-500 font-mono">{client.client_pan}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm text-gray-500">Entries</p>
                                <p className="font-semibold">{client.entries.length}</p>
                              </div>
                              <div className="flex gap-2 text-xs">
                                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">{client.untaggedCount} untagged</span>
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full">{client.taggedCount} tagged</span>
                              </div>
                              {expandedClients[client.client_id] ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          </div>
                          
                          {/* Client Entries - Expanded */}
                          {expandedClients[client.client_id] && (
                            <div className="border-t">
                              <table className="w-full">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Opportunity</th>
                                    <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Principal</th>
                                    <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Interest</th>
                                    <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Net Amt</th>
                                    <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
                                    <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Custom Amt</th>
                                    <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Save</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {client.entries.map((entry) => (
                                    <tr key={entry.cashflow_id} className={`border-t hover:bg-gray-50 ${entry.currentTag === 'not_tagged' ? 'bg-red-50/30' : ''}`}>
                                      <td className="py-2 px-4 text-sm">{entry.bond_name?.slice(0, 20) || 'N/A'}</td>
                                      <td className="py-2 px-4 text-center text-sm font-mono">{format(new Date(entry.expected_date), "dd-MMM-yy")}</td>
                                      <td className="py-2 px-4 text-right text-sm font-mono">₹{entry.principal_net?.toLocaleString('en-IN')}</td>
                                      <td className="py-2 px-4 text-right text-sm font-mono">₹{entry.interest_net?.toLocaleString('en-IN')}</td>
                                      <td className="py-2 px-4 text-right text-sm font-mono text-green-600 font-medium">₹{entry.net_amount?.toLocaleString('en-IN')}</td>
                                      <td className="py-2 px-4">
                                        <select
                                          value={entry.currentTag}
                                          onChange={(e) => handleTagChange(entry.cashflow_id, e.target.value)}
                                          className={`px-2 py-1 text-xs rounded-lg border focus:outline-none w-full ${getTagColor(entry.currentTag)}`}
                                        >
                                          <option value="not_tagged">Select Tag</option>
                                          <option value="principal">Principal</option>
                                          <option value="interest">Interest</option>
                                          <option value="net_amount">Net Amount</option>
                                          <option value="other">Other (Custom)</option>
                                          <option value="not_invest">Not Invest</option>
                                        </select>
                                      </td>
                                      <td className="py-2 px-4 text-center">
                                        {entry.currentTag === 'other' && (
                                          <input
                                            type="number"
                                            placeholder="Amount"
                                            value={customAmounts[entry.cashflow_id] || entry.custom_amount || ''}
                                            onChange={(e) => handleCustomAmountChange(entry.cashflow_id, e.target.value)}
                                            className="px-2 py-1 text-xs rounded border w-24 text-center"
                                          />
                                        )}
                                      </td>
                                      <td className="py-2 px-4 text-center">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleSaveEntryTag(entry.cashflow_id)}
                                          disabled={savingClient === entry.cashflow_id}
                                          className="h-7 px-2"
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
                              {/* Progress bar */}
                              <div className="px-4 py-3 bg-gray-50 border-t">
                                <div className="flex items-center justify-between text-sm mb-2">
                                  <span className="text-gray-600">Tagging Progress</span>
                                  <span className="font-medium">{client.taggedCount}/{client.entries.length}</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-amber-500 h-2 rounded-full transition-all"
                                    style={{width: `${(client.taggedCount / client.entries.length) * 100}%`}}
                                  />
                                </div>
                                {client.allTagged && (
                                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" /> All entries tagged! Save all to move to Tagged section.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )
                  )}

                  {/* TAGGED SECTION - Ready to send for approval */}
                  {reinvestmentSection === "tagged" && (
                    taggedClients.length === 0 ? (
                      <div className="text-center py-12">
                        <Tag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No clients ready for approval</p>
                        <p className="text-sm text-gray-400 mt-2">Tag all entries for a client in the "Untagged" section first</p>
                      </div>
                    ) : (
                      taggedClients.map((client) => (
                        <div key={client.client_id} className="bg-white rounded-lg border border-green-200 overflow-hidden">
                          {/* Client Header */}
                          <div className="px-4 py-3 bg-green-50 flex items-center justify-between">
                            <div 
                              className="flex items-center gap-3 cursor-pointer flex-1"
                              onClick={() => setExpandedClients(prev => ({...prev, [client.client_id]: !prev[client.client_id]}))}
                            >
                              <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center">
                                <span className="text-green-800 font-semibold">{client.client_name?.charAt(0).toUpperCase()}</span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{client.client_name}</p>
                                <p className="text-xs text-gray-500 font-mono">{client.client_pan} • {client.client_email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm text-gray-500">Tagged Amount</p>
                                <p className="font-semibold text-green-600">₹{client.taggedAmount?.toLocaleString('en-IN')}</p>
                              </div>
                              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                {client.taggedCount} entries
                              </span>
                              <Button
                                size="sm"
                                className="gap-2 bg-amber-600 hover:bg-amber-700"
                                disabled={sendingApproval === client.client_id}
                                onClick={() => handleSendApprovalEmail(client.client_id, client.client_name, client.entries)}
                              >
                                {sendingApproval === client.client_id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Mail className="h-4 w-4" />
                                )}
                                Send for Approval
                              </Button>
                              {expandedClients[client.client_id] ? <ChevronUp className="h-5 w-5 cursor-pointer" onClick={() => setExpandedClients(prev => ({...prev, [client.client_id]: false}))} /> : <ChevronDown className="h-5 w-5 cursor-pointer" onClick={() => setExpandedClients(prev => ({...prev, [client.client_id]: true}))} />}
                            </div>
                          </div>
                          
                          {/* Expanded entries */}
                          {expandedClients[client.client_id] && (
                            <div className="border-t">
                              <table className="w-full">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Opportunity</th>
                                    <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Net Amount</th>
                                    <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
                                    <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Tagged Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {client.entries.map((entry) => {
                                    let taggedAmt = 0;
                                    if (entry.currentTag === 'other') taggedAmt = parseFloat(customAmounts[entry.cashflow_id] || entry.custom_amount || 0);
                                    else if (entry.currentTag === 'principal') taggedAmt = entry.principal_net;
                                    else if (entry.currentTag === 'interest') taggedAmt = entry.interest_net;
                                    else if (entry.currentTag === 'net_amount') taggedAmt = entry.net_amount;
                                    
                                    return (
                                      <tr key={entry.cashflow_id} className="border-t hover:bg-gray-50">
                                        <td className="py-2 px-4 text-sm">{entry.bond_name?.slice(0, 25) || 'N/A'}</td>
                                        <td className="py-2 px-4 text-center text-sm font-mono">{format(new Date(entry.expected_date), "dd-MMM-yy")}</td>
                                        <td className="py-2 px-4 text-right text-sm font-mono">₹{entry.net_amount?.toLocaleString('en-IN')}</td>
                                        <td className="py-2 px-4 text-center">
                                          <span className={`px-2 py-1 text-xs rounded-full ${getTagColor(entry.currentTag)}`}>
                                            {getTagLabel(entry.currentTag)}
                                          </span>
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm font-mono font-medium text-green-600">
                                          ₹{taggedAmt?.toLocaleString('en-IN')}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))
                    )
                  )}

                  {/* SENT FOR APPROVAL SECTION - Shows status */}
                  {reinvestmentSection === "sent" && (
                    sentClients.length === 0 ? (
                      <div className="text-center py-12">
                        <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No clients sent for approval yet</p>
                        <p className="text-sm text-gray-400 mt-2">Tag and send clients from the "Tagged" section</p>
                      </div>
                    ) : (
                      sentClients.map((client) => {
                        // Determine overall status
                        const pendingEntries = client.entries.filter(e => e.approval_status === 'pending');
                        const approvedEntries = client.entries.filter(e => e.approval_status === 'approved');
                        const rejectedEntries = client.entries.filter(e => e.approval_status === 'rejected');
                        
                        let overallStatus = 'pending';
                        let statusColor = 'yellow';
                        if (approvedEntries.length === client.entries.length) {
                          overallStatus = 'approved';
                          statusColor = 'green';
                        } else if (rejectedEntries.length === client.entries.length) {
                          overallStatus = 'rejected';
                          statusColor = 'red';
                        } else if (approvedEntries.length > 0 || rejectedEntries.length > 0) {
                          overallStatus = 'partial';
                          statusColor = 'blue';
                        }
                        
                        return (
                          <div key={client.client_id} className={`bg-white rounded-lg border border-${statusColor}-200 overflow-hidden`}>
                            {/* Client Header */}
                            <div className={`px-4 py-3 bg-${statusColor}-50 flex items-center justify-between`}>
                              <div 
                                className="flex items-center gap-3 cursor-pointer flex-1"
                                onClick={() => setExpandedClients(prev => ({...prev, [client.client_id]: !prev[client.client_id]}))}
                              >
                                <div className={`w-10 h-10 rounded-full bg-${statusColor}-200 flex items-center justify-center`}>
                                  <span className={`text-${statusColor}-800 font-semibold`}>{client.client_name?.charAt(0).toUpperCase()}</span>
                                </div>
                                <div>
                                  <p className="font-medium text-gray-800">{client.client_name}</p>
                                  <p className="text-xs text-gray-500 font-mono">{client.client_pan}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex gap-2 text-xs">
                                  {pendingEntries.length > 0 && (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full flex items-center gap-1">
                                      <Clock className="h-3 w-3" /> {pendingEntries.length} Pending
                                    </span>
                                  )}
                                  {approvedEntries.length > 0 && (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                                      <Check className="h-3 w-3" /> {approvedEntries.length} Approved
                                    </span>
                                  )}
                                  {rejectedEntries.length > 0 && (
                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full flex items-center gap-1">
                                      <X className="h-3 w-3" /> {rejectedEntries.length} Rejected
                                    </span>
                                  )}
                                </div>
                                {expandedClients[client.client_id] ? <ChevronUp className="h-5 w-5 cursor-pointer" /> : <ChevronDown className="h-5 w-5 cursor-pointer" />}
                              </div>
                            </div>
                            
                            {/* Expanded entries */}
                            {expandedClients[client.client_id] && (
                              <div className="border-t">
                                <table className="w-full">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Opportunity</th>
                                      <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                                      <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
                                      <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                                      <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {client.entries.map((entry) => (
                                      <tr key={entry.cashflow_id} className="border-t hover:bg-gray-50">
                                        <td className="py-2 px-4 text-sm">{entry.bond_name?.slice(0, 25) || 'N/A'}</td>
                                        <td className="py-2 px-4 text-center text-sm font-mono">{format(new Date(entry.expected_date), "dd-MMM-yy")}</td>
                                        <td className="py-2 px-4 text-center">
                                          <span className={`px-2 py-1 text-xs rounded-full ${getTagColor(entry.reinvestment_tag)}`}>
                                            {getTagLabel(entry.reinvestment_tag)}
                                          </span>
                                        </td>
                                        <td className="py-2 px-4 text-right text-sm font-mono font-medium">
                                          ₹{(entry.custom_amount || entry.net_amount)?.toLocaleString('en-IN')}
                                        </td>
                                        <td className="py-2 px-4 text-center">
                                          {getApprovalStatusBadge(entry.approval_status)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
