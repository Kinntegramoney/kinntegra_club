import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Check, X, Clock, FileText, FileImage, Filter, RefreshCw, Tag, Mail, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  const [reinvestmentApprovals, setReinvestmentApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "all");
  const [processingTrade, setProcessingTrade] = useState(null);
  const [brokerNotes, setBrokerNotes] = useState("");
  
  // Filter states
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // "trade" or "reinvestment"

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
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      const [pendingRes, allRes, reinvestmentRes] = await Promise.all([
        axios.get(`${API}/trades/pending`, { headers }),
        axios.get(`${API}/trades`, { headers }),
        axios.get(`${API}/reinvestment/upcoming`, { headers }).catch(() => ({ data: { by_client: [] } }))
      ]);
      
      setPendingTrades(pendingRes.data);
      setAllTrades(allRes.data);
      
      // Extract sent approval entries from reinvestment data
      const sentApprovals = [];
      reinvestmentRes.data?.by_client?.forEach(client => {
        client.entries?.forEach(entry => {
          if (entry.approval_status && entry.approval_status !== 'not_sent') {
            sentApprovals.push({
              ...entry,
              client_name: client.client_name,
              client_pan: client.client_pan,
              client_email: client.client_email,
              type: 'reinvestment'
            });
          }
        });
      });
      setReinvestmentApprovals(sentApprovals);
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
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
      fetchData();
    } catch (error) {
      console.error("Error verifying trade:", error);
      toast.error(error.response?.data?.detail || "Failed to verify trade");
    } finally {
      setProcessingTrade(null);
    }
  };

  const getStatusBadge = (status, type = 'trade') => {
    if (type === 'reinvestment') {
      switch (status) {
        case 'pending':
          return <span className="px-2 py-1 bg-etihad-gold-100 text-etihad-gold-700 text-xs rounded-full flex items-center gap-1"><Mail className="h-3 w-3" /> Awaiting</span>;
        case 'approved':
          return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1"><Check className="h-3 w-3" /> Approved</span>;
        case 'rejected':
          return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1"><X className="h-3 w-3" /> Rejected</span>;
        default:
          return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">{status}</span>;
      }
    }
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

  const getTagColor = (tag) => {
    switch(tag) {
      case 'principal': return 'bg-blue-100 text-blue-700';
      case 'interest': return 'bg-green-100 text-green-700';
      case 'net_amount': return 'bg-purple-100 text-purple-700';
      case 'other': return 'bg-orange-100 text-orange-700';
      case 'not_invest': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  // Combined and filtered logs
  const filteredLogs = useMemo(() => {
    let logs = [];
    
    if (activeTab === 'pending') {
      logs = pendingTrades.map(t => ({ ...t, type: 'trade' }));
    } else if (activeTab === 'all') {
      // Combine trades and reinvestment approvals
      const trades = allTrades.map(t => ({ ...t, type: 'trade' }));
      const approvals = reinvestmentApprovals.map(r => ({ ...r, type: 'reinvestment' }));
      logs = [...trades, ...approvals];
    } else if (activeTab === 'reinvestment') {
      logs = reinvestmentApprovals.map(r => ({ ...r, type: 'reinvestment' }));
    }
    
    // Apply type filter
    if (typeFilter !== 'all') {
      logs = logs.filter(l => l.type === typeFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      logs = logs.filter(l => {
        if (l.type === 'trade') return l.status === statusFilter;
        if (l.type === 'reinvestment') return l.approval_status === statusFilter;
        return true;
      });
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      logs = logs.filter(l => {
        const searchFields = [
          l.client_name,
          l.client_pan,
          l.bond_name,
          l.created_by_name
        ].filter(Boolean).map(f => f.toLowerCase());
        return searchFields.some(f => f.includes(query));
      });
    }
    
    // Sort by date (most recent first)
    logs.sort((a, b) => {
      const dateA = new Date(a.created_at || a.expected_date || 0);
      const dateB = new Date(b.created_at || b.expected_date || 0);
      return dateB - dateA;
    });
    
    return logs;
  }, [activeTab, allTrades, pendingTrades, reinvestmentApprovals, typeFilter, statusFilter, searchQuery]);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="trade-verification-title">Logs</h1>
              <p className="text-sm text-gray-500 mt-1">Review trade requests and reinvestment approvals</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-etihad-gold-100 text-etihad-gold-700 text-sm rounded-full font-medium">
                {pendingTrades.length} Pending Trades
              </span>
              {reinvestmentApprovals.filter(r => r.approval_status === 'pending').length > 0 && (
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full font-medium">
                  {reinvestmentApprovals.filter(r => r.approval_status === 'pending').length} Reinv Pending
                </span>
              )}
              <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-6">
          <div className="flex items-center justify-between border-b border-gray-200">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("pending")}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === "pending" 
                    ? "border-etihad-gold-600 text-etihad-gold-600" 
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                data-testid="tab-pending"
              >
                Pending Approvals ({pendingTrades.length})
              </button>
              <button
                onClick={() => setActiveTab("all")}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === "all" 
                    ? "border-etihad-gold-600 text-etihad-gold-600" 
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                data-testid="tab-all"
              >
                All Logs ({allTrades.length + reinvestmentApprovals.length})
              </button>
              <button
                onClick={() => setActiveTab("reinvestment")}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-1 ${
                  activeTab === "reinvestment" 
                    ? "border-etihad-gold-600 text-etihad-gold-600" 
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                data-testid="tab-reinvestment"
              >
                <Tag className="h-4 w-4" />
                Sent for Approval ({reinvestmentApprovals.length})
              </button>
            </div>
            
            {/* Filter Toggle */}
            <Button
              variant={filterOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterOpen(!filterOpen)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </div>
          
          {/* Filter Panel */}
          {filterOpen && (
            <div className="bg-white border border-gray-200 rounded-lg mt-4 p-4 flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search client, PAN, bond..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Type:</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">All Types</option>
                  <option value="trade">Trades Only</option>
                  <option value="reinvestment">Reinvestment Only</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              
              {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setTypeFilter("all");
                    setStatusFilter("all");
                  }}
                  className="text-gray-500"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading...</p>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {activeTab === 'pending' ? "No pending trades to verify" : 
                 activeTab === 'reinvestment' ? "No reinvestment approvals sent" : "No logs found"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLogs.map((item, idx) => (
                <div 
                  key={item.id || item.cashflow_id || idx} 
                  className={`bg-white rounded-lg border p-4 md:p-6 ${
                    item.type === 'reinvestment' ? 'border-blue-200' : 'border-gray-200'
                  }`}
                  data-testid={`log-card-${item.id || item.cashflow_id}`}
                >
                  {/* Type Badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      item.type === 'reinvestment' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {item.type === 'reinvestment' ? 'Reinvestment Approval' : 'Trade'}
                    </span>
                    {item.type === 'reinvestment' 
                      ? getStatusBadge(item.approval_status, 'reinvestment')
                      : getStatusBadge(item.status)
                    }
                  </div>

                  {item.type === 'trade' ? (
                    // Trade Card Content
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base md:text-lg truncate">{item.bond_name}</h3>
                          <p className="text-xs md:text-sm text-gray-500">
                            Created by {item.created_by_name} ({item.created_by_role === 'sub_broker' ? 'Sub-Broker' : 'Broker'})
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Client</p>
                          <p className="font-medium text-sm md:text-base truncate">{item.client_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{item.client_pan}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Units</p>
                          <p className="font-mono font-bold text-base md:text-lg">{item.units}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Price/Unit</p>
                          <p className="font-mono text-sm">₹{item.calculated_price?.toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Total</p>
                          <p className="font-mono font-bold text-etihad-gold-600 text-sm md:text-base">₹{item.total_amount?.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <p className="text-xs text-gray-500 uppercase">Investment Date</p>
                          <p className="font-mono text-sm">{format(new Date(item.investment_date), "MMM dd, yyyy")}</p>
                        </div>
                      </div>

                      {(item.payment_reference || item.payment_notes || item.payment_proof_filename) && (
                        <div className="bg-gray-50 p-3 rounded-md mb-4">
                          <p className="text-xs text-gray-500 uppercase mb-2 font-medium">Payment Details</p>
                          <div className="space-y-1 text-sm">
                            {item.payment_reference && (
                              <p><span className="text-gray-500">Reference:</span> <span className="font-mono">{item.payment_reference}</span></p>
                            )}
                            {item.payment_proof_filename && (
                              <p className="flex items-center gap-2">
                                <FileImage className="h-4 w-4 text-green-600" />
                                <span className="text-gray-500">Proof:</span> 
                                <span className="text-green-700 truncate max-w-[200px]">{item.payment_proof_filename}</span>
                              </p>
                            )}
                            {item.payment_notes && (
                              <p><span className="text-gray-500">Notes:</span> {item.payment_notes}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {item.broker_notes && (
                        <div className="bg-blue-50 p-3 rounded-md mb-4">
                          <p className="text-xs text-blue-600 uppercase mb-1">Broker Notes</p>
                          <p className="text-sm">{item.broker_notes}</p>
                        </div>
                      )}

                      {item.status === 'pending' && (
                        <div className="border-t border-gray-200 pt-4 mt-4">
                          <div className="mb-3">
                            <label className="text-xs text-gray-500 uppercase block mb-1">Add Notes (Optional)</label>
                            <Textarea
                              value={processingTrade === item.id ? brokerNotes : ""}
                              onChange={(e) => {
                                setProcessingTrade(item.id);
                                setBrokerNotes(e.target.value);
                              }}
                              placeholder="Add verification notes..."
                              rows={2}
                              data-testid={`broker-notes-${item.id}`}
                            />
                          </div>
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleVerify(item.id, 'approved')}
                              disabled={processingTrade === item.id}
                              className="flex-1 bg-green-600 hover:bg-green-700"
                              data-testid={`approve-trade-${item.id}`}
                            >
                              <Check className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              onClick={() => handleVerify(item.id, 'rejected')}
                              disabled={processingTrade === item.id}
                              variant="destructive"
                              className="flex-1"
                              data-testid={`reject-trade-${item.id}`}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      )}

                      {item.approved_at && (
                        <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
                          {item.status === 'approved' ? 'Approved' : 'Rejected'} on {format(new Date(item.approved_at), "MMM dd, yyyy 'at' HH:mm")}
                        </div>
                      )}
                    </>
                  ) : (
                    // Reinvestment Approval Card Content
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base md:text-lg truncate">{item.bond_name || 'Reinvestment Entry'}</h3>
                          <p className="text-xs md:text-sm text-gray-500">
                            Sent for client approval
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Client</p>
                          <p className="font-medium text-sm md:text-base truncate">{item.client_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{item.client_pan}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Expected Date</p>
                          <p className="font-mono text-sm">{item.expected_date ? format(new Date(item.expected_date), "MMM dd, yyyy") : '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Tag</p>
                          <span className={`px-2 py-1 text-xs rounded-full ${getTagColor(item.reinvestment_tag)}`}>
                            {getTagLabel(item.reinvestment_tag)}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Amount</p>
                          <p className="font-mono font-bold text-blue-600 text-sm md:text-base">
                            ₹{(item.custom_amount || item.net_amount)?.toLocaleString('en-IN') || '-'}
                          </p>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <p className="text-xs text-gray-500 uppercase">Net Amount</p>
                          <p className="font-mono text-sm">₹{item.net_amount?.toLocaleString('en-IN') || '-'}</p>
                        </div>
                      </div>

                      {item.client_email && (
                        <div className="bg-blue-50 p-3 rounded-md">
                          <p className="text-xs text-blue-600 uppercase mb-1">Sent To</p>
                          <p className="text-sm font-mono">{item.client_email}</p>
                        </div>
                      )}
                    </>
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
