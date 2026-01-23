import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Tag, RefreshCw, ChevronDown, ChevronUp, Mail, Save, 
  Clock, CheckCircle, History, ArrowRight, Users, Search,
  Check, X
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TAG_OPTIONS = [
  { value: "reinvest", label: "Reinvest" },
  { value: "withdraw", label: "Withdraw" },
  { value: "not_invest", label: "Not Invest" },
  { value: "other", label: "Other" },
];

const PORTFOLIO_OPTIONS = [
  { value: "equity", label: "Equity" },
  { value: "debt", label: "Debt" },
  { value: "hybrid", label: "Hybrid" },
  { value: "gold", label: "Gold" },
  { value: "real_estate", label: "Real Estate" },
];

export default function ReinvestmentTagging() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("untagged");
  const [activeSection, setActiveSection] = useState("past"); // "past" or "upcoming"
  
  // Data grouped by client
  const [clientGroups, setClientGroups] = useState({ past: [], upcoming: [] });
  const [taggedGroups, setTaggedGroups] = useState([]);
  
  // Expanded clients
  const [expandedClients, setExpandedClients] = useState({});
  
  // Selection state for mass operations
  const [selectedEntries, setSelectedEntries] = useState({});
  const [massTagValues, setMassTagValues] = useState({ tag: "", portfolio: "", ucc: "" });
  
  // Local tag changes (per cashflow)
  const [localChanges, setLocalChanges] = useState({});
  
  // Saving state
  const [savingClient, setSavingClient] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(null);

  useEffect(() => {
    document.title = "Kinntegraa | Reinvestment Tagging";
  }, []);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/reinvestment/upcoming`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const data = response.data;
      
      // Separate into past, upcoming, and tagged
      const pastEntries = [];
      const upcomingEntries = [];
      const taggedEntries = [];
      
      // Flatten months data
      (data.months || []).forEach(month => {
        (month.items || []).forEach(item => {
          if (item.reinvestment_tag && item.reinvestment_tag !== 'not_tagged') {
            taggedEntries.push(item);
          } else if (item.is_past_date) {
            pastEntries.push(item);
          } else {
            upcomingEntries.push(item);
          }
        });
      });
      
      // Group by client
      const groupByClient = (entries) => {
        const groups = {};
        entries.forEach(entry => {
          const clientId = entry.client_id;
          if (!groups[clientId]) {
            groups[clientId] = {
              client_id: clientId,
              client_name: entry.client_name,
              client_pan: entry.client_pan,
              client_email: entry.client_email,
              ucc_list: entry.ucc_list || [],
              entries: []
            };
          }
          groups[clientId].entries.push(entry);
        });
        return Object.values(groups);
      };
      
      setClientGroups({
        past: groupByClient(pastEntries),
        upcoming: groupByClient(upcomingEntries)
      });
      setTaggedGroups(groupByClient(taggedEntries));
      
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load reinvestment data");
    } finally {
      setLoading(false);
    }
  };

  const toggleClientExpand = (clientId) => {
    setExpandedClients(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  const handleEntrySelect = (entryId, checked) => {
    setSelectedEntries(prev => ({
      ...prev,
      [entryId]: checked
    }));
  };

  const handleSelectAllForClient = (clientId, entries, checked) => {
    const updates = {};
    entries.forEach(entry => {
      updates[entry.id] = checked;
    });
    setSelectedEntries(prev => ({ ...prev, ...updates }));
  };

  const handleLocalChange = (entryId, field, value) => {
    setLocalChanges(prev => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [field]: value
      }
    }));
  };

  const applyMassTag = () => {
    const selectedIds = Object.keys(selectedEntries).filter(id => selectedEntries[id]);
    if (selectedIds.length === 0) {
      toast.error("Please select entries first");
      return;
    }
    
    const updates = {};
    selectedIds.forEach(id => {
      updates[id] = {
        ...localChanges[id],
        ...(massTagValues.tag && { reinvestment_tag: massTagValues.tag }),
        ...(massTagValues.portfolio && { portfolio_category: massTagValues.portfolio }),
        ...(massTagValues.ucc && { target_ucc: massTagValues.ucc })
      };
    });
    setLocalChanges(prev => ({ ...prev, ...updates }));
    toast.success(`Applied to ${selectedIds.length} entries`);
  };

  const isEntryComplete = (entry) => {
    const changes = localChanges[entry.id] || {};
    const tag = changes.reinvestment_tag || entry.reinvestment_tag;
    const portfolio = changes.portfolio_category || entry.portfolio_category;
    const ucc = changes.target_ucc || entry.target_ucc;
    
    // All 3 fields must be filled
    return tag && tag !== 'not_tagged' && portfolio && ucc;
  };

  const saveClientTags = async (clientGroup) => {
    // Validate all entries have complete data
    const incompleteEntries = clientGroup.entries.filter(entry => {
      const changes = localChanges[entry.id] || {};
      const tag = changes.reinvestment_tag || entry.reinvestment_tag;
      const portfolio = changes.portfolio_category || entry.portfolio_category;
      const ucc = changes.target_ucc || entry.target_ucc;
      
      // If there's a change, all 3 fields must be present
      if (changes.reinvestment_tag || changes.portfolio_category || changes.target_ucc) {
        return !tag || tag === 'not_tagged' || !portfolio || !ucc;
      }
      return false;
    });
    
    if (incompleteEntries.length > 0) {
      toast.error("Please fill UCC, Portfolio, and Tag for all modified entries");
      return;
    }
    
    setSavingClient(clientGroup.client_id);
    try {
      const token = localStorage.getItem("token");
      
      // Save each entry that has changes
      for (const entry of clientGroup.entries) {
        const changes = localChanges[entry.id];
        if (changes && Object.keys(changes).length > 0) {
          await axios.put(
            `${API}/reinvestment/tag/${entry.id}`,
            {
              reinvestment_tag: changes.reinvestment_tag || entry.reinvestment_tag || 'reinvest',
              portfolio_category: changes.portfolio_category || entry.portfolio_category,
              target_ucc: changes.target_ucc || entry.target_ucc,
              custom_amount: changes.custom_amount
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
      }
      
      toast.success("Tags saved successfully");
      
      // Clear local changes for this client
      const newLocalChanges = { ...localChanges };
      clientGroup.entries.forEach(entry => {
        delete newLocalChanges[entry.id];
      });
      setLocalChanges(newLocalChanges);
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error("Error saving tags:", error);
      toast.error(error.response?.data?.detail || "Failed to save tags");
    } finally {
      setSavingClient(null);
    }
  };

  const sendEmailToClient = async (clientGroup) => {
    setSendingEmail(clientGroup.client_id);
    try {
      const token = localStorage.getItem("token");
      
      // Get all tagged entries for this client
      const taggedEntryIds = clientGroup.entries
        .filter(e => e.reinvestment_tag && e.reinvestment_tag !== 'not_tagged')
        .map(e => e.id);
      
      if (taggedEntryIds.length === 0) {
        toast.error("No tagged entries to send");
        return;
      }
      
      await axios.post(
        `${API}/reinvestment/send-approval-email`,
        {
          client_id: clientGroup.client_id,
          cashflow_ids: taggedEntryIds
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Email sent to client for approval");
      fetchData();
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error(error.response?.data?.detail || "Failed to send email");
    } finally {
      setSendingEmail(null);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0";
    return `₹${parseFloat(amount).toLocaleString('en-IN')}`;
  };

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
    return <SubBrokerSidebar user={user} />;
  };

  const getSelectedCount = () => {
    return Object.values(selectedEntries).filter(Boolean).length;
  };

  const renderClientGroup = (clientGroup, isPast = false) => {
    const isExpanded = expandedClients[clientGroup.client_id];
    const hasChanges = clientGroup.entries.some(e => localChanges[e.id]);
    const allSelected = clientGroup.entries.every(e => selectedEntries[e.id]);
    const someSelected = clientGroup.entries.some(e => selectedEntries[e.id]);
    
    return (
      <div key={clientGroup.client_id} className="bg-white rounded-lg border mb-4" data-testid={`client-group-${clientGroup.client_id}`}>
        {/* Client Header */}
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
          onClick={() => toggleClientExpand(clientGroup.client_id)}
        >
          <div className="flex items-center gap-4">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => {
                handleSelectAllForClient(clientGroup.client_id, clientGroup.entries, checked);
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <div>
              <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
              <p className="text-sm text-gray-500">{clientGroup.client_pan} • {clientGroup.entries.length} entries</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={isPast ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}>
              {isPast ? <History className="h-3 w-3 mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
              {isPast ? "Historical" : "Upcoming"}
            </Badge>
            {hasChanges && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); saveClientTags(clientGroup); }}
                disabled={savingClient === clientGroup.client_id}
                className="bg-green-600 hover:bg-green-700"
              >
                {savingClient === clientGroup.client_id ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </>
                )}
              </Button>
            )}
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
        
        {/* Expanded Entries */}
        {isExpanded && (
          <div className="border-t">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-4 py-2"></th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">BOND</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">DATE</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">AMOUNT</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">UCC *</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">PORTFOLIO *</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">TAG *</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientGroup.entries.map(entry => {
                  const changes = localChanges[entry.id] || {};
                  const currentTag = changes.reinvestment_tag || entry.reinvestment_tag || '';
                  const currentPortfolio = changes.portfolio_category || entry.portfolio_category || '';
                  const currentUcc = changes.target_ucc || entry.target_ucc || '';
                  
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedEntries[entry.id] || false}
                          onCheckedChange={(checked) => handleEntrySelect(entry.id, checked)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{entry.bond_name}</div>
                        <div className="text-xs text-gray-500">{entry.bond_code}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{format(new Date(entry.expected_date), "dd MMM yyyy")}</div>
                        {entry.is_past_date && (
                          <span className="text-xs text-blue-600">Past</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-semibold">{formatCurrency(entry.net_amount)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={currentUcc}
                          onValueChange={(v) => handleLocalChange(entry.id, 'target_ucc', v)}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue placeholder="Select UCC" />
                          </SelectTrigger>
                          <SelectContent>
                            {(clientGroup.ucc_list || []).map(ucc => (
                              <SelectItem key={ucc} value={ucc}>{ucc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={currentPortfolio}
                          onValueChange={(v) => handleLocalChange(entry.id, 'portfolio_category', v)}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue placeholder="Portfolio" />
                          </SelectTrigger>
                          <SelectContent>
                            {PORTFOLIO_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={currentTag}
                          onValueChange={(v) => handleLocalChange(entry.id, 'reinvestment_tag', v)}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue placeholder="Tag" />
                          </SelectTrigger>
                          <SelectContent>
                            {TAG_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderTaggedClientGroup = (clientGroup) => {
    const isExpanded = expandedClients[`tagged_${clientGroup.client_id}`];
    const pendingApproval = clientGroup.entries.filter(e => e.approval_status === 'pending');
    const approved = clientGroup.entries.filter(e => e.client_approved);
    
    return (
      <div key={clientGroup.client_id} className="bg-white rounded-lg border mb-4">
        {/* Client Header */}
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
          onClick={() => setExpandedClients(prev => ({
            ...prev,
            [`tagged_${clientGroup.client_id}`]: !prev[`tagged_${clientGroup.client_id}`]
          }))}
        >
          <div className="flex items-center gap-4">
            <div>
              <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
              <p className="text-sm text-gray-500">{clientGroup.client_pan} • {clientGroup.entries.length} tagged</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pendingApproval.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700">
                <Clock className="h-3 w-3 mr-1" />
                {pendingApproval.length} Pending
              </Badge>
            )}
            {approved.length > 0 && (
              <Badge className="bg-green-100 text-green-700">
                <CheckCircle className="h-3 w-3 mr-1" />
                {approved.length} Approved
              </Badge>
            )}
            {pendingApproval.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); sendEmailToClient(clientGroup); }}
                disabled={sendingEmail === clientGroup.client_id}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                {sendingEmail === clientGroup.client_id ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-1" />
                    Email Client
                  </>
                )}
              </Button>
            )}
            {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
        
        {/* Expanded Entries */}
        {isExpanded && (
          <div className="border-t">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">BOND</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">DATE</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600">AMOUNT</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">UCC</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">PORTFOLIO</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600">TAG</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-gray-600">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientGroup.entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{entry.bond_name}</div>
                      <div className="text-xs text-gray-500">{entry.bond_code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{format(new Date(entry.expected_date), "dd MMM yyyy")}</div>
                      {entry.is_past_date && (
                        <span className="text-xs text-blue-600">Historical</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {formatCurrency(entry.net_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm">{entry.target_ucc || '-'}</td>
                    <td className="px-4 py-3 text-sm capitalize">{entry.portfolio_category || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">
                        {entry.reinvestment_tag}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {entry.client_approved ? (
                        <Badge className="bg-green-100 text-green-700">
                          <Check className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      ) : entry.approval_status === 'rejected' ? (
                        <Badge className="bg-red-100 text-red-700">
                          <X className="h-3 w-3 mr-1" />
                          Rejected
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {getSidebar()}
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Tag className="h-5 w-5 text-amber-600" />
                  Reinvestment Tagging
                </h1>
                <p className="text-sm text-gray-500">Tag client cashflows for reinvestment</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="px-6 border-t">
            <div className="flex">
              <button
                onClick={() => setActiveTab("untagged")}
                className={`px-4 py-3 text-sm font-medium border-b-2 ${
                  activeTab === "untagged"
                    ? "border-amber-600 text-amber-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Untagged
              </button>
              <button
                onClick={() => setActiveTab("tagged")}
                className={`px-4 py-3 text-sm font-medium border-b-2 ${
                  activeTab === "tagged"
                    ? "border-amber-600 text-amber-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Tagged
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : activeTab === "untagged" ? (
            <>
              {/* Mass Tag Controls */}
              {getSelectedCount() > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-600">{getSelectedCount()} selected</Badge>
                      <span className="text-sm text-amber-800">Apply to all selected:</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select value={massTagValues.ucc} onValueChange={(v) => setMassTagValues(prev => ({ ...prev, ucc: v }))}>
                        <SelectTrigger className="w-32 h-9">
                          <SelectValue placeholder="UCC" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="KWPL000231">KWPL000231</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={massTagValues.portfolio} onValueChange={(v) => setMassTagValues(prev => ({ ...prev, portfolio: v }))}>
                        <SelectTrigger className="w-28 h-9">
                          <SelectValue placeholder="Portfolio" />
                        </SelectTrigger>
                        <SelectContent>
                          {PORTFOLIO_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={massTagValues.tag} onValueChange={(v) => setMassTagValues(prev => ({ ...prev, tag: v }))}>
                        <SelectTrigger className="w-28 h-9">
                          <SelectValue placeholder="Tag" />
                        </SelectTrigger>
                        <SelectContent>
                          {TAG_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={applyMassTag} className="bg-amber-600 hover:bg-amber-700">
                        Apply
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Section Toggle */}
              <div className="flex gap-2 mb-6">
                <Button
                  variant={activeSection === "past" ? "default" : "outline"}
                  onClick={() => setActiveSection("past")}
                  className={activeSection === "past" ? "bg-blue-600" : ""}
                >
                  <History className="h-4 w-4 mr-2" />
                  Historical ({clientGroups.past.length} clients)
                </Button>
                <Button
                  variant={activeSection === "upcoming" ? "default" : "outline"}
                  onClick={() => setActiveSection("upcoming")}
                  className={activeSection === "upcoming" ? "bg-amber-600" : ""}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Upcoming ({clientGroups.upcoming.length} clients)
                </Button>
              </div>

              {/* Client Groups */}
              {activeSection === "past" ? (
                clientGroups.past.length === 0 ? (
                  <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                    <History className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>No historical entries to tag</p>
                  </div>
                ) : (
                  clientGroups.past.map(group => renderClientGroup(group, true))
                )
              ) : (
                clientGroups.upcoming.length === 0 ? (
                  <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                    <ArrowRight className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>No upcoming entries to tag</p>
                  </div>
                ) : (
                  clientGroups.upcoming.map(group => renderClientGroup(group, false))
                )
              )}
            </>
          ) : (
            /* Tagged Tab */
            taggedGroups.length === 0 ? (
              <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                <Tag className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p>No tagged entries yet</p>
              </div>
            ) : (
              taggedGroups.map(group => renderTaggedClientGroup(group))
            )
          )}
        </div>
      </div>
    </div>
  );
}
