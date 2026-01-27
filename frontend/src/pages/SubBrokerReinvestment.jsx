import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  RefreshCw, Save, Tag, ChevronUp, ChevronDown, Clock, CheckCircle,
  AlertCircle, IndianRupee, Mail, History, ArrowRight, Check, X
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PORTFOLIO_OPTIONS = [
  { value: 'wealth', label: 'Wealth' },
  { value: 'tax', label: 'Tax' },
  { value: 'short_term', label: 'Short Term' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'bonds', label: 'Bonds' },
  { value: 'real_estate', label: 'Real Estate' }
];

const TAG_OPTIONS = [
  { value: 'principal', label: 'Principal' },
  { value: 'interest', label: 'Interest' },
  { value: 'both', label: 'Both (P+I)' },
  { value: 'none', label: 'None' },
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
    if (parsedUser.role !== "sub_broker") {
      navigate("/broker/dashboard");
      return;
    }
    
    setUser(parsedUser);
    fetchData();
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      // Use the same endpoint as broker - it filters by sub-broker's linked clients
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

  const saveClientTags = async (clientId, entries) => {
    setSavingClient(clientId);
    try {
      const token = localStorage.getItem("token");
      
      // Get entries that have local changes
      const entriesToSave = entries.filter(entry => localChanges[entry.id]);
      
      if (entriesToSave.length === 0) {
        toast.error("No changes to save");
        setSavingClient(null);
        return;
      }
      
      // Save each entry
      for (const entry of entriesToSave) {
        const changes = localChanges[entry.id];
        const tag = changes.reinvestment_tag || entry.reinvestment_tag;
        
        // Validate required fields for non-none tags
        if (tag && tag !== 'none' && tag !== 'not_tagged') {
          if (!changes.portfolio_category && !entry.portfolio_category) {
            toast.error(`Please select portfolio for ${entry.bond_name}`);
            setSavingClient(null);
            return;
          }
          if (!changes.target_ucc && !entry.target_ucc) {
            toast.error(`Please select UCC for ${entry.bond_name}`);
            setSavingClient(null);
            return;
          }
        }
        
        await axios.put(`${API}/reinvestment/tag/${entry.id}`, {
          reinvestment_tag: tag,
          portfolio_category: changes.portfolio_category || entry.portfolio_category,
          target_ucc: changes.target_ucc || entry.target_ucc,
          custom_amount: changes.custom_amount || entry.custom_amount
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      toast.success(`Saved ${entriesToSave.length} entries`);
      
      // Clear local changes for saved entries
      const clearedChanges = { ...localChanges };
      entriesToSave.forEach(entry => delete clearedChanges[entry.id]);
      setLocalChanges(clearedChanges);
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error("Error saving tags:", error);
      toast.error(error.response?.data?.detail || "Failed to save tags");
    } finally {
      setSavingClient(null);
    }
  };

  const sendApprovalEmail = async (clientId, entries) => {
    setSendingEmail(clientId);
    try {
      const token = localStorage.getItem("token");
      
      // Only send for tagged future entries that haven't been sent yet
      const entriesToSend = entries.filter(entry => 
        entry.reinvestment_tag && 
        entry.reinvestment_tag !== 'not_tagged' && 
        entry.reinvestment_tag !== 'none' &&
        !entry.is_past_date &&
        entry.approval_status !== 'pending' &&
        entry.approval_status !== 'approved'
      );
      
      if (entriesToSend.length === 0) {
        toast.error("No entries eligible for approval email");
        setSendingEmail(null);
        return;
      }
      
      await axios.post(`${API}/reinvestment/send-approval-email`, {
        client_id: clientId,
        cashflow_ids: entriesToSend.map(e => e.id)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Approval email sent successfully");
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
    return `₹${Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM yyyy");
    } catch {
      return dateStr;
    }
  };

  const getTagLabel = (tag) => {
    const option = TAG_OPTIONS.find(o => o.value === tag);
    return option ? option.label : tag || 'Not Tagged';
  };

  const getTagColor = (tag) => {
    switch (tag) {
      case 'principal': return 'bg-blue-100 text-blue-700';
      case 'interest': return 'bg-green-100 text-green-700';
      case 'both': return 'bg-purple-100 text-purple-700';
      case 'none': return 'bg-gray-100 text-gray-700';
      case 'custom': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const getApprovalBadge = (entry) => {
    if (entry.is_past_date) {
      return <Badge variant="outline" className="text-xs bg-gray-50">Past Date</Badge>;
    }
    if (entry.client_approved) {
      return <Badge className="text-xs bg-green-100 text-green-700">Approved</Badge>;
    }
    if (entry.approval_status === 'pending') {
      return <Badge className="text-xs bg-yellow-100 text-yellow-700">Pending</Badge>;
    }
    if (entry.approval_status === 'rejected') {
      return <Badge className="text-xs bg-red-100 text-red-700">Rejected</Badge>;
    }
    return null;
  };

  // Get current data based on active tab and section
  const getCurrentData = () => {
    if (activeTab === 'untagged') {
      return untaggedSection === 'past' ? untaggedPast : untaggedUpcoming;
    } else {
      return taggedSection === 'past' ? taggedPast : taggedUpcoming;
    }
  };

  const currentData = getCurrentData();
  const currentSection = activeTab === 'untagged' ? untaggedSection : taggedSection;
  const setCurrentSection = activeTab === 'untagged' ? setUntaggedSection : setTaggedSection;

  // Calculate summary stats
  const totalUntagged = untaggedPast.reduce((sum, c) => sum + c.entries.length, 0) + 
                        untaggedUpcoming.reduce((sum, c) => sum + c.entries.length, 0);
  const totalTagged = taggedPast.reduce((sum, c) => sum + c.entries.length, 0) + 
                      taggedUpcoming.reduce((sum, c) => sum + c.entries.length, 0);

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <SubBrokerSidebar user={user} />
      
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 md:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800" data-testid="reinvestment-title">
                Reinvestment Tagging
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Tag upcoming cashflows for your linked clients
              </p>
            </div>
            <Button variant="outline" onClick={fetchData} data-testid="refresh-btn">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg p-4 text-white">
              <p className="text-orange-100 text-sm">Untagged</p>
              <p className="text-2xl font-bold">{totalUntagged}</p>
              <p className="text-orange-100 text-xs">entries</p>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg p-4 text-white">
              <p className="text-green-100 text-sm">Tagged</p>
              <p className="text-2xl font-bold">{totalTagged}</p>
              <p className="text-green-100 text-xs">entries</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-gray-500 text-sm">Past Due</p>
              <p className="text-2xl font-bold text-gray-800">
                {untaggedPast.reduce((sum, c) => sum + c.entries.length, 0)}
              </p>
              <p className="text-xs text-gray-400">untagged</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-gray-500 text-sm">Upcoming</p>
              <p className="text-2xl font-bold text-gray-800">
                {untaggedUpcoming.reduce((sum, c) => sum + c.entries.length, 0)}
              </p>
              <p className="text-xs text-gray-400">untagged</p>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mt-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("untagged")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "untagged" 
                  ? "border-etihad-gold-600 text-etihad-gold-700" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="untagged-tab"
            >
              Untagged ({totalUntagged})
            </button>
            <button
              onClick={() => setActiveTab("tagged")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "tagged" 
                  ? "border-etihad-gold-600 text-etihad-gold-700" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="tagged-tab"
            >
              Tagged ({totalTagged})
            </button>
          </div>
          
          {/* Sub-section tabs (Past/Upcoming) */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setCurrentSection("past")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                currentSection === "past"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Clock className="h-3 w-3 inline mr-1" />
              Past Due
            </button>
            <button
              onClick={() => setCurrentSection("upcoming")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                currentSection === "upcoming"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <ArrowRight className="h-3 w-3 inline mr-1" />
              Upcoming
            </button>
          </div>
        </div>

        {/* Mass Action Bar */}
        {getSelectedCount() > 0 && (
          <div className="bg-etihad-gold-50 border-b border-etihad-gold-200 px-4 md:px-8 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-etihad-gold-700">
                {getSelectedCount()} selected
              </span>
              <Select value={massUcc} onValueChange={setMassUcc}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Set UCC" />
                </SelectTrigger>
                <SelectContent>
                  {/* Get all unique UCCs from current data */}
                  {[...new Set(currentData.flatMap(c => c.ucc_list || []))].map(ucc => (
                    <SelectItem key={ucc} value={ucc} className="text-xs">{ucc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={massPortfolio} onValueChange={setMassPortfolio}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Set Portfolio" />
                </SelectTrigger>
                <SelectContent>
                  {PORTFOLIO_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={massTag} onValueChange={setMassTag}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Set Tag" />
                </SelectTrigger>
                <SelectContent>
                  {TAG_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={applyMassTag} className="bg-etihad-gold-600 hover:bg-etihad-gold-700">
                Apply
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 md:p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : currentData.length === 0 ? (
            <div className="text-center py-12">
              <Tag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                No {currentSection} {activeTab} cashflows found
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentData.map((client) => {
                const sectionKey = `${activeTab}_${currentSection}_${client.client_id}`;
                const isExpanded = expandedClients[sectionKey];
                const hasChanges = client.entries.some(e => localChanges[e.id]);
                const allSelected = client.entries.every(e => selectedEntries[e.id]);
                const someSelected = client.entries.some(e => selectedEntries[e.id]);
                
                return (
                  <div 
                    key={client.client_id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                  >
                    {/* Client Header */}
                    <div className="flex items-center justify-between p-4 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) => handleSelectAllForClient(client.entries, checked)}
                          className="data-[state=checked]:bg-etihad-gold-600"
                        />
                        <button
                          onClick={() => toggleClientExpand(client.client_id, `${activeTab}_${currentSection}`)}
                          className="flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-etihad-maroon-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                            {client.client_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'CL'}
                          </div>
                          <div className="text-left">
                            <p className="font-semibold text-gray-800">{client.client_name}</p>
                            <p className="text-xs text-gray-500 font-mono">{client.client_pan}</p>
                          </div>
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-800">{client.entries.length} entries</p>
                          <p className="text-xs text-gray-500">
                            {formatCurrency(client.entries.reduce((sum, e) => sum + (e.net_amount || 0), 0))}
                          </p>
                        </div>
                        {hasChanges && (
                          <Button 
                            size="sm" 
                            onClick={() => saveClientTags(client.client_id, client.entries)}
                            disabled={savingClient === client.client_id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {savingClient === client.client_id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Save className="h-4 w-4 mr-1" />
                                Save
                              </>
                            )}
                          </Button>
                        )}
                        {activeTab === 'tagged' && currentSection === 'upcoming' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => sendApprovalEmail(client.client_id, client.entries)}
                            disabled={sendingEmail === client.client_id}
                          >
                            {sendingEmail === client.client_id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Mail className="h-4 w-4 mr-1" />
                                Send Email
                              </>
                            )}
                          </Button>
                        )}
                        <button onClick={() => toggleClientExpand(client.client_id, `${activeTab}_${currentSection}`)}>
                          {isExpanded 
                            ? <ChevronUp className="h-5 w-5 text-gray-400" />
                            : <ChevronDown className="h-5 w-5 text-gray-400" />
                          }
                        </button>
                      </div>
                    </div>
                    
                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="w-8 py-3 px-2"></th>
                                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Bond</th>
                                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Principal</th>
                                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Interest</th>
                                <th className="text-right py-3 px-3 text-xs font-medium text-gray-500 uppercase">Net</th>
                                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">UCC</th>
                                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Portfolio</th>
                                <th className="text-left py-3 px-3 text-xs font-medium text-gray-500 uppercase">Tag</th>
                                <th className="text-center py-3 px-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {client.entries.map((entry) => {
                                const changes = localChanges[entry.id] || {};
                                const currentTag = changes.reinvestment_tag || entry.reinvestment_tag || 'not_tagged';
                                const currentUcc = changes.target_ucc || entry.target_ucc || '';
                                const currentPortfolio = changes.portfolio_category || entry.portfolio_category || '';
                                
                                return (
                                  <tr key={entry.id} className="hover:bg-gray-50">
                                    <td className="py-3 px-2">
                                      <Checkbox
                                        checked={selectedEntries[entry.id] || false}
                                        onCheckedChange={(checked) => handleEntrySelect(entry.id, checked)}
                                        className="data-[state=checked]:bg-etihad-gold-600"
                                      />
                                    </td>
                                    <td className="py-3 px-3">
                                      <p className="font-medium text-gray-800 truncate max-w-[120px]">
                                        {entry.bond_name}
                                      </p>
                                      <p className="text-xs text-gray-500">{entry.bond_code}</p>
                                    </td>
                                    <td className="py-3 px-3">
                                      <p className={entry.is_past_date ? "text-red-600 font-medium" : "text-gray-600"}>
                                        {formatDate(entry.expected_date)}
                                      </p>
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono text-gray-800">
                                      {formatCurrency(entry.principal_net)}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono text-green-600">
                                      {formatCurrency(entry.interest_net)}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono font-medium text-gray-800">
                                      {formatCurrency(entry.net_amount)}
                                    </td>
                                    <td className="py-3 px-3">
                                      <Select
                                        value={currentUcc}
                                        onValueChange={(value) => handleLocalChange(entry.id, 'target_ucc', value)}
                                      >
                                        <SelectTrigger className="w-[120px] h-8 text-xs">
                                          <SelectValue placeholder="Select UCC" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(client.ucc_list || []).map((ucc) => (
                                            <SelectItem key={ucc} value={ucc} className="text-xs">
                                              {ucc}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="py-3 px-3">
                                      <Select
                                        value={currentPortfolio}
                                        onValueChange={(value) => handleLocalChange(entry.id, 'portfolio_category', value)}
                                      >
                                        <SelectTrigger className="w-[110px] h-8 text-xs">
                                          <SelectValue placeholder="Portfolio" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {PORTFOLIO_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                              {opt.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="py-3 px-3">
                                      <Select
                                        value={currentTag}
                                        onValueChange={(value) => handleLocalChange(entry.id, 'reinvestment_tag', value)}
                                      >
                                        <SelectTrigger className={`w-[100px] h-8 text-xs ${getTagColor(currentTag)}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {TAG_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                              {opt.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      {getApprovalBadge(entry)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
