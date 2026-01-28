import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { logUserActivity } from "@/utils/activityLogger";
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
  Clock, CheckCircle, History, ArrowRight, Check, X
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Original options
const PORTFOLIO_OPTIONS = [
  { value: 'wealth', label: 'Wealth' },
  { value: 'tax', label: 'Tax' },
  { value: 'short_term', label: 'Short Term' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'bonds', label: 'Bonds' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'none', label: 'None' }
];

const TAG_OPTIONS = [
  { value: 'principal', label: 'Principal' },
  { value: 'interest', label: 'Interest' },
  { value: 'both', label: 'Both' },
  { value: 'custom', label: 'Custom' }
];

export default function SubBrokerReinvestment() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("untagged");
  const [untaggedSection, setUntaggedSection] = useState("past");
  const [taggedSection, setTaggedSection] = useState("past");
  
  // Data grouped by client
  const [untaggedPast, setUntaggedPast] = useState([]);
  const [untaggedUpcoming, setUntaggedUpcoming] = useState([]);
  const [taggedPast, setTaggedPast] = useState([]);
  const [taggedUpcoming, setTaggedUpcoming] = useState([]);
  
  // Expanded clients
  const [expandedClients, setExpandedClients] = useState({});
  
  // Selection state
  const [selectedEntries, setSelectedEntries] = useState({});
  
  // Mass tag values
  const [massUcc, setMassUcc] = useState("");
  const [massPortfolio, setMassPortfolio] = useState("");
  const [massTag, setMassTag] = useState("");
  
  // Local changes per entry
  const [localChanges, setLocalChanges] = useState({});
  
  // Saving/sending state
  const [savingClient, setSavingClient] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(null);

  // Log user activity
  useEffect(() => {
    logUserActivity('reinvestment');
  }, []);

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
      
      // Separate into categories
      const untaggedPastItems = [];
      const untaggedUpcomingItems = [];
      const taggedPastItems = [];
      const taggedUpcomingItems = [];
      
      // Flatten months data
      (data.months || []).forEach(month => {
        (month.items || []).forEach(item => {
          // Normalize id field - backend returns cashflow_id
          const normalizedItem = {
            ...item,
            id: item.cashflow_id || item.id,
            ucc_list: item.client_ucc_list || item.ucc_list || []
          };
          
          const isTagged = normalizedItem.reinvestment_tag && normalizedItem.reinvestment_tag !== 'not_tagged';
          const isPast = normalizedItem.is_past_date;
          
          if (isTagged) {
            if (isPast) {
              taggedPastItems.push(normalizedItem);
            } else {
              taggedUpcomingItems.push(normalizedItem);
            }
          } else {
            if (isPast) {
              untaggedPastItems.push(normalizedItem);
            } else {
              untaggedUpcomingItems.push(normalizedItem);
            }
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
              ucc_list: entry.ucc_list || entry.client_ucc_list || [],
              entries: []
            };
          }
          // Ensure ucc_list is the union of all entries' ucc_lists
          const newUccs = entry.ucc_list || entry.client_ucc_list || [];
          newUccs.forEach(ucc => {
            if (!groups[clientId].ucc_list.includes(ucc)) {
              groups[clientId].ucc_list.push(ucc);
            }
          });
          groups[clientId].entries.push(entry);
        });
        return Object.values(groups);
      };
      
      setUntaggedPast(groupByClient(untaggedPastItems));
      setUntaggedUpcoming(groupByClient(untaggedUpcomingItems));
      setTaggedPast(groupByClient(taggedPastItems));
      setTaggedUpcoming(groupByClient(taggedUpcomingItems));
      
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load reinvestment data");
    } finally {
      setLoading(false);
    }
  };

  const toggleClientExpand = (clientId, section) => {
    const key = `${section}_${clientId}`;
    setExpandedClients(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleEntrySelect = (entryId, checked) => {
    setSelectedEntries(prev => ({
      ...prev,
      [entryId]: checked
    }));
  };

  const handleSelectAllForClient = (entries, checked) => {
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

  const getSelectedCount = () => {
    return Object.values(selectedEntries).filter(Boolean).length;
  };

  const applyMassTag = () => {
    const selectedIds = Object.keys(selectedEntries).filter(id => selectedEntries[id]);
    if (selectedIds.length === 0) {
      toast.error("Please select entries first");
      return;
    }
    
    if (!massUcc && !massPortfolio && !massTag) {
      toast.error("Please select at least one value to apply");
      return;
    }
    
    const updates = {};
    selectedIds.forEach(id => {
      updates[id] = {
        ...localChanges[id],
        ...(massUcc && { target_ucc: massUcc }),
        ...(massPortfolio && { portfolio_category: massPortfolio }),
        ...(massTag && { reinvestment_tag: massTag })
      };
    });
    setLocalChanges(prev => ({ ...prev, ...updates }));
    toast.success(`Applied to ${selectedIds.length} entries`);
    
    // Clear mass values
    setMassUcc("");
    setMassPortfolio("");
    setMassTag("");
  };

  const clearSelection = () => {
    setSelectedEntries({});
    setMassUcc("");
    setMassPortfolio("");
    setMassTag("");
  };

  const saveClientTags = async (clientGroup, isPast) => {
    // Validate: all 3 fields must be filled for entries with changes
    const entriesToSave = clientGroup.entries.filter(entry => localChanges[entry.id]);
    
    if (entriesToSave.length === 0) {
      toast.error("No changes to save");
      return;
    }
    
    for (const entry of entriesToSave) {
      const changes = localChanges[entry.id];
      const ucc = changes.target_ucc || entry.target_ucc;
      const portfolio = changes.portfolio_category || entry.portfolio_category;
      const tag = changes.reinvestment_tag || entry.reinvestment_tag;
      
      if (!ucc || !portfolio || !tag || tag === 'not_tagged') {
        toast.error("Please fill UCC, Portfolio, and Tag for all modified entries");
        return;
      }
    }
    
    setSavingClient(clientGroup.client_id);
    try {
      const token = localStorage.getItem("token");
      
      for (const entry of entriesToSave) {
        const changes = localChanges[entry.id];
        await axios.put(
          `${API}/reinvestment/tag/${entry.id}`,
          {
            reinvestment_tag: changes.reinvestment_tag || entry.reinvestment_tag,
            portfolio_category: changes.portfolio_category || entry.portfolio_category,
            target_ucc: changes.target_ucc || entry.target_ucc,
            custom_amount: changes.custom_amount
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      toast.success(isPast ? "Tags saved and auto-approved (historical)" : "Tags saved successfully");
      
      // Clear local changes for this client
      const newLocalChanges = { ...localChanges };
      clientGroup.entries.forEach(entry => {
        delete newLocalChanges[entry.id];
      });
      setLocalChanges(newLocalChanges);
      
      fetchData();
    } catch (error) {
      console.error("Error saving tags:", error);
      toast.error(error.response?.data?.detail || "Failed to save tags");
    } finally {
      setSavingClient(null);
    }
  };

  const sendEmailToClient = async (clientGroup) => {
    const taggedEntryIds = clientGroup.entries
      .filter(e => e.reinvestment_tag && e.reinvestment_tag !== 'not_tagged' && !e.client_approved)
      .map(e => e.id);
    
    if (taggedEntryIds.length === 0) {
      toast.error("No entries pending approval");
      return;
    }
    
    setSendingEmail(clientGroup.client_id);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/reinvestment/send-approval-email`,
        {
          client_id: clientGroup.client_id,
          cashflow_ids: taggedEntryIds
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Approval email sent to client");
      fetchData();
    } catch (error) {
      console.error("Error sending email:", error);
      toast.error(error.response?.data?.detail || "Failed to send email");
    } finally {
      setSendingEmail(null);
    }
  };

  const resendApprovalEmail = async (clientId, cashflowId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API}/reinvestment/send-approval-email`,
        {
          client_id: clientId,
          cashflow_ids: [cashflowId],
          resend: true
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success("Approval email resent to client");
    } catch (error) {
      console.error("Error resending email:", error);
      toast.error(error.response?.data?.detail || "Failed to resend email");
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0";
    return `₹${parseFloat(amount).toLocaleString('en-IN')}`;
  };

  const getSidebar = () => {
    return <SubBrokerSidebar user={user} />;
  };

  // Get all unique UCCs from all client groups for mass selection
  const getAllUccs = () => {
    const uccs = new Set();
    [...untaggedPast, ...untaggedUpcoming].forEach(group => {
      (group.ucc_list || []).forEach(ucc => uccs.add(ucc));
    });
    return Array.from(uccs);
  };

  const renderUntaggedClientGroup = (clientGroup, isPast, section) => {
    const key = `${section}_${clientGroup.client_id}`;
    const isExpanded = expandedClients[key];
    const hasChanges = clientGroup.entries.some(e => localChanges[e.id]);
    const allSelected = clientGroup.entries.every(e => selectedEntries[e.id]);
    const totalAmount = clientGroup.entries.reduce((sum, e) => sum + (e.net_amount || 0), 0);
    
    return (
      <div key={key} className="bg-white rounded-lg border mb-3 overflow-hidden">
        {/* Client Header */}
        <div 
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 border-b"
          onClick={() => toggleClientExpand(clientGroup.client_id, section)}
        >
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => handleSelectAllForClient(clientGroup.entries, checked)}
              onClick={(e) => e.stopPropagation()}
            />
            <div>
              <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{clientGroup.client_pan}</span>
                <span>•</span>
                <span>{clientGroup.entries.length} entries</span>
                <span>•</span>
                <span className="font-medium text-gray-700">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); saveClientTags(clientGroup, isPast); }}
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
            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </div>
        </div>
        
        {/* Expanded Entries */}
        {isExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Bond</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">UCC *</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Portfolio *</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Tag *</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientGroup.entries.map(entry => {
                  const changes = localChanges[entry.id] || {};
                  const currentUcc = changes.target_ucc || entry.target_ucc || '';
                  const currentPortfolio = changes.portfolio_category || entry.portfolio_category || '';
                  const currentTag = changes.reinvestment_tag || entry.reinvestment_tag || '';
                  
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selectedEntries[entry.id] || false}
                          onCheckedChange={(checked) => handleEntrySelect(entry.id, checked)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{entry.bond_name}</div>
                        <div className="text-xs text-gray-500">{entry.bond_code}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format(new Date(entry.expected_date), "dd MMM yyyy")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatCurrency(entry.net_amount)}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={currentUcc}
                          onValueChange={(v) => handleLocalChange(entry.id, 'target_ucc', v)}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {(clientGroup.ucc_list || []).map(ucc => (
                              <SelectItem key={ucc} value={ucc}>{ucc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={currentPortfolio}
                          onValueChange={(v) => handleLocalChange(entry.id, 'portfolio_category', v)}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {PORTFOLIO_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={currentTag}
                          onValueChange={(v) => handleLocalChange(entry.id, 'reinvestment_tag', v)}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue placeholder="Select" />
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

  const renderTaggedClientGroup = (clientGroup, isPast, section) => {
    const key = `tagged_${section}_${clientGroup.client_id}`;
    const isExpanded = expandedClients[key];
    const pendingCount = clientGroup.entries.filter(e => !e.client_approved && e.approval_status !== 'approved').length;
    const approvedCount = clientGroup.entries.filter(e => e.client_approved || e.approval_status === 'approved').length;
    const totalAmount = clientGroup.entries.reduce((sum, e) => sum + (e.net_amount || 0), 0);
    
    return (
      <div key={key} className="bg-white rounded-lg border mb-3 overflow-hidden">
        {/* Client Header */}
        <div 
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 border-b"
          onClick={() => setExpandedClients(prev => ({ ...prev, [key]: !prev[key] }))}
        >
          <div>
            <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{clientGroup.client_pan}</span>
              <span>•</span>
              <span>{clientGroup.entries.length} entries</span>
              <span>•</span>
              <span className="font-medium text-gray-700">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {approvedCount > 0 && (
              <Badge className="bg-green-100 text-green-700">
                <Check className="h-3 w-3 mr-1" />
                {approvedCount} Approved
              </Badge>
            )}
            {pendingCount > 0 && (
              <>
                <Badge className="bg-etihad-gold-100 text-etihad-gold-700">
                  <Clock className="h-3 w-3 mr-1" />
                  {pendingCount} Pending
                </Badge>
                {!isPast && (
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
                        Send Email
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </div>
        </div>
        
        {/* Expanded Entries */}
        {isExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Bond</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">UCC</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Portfolio</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Tag</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientGroup.entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{entry.bond_name}</div>
                      <div className="text-xs text-gray-500">{entry.bond_code}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {format(new Date(entry.expected_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatCurrency(entry.net_amount)}
                    </td>
                    <td className="px-3 py-2">{entry.target_ucc || '-'}</td>
                    <td className="px-3 py-2 capitalize">{entry.portfolio_category?.replace('_', ' ') || '-'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        {entry.reinvestment_tag === 'principal' ? 'Principal' :
                         entry.reinvestment_tag === 'interest' ? 'Interest' :
                         entry.reinvestment_tag === 'both' ? 'Both' :
                         entry.reinvestment_tag === 'none' ? 'None' :
                         entry.reinvestment_tag === 'custom' ? 'Custom' :
                         entry.reinvestment_tag}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {entry.client_approved || entry.approval_status === 'approved' ? (
                        <Badge className="bg-green-100 text-green-700 text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      ) : entry.approval_status === 'rejected' ? (
                        <Badge className="bg-red-100 text-red-700 text-xs">
                          <X className="h-3 w-3 mr-1" />
                          Rejected
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Badge className="bg-etihad-gold-100 text-etihad-gold-700 text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                          {entry.approval_email_sent && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1 text-xs text-blue-600 hover:text-blue-700"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                resendApprovalEmail(clientGroup.client_id, entry.id);
                              }}
                              title="Resend approval email"
                            >
                              <Mail className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
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

  const currentUntaggedGroups = untaggedSection === "past" ? untaggedPast : untaggedUpcoming;
  const currentTaggedGroups = taggedSection === "past" ? taggedPast : taggedUpcoming;
  const allUccs = getAllUccs();

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
                  <Tag className="h-5 w-5 text-etihad-gold-600" />
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
          
          {/* Main Tabs */}
          <div className="px-6 border-t">
            <div className="flex">
              <button
                onClick={() => setActiveTab("untagged")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "untagged"
                    ? "border-etihad-gold-600 text-etihad-gold-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Untagged ({untaggedPast.length + untaggedUpcoming.length} clients)
              </button>
              <button
                onClick={() => setActiveTab("tagged")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "tagged"
                    ? "border-etihad-gold-600 text-etihad-gold-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Tagged ({taggedPast.length + taggedUpcoming.length} clients)
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : activeTab === "untagged" ? (
            <>
              {/* Mass Tag Controls */}
              {getSelectedCount() > 0 && (
                <div className="bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-etihad-gold-600 text-white">{getSelectedCount()} selected</Badge>
                      <span className="text-sm text-etihad-gold-800">Apply to selected:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={massUcc} onValueChange={setMassUcc}>
                        <SelectTrigger className="w-32 h-8 text-xs bg-white">
                          <SelectValue placeholder="UCC" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUccs.map(ucc => (
                            <SelectItem key={ucc} value={ucc}>{ucc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={massPortfolio} onValueChange={setMassPortfolio}>
                        <SelectTrigger className="w-28 h-8 text-xs bg-white">
                          <SelectValue placeholder="Portfolio" />
                        </SelectTrigger>
                        <SelectContent>
                          {PORTFOLIO_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={massTag} onValueChange={setMassTag}>
                        <SelectTrigger className="w-28 h-8 text-xs bg-white">
                          <SelectValue placeholder="Tag" />
                        </SelectTrigger>
                        <SelectContent>
                          {TAG_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={applyMassTag} className="bg-etihad-gold-600 hover:bg-etihad-gold-700 h-8">
                        Apply
                      </Button>
                      <Button size="sm" variant="outline" onClick={clearSelection} className="h-8">
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Section Toggle */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={untaggedSection === "past" ? "default" : "outline"}
                  onClick={() => setUntaggedSection("past")}
                  className={untaggedSection === "past" ? "bg-blue-600 hover:bg-blue-700" : ""}
                  size="sm"
                >
                  <History className="h-4 w-4 mr-1" />
                  Historical ({untaggedPast.length})
                </Button>
                <Button
                  variant={untaggedSection === "upcoming" ? "default" : "outline"}
                  onClick={() => setUntaggedSection("upcoming")}
                  className={untaggedSection === "upcoming" ? "bg-etihad-gold-600 hover:bg-etihad-gold-700" : ""}
                  size="sm"
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Upcoming ({untaggedUpcoming.length})
                </Button>
              </div>

              {/* Client Groups */}
              {currentUntaggedGroups.length === 0 ? (
                <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                  {untaggedSection === "past" ? (
                    <History className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  ) : (
                    <ArrowRight className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  )}
                  <p>No {untaggedSection === "past" ? "historical" : "upcoming"} entries to tag</p>
                </div>
              ) : (
                currentUntaggedGroups.map(group => 
                  renderUntaggedClientGroup(group, untaggedSection === "past", untaggedSection)
                )
              )}
            </>
          ) : (
            /* Tagged Tab */
            <>
              {/* Section Toggle */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={taggedSection === "past" ? "default" : "outline"}
                  onClick={() => setTaggedSection("past")}
                  className={taggedSection === "past" ? "bg-blue-600 hover:bg-blue-700" : ""}
                  size="sm"
                >
                  <History className="h-4 w-4 mr-1" />
                  Historical ({taggedPast.length})
                </Button>
                <Button
                  variant={taggedSection === "upcoming" ? "default" : "outline"}
                  onClick={() => setTaggedSection("upcoming")}
                  className={taggedSection === "upcoming" ? "bg-etihad-gold-600 hover:bg-etihad-gold-700" : ""}
                  size="sm"
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Upcoming ({taggedUpcoming.length})
                </Button>
              </div>

              {/* Client Groups */}
              {currentTaggedGroups.length === 0 ? (
                <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
                  <Tag className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p>No {taggedSection === "past" ? "historical" : "upcoming"} tagged entries</p>
                </div>
              ) : (
                currentTaggedGroups.map(group => 
                  renderTaggedClientGroup(group, taggedSection === "past", taggedSection)
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
