import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { format } from "date-fns";
import Sidebar from "../components/Sidebar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  RefreshCw, Save, CheckCircle, AlertCircle, ChevronUp, ChevronDown,
  Mail, Tag
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function ReinvestmentTagging() {
  const [user, setUser] = useState(null);
  const [reinvestmentData, setReinvestmentData] = useState(null);
  const [loadingReinvestment, setLoadingReinvestment] = useState(false);
  const [reinvestmentSection, setReinvestmentSection] = useState("untagged");
  const [localTags, setLocalTags] = useState({});
  const [customAmounts, setCustomAmounts] = useState({});
  const [savingClient, setSavingClient] = useState(null);
  const [expandedClients, setExpandedClients] = useState({});
  const [selectedClientEntries, setSelectedClientEntries] = useState({});
  const [sendingApproval, setSendingApproval] = useState(null);
  const [portfolioCategories, setPortfolioCategories] = useState({});

  // Portfolio category options
  const PORTFOLIO_OPTIONS = [
    { value: '', label: 'Select Portfolio' },
    { value: 'wealth', label: 'Wealth' },
    { value: 'tax', label: 'Tax' },
    { value: 'short_term', label: 'Short Term' },
    { value: 'commodities', label: 'Commodities' },
    { value: 'bonds', label: 'Bonds' },
    { value: 'real_estate', label: 'Real Estate' }
  ];

  useEffect(() => {
    document.title = "Kinntegraa | Reinvestment Tagging";
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    fetchReinvestmentData();
  }, []);

  const getAuthHeaders = () => ({
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchReinvestmentData = async () => {
    setLoadingReinvestment(true);
    try {
      const response = await axios.get(`${API}/reinvestment/upcoming`, getAuthHeaders());
      setReinvestmentData(response.data);
      
      // Initialize local tags and portfolio categories from data
      const tags = {};
      const portfolios = {};
      response.data?.by_client?.forEach(client => {
        client.entries.forEach(item => {
          tags[item.cashflow_id] = item.reinvestment_tag || 'not_tagged';
          portfolios[item.cashflow_id] = item.portfolio_category || '';
        });
      });
      setLocalTags(tags);
      setPortfolioCategories(portfolios);
    } catch (error) {
      console.error("Error fetching reinvestment data:", error);
      toast.error("Failed to load reinvestment data");
    } finally {
      setLoadingReinvestment(false);
    }
  };

  const handleTagChange = (cashflowId, tag) => {
    setLocalTags(prev => ({ ...prev, [cashflowId]: tag }));
  };

  const handleCustomAmountChange = (cashflowId, amount) => {
    setCustomAmounts(prev => ({ ...prev, [cashflowId]: amount }));
  };

  const handlePortfolioCategoryChange = (cashflowId, category) => {
    setPortfolioCategories(prev => ({ ...prev, [cashflowId]: category }));
  };

  const handleSaveEntryTag = async (cashflowId) => {
    setSavingClient(cashflowId);
    try {
      await axios.put(`${API}/reinvestment/tag/${cashflowId}`, 
        { 
          reinvestment_tag: localTags[cashflowId],
          custom_amount: localTags[cashflowId] === 'other' ? parseFloat(customAmounts[cashflowId]) : null,
          portfolio_category: portfolioCategories[cashflowId] || null
        },
        getAuthHeaders()
      );
      toast.success("Tag saved");
      fetchReinvestmentData();
    } catch (error) {
      console.error("Error saving tag:", error);
      toast.error("Failed to save tag");
    } finally {
      setSavingClient(null);
    }
  };

  // Untag an entry - reset tag and portfolio, move back to Untagged section
  const handleUntag = async (cashflowId) => {
    setSavingClient(cashflowId);
    try {
      await axios.put(`${API}/reinvestment/tag/${cashflowId}`, 
        { 
          reinvestment_tag: 'not_tagged',
          custom_amount: null,
          portfolio_category: null
        },
        getAuthHeaders()
      );
      // Update local state
      setLocalTags(prev => ({ ...prev, [cashflowId]: 'not_tagged' }));
      setPortfolioCategories(prev => ({ ...prev, [cashflowId]: '' }));
      setCustomAmounts(prev => {
        const newAmounts = { ...prev };
        delete newAmounts[cashflowId];
        return newAmounts;
      });
      toast.success("Entry untagged successfully");
      fetchReinvestmentData();
    } catch (error) {
      console.error("Error untagging entry:", error);
      toast.error("Failed to untag entry");
    } finally {
      setSavingClient(null);
    }
  };

  // Save all tags for a client - only when ALL entries are tagged
  const handleSaveAllClientTags = async (client) => {
    // Check if all entries are complete (tagged + portfolio)
    const allComplete = client.entries.every(e => {
      const tag = localTags[e.cashflow_id] || e.currentTag;
      const portfolio = portfolioCategories[e.cashflow_id] || e.portfolio_category || '';
      
      // Entry is complete if:
      // 1. It's 'not_invest' (no portfolio needed), OR
      // 2. It has both tag and portfolio
      if (!tag || tag === 'not_tagged') return false;
      if (tag === 'not_invest') return true;
      return !!portfolio;
    });
    
    if (!allComplete) {
      toast.error("Please complete both Tag and Portfolio for all entries before saving");
      return;
    }

    setSavingClient(client.client_id);
    try {
      // Save all tags for this client
      await Promise.all(
        client.entries.map(entry => 
          axios.put(`${API}/reinvestment/tag/${entry.cashflow_id}`, 
            { 
              reinvestment_tag: localTags[entry.cashflow_id] || entry.currentTag,
              custom_amount: (localTags[entry.cashflow_id] || entry.currentTag) === 'other' 
                ? parseFloat(customAmounts[entry.cashflow_id] || entry.custom_amount) 
                : null,
              portfolio_category: portfolioCategories[entry.cashflow_id] || entry.portfolio_category || null
            },
            getAuthHeaders()
          )
        )
      );
      toast.success(`All tags saved for ${client.client_name}`);
      fetchReinvestmentData();
    } catch (error) {
      console.error("Error saving tags:", error);
      toast.error("Failed to save tags");
    } finally {
      setSavingClient(null);
    }
  };

  const handleSendForApproval = async (client) => {
    const selectedEntries = selectedClientEntries[client.client_id] || [];
    if (selectedEntries.length === 0) {
      toast.error("Please select entries to send for approval");
      return;
    }
    
    setSendingApproval(client.client_id);
    try {
      await axios.post(`${API}/reinvestment/send-approval`, 
        { 
          client_id: client.client_id,
          cashflow_ids: selectedEntries
        },
        getAuthHeaders()
      );
      toast.success(`Approval request sent to ${client.client_name}`);
      fetchReinvestmentData();
      setSelectedClientEntries(prev => ({ ...prev, [client.client_id]: [] }));
    } catch (error) {
      console.error("Error sending approval:", error);
      toast.error("Failed to send approval request");
    } finally {
      setSendingApproval(null);
    }
  };

  // Process and categorize clients
  // IMPORTANT: A client only goes to "Tagged" when ALL entries are:
  //   1. Tagged (not 'not_tagged')
  //   2. Have portfolio category selected (except for 'not_invest' entries)
  // If even one entry is incomplete, the client stays in "Untagged" section
  const { untaggedClients, taggedClients, sentClients } = useMemo(() => {
    if (!reinvestmentData?.by_client) return { untaggedClients: [], taggedClients: [], sentClients: [] };
    
    const untagged = [];
    const tagged = [];
    const sent = [];
    
    reinvestmentData.by_client.forEach(client => {
      const entriesWithTags = client.entries.map(entry => {
        const currentTag = localTags[entry.cashflow_id] || entry.reinvestment_tag || 'not_tagged';
        const currentPortfolio = portfolioCategories[entry.cashflow_id] || entry.portfolio_category || '';
        
        // An entry is "complete" if:
        // 1. It's tagged as 'not_invest' (no portfolio needed), OR
        // 2. It has a tag AND a portfolio category
        const isComplete = currentTag === 'not_invest' || 
          (currentTag !== 'not_tagged' && (currentTag === 'not_invest' || currentPortfolio));
        
        return {
          ...entry,
          currentTag,
          currentPortfolio,
          isComplete
        };
      });
      
      const untaggedCount = entriesWithTags.filter(e => e.currentTag === 'not_tagged').length;
      const incompleteCount = entriesWithTags.filter(e => !e.isComplete).length;
      const taggedCount = entriesWithTags.filter(e => e.currentTag !== 'not_tagged').length;
      const completeCount = entriesWithTags.filter(e => e.isComplete).length;
      const sentCount = entriesWithTags.filter(e => e.approval_status && e.approval_status !== 'not_sent').length;
      
      const clientWithStats = {
        ...client,
        entries: entriesWithTags,
        untaggedCount,
        incompleteCount,
        taggedCount,
        completeCount,
        totalEntries: entriesWithTags.length,
        allComplete: incompleteCount === 0 && completeCount > 0, // All entries must be complete (tag + portfolio)
        taggedAmount: entriesWithTags
          .filter(e => e.currentTag !== 'not_tagged' && e.currentTag !== 'not_invest')
          .reduce((sum, e) => {
            if (e.currentTag === 'principal') return sum + (e.principal_net || 0);
            if (e.currentTag === 'interest') return sum + (e.interest_net || 0);
            if (e.currentTag === 'net_amount') return sum + (e.net_amount || 0);
            if (e.currentTag === 'other') return sum + (parseFloat(customAmounts[e.cashflow_id]) || e.custom_amount || 0);
            return sum;
          }, 0)
      };
      
      // Sent section: entries that have been sent for approval
      if (sentCount > 0) {
        sent.push(clientWithStats);
      }
      
      // Tagged section: ALL entries must be complete (tag + portfolio)
      // If even ONE entry is incomplete, the client goes to Untagged section
      if (incompleteCount === 0 && completeCount > 0 && sentCount === 0) {
        tagged.push(clientWithStats);
      } else if (incompleteCount > 0 || sentCount === 0) {
        // Any incomplete entries = client goes to Untagged section
        untagged.push(clientWithStats);
      }
    });
    
    return { untaggedClients: untagged, taggedClients: tagged, sentClients: sent };
  }, [reinvestmentData, localTags, customAmounts, portfolioCategories]);

  const getTagColor = (tag) => {
    switch(tag) {
      case 'principal': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'interest': return 'bg-green-100 text-green-700 border-green-300';
      case 'net_amount': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'other': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'not_invest': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  };

  const getTagLabel = (tag) => {
    switch(tag) {
      case 'principal': return 'Principal';
      case 'interest': return 'Interest';
      case 'net_amount': return 'Net Amount';
      case 'other': return 'Custom';
      case 'not_invest': return 'Not Investing';
      default: return 'Not Tagged';
    }
  };

  const getApprovalStatusBadge = (status) => {
    switch(status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700">Pending</span>;
      case 'approved':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">Rejected</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">Not Sent</span>;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800" data-testid="reinvestment-title">
                <Tag className="h-6 w-6 inline-block mr-2 text-amber-500" />
                Reinv Tag
              </h1>
              <p className="text-sm text-gray-500 mt-1">Tag upcoming cashflows for reinvestment and send for client approval</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchReinvestmentData} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loadingReinvestment ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-8">
          {/* Sub-tabs */}
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
          </div>

          {loadingReinvestment ? (
            <div className="text-center py-12 text-gray-500">Loading reinvestment data...</div>
          ) : (
            <div className="space-y-4">
              {/* UNTAGGED SECTION */}
              {reinvestmentSection === "untagged" && (
                untaggedClients.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
                    <p className="text-gray-500">All clients have been tagged!</p>
                    <p className="text-sm text-gray-400 mt-2">Move to &ldquo;Tagged&rdquo; section to send for approval</p>
                  </div>
                ) : (
                  untaggedClients.map((client) => (
                    <div key={client.client_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                          <div className="flex gap-2 text-xs flex-wrap">
                            {client.untaggedCount > 0 && (
                              <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">{client.untaggedCount} untagged</span>
                            )}
                            {client.incompleteCount > 0 && client.incompleteCount !== client.untaggedCount && (
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">{client.incompleteCount - client.untaggedCount} need portfolio</span>
                            )}
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full">{client.completeCount} complete</span>
                          </div>
                          {expandedClients[client.client_id] ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </div>
                      
                      {expandedClients[client.client_id] && (
                        <div className="border-t">
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Deal ID</th>
                                <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Principal</th>
                                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Interest</th>
                                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Net Amt</th>
                                <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
                                <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Custom Amt</th>
                                <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Portfolio</th>
                                <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Save</th>
                              </tr>
                            </thead>
                            <tbody>
                              {client.entries.map((entry) => {
                                const needsPortfolio = entry.currentTag && entry.currentTag !== 'not_tagged' && entry.currentTag !== 'not_invest' && !entry.currentPortfolio;
                                return (
                                <tr key={entry.cashflow_id} className={`border-t hover:bg-gray-50 ${entry.currentTag === 'not_tagged' ? 'bg-red-50/30' : ''} ${needsPortfolio ? 'bg-yellow-50/50' : ''} ${entry.prepayment_affected ? 'bg-amber-50/50' : ''} ${entry.isComplete ? 'bg-green-50/30' : ''}`}>
                                  <td className="py-2 px-4 text-sm">
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono text-gray-700">{entry.bond_code || entry.deal_id || 'N/A'}</span>
                                        {entry.is_amended && (
                                          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded" title={entry.amendment_reason || 'Amount revised due to prepayment'}>
                                            Revised
                                          </span>
                                        )}
                                      </div>
                                      {entry.bond_name && (
                                        <span className="text-xs text-gray-500">{entry.bond_name.slice(0, 25)}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-4 text-center text-sm font-mono">{format(new Date(entry.expected_date), "dd-MMM-yy")}</td>
                                  <td className="py-2 px-4 text-right text-sm font-mono">₹{entry.principal_net?.toLocaleString('en-IN')}</td>
                                  <td className="py-2 px-4 text-right text-sm font-mono">
                                    <div className="flex flex-col items-end">
                                      <span>₹{entry.interest_net?.toLocaleString('en-IN')}</span>
                                      {entry.original_interest_component && entry.original_interest_component !== entry.interest_net && (
                                        <span className="text-[10px] text-gray-400 line-through">₹{(entry.original_interest_component - (entry.original_interest_component * 0.1))?.toLocaleString('en-IN')}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-4 text-right text-sm font-mono text-green-600 font-medium">
                                    <div className="flex flex-col items-end">
                                      <span>₹{entry.net_amount?.toLocaleString('en-IN')}</span>
                                      {entry.original_net_amount && entry.original_net_amount !== entry.net_amount && (
                                        <span className="text-[10px] text-gray-400 line-through">₹{entry.original_net_amount?.toLocaleString('en-IN')}</span>
                                      )}
                                    </div>
                                  </td>
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
                                    {entry.currentTag && entry.currentTag !== 'not_tagged' && entry.currentTag !== 'not_invest' && (
                                      <select
                                        value={portfolioCategories[entry.cashflow_id] || entry.portfolio_category || ''}
                                        onChange={(e) => handlePortfolioCategoryChange(entry.cashflow_id, e.target.value)}
                                        className="px-2 py-1 text-xs rounded-lg border focus:outline-none bg-purple-50 border-purple-200 text-purple-800"
                                        data-testid={`portfolio-select-${entry.cashflow_id}`}
                                      >
                                        {PORTFOLIO_OPTIONS.map(opt => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </select>
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
                              )})}
                            </tbody>
                          </table>
                          <div className="px-4 py-3 bg-gray-50 border-t">
                            <div className="flex items-center justify-between text-sm mb-2">
                              <span className="text-gray-600">Completion Progress</span>
                              <span className="font-medium">{client.completeCount}/{client.entries.length}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                              <div 
                                className="bg-green-500 h-2 rounded-full transition-all"
                                style={{ width: `${(client.completeCount / client.entries.length) * 100}%` }}
                              />
                            </div>
                            {/* Save All button - only enabled when ALL entries are tagged */}
                            <div className="flex items-center justify-between">
                              {client.allTagged ? (
                                <p className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" /> All entries tagged - Ready to save!
                                </p>
                              ) : (
                                <p className="text-xs text-amber-600">
                                  Tag all {client.untaggedCount} remaining entries to save
                                </p>
                              )}
                              <Button
                                size="sm"
                                onClick={() => handleSaveAllClientTags(client)}
                                disabled={!client.allTagged || savingClient === client.client_id}
                                className={`gap-2 ${client.allTagged ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}
                              >
                                {savingClient === client.client_id ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <Save className="h-4 w-4" />
                                    Save All Tags
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )
              )}

              {/* TAGGED SECTION */}
              {reinvestmentSection === "tagged" && (
                taggedClients.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No clients ready for approval</p>
                    <p className="text-sm text-gray-400 mt-2">Tag all entries for a client first</p>
                  </div>
                ) : (
                  taggedClients.map((client) => (
                    <div key={client.client_id} className="bg-white rounded-lg border border-green-200 overflow-hidden">
                      <div className="px-4 py-3 bg-green-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-green-700" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{client.client_name}</p>
                            <p className="text-xs text-gray-500">{client.entries.length} entries tagged • Total: ₹{client.taggedAmount?.toLocaleString('en-IN')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 text-sm text-gray-600 mr-4">
                            <input
                              type="checkbox"
                              checked={selectedClientEntries[client.client_id]?.length === client.entries.filter(e => e.currentTag !== 'not_invest').length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedClientEntries(prev => ({
                                    ...prev,
                                    [client.client_id]: client.entries.filter(e => e.currentTag !== 'not_invest').map(e => e.cashflow_id)
                                  }));
                                } else {
                                  setSelectedClientEntries(prev => ({
                                    ...prev,
                                    [client.client_id]: []
                                  }));
                                }
                              }}
                              className="rounded border-gray-300"
                            />
                            Select All
                          </label>
                          <Button
                            size="sm"
                            onClick={() => handleSendForApproval(client)}
                            disabled={sendingApproval === client.client_id || !selectedClientEntries[client.client_id]?.length}
                            className="gap-2 bg-green-600 hover:bg-green-700"
                          >
                            {sendingApproval === client.client_id ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="h-4 w-4" />
                                Send for Approval ({selectedClientEntries[client.client_id]?.length || 0})
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="p-4">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="w-8 py-2 px-2"></th>
                              <th className="text-left py-2 px-4 text-xs font-medium text-gray-500 uppercase">Portfolio</th>
                              <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Tag</th>
                              <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                              <th className="text-center py-2 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {client.entries.map((entry) => (
                              <tr key={entry.cashflow_id} className="border-t">
                                <td className="py-2 px-2">
                                  {entry.currentTag !== 'not_invest' && (
                                    <input
                                      type="checkbox"
                                      checked={selectedClientEntries[client.client_id]?.includes(entry.cashflow_id)}
                                      onChange={(e) => {
                                        setSelectedClientEntries(prev => {
                                          const current = prev[client.client_id] || [];
                                          if (e.target.checked) {
                                            return { ...prev, [client.client_id]: [...current, entry.cashflow_id] };
                                          } else {
                                            return { ...prev, [client.client_id]: current.filter(id => id !== entry.cashflow_id) };
                                          }
                                        });
                                      }}
                                      className="rounded border-gray-300"
                                    />
                                  )}
                                </td>
                                <td className="py-2 px-4 text-sm">
                                  <div className="flex flex-col gap-0.5">
                                    {(entry.currentPortfolio || entry.portfolio_category) ? (
                                      <span className="text-purple-700 font-medium">
                                        {PORTFOLIO_OPTIONS.find(p => p.value === (entry.currentPortfolio || entry.portfolio_category))?.label || (entry.currentPortfolio || entry.portfolio_category)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500 italic">No portfolio selected</span>
                                    )}
                                    {entry.bond_code && (
                                      <span className="text-xs text-gray-500 font-mono">{entry.bond_code}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-4 text-center text-sm font-mono">{format(new Date(entry.expected_date), "dd-MMM-yy")}</td>
                                <td className="py-2 px-4 text-center">
                                  <span className={`px-2 py-1 text-xs rounded-lg border ${getTagColor(entry.currentTag)}`}>
                                    {getTagLabel(entry.currentTag)}
                                  </span>
                                </td>
                                <td className="py-2 px-4 text-right text-sm font-mono font-medium">
                                  {entry.currentTag === 'principal' && `₹${entry.principal_net?.toLocaleString('en-IN')}`}
                                  {entry.currentTag === 'interest' && `₹${entry.interest_net?.toLocaleString('en-IN')}`}
                                  {entry.currentTag === 'net_amount' && `₹${entry.net_amount?.toLocaleString('en-IN')}`}
                                  {entry.currentTag === 'other' && `₹${entry.custom_amount?.toLocaleString('en-IN')}`}
                                  {entry.currentTag === 'not_invest' && <span className="text-red-500">Not Investing</span>}
                                </td>
                                <td className="py-2 px-4 text-center">
                                  <button
                                    onClick={() => handleTagChange(client.client_id, entry.cashflow_id, 'not_tagged')}
                                    className="px-2 py-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded border border-red-200 transition-colors"
                                    title="Remove tag and move back to Untagged"
                                  >
                                    Untag
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )
              )}

              {/* SENT FOR APPROVAL SECTION */}
              {reinvestmentSection === "sent" && (
                sentClients.length === 0 ? (
                  <div className="text-center py-12">
                    <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No approvals sent yet</p>
                    <p className="text-sm text-gray-400 mt-2">Tag and send entries for client approval</p>
                  </div>
                ) : (
                  sentClients.map((client) => {
                    const sentEntries = client.entries.filter(e => e.approval_status && e.approval_status !== 'not_sent');
                    return (
                      <div key={client.client_id} className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                        <div className="px-4 py-3 bg-blue-50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center">
                              <Mail className="h-5 w-5 text-blue-700" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-800">{client.client_name}</p>
                              <p className="text-xs text-gray-500">{sentEntries.length} entries sent for approval</p>
                            </div>
                          </div>
                        </div>
                        {sentEntries.length > 0 && (
                          <div className="p-4">
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
                                {sentEntries.map((entry) => (
                                  <tr key={entry.cashflow_id} className="border-t">
                                    <td className="py-2 px-4 text-sm">
                                      <div className="flex flex-col gap-0.5">
                                        <span>
                                          {entry.bond_name?.slice(0, 25) || (
                                            (entry.currentPortfolio || entry.portfolio_category) 
                                              ? <span className="text-purple-700 font-medium">
                                                  Portfolio - {PORTFOLIO_OPTIONS.find(p => p.value === (entry.currentPortfolio || entry.portfolio_category))?.label || (entry.currentPortfolio || entry.portfolio_category)}
                                                </span>
                                              : (entry.currentTag && entry.currentTag !== 'not_tagged' && entry.currentTag !== 'not_invest')
                                                ? <span className="text-purple-600">Portfolio</span>
                                                : 'N/A'
                                          )}
                                        </span>
                                        {entry.bond_name && (entry.currentPortfolio || entry.portfolio_category) && (
                                          <span className="text-xs text-purple-600 font-medium">
                                            Portfolio: {PORTFOLIO_OPTIONS.find(p => p.value === (entry.currentPortfolio || entry.portfolio_category))?.label || (entry.currentPortfolio || entry.portfolio_category)}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-2 px-4 text-center text-sm font-mono">{format(new Date(entry.expected_date), "dd-MMM-yy")}</td>
                                    <td className="py-2 px-4 text-center">
                                      <span className={`px-2 py-1 text-xs rounded-lg border ${getTagColor(entry.currentTag)}`}>
                                        {getTagLabel(entry.currentTag)}
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
      </div>
    </div>
  );
}
