import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import ClientSidebar from "@/components/ClientSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Tag, Clock, CheckCircle, XCircle, Search, RefreshCw,
  Calendar, User, TrendingUp, MoreVertical, Edit, Check, X,
  AlertTriangle, History, ArrowRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function UntaggedTrades() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("untagged");
  const [trades, setTrades] = useState([]);
  const [pendingApproval, setPendingApproval] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  
  // Tagging modal state
  const [taggingTrade, setTaggingTrade] = useState(null);
  const [tagForm, setTagForm] = useState({ ucc: "", portfolio: "", tagged_amount: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Kinntegraa | Trade Tagging";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchData(parsedUser);
  }, [navigate]);

  const fetchData = async (currentUser) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      
      if (currentUser.role === 'client') {
        // Clients see pending approval trades
        const response = await axios.get(`${API}/trades/pending-approval`, { headers });
        setPendingApproval(response.data || []);
      } else {
        // Broker/Sub-broker see untagged trades
        const [untaggedRes, pendingRes] = await Promise.all([
          axios.get(`${API}/trades/untagged`, { headers }),
          axios.get(`${API}/trades/pending-approval`, { headers })
        ]);
        setTrades(untaggedRes.data || []);
        setPendingApproval(pendingRes.data || []);
      }
    } catch (error) {
      console.error("Error fetching trades:", error);
      toast.error("Failed to load trades");
    } finally {
      setLoading(false);
    }
  };

  const handleTagTrade = async (e) => {
    e.preventDefault();
    if (!taggingTrade || !tagForm.ucc || !tagForm.portfolio) {
      toast.error("Please fill UCC and Portfolio");
      return;
    }
    
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/trades/${taggingTrade.id}/tag`,
        {
          ucc: tagForm.ucc,
          portfolio: tagForm.portfolio,
          tagged_amount: tagForm.tagged_amount ? parseFloat(tagForm.tagged_amount.replace(/,/g, '')) : null,
          notes: tagForm.notes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(taggingTrade.is_past_dated 
        ? "Trade tagged and approved!" 
        : "Trade tagged - pending client approval"
      );
      setTaggingTrade(null);
      setTagForm({ ucc: "", portfolio: "", tagged_amount: "", notes: "" });
      fetchData(user);
    } catch (error) {
      console.error("Error tagging trade:", error);
      toast.error(error.response?.data?.detail || "Failed to tag trade");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClientApprove = async (tradeId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/trades/${tradeId}/client-approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Trade approved!");
      fetchData(user);
    } catch (error) {
      console.error("Error approving trade:", error);
      toast.error(error.response?.data?.detail || "Failed to approve trade");
    }
  };

  const handleClientReject = async (tradeId) => {
    const reason = window.prompt("Reason for rejection (optional):");
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/trades/${tradeId}/reject?reason=${encodeURIComponent(reason || '')}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Trade rejected");
      fetchData(user);
    } catch (error) {
      console.error("Error rejecting trade:", error);
      toast.error(error.response?.data?.detail || "Failed to reject trade");
    }
  };

  const openTagModal = (trade) => {
    setTaggingTrade(trade);
    setTagForm({
      ucc: trade.ucc || "",
      portfolio: trade.portfolio || "",
      tagged_amount: trade.tagged_amount?.toString() || trade.total_amount?.toString() || "",
      notes: trade.broker_notes || ""
    });
  };

  const filteredTrades = trades.filter(trade => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!trade.client_name?.toLowerCase().includes(query) &&
          !trade.bond_name?.toLowerCase().includes(query) &&
          !trade.client_pan?.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (dateFilter === 'past' && !trade.is_past_dated) return false;
    if (dateFilter === 'future' && trade.is_past_dated) return false;
    return true;
  });

  const pastTrades = filteredTrades.filter(t => t.is_past_dated);
  const futureTrades = filteredTrades.filter(t => !t.is_past_dated);

  const getSidebar = () => {
    if (!user) return null;
    if (user.role === "broker") return <Sidebar user={user} />;
    if (user.role === "sub_broker") return <SubBrokerSidebar user={user} />;
    return <ClientSidebar user={user} />;
  };

  const formatCurrency = (amount) => {
    if (!amount) return "-";
    return `₹${parseFloat(amount).toLocaleString('en-IN')}`;
  };

  const isClient = user?.role === 'client';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {getSidebar()}
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2" data-testid="untagged-trades-title">
                  <Tag className="h-5 w-5 text-amber-600" />
                  {isClient ? "Pending Approvals" : "Trade Tagging"}
                </h1>
                <p className="text-sm text-gray-500">
                  {isClient 
                    ? "Review and approve tagged trades" 
                    : "Tag untagged trades with UCC, portfolio, and amount"
                  }
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => fetchData(user)}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Stats */}
          {!isClient && (
            <div className="px-6 py-3 border-t bg-gray-50 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-500">Past-dated:</span>
                <span className="font-semibold text-blue-600">{pastTrades.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-gray-500">Future-dated:</span>
                <span className="font-semibold text-amber-600">{futureTrades.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-500" />
                <span className="text-sm text-gray-500">Pending approval:</span>
                <span className="font-semibold text-purple-600">{pendingApproval.length}</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-6">
          {isClient ? (
            // Client view - only pending approvals
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="p-4 border-b bg-amber-50">
                <h3 className="font-semibold text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Trades Awaiting Your Approval
                </h3>
                <p className="text-sm text-amber-700 mt-1">
                  Review tagged trades from your advisor. Once approved, they cannot be edited.
                </p>
              </div>
              
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
                </div>
              ) : pendingApproval.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-3" />
                  <p>No trades pending your approval</p>
                </div>
              ) : (
                <div className="divide-y">
                  {pendingApproval.map(trade => (
                    <div key={trade.id} className="p-4 hover:bg-gray-50" data-testid={`pending-trade-${trade.id}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <TrendingUp className="h-5 w-5 text-amber-600" />
                            <span className="font-semibold text-gray-800">{trade.bond_name}</span>
                            <Badge variant="outline" className="text-amber-600 border-amber-200">
                              {trade.bond_code}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Investment Date:</span>
                              <p className="font-medium">{format(new Date(trade.investment_date), "dd MMM yyyy")}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Units:</span>
                              <p className="font-medium">{trade.units}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Amount:</span>
                              <p className="font-medium">{formatCurrency(trade.tagged_amount || trade.total_amount)}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">UCC / Portfolio:</span>
                              <p className="font-medium">{trade.ucc} / {trade.portfolio}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleClientApprove(trade.id)}
                            data-testid={`approve-trade-${trade.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleClientReject(trade.id)}
                            data-testid={`reject-trade-${trade.id}`}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Broker/Sub-broker view
            <>
              {/* Filters */}
              <div className="bg-white rounded-lg border p-4 mb-6">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by client, bond, or PAN..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="trade-search-input"
                    />
                  </div>
                  
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-40" data-testid="date-filter">
                      <SelectValue placeholder="All Dates" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Dates</SelectItem>
                      <SelectItem value="past">Past-dated</SelectItem>
                      <SelectItem value="future">Future-dated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="untagged" className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Untagged ({filteredTrades.length})
                  </TabsTrigger>
                  <TabsTrigger value="pending" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Pending Approval ({pendingApproval.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="untagged">
                  {loading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
                    </div>
                  ) : filteredTrades.length === 0 ? (
                    <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                      <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-3" />
                      <p>No untagged trades</p>
                      <p className="text-sm mt-1">All trades have been tagged</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Bond</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Units</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Type</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-20">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredTrades.map(trade => (
                            <tr key={trade.id} className="hover:bg-gray-50" data-testid={`untagged-trade-${trade.id}`}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{trade.client_name}</div>
                                <div className="text-xs text-gray-500">{trade.client_pan}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{trade.bond_name}</div>
                                <div className="text-xs text-gray-500">{trade.bond_code}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm">{format(new Date(trade.investment_date), "dd MMM yyyy")}</div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono">{trade.units}</td>
                              <td className="px-4 py-3 text-right font-mono">{formatCurrency(trade.total_amount)}</td>
                              <td className="px-4 py-3 text-center">
                                {trade.is_past_dated ? (
                                  <Badge className="bg-blue-100 text-blue-700">Past</Badge>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-700">Future</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Button 
                                  size="sm" 
                                  className="bg-amber-600 hover:bg-amber-700"
                                  onClick={() => openTagModal(trade)}
                                  data-testid={`tag-trade-${trade.id}`}
                                >
                                  <Tag className="h-4 w-4 mr-1" />
                                  Tag
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pending">
                  {pendingApproval.length === 0 ? (
                    <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                      <Clock className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                      <p>No trades pending client approval</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Bond</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">UCC / Portfolio</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-20">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {pendingApproval.map(trade => (
                            <tr key={trade.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{trade.client_name}</div>
                                <div className="text-xs text-gray-500">{trade.client_pan}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-800">{trade.bond_name}</div>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {format(new Date(trade.investment_date), "dd MMM yyyy")}
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm">{trade.ucc}</div>
                                <div className="text-xs text-gray-500">{trade.portfolio}</div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono">
                                {formatCurrency(trade.tagged_amount || trade.total_amount)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge className="bg-purple-100 text-purple-700">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Awaiting Client
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => openTagModal(trade)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>

      {/* Tagging Modal */}
      <Dialog open={!!taggingTrade} onOpenChange={() => setTaggingTrade(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-amber-600" />
              Tag Trade
            </DialogTitle>
            <DialogDescription>
              {taggingTrade?.is_past_dated 
                ? "Past-dated trade - will be auto-approved after tagging"
                : "Future-dated trade - will require client approval after tagging"
              }
            </DialogDescription>
          </DialogHeader>
          
          {taggingTrade && (
            <form onSubmit={handleTagTrade} className="space-y-4">
              {/* Trade Info */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Client:</span>
                  <span className="font-medium">{taggingTrade.client_name}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Bond:</span>
                  <span className="font-medium">{taggingTrade.bond_name}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Date:</span>
                  <span className="font-medium">{format(new Date(taggingTrade.investment_date), "dd MMM yyyy")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Original Amount:</span>
                  <span className="font-medium">{formatCurrency(taggingTrade.total_amount)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="ucc">UCC *</Label>
                  <Input
                    id="ucc"
                    value={tagForm.ucc}
                    onChange={(e) => setTagForm({...tagForm, ucc: e.target.value})}
                    placeholder="Enter UCC"
                    required
                    data-testid="tag-ucc-input"
                  />
                </div>
                
                <div>
                  <Label htmlFor="portfolio">Portfolio *</Label>
                  <Input
                    id="portfolio"
                    value={tagForm.portfolio}
                    onChange={(e) => setTagForm({...tagForm, portfolio: e.target.value})}
                    placeholder="Enter Portfolio"
                    required
                    data-testid="tag-portfolio-input"
                  />
                </div>
                
                <div>
                  <Label htmlFor="tagged_amount">Investment Amount (₹)</Label>
                  <Input
                    id="tagged_amount"
                    value={tagForm.tagged_amount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/,/g, '');
                      if (!isNaN(value) && value !== '') {
                        setTagForm({...tagForm, tagged_amount: parseInt(value).toLocaleString('en-IN')});
                      } else if (value === '') {
                        setTagForm({...tagForm, tagged_amount: ''});
                      }
                    }}
                    placeholder="Leave blank to use original amount"
                    data-testid="tag-amount-input"
                  />
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <textarea
                    id="notes"
                    value={tagForm.notes}
                    onChange={(e) => setTagForm({...tagForm, notes: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border rounded-md"
                    placeholder="Optional notes..."
                  />
                </div>
              </div>

              {!taggingTrade.is_past_dated && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  This trade will require client approval before it becomes active.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setTaggingTrade(null)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  disabled={submitting}
                  data-testid="submit-tag-btn"
                >
                  {submitting ? "Saving..." : (
                    <>
                      <Tag className="h-4 w-4 mr-2" />
                      {taggingTrade.is_past_dated ? "Tag & Approve" : "Tag Trade"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
