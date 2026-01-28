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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Tag, RefreshCw, ChevronDown, ChevronUp, Mail, Save, 
  Clock, CheckCircle, History, ArrowRight, Check, X, Plus, Minus
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
  
  // Multi-retag modal state
  const [showMultiRetagModal, setShowMultiRetagModal] = useState(false);
  const [multiRetagData, setMultiRetagData] = useState({});
  const [selectedTagType, setSelectedTagType] = useState(""); // principal, interest, both

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

  // Get selected entries data for multi-retag modal
  const getSelectedEntriesData = () => {
    const selectedIds = Object.keys(selectedEntries).filter(id => selectedEntries[id]);
    const allEntries = [...untaggedPast, ...untaggedUpcoming].flatMap(g => g.entries);
    return allEntries.filter(e => selectedIds.includes(e.id));
  };

  // Open multi-retag modal
  const openMultiRetagModal = (tagType) => {
    const entries = getSelectedEntriesData();
    if (entries.length === 0) {
      toast.error("Please select entries first");
      return;
    }
    
    if (!tagType) {
      toast.error("Please select a tag type first");
      return;
    }
    
    setSelectedTagType(tagType);
    
    // Initialize multi-retag data for each selected entry with UCC allocations
    const initialData = {};
    entries.forEach(entry => {
      const existing = localChanges[entry.id] || {};
      
      // Get the amount based on tag type selection
      let splitAmount = 0;
      if (tagType === 'principal') {
        splitAmount = entry.principal_amount || 0;
      } else if (tagType === 'interest') {
        splitAmount = entry.interest_amount || 0;
      } else if (tagType === 'both') {
        splitAmount = entry.net_amount || 0;
      }
      
      const amounts = {
        principal: entry.principal_amount || 0,
        interest: entry.interest_amount || 0,
        both: entry.net_amount || 0
      };
      
      initialData[entry.id] = {
        entry: entry,
        amounts: amounts,
        totalAmount: splitAmount,
        allocations: [
          {
            id: `${entry.id}-alloc-0`,
            ucc: existing.target_ucc || entry.target_ucc || entry.ucc_list?.[0] || '',
            amount: splitAmount,
            portfolio: existing.portfolio_category || entry.portfolio_category || ''
          }
        ]
      };
    });
    setMultiRetagData(initialData);
    setShowMultiRetagModal(true);
  };

  // Add a new UCC allocation to an entry
  const addUccAllocation = (entryId) => {
    setMultiRetagData(prev => {
      const entry = prev[entryId];
      const allocations = entry.allocations;
      const usedAmount = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      const remainingAmount = entry.totalAmount - usedAmount;
      
      return {
        ...prev,
        [entryId]: {
          ...entry,
          allocations: [
            ...allocations,
            {
              id: `${entryId}-alloc-${allocations.length}`,
              ucc: (entry.entry?.ucc_list?.length === 1) ? entry.entry.ucc_list[0] : '',
              amount: Math.max(0, remainingAmount),
              portfolio: ''
            }
          ]
        }
      };
    });
  };

  // Remove a UCC allocation from an entry
  const removeUccAllocation = (entryId, allocIndex) => {
    setMultiRetagData(prev => {
      const entry = prev[entryId];
      if (entry.allocations.length <= 1) return prev;
      
      const newAllocations = entry.allocations.filter((_, idx) => idx !== allocIndex);
      return {
        ...prev,
        [entryId]: {
          ...entry,
          allocations: newAllocations
        }
      };
    });
  };

  // Update a specific allocation field
  const updateAllocation = (entryId, allocIndex, field, value) => {
    setMultiRetagData(prev => {
      const entry = prev[entryId];
      const newAllocations = [...entry.allocations];
      newAllocations[allocIndex] = {
        ...newAllocations[allocIndex],
        [field]: field === 'amount' ? (value === '' ? '' : parseFloat(value) || 0) : value
      };
      return {
        ...prev,
        [entryId]: {
          ...entry,
          allocations: newAllocations
        }
      };
    });
  };

  // Calculate allocation totals for an entry
  const getAllocationTotal = (entryId) => {
    const entry = multiRetagData[entryId];
    if (!entry) return 0;
    return entry.allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  };

  // Validate all allocations
  const validateAllocations = () => {
    const errors = [];
    Object.entries(multiRetagData).forEach(([entryId, data]) => {
      const total = getAllocationTotal(entryId);
      const diff = Math.abs(total - data.totalAmount);
      
      if (diff > 0.01) {
        errors.push(`${data.entry.bond_name}: Allocation total doesn't match entry amount`);
      }
      
      data.allocations.forEach((alloc, idx) => {
        if (!alloc.ucc) errors.push(`${data.entry.bond_name} - Allocation ${idx + 1}: UCC is required`);
        if (!alloc.portfolio) errors.push(`${data.entry.bond_name} - Allocation ${idx + 1}: Portfolio is required`);
        if (!alloc.amount || alloc.amount <= 0) errors.push(`${data.entry.bond_name} - Allocation ${idx + 1}: Amount must be greater than 0`);
      });
    });
    return errors;
  };

  // Apply multi-retag changes with UCC splits
  const applyMultiRetagChanges = () => {
    const errors = validateAllocations();
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    
    const updates = {};
    Object.entries(multiRetagData).forEach(([entryId, data]) => {
      const primaryAlloc = data.allocations[0];
      updates[entryId] = {
        target_ucc: primaryAlloc.ucc,
        portfolio_category: primaryAlloc.portfolio,
        reinvestment_tag: selectedTagType, // Use the tag selected BEFORE opening modal
        ucc_allocations: data.allocations.map(a => ({
          ucc: a.ucc,
          amount: a.amount,
          portfolio: a.portfolio,
          tag: selectedTagType
        }))
      };
    });
    
    setLocalChanges(prev => ({ ...prev, ...updates }));
    setShowMultiRetagModal(false);
    
    const totalAllocations = Object.values(multiRetagData).reduce(
      (sum, d) => sum + d.allocations.length, 0
    );
    toast.success(`Applied ${totalAllocations} allocations across ${Object.keys(updates).length} entries`);
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

  // Get UCCs only from selected entries (for mass tagging)
  const getSelectedUccs = () => {
    const selectedIds = Object.keys(selectedEntries).filter(id => selectedEntries[id]);
    if (selectedIds.length === 0) return [];
    
    const uccs = new Set();
    [...untaggedPast, ...untaggedUpcoming].forEach(group => {
      // Check if any entry from this client is selected
      const hasSelectedEntry = group.entries.some(e => selectedEntries[e.id]);
      if (hasSelectedEntry) {
        (group.ucc_list || []).forEach(ucc => uccs.add(ucc));
      }
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
        <div className="p-6 pb-24"> {/* Added padding bottom for sticky bar */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : activeTab === "untagged" ? (
            <>
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

        {/* Sticky Mass Tagging Bar */}
        {activeTab === "untagged" && getSelectedCount() > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-20">
            <div className="max-w-7xl mx-auto px-6 py-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-etihad-gold-600 text-white">{getSelectedCount()} selected</Badge>
                  <span className="text-sm text-gray-700">Quick apply or edit individually:</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={massUcc} onValueChange={setMassUcc}>
                    <SelectTrigger className="w-32 h-8 text-xs bg-white">
                      <SelectValue placeholder="UCC" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSelectedUccs().map(ucc => (
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
                    Quick Apply
                  </Button>
                  <div className="w-px h-6 bg-gray-300 mx-1" />
                  {/* Split by Tag Type buttons */}
                  <div className="flex items-center gap-1 bg-gray-100 rounded-md p-1">
                    <span className="text-xs text-gray-600 px-1">Split:</span>
                    <Button 
                      size="sm" 
                      onClick={() => openMultiRetagModal('principal')} 
                      variant="ghost"
                      className="h-7 text-xs px-2 hover:bg-blue-100 hover:text-blue-700"
                    >
                      Principal
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => openMultiRetagModal('interest')} 
                      variant="ghost"
                      className="h-7 text-xs px-2 hover:bg-blue-100 hover:text-blue-700"
                    >
                      Interest
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => openMultiRetagModal('both')} 
                      variant="ghost"
                      className="h-7 text-xs px-2 hover:bg-blue-100 hover:text-blue-700"
                    >
                      Both
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" onClick={clearSelection} className="h-8">
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Multi-Retag Modal with UCC Allocations */}
        <Dialog open={showMultiRetagModal} onOpenChange={setShowMultiRetagModal}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Split {selectedTagType.charAt(0).toUpperCase() + selectedTagType.slice(1)} Amount ({Object.keys(multiRetagData).length} entries)
              </DialogTitle>
              <p className="text-sm text-gray-500">Split the <span className="font-medium text-etihad-gold-700">{selectedTagType}</span> amount across multiple UCCs with different portfolios</p>
            </DialogHeader>
            
            <div className="flex-1 overflow-auto py-4 space-y-6">
              {Object.entries(multiRetagData).map(([entryId, data]) => {
                const allocTotal = getAllocationTotal(entryId);
                const isBalanced = Math.abs(allocTotal - data.totalAmount) < 0.01;
                const remaining = data.totalAmount - allocTotal;
                
                return (
                  <div key={entryId} className="border rounded-lg bg-gray-50 overflow-hidden">
                    {/* Entry Header with Amount Breakdown */}
                    <div className="bg-white px-4 py-3 border-b">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium text-sm">{data.entry?.bond_name || 'Unknown Bond'}</div>
                          <div className="text-xs text-gray-500">
                            {data.entry?.client_name} • {format(new Date(data.entry?.expected_date || new Date()), "dd MMM yyyy")}
                          </div>
                        </div>
                        <Badge className="bg-etihad-gold-100 text-etihad-gold-700 border-etihad-gold-200">
                          Tag: {selectedTagType.charAt(0).toUpperCase() + selectedTagType.slice(1)}
                        </Badge>
                      </div>
                      
                      {/* Amount Breakdown */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className={`rounded-lg p-2 border ${selectedTagType === 'principal' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="text-[10px] text-gray-500 uppercase">Principal</div>
                          <div className={`text-sm font-semibold ${selectedTagType === 'principal' ? 'text-blue-700' : 'text-gray-600'}`}>
                            {formatCurrency(data.amounts?.principal || 0)}
                          </div>
                        </div>
                        <div className={`rounded-lg p-2 border ${selectedTagType === 'interest' ? 'bg-green-50 border-green-300 ring-2 ring-green-400' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="text-[10px] text-gray-500 uppercase">Interest</div>
                          <div className={`text-sm font-semibold ${selectedTagType === 'interest' ? 'text-green-700' : 'text-gray-600'}`}>
                            {formatCurrency(data.amounts?.interest || 0)}
                          </div>
                        </div>
                        <div className={`rounded-lg p-2 border ${selectedTagType === 'both' ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-400' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="text-[10px] text-gray-500 uppercase">Both (Total)</div>
                          <div className={`text-sm font-semibold ${selectedTagType === 'both' ? 'text-purple-700' : 'text-gray-600'}`}>
                            {formatCurrency(data.amounts?.both || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Allocation Status Bar */}
                    <div className={`px-4 py-2 text-xs flex items-center justify-between ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <span>
                        Allocated: {formatCurrency(allocTotal)} / {formatCurrency(data.totalAmount)}
                        {!isBalanced && ` (${remaining > 0 ? '' : '-'}${formatCurrency(Math.abs(remaining))} ${remaining > 0 ? 'remaining' : 'over'})`}
                      </span>
                      {isBalanced && <CheckCircle className="h-4 w-4" />}
                    </div>
                    
                    {/* UCC Allocations - Only UCC, Amount, Portfolio (NO Tag) */}
                    <div className="p-4 space-y-3">
                      {data.allocations.map((alloc, allocIndex) => (
                        <div key={alloc.id} className="bg-white rounded-lg border p-3">
                          <div className="flex items-start gap-3">
                            {/* Allocation Number */}
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-etihad-gold-100 text-etihad-gold-700 flex items-center justify-center text-xs font-medium">
                              {allocIndex + 1}
                            </div>
                            
                            {/* Allocation Fields - 3 columns: UCC, Amount, Portfolio */}
                            <div className="flex-1 grid grid-cols-3 gap-3">
                              {/* UCC */}
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block">UCC</Label>
                                <Select 
                                  value={alloc.ucc} 
                                  onValueChange={(v) => updateAllocation(entryId, allocIndex, 'ucc', v)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select UCC" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(data.entry?.ucc_list || []).map(ucc => (
                                      <SelectItem key={ucc} value={ucc}>{ucc}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {/* Amount */}
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block">Amount (₹)</Label>
                                <Input
                                  type="number"
                                  value={alloc.amount}
                                  onChange={(e) => updateAllocation(entryId, allocIndex, 'amount', e.target.value)}
                                  className="h-8 text-xs"
                                  placeholder="Enter amount"
                                />
                              </div>
                              
                              {/* Portfolio */}
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block">Portfolio</Label>
                                <Select 
                                  value={alloc.portfolio} 
                                  onValueChange={(v) => updateAllocation(entryId, allocIndex, 'portfolio', v)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PORTFOLIO_OPTIONS.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            
                            {/* Remove Button */}
                            {data.allocations.length > 1 && (
                              <button
                                onClick={() => removeUccAllocation(entryId, allocIndex)}
                                className="flex-shrink-0 p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Remove allocation"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      {/* Add Allocation Button */}
                      {data.allocations.length < (data.entry?.ucc_list?.length || 1) && (
                        <button
                          onClick={() => addUccAllocation(entryId)}
                          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-etihad-gold-400 hover:text-etihad-gold-600 transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                          <Plus className="h-4 w-4" />
                          Add UCC Allocation
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setShowMultiRetagModal(false)}>
                Cancel
              </Button>
              <Button onClick={applyMultiRetagChanges} className="bg-etihad-gold-600 hover:bg-etihad-gold-700">
                Apply Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
