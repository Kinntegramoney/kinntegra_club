import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import SubBrokerSidebar from "@/components/SubBrokerSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, addMonths, startOfMonth, endOfMonth, subDays, addDays, isBefore } from "date-fns";
import { 
  Tag, RefreshCw, ChevronDown, ChevronUp, Mail, Save, 
  Clock, CheckCircle, History, ArrowRight, Check, X, Plus, Minus, Pencil, Lock, Calendar, Eye, Ban, MoreVertical
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Round down to nearest 100 for investment amount
const roundToHundred = (amount) => {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / 100) * 100;
};

// Original options
const PORTFOLIO_OPTIONS = [
  { value: 'wealth', label: 'Wealth' },
  { value: 'tax', label: 'Tax' },
  { value: 'short_term', label: 'Short Term' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'bonds', label: 'Bonds', minAmount: 1000000 }, // > 10 lakhs
  { value: 'real_estate', label: 'Real Estate', minAmount: 2500000 }, // > 25 lakhs
  { value: 'none', label: 'None' }
];

// Filter portfolio options based on amount
const getFilteredPortfolioOptions = (amount) => {
  const numAmount = parseFloat(amount) || 0;
  
  // If amount < 1000, only show "None"
  if (numAmount < 1000) {
    return PORTFOLIO_OPTIONS.filter(opt => opt.value === 'none');
  }
  
  // Filter out options that require higher minimum amounts
  return PORTFOLIO_OPTIONS.filter(opt => {
    if (!opt.minAmount) return true;
    return numAmount >= opt.minAmount;
  });
};

const TAG_OPTIONS = [
  { value: 'principal', label: 'Principal' },
  { value: 'interest', label: 'Interest' },
  { value: 'both', label: 'Both' },
  { value: 'custom', label: 'Custom' }
];

export default function ReinvestmentTagging() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("untagged");
  const [untaggedSection, setUntaggedSection] = useState("past");
  const [taggedSection, setTaggedSection] = useState("past");
  
  // Month-wise view state
  const [selectedMonth, setSelectedMonth] = useState(null); // Format: "2026-01"
  const [viewMode, setViewMode] = useState("month"); // "month" or "client"
  const [monthSubTab, setMonthSubTab] = useState("untagged"); // "untagged" or "tagged"
  
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
  const [selectedTagType, setSelectedTagType] = useState(""); // principal, interest, both - selected BEFORE opening modal

  // Edit/Cancel modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedEntryForAction, setSelectedEntryForAction] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [cancelReason, setCancelReason] = useState("");
  const [processingAction, setProcessingAction] = useState(false);

  // Split allocations state for tracking UCC/portfolio splits
  const [splitAllocations, setSplitAllocations] = useState({});

  // Calculate available months and their lock status
  const getMonthsConfig = useMemo(() => {
    const today = new Date();
    const currentMonth = startOfMonth(today);
    const months = [];
    
    // Historical months (past 6 months) - Can always view AND tag
    for (let i = 6; i >= 1; i--) {
      const monthDate = addMonths(currentMonth, -i);
      months.push({
        key: format(monthDate, 'yyyy-MM'),
        label: format(monthDate, 'MMMM yyyy'),
        shortLabel: format(monthDate, 'MMM yyyy'),
        isHistorical: true,
        isLocked: false,
        canTag: true, // Historical months can be tagged
        startDate: startOfMonth(monthDate),
        endDate: endOfMonth(monthDate)
      });
    }
    
    // Current month
    months.push({
      key: format(currentMonth, 'yyyy-MM'),
      label: format(currentMonth, 'MMMM yyyy'),
      shortLabel: format(currentMonth, 'MMM yyyy'),
      isCurrent: true,
      isLocked: false,
      canTag: true, // Can tag current month
      startDate: startOfMonth(currentMonth),
      endDate: endOfMonth(currentMonth)
    });
    
    // Future months (next 6 months)
    for (let i = 1; i <= 6; i++) {
      const monthDate = addMonths(currentMonth, i);
      
      // Determine if tagging is allowed
      // Current quarter: months 1-3 from current month can be tagged
      // Next quarter (months 4-6) can be tagged 5 days before first month of next quarter
      let canTag = true;
      
      if (i > 3) {
        // This is in next quarter
        // Find the start of next quarter (month 4 from current)
        const nextQuarterStart = addMonths(currentMonth, 4);
        const unlockDate = subDays(startOfMonth(nextQuarterStart), 5);
        
        // If today is before the unlock date, tagging is disabled
        canTag = !isBefore(today, unlockDate);
      }
      
      months.push({
        key: format(monthDate, 'yyyy-MM'),
        label: format(monthDate, 'MMMM yyyy'),
        shortLabel: format(monthDate, 'MMM yyyy'),
        isHistorical: false,
        isFuture: true,
        monthsAhead: i,
        isLocked: false, // Can always view
        canTag: canTag, // But tagging may be disabled
        startDate: startOfMonth(monthDate),
        endDate: endOfMonth(monthDate)
      });
    }
    
    return months;
  }, []);

  // Get entries grouped by month
  const getEntriesByMonth = useMemo(() => {
    const allEntries = [...untaggedPast, ...untaggedUpcoming, ...taggedPast, ...taggedUpcoming];
    const byMonth = {};
    
    allEntries.forEach(clientGroup => {
      if (!clientGroup.entries) return;
      
      clientGroup.entries.forEach(entry => {
        // Use expected_date from API (cashflow date)
        const dateField = entry.expected_date || entry.date;
        if (!dateField) return;
        
        try {
          const entryDate = new Date(dateField);
          if (isNaN(entryDate.getTime())) return;
          
          const monthKey = format(entryDate, 'yyyy-MM');
          
          if (!byMonth[monthKey]) {
            byMonth[monthKey] = {
              untagged: [],
              tagged: []
            };
          }
          
          const isTagged = entry.reinvestment_tag && entry.reinvestment_tag !== 'not_tagged';
          const entryWithClient = { 
            ...entry, 
            client_name: clientGroup.client_name, 
            client_id: clientGroup.client_id,
            date: dateField // Ensure date field is set for downstream use
          };
          
          if (isTagged) {
            byMonth[monthKey].tagged.push(entryWithClient);
          } else {
            byMonth[monthKey].untagged.push(entryWithClient);
          }
        } catch (e) {
          console.error('Error parsing date:', dateField, e);
        }
      });
    });
    
    return byMonth;
  }, [untaggedPast, untaggedUpcoming, taggedPast, taggedUpcoming]);

  // Get counts for each month
  const getMonthCounts = useMemo(() => {
    const counts = {};
    getMonthsConfig.forEach(month => {
      const monthData = getEntriesByMonth[month.key];
      counts[month.key] = {
        total: monthData ? monthData.untagged.length + monthData.tagged.length : 0,
        untagged: monthData ? monthData.untagged.length : 0,
        tagged: monthData ? monthData.tagged.length : 0
      };
    });
    return counts;
  }, [getMonthsConfig, getEntriesByMonth]);

  useEffect(() => {
    document.title = "Kinntegraa | Reinvestment Tagging";
  }, []);

  // Set default selected month to current month
  useEffect(() => {
    if (!selectedMonth && getMonthsConfig.length > 0) {
      const currentMonthConfig = getMonthsConfig.find(m => m.isCurrent);
      if (currentMonthConfig) {
        setSelectedMonth(currentMonthConfig.key);
      }
    }
  }, [getMonthsConfig, selectedMonth]);

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

  // Open multi-retag modal with a specific tag type
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
      // Backend returns: principal_net, interest_net, net_amount
      let splitAmount = 0;
      if (tagType === 'principal') {
        splitAmount = entry.principal_net || entry.principal_amount || 0;
      } else if (tagType === 'interest') {
        splitAmount = entry.interest_net || entry.interest_amount || 0;
      } else if (tagType === 'both') {
        splitAmount = entry.net_amount || 0;
      }
      
      // Round down (floor) to avoid decimal amounts
      splitAmount = Math.floor(splitAmount);
      
      // Store all amounts for display (also floored)
      // Use principal_net and interest_net from backend
      const amounts = {
        principal: Math.floor(entry.principal_net || entry.principal_amount || 0),
        interest: Math.floor(entry.interest_net || entry.interest_amount || 0),
        both: Math.floor(entry.net_amount || 0)
      };
      
      // Determine initial portfolio - auto-set to 'none' if amount < 1000
      let initialPortfolio = existing.portfolio_category || entry.portfolio_category || '';
      if (splitAmount < 1000) {
        initialPortfolio = 'none';
      }
      
      // Default investment date is T+1 of repayment date
      const repaymentDate = entry.expected_date || entry.date;
      const defaultInvestmentDate = repaymentDate 
        ? format(addDays(new Date(repaymentDate), 1), 'yyyy-MM-dd')
        : format(addDays(new Date(), 1), 'yyyy-MM-dd');
      
      // Auto-set UCC if there's only one
      const defaultUcc = (entry.ucc_list?.length === 1) 
        ? entry.ucc_list[0] 
        : (existing.target_ucc || entry.target_ucc || '');
      
      // Start with one allocation using existing values or defaults
      initialData[entry.id] = {
        entry: entry,
        amounts: amounts,
        totalAmount: splitAmount, // This is the amount to split based on tag type
        allocations: [
          {
            id: `${entry.id}-alloc-0`,
            ucc: defaultUcc,
            amount: splitAmount,
            portfolio: initialPortfolio,
            investment_date: defaultInvestmentDate
          }
        ]
      };
    });
    setMultiRetagData(initialData);
    setShowMultiRetagModal(true);
  };

  // Add a new UCC allocation to an entry (allows multiple allocations for different portfolios)
  const addUccAllocation = (entryId) => {
    setMultiRetagData(prev => {
      const entry = prev[entryId];
      const allocations = entry.allocations;
      const usedAmount = allocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      const remainingAmount = Math.floor(entry.totalAmount - usedAmount);
      
      // Auto-select UCC if client has only one
      const defaultUcc = (entry.entry?.ucc_list?.length === 1) ? entry.entry.ucc_list[0] : '';
      
      // Auto-set portfolio to 'none' if remaining amount < 1000
      const defaultPortfolio = remainingAmount < 1000 ? 'none' : '';
      
      // Default investment date is T+1 of repayment date
      const repaymentDate = entry.entry?.expected_date || entry.entry?.date;
      const defaultInvestmentDate = repaymentDate 
        ? format(addDays(new Date(repaymentDate), 1), 'yyyy-MM-dd')
        : format(addDays(new Date(), 1), 'yyyy-MM-dd');
      
      return {
        ...prev,
        [entryId]: {
          ...entry,
          allocations: [
            ...allocations,
            {
              id: `${entryId}-alloc-${allocations.length}`,
              ucc: defaultUcc,
              amount: Math.max(0, remainingAmount),
              portfolio: defaultPortfolio,
              investment_date: defaultInvestmentDate
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
      if (entry.allocations.length <= 1) return prev; // Keep at least one allocation
      
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
      let newAmount = newAllocations[allocIndex].amount;
      let newPortfolio = newAllocations[allocIndex].portfolio;
      let newUcc = newAllocations[allocIndex].ucc;
      let newInvestmentDate = newAllocations[allocIndex].investment_date;
      
      if (field === 'amount') {
        // Parse and floor to avoid decimal amounts
        newAmount = value === '' ? '' : Math.floor(parseFloat(value) || 0);
        
        // If amount < 1000, auto-set portfolio to "none" and clear UCC (not needed)
        if (newAmount !== '' && newAmount < 1000) {
          newPortfolio = 'none';
          newUcc = ''; // Clear UCC for small amounts - not needed for reinvestment
        }
        // If current portfolio is bonds/real_estate but amount is now below threshold, reset to empty
        else if (newAmount !== '') {
          const currentPortfolio = newAllocations[allocIndex].portfolio;
          if (currentPortfolio === 'bonds' && newAmount < 1000000) {
            newPortfolio = '';
          } else if (currentPortfolio === 'real_estate' && newAmount < 2500000) {
            newPortfolio = '';
          }
          // Auto-set UCC if there's only one and amount >= 1000
          if (!newUcc && entry.entry?.ucc_list?.length === 1) {
            newUcc = entry.entry.ucc_list[0];
          }
        }
      }
      
      // If portfolio is being changed, auto-round the amount
      if (field === 'portfolio') {
        newPortfolio = value;
        // Round the current amount to nearest 100 when portfolio is selected
        if (newAmount !== '' && newAmount > 0) {
          const flooredAmount = Math.floor(newAmount);
          newAmount = roundToHundred(flooredAmount);
        }
      }
      
      // If UCC is being changed
      if (field === 'ucc') {
        newUcc = value;
      }
      
      // If investment date is being changed
      if (field === 'investment_date') {
        newInvestmentDate = value;
      }
      
      newAllocations[allocIndex] = {
        ...newAllocations[allocIndex],
        amount: newAmount,
        portfolio: newPortfolio,
        ucc: newUcc,
        investment_date: newInvestmentDate
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

  // Handle amount blur to round to nearest 100 and auto-add allocation for remaining balance
  const handleAmountBlur = (entryId, allocIndex) => {
    setMultiRetagData(prev => {
      const entry = prev[entryId];
      if (!entry) return prev;
      
      const newAllocations = [...entry.allocations];
      const currentAmount = newAllocations[allocIndex].amount;
      
      if (currentAmount !== '' && currentAmount !== 0) {
        // Floor first to avoid decimals, then round to nearest 100
        const flooredAmount = Math.floor(currentAmount);
        const roundedAmount = roundToHundred(flooredAmount);
        let newPortfolio = newAllocations[allocIndex].portfolio;
        
        // Auto-set to "none" if amount < 1000
        if (roundedAmount < 1000) {
          newPortfolio = 'none';
        }
        // Reset portfolio if it no longer qualifies
        else if (newPortfolio === 'bonds' && roundedAmount < 1000000) {
          newPortfolio = '';
        } else if (newPortfolio === 'real_estate' && roundedAmount < 2500000) {
          newPortfolio = '';
        }
        
        newAllocations[allocIndex] = {
          ...newAllocations[allocIndex],
          amount: roundedAmount,
          portfolio: newPortfolio
        };
        
        // Calculate remaining amount after this edit
        const usedAmount = newAllocations.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
        const remainingAmount = Math.floor(entry.totalAmount - usedAmount);
        
        // Auto-add allocation for remaining balance
        // Only add if:
        // 1. Remaining > 0
        // 2. No existing allocation already has this exact remaining amount (avoid duplicates)
        if (remainingAmount > 0) {
          const alreadyHasThisAmount = newAllocations.some(a => Math.floor(a.amount) === remainingAmount);
          
          if (!alreadyHasThisAmount) {
            // Auto-select UCC if client has only one
            const defaultUcc = (entry.entry?.ucc_list?.length === 1) ? entry.entry.ucc_list[0] : '';
            
            // Auto-set portfolio to 'none' if remaining amount < 1000
            const defaultPortfolio = remainingAmount < 1000 ? 'none' : '';
            
            // Default investment date is T+1 of repayment date
            const repaymentDate = entry.entry?.expected_date || entry.entry?.date;
            const defaultInvestmentDate = repaymentDate 
              ? format(addDays(new Date(repaymentDate), 1), 'yyyy-MM-dd')
              : format(addDays(new Date(), 1), 'yyyy-MM-dd');
            
            newAllocations.push({
              id: `${entryId}-alloc-${newAllocations.length}`,
              ucc: defaultUcc,
              amount: remainingAmount,
              portfolio: defaultPortfolio,
              investment_date: defaultInvestmentDate
            });
          }
        }
      }
      
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
      
      if (diff > 0.01) { // Allow small rounding differences
        errors.push(`${data.entry.bond_name}: Allocation total (₹${total.toLocaleString('en-IN')}) doesn't match entry amount (₹${data.totalAmount.toLocaleString('en-IN')})`);
      }
      
      data.allocations.forEach((alloc, idx) => {
        // For amounts < 1000, UCC is not required (will be auto-tagged as 'none')
        const isSmallAmount = (alloc.amount || 0) < 1000;
        
        // Get the UCC value - if only one UCC available, use it even if not explicitly set
        const effectiveUcc = alloc.ucc || (data.entry?.ucc_list?.length === 1 ? data.entry.ucc_list[0] : '');
        
        if (!isSmallAmount && !effectiveUcc) {
          errors.push(`${data.entry.bond_name} - Allocation ${idx + 1}: UCC is required for amounts >= ₹1,000`);
        }
        if (!isSmallAmount && !alloc.portfolio) {
          errors.push(`${data.entry.bond_name} - Allocation ${idx + 1}: Portfolio is required`);
        }
        if (!alloc.amount || alloc.amount <= 0) errors.push(`${data.entry.bond_name} - Allocation ${idx + 1}: Amount must be greater than 0`);
      });
    });
    return errors;
  };

  // Apply multi-retag changes with UCC splits
  const applyMultiRetagChanges = () => {
    const errors = validateAllocations();
    if (errors.length > 0) {
      toast.error(errors[0]); // Show first error
      return;
    }
    
    // Save allocations with the selected tag type
    const updates = {};
    
    Object.entries(multiRetagData).forEach(([entryId, data]) => {
      // Primary allocation goes to localChanges for display
      const primaryAlloc = data.allocations[0];
      // Get effective UCC (use single UCC if not explicitly set)
      const getEffectiveUcc = (alloc) => alloc.ucc || (data.entry?.ucc_list?.length === 1 ? data.entry.ucc_list[0] : '');
      
      updates[entryId] = {
        target_ucc: getEffectiveUcc(primaryAlloc),
        portfolio_category: primaryAlloc.portfolio,
        reinvestment_tag: selectedTagType, // Use the tag selected BEFORE opening modal
        // Store all allocations for backend processing
        ucc_allocations: data.allocations.map(a => ({
          ucc: getEffectiveUcc(a),
          amount: a.amount,
          portfolio: a.portfolio,
          tag: selectedTagType, // Same tag for all allocations
          investment_date: a.investment_date // Include investment date
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
    // Validate: all entries with changes must have required fields
    const entriesToSave = clientGroup.entries.filter(entry => localChanges[entry.id]);
    
    if (entriesToSave.length === 0) {
      toast.error("No changes to save");
      return;
    }
    
    // Validate each entry
    for (const entry of entriesToSave) {
      const changes = localChanges[entry.id];
      
      // Check if this is a split allocation entry
      if (changes.ucc_allocations && changes.ucc_allocations.length > 0) {
        // Validate split allocations
        for (const alloc of changes.ucc_allocations) {
          // For amounts < 1000, UCC is not required (will be auto-tagged as 'none')
          const isSmallAmount = (alloc.amount || 0) < 1000;
          
          if (!isSmallAmount && !alloc.ucc) {
            toast.error(`UCC is required for amounts >= ₹1,000 in "${entry.bond_name}"`);
            return;
          }
          if (!isSmallAmount && (!alloc.portfolio || !alloc.amount || alloc.amount <= 0)) {
            toast.error(`Please fill all fields for split allocations in "${entry.bond_name}"`);
            return;
          }
        }
        // Ensure tag is set for split entries
        if (!changes.reinvestment_tag || changes.reinvestment_tag === 'not_tagged') {
          toast.error(`Please select a tag type for "${entry.bond_name}"`);
          return;
        }
      } else {
        // Regular single allocation validation
        const ucc = changes.target_ucc || entry.target_ucc;
        const portfolio = changes.portfolio_category || entry.portfolio_category;
        const tag = changes.reinvestment_tag || entry.reinvestment_tag;
        
        if (!ucc || !portfolio || !tag || tag === 'not_tagged') {
          toast.error("Please fill UCC, Portfolio, and Tag for all modified entries");
          return;
        }
      }
    }
    
    setSavingClient(clientGroup.client_id);
    try {
      const token = localStorage.getItem("token");
      
      for (const entry of entriesToSave) {
        const changes = localChanges[entry.id];
        
        // Prepare request body - include ucc_allocations if present
        const requestBody = {
          reinvestment_tag: changes.reinvestment_tag || entry.reinvestment_tag,
          portfolio_category: changes.portfolio_category || entry.portfolio_category,
          target_ucc: changes.target_ucc || entry.target_ucc,
          custom_amount: changes.custom_amount
        };
        
        // Add split allocations if present
        if (changes.ucc_allocations && changes.ucc_allocations.length > 0) {
          requestBody.ucc_allocations = changes.ucc_allocations.map(alloc => ({
            ucc: alloc.ucc,
            amount: parseFloat(alloc.amount) || 0,
            portfolio: alloc.portfolio,
            tag: alloc.tag || changes.reinvestment_tag
          }));
        }
        
        await axios.put(
          `${API}/reinvestment/tag/${entry.id}`,
          requestBody,
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

  // Open cancel modal for a tagged entry
  const openCancelModal = (entry) => {
    setSelectedEntryForAction(entry);
    setCancelReason("");
    setShowCancelModal(true);
  };

  // Open edit modal for a tagged entry
  const openEditModal = (entry) => {
    setSelectedEntryForAction(entry);
    setEditFormData({
      reinvestment_tag: entry.reinvestment_tag || '',
      portfolio_category: entry.portfolio_category || '',
      target_ucc: entry.target_ucc || '',
      reason: ''
    });
    setShowEditModal(true);
  };

  // Edit tagged entry using the Split Amount modal (same as Untagged section)
  const editTaggedEntry = (entry, clientGroup) => {
    // Determine tag type from entry
    const tagType = entry.reinvestment_tag || 'both';
    setSelectedTagType(tagType);
    
    // Build allocations from existing data
    let allocations = [];
    
    // Check if entry has split allocations in localChanges
    const changes = localChanges[entry.id];
    if (changes?.ucc_allocations && changes.ucc_allocations.length > 0) {
      allocations = changes.ucc_allocations.map((a, idx) => ({
        id: `${entry.id}-alloc-${idx}`,
        ucc: a.ucc,
        amount: a.amount,
        portfolio: a.portfolio
      }));
    } else if (splitAllocations[entry.id] && splitAllocations[entry.id].length > 0) {
      // Use existing split allocations from database
      allocations = splitAllocations[entry.id].map((a, idx) => ({
        id: `${entry.id}-alloc-${idx}`,
        ucc: a.ucc,
        amount: a.amount,
        portfolio: a.portfolio
      }));
    } else {
      // Single allocation - use entry's values
      allocations = [{
        id: `${entry.id}-alloc-0`,
        ucc: entry.target_ucc || (clientGroup.ucc_list?.length === 1 ? clientGroup.ucc_list[0] : ''),
        amount: Math.floor(tagType === 'principal' ? (entry.principal_net || entry.principal_amount || 0) :
                          tagType === 'interest' ? (entry.interest_net || entry.interest_amount || 0) :
                          (entry.net_amount || 0)),
        portfolio: entry.portfolio_category || ''
      }];
    }
    
    // Build modal data
    const modalData = {
      [entry.id]: {
        entry: { ...entry, ucc_list: clientGroup.ucc_list || [] },
        amounts: {
          principal: Math.floor(entry.principal_net || entry.principal_amount || 0),
          interest: Math.floor(entry.interest_net || entry.interest_amount || 0),
          both: Math.floor(entry.net_amount || 0)
        },
        totalAmount: Math.floor(
          tagType === 'principal' ? (entry.principal_net || entry.principal_amount || 0) :
          tagType === 'interest' ? (entry.interest_net || entry.interest_amount || 0) :
          (entry.net_amount || 0)
        ),
        allocations: allocations
      }
    };
    
    setMultiRetagData(modalData);
    setShowMultiRetagModal(true);
  };

  // Handle cancel submission
  const handleCancelSubmit = async () => {
    if (!selectedEntryForAction) return;
    
    setProcessingAction(true);
    try {
      const token = localStorage.getItem("token");
      const logId = selectedEntryForAction.reinvestment_log_id || selectedEntryForAction.id;
      
      const response = await axios.post(
        `${API}/reinvestment/cancel/${logId}`,
        { reason: cancelReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.requires_client_approval) {
        toast.success("Cancellation request sent to client for approval");
      } else {
        toast.success("Reinvestment tag cancelled successfully");
      }
      
      setShowCancelModal(false);
      fetchData();
    } catch (error) {
      console.error("Error cancelling:", error);
      toast.error(error.response?.data?.detail || "Failed to cancel reinvestment");
    } finally {
      setProcessingAction(false);
    }
  };

  // Handle edit submission
  const handleEditSubmit = async () => {
    if (!selectedEntryForAction) return;
    
    setProcessingAction(true);
    try {
      const token = localStorage.getItem("token");
      const logId = selectedEntryForAction.reinvestment_log_id || selectedEntryForAction.id;
      
      const response = await axios.put(
        `${API}/reinvestment/edit/${logId}`,
        editFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.requires_approval) {
        toast.success("Edit request sent to client for re-approval");
      } else {
        toast.success("Reinvestment tag updated successfully");
      }
      
      setShowEditModal(false);
      fetchData();
    } catch (error) {
      console.error("Error editing:", error);
      toast.error(error.response?.data?.detail || "Failed to edit reinvestment");
    } finally {
      setProcessingAction(false);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0";
    // Round down (floor) for display
    const roundedDown = Math.floor(parseFloat(amount));
    return `₹${roundedDown.toLocaleString('en-IN')}`;
  };

  // Check if an entry has split allocations saved
  const hasSplitAllocations = (entryId) => {
    const changes = localChanges[entryId];
    return changes?.ucc_allocations && changes.ucc_allocations.length > 0;
  };

  // Check if entry has multiple UCCs or portfolios in allocations
  const getSplitDisplayValues = (entryId) => {
    const changes = localChanges[entryId];
    if (!changes?.ucc_allocations || changes.ucc_allocations.length === 0) {
      return { ucc: changes?.target_ucc || '', portfolio: changes?.portfolio_category || '', tag: changes?.reinvestment_tag || '' };
    }
    
    const allocations = changes.ucc_allocations;
    const uniqueUccs = [...new Set(allocations.map(a => a.ucc))];
    const uniquePortfolios = [...new Set(allocations.map(a => a.portfolio))];
    const tag = allocations[0]?.tag || changes?.reinvestment_tag || '';
    
    return {
      ucc: uniqueUccs.length > 1 ? 'Multi' : uniqueUccs[0] || '',
      portfolio: uniquePortfolios.length > 1 ? 'Multi' : uniquePortfolios[0] || '',
      tag: tag
    };
  };

  // Open modal to edit an existing split entry
  const editSplitEntry = (entry, clientGroup) => {
    const changes = localChanges[entry.id];
    if (!changes?.ucc_allocations) return;
    
    const tagType = changes.reinvestment_tag || changes.ucc_allocations[0]?.tag || 'both';
    setSelectedTagType(tagType);
    
    // Rebuild the modal data from saved allocations
    // Use principal_net and interest_net from backend
    const modalData = {
      [entry.id]: {
        entry: { ...entry, ucc_list: clientGroup.ucc_list },
        amounts: {
          principal: entry.principal_net || entry.principal_amount || 0,
          interest: entry.interest_net || entry.interest_amount || 0,
          both: entry.net_amount || 0
        },
        totalAmount: tagType === 'principal' ? (entry.principal_net || entry.principal_amount || 0) : 
                     tagType === 'interest' ? (entry.interest_net || entry.interest_amount || 0) : 
                     (entry.net_amount || 0),
        allocations: changes.ucc_allocations.map((a, idx) => ({
          id: `${entry.id}-alloc-${idx}`,
          ucc: a.ucc,
          amount: a.amount,
          portfolio: a.portfolio
        }))
      }
    };
    
    setMultiRetagData(modalData);
    setShowMultiRetagModal(true);
  };

  const getSidebar = () => {
    if (user?.role === "broker") return <Sidebar user={user} />;
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

  // Render the month view with Untagged/Tagged tabs
  const renderMonthView = () => {
    if (!selectedMonth) {
      return (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p>Select a month to view entries</p>
        </div>
      );
    }
    
    const monthConfig = getMonthsConfig.find(m => m.key === selectedMonth);
    const monthData = getEntriesByMonth[selectedMonth] || { untagged: [], tagged: [] };
    const allEntries = [...monthData.untagged, ...monthData.tagged];
    
    if (allEntries.length === 0) {
      return (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
          <Calendar className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p>No entries for {monthConfig?.label || selectedMonth}</p>
        </div>
      );
    }
    
    // Group UNTAGGED entries by client for this month
    const untaggedByClient = {};
    monthData.untagged.forEach(entry => {
      if (!untaggedByClient[entry.client_id]) {
        const clientData = [...untaggedPast, ...untaggedUpcoming, ...taggedPast, ...taggedUpcoming]
          .find(g => g.client_id === entry.client_id);
        
        untaggedByClient[entry.client_id] = {
          client_id: entry.client_id,
          client_name: entry.client_name,
          client_pan: entry.client_pan || clientData?.client_pan || '',
          client_email: entry.client_email || clientData?.client_email || '',
          ucc_list: entry.ucc_list || clientData?.ucc_list || [],
          entries: []
        };
      }
      untaggedByClient[entry.client_id].entries.push(entry);
    });
    
    // Group TAGGED entries by client for this month (only pending status - not yet client approved)
    const taggedByClient = {};
    monthData.tagged.filter(e => !e.client_approved && e.approval_status !== 'submitted').forEach(entry => {
      if (!taggedByClient[entry.client_id]) {
        const clientData = [...untaggedPast, ...untaggedUpcoming, ...taggedPast, ...taggedUpcoming]
          .find(g => g.client_id === entry.client_id);
        
        taggedByClient[entry.client_id] = {
          client_id: entry.client_id,
          client_name: entry.client_name,
          client_pan: entry.client_pan || clientData?.client_pan || '',
          client_email: entry.client_email || clientData?.client_email || '',
          ucc_list: entry.ucc_list || clientData?.ucc_list || [],
          entries: []
        };
      }
      taggedByClient[entry.client_id].entries.push(entry);
    });
    
    const untaggedClientGroups = Object.values(untaggedByClient);
    const taggedClientGroups = Object.values(taggedByClient);
    const canTag = monthConfig?.canTag !== false;
    
    // Check if any entries are selected for this month
    const selectedCount = Object.keys(selectedEntries).filter(id => 
      selectedEntries[id] && monthData.untagged.some(e => e.id === id)
    ).length;

    // Filter tagged entries to only show pending (not client approved yet)
    const pendingTaggedEntries = monthData.tagged.filter(e => 
      !e.client_approved && e.approval_status !== 'submitted' && e.approval_status !== 'auto_tagged'
    );
    
    return (
      <div className="space-y-4">
        {/* Month Summary Header */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                !canTag ? 'bg-orange-100' :
                monthConfig?.isHistorical ? 'bg-gray-100' :
                monthConfig?.isCurrent ? 'bg-blue-100' : 'bg-green-100'
              }`}>
                {!canTag ? (
                  <Eye className="h-5 w-5 text-orange-600" />
                ) : monthConfig?.isHistorical ? (
                  <History className="h-5 w-5 text-gray-600" />
                ) : monthConfig?.isCurrent ? (
                  <Clock className="h-5 w-5 text-blue-600" />
                ) : (
                  <Calendar className="h-5 w-5 text-green-600" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-800">{monthConfig?.label || selectedMonth}</h2>
                  {!canTag && (
                    <Badge className="bg-orange-100 text-orange-700 text-xs">View Only</Badge>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {monthData.untagged.length} untagged, {pendingTaggedEntries.length} pending
                  {!canTag && ' • Tagging opens 5 days before this quarter'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-500">Total Amount</p>
                <p className="font-semibold text-gray-800">
                  ₹{allEntries.reduce((sum, e) => sum + (e.net_amount || 0), 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Clients</p>
                <p className="font-semibold text-gray-800">{untaggedClientGroups.length + taggedClientGroups.length}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Sub-tabs for Untagged / Tagged */}
        <div className="bg-white rounded-lg border">
          <div className="border-b">
            <div className="flex">
              <button
                onClick={() => setMonthSubTab("untagged")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  monthSubTab === "untagged"
                    ? "text-amber-700 border-b-2 border-amber-500 bg-amber-50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Tag className="h-4 w-4" />
                  Untagged
                  <Badge className="bg-amber-100 text-amber-700 text-xs">{monthData.untagged.length}</Badge>
                </div>
              </button>
              <button
                onClick={() => setMonthSubTab("tagged")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  monthSubTab === "tagged"
                    ? "text-green-700 border-b-2 border-green-500 bg-green-50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Tagged (Pending)
                  <Badge className="bg-green-100 text-green-700 text-xs">{pendingTaggedEntries.length}</Badge>
                </div>
              </button>
            </div>
          </div>
          
          {/* Tab Content */}
          <div className="p-4">
            {monthSubTab === "untagged" ? (
              <>
                {/* Mass Tagging Actions - Sticky bar when entries are selected */}
                {canTag && selectedCount > 0 && (
                  <div className="sticky top-0 z-20 bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg p-4 mb-4 shadow-md">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-etihad-gold-600 text-white">{selectedCount} selected</Badge>
                        <Button variant="outline" size="sm" onClick={clearSelection}>
                          <X className="h-4 w-4 mr-1" />
                          Clear
                        </Button>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Split Amount:</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMultiRetagModal('principal')}
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          Principal
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMultiRetagModal('interest')}
                          className="border-green-300 text-green-700 hover:bg-green-50"
                        >
                          Interest
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMultiRetagModal('both')}
                          className="border-purple-300 text-purple-700 hover:bg-purple-50"
                        >
                          Both (P+I)
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Untagged Client Groups */}
                {untaggedClientGroups.length > 0 ? (
                  <div className="space-y-3">
                    {untaggedClientGroups.map(clientGroup => 
                      renderMonthClientGroup(clientGroup, monthConfig)
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-300 mb-3" />
                    <p>All entries have been tagged</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Tagged Entries (Pending) */}
                {taggedClientGroups.length > 0 ? (
                  <div className="space-y-3">
                    {taggedClientGroups.map(clientGroup => 
                      renderTaggedClientGroup(clientGroup, monthConfig)
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Clock className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p>No pending tagged entries</p>
                    <p className="text-sm mt-1">Tag entries from the Untagged tab</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  // Render a single client group within month view
  const renderMonthClientGroup = (clientGroup, monthConfig) => {
    const key = `month_${selectedMonth}_${clientGroup.client_id}`;
    const isExpanded = expandedClients[key] !== false; // Default expanded
    const hasChanges = clientGroup.entries.some(e => localChanges[e.id]);
    const allSelected = clientGroup.entries.length > 0 && clientGroup.entries.every(e => selectedEntries[e.id]);
    const someSelected = clientGroup.entries.some(e => selectedEntries[e.id]);
    const totalAmount = clientGroup.entries.reduce((sum, e) => sum + (e.net_amount || 0), 0);
    const canTag = monthConfig?.canTag !== false;
    
    return (
      <div key={key} className="bg-white rounded-lg border overflow-hidden">
        {/* Client Header */}
        <div 
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 border-b"
          onClick={() => toggleClientExpand(clientGroup.client_id, `month_${selectedMonth}`)}
        >
          <div className="flex items-center gap-3">
            {canTag && (
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onCheckedChange={(checked) => handleSelectAllForClient(clientGroup.entries, checked)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <div>
              <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{clientGroup.client_pan}</span>
                <span>•</span>
                <span>{clientGroup.entries.length} entries</span>
                <span>•</span>
                <span className="font-medium text-gray-700">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canTag && hasChanges && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); saveClientTags(clientGroup, monthConfig?.isHistorical); }}
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
        
        {/* Expanded Entries Table */}
        {isExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {canTag && <th className="w-10 px-3 py-2"></th>}
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Bond</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Principal</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Interest</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Net Amount</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">UCC</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Portfolio</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Tag</th>
                  {canTag && <th className="w-16 px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientGroup.entries.map(entry => {
                  const changes = localChanges[entry.id] || {};
                  const isSplit = hasSplitAllocations(entry.id);
                  const splitValues = isSplit ? getSplitDisplayValues(entry.id) : null;
                  const currentUcc = splitValues?.ucc || changes.target_ucc || entry.target_ucc || '';
                  const currentPortfolio = splitValues?.portfolio || changes.portfolio_category || entry.portfolio_category || '';
                  const currentTag = splitValues?.tag || changes.reinvestment_tag || entry.reinvestment_tag || '';
                  const isTagged = currentTag && currentTag !== 'not_tagged';
                  
                  // Get available UCCs for this client
                  const availableUccs = clientGroup.ucc_list || [];
                  
                  return (
                    <tr key={entry.id} className={`hover:bg-gray-50 ${isSplit ? 'bg-green-50' : isTagged ? 'bg-green-50/30' : ''}`}>
                      {canTag && (
                        <td className="px-3 py-2">
                          {!isSplit ? (
                            <Checkbox
                              checked={selectedEntries[entry.id] || false}
                              onCheckedChange={(checked) => handleEntrySelect(entry.id, checked)}
                            />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="font-medium">{entry.bond_name}</div>
                        <div className="text-xs text-gray-500">{entry.bond_code}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format(new Date(entry.date || entry.expected_date), "dd MMM yyyy")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ₹{(entry.principal_net || entry.principal_component || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ₹{(entry.interest_net || ((entry.interest_component || 0) - (entry.tds_amount || 0))).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        ₹{(entry.net_amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2">
                        {isSplit ? (
                          <Badge variant={currentUcc === 'Multi' ? 'secondary' : 'outline'} className="text-xs">
                            {currentUcc}
                          </Badge>
                        ) : canTag ? (
                          <Select
                            value={currentUcc}
                            onValueChange={(value) => handleLocalChange(entry.id, 'target_ucc', value)}
                          >
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableUccs.map(ucc => (
                                <SelectItem key={ucc} value={ucc}>{ucc}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-gray-600">{currentUcc || '-'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isSplit ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {currentPortfolio}
                          </Badge>
                        ) : canTag ? (
                          <Select
                            value={currentPortfolio}
                            onValueChange={(value) => handleLocalChange(entry.id, 'portfolio_category', value)}
                          >
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {getFilteredPortfolioOptions(entry.net_amount).map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-gray-600 capitalize">{currentPortfolio || '-'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isSplit ? (
                          <Badge className="bg-green-100 text-green-700 text-xs capitalize">
                            {currentTag}
                          </Badge>
                        ) : canTag ? (
                          <Select
                            value={currentTag}
                            onValueChange={(value) => handleLocalChange(entry.id, 'reinvestment_tag', value)}
                          >
                            <SelectTrigger className={`h-7 text-xs w-24 ${
                              currentTag === 'not_tagged' || !currentTag ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'
                            }`}>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_tagged">Not Tagged</SelectItem>
                              <SelectItem value="principal">Principal</SelectItem>
                              <SelectItem value="interest">Interest</SelectItem>
                              <SelectItem value="both">Both</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={`text-xs capitalize ${isTagged ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {currentTag || 'Not Tagged'}
                          </Badge>
                        )}
                      </td>
                      {canTag && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {isSplit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => editSplitEntry(entry, clientGroup)}
                                className="h-7 w-7 p-0"
                                title="Edit split allocations"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                            {/* Show action menu for tagged items that have been processed */}
                            {isTagged && (entry.client_approved || entry.approval_status === 'approved' || entry.approval_status === 'submitted') && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                    <MoreVertical className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => editSplitEntry(entry, clientGroup)}>
                                    <Pencil className="h-3 w-3 mr-2" />
                                    Edit Tag
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => openCancelModal(entry)}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <Ban className="h-3 w-3 mr-2" />
                                    Cancel
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </td>
                      )}
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

  // Save a single entry from month view
  const saveMonthEntry = async (entry) => {
    const changes = localChanges[entry.id];
    if (!changes || !changes.reinvestment_tag) {
      toast.error("Please select a tag");
      return;
    }
    
    try {
      const token = localStorage.getItem("token");
      await axios.put(`${API}/reinvestment/tag/${entry.id}`, {
        reinvestment_tag: changes.reinvestment_tag
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success("Tag saved successfully");
      
      // Clear local change
      setLocalChanges(prev => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      
      // Refresh data
      fetchData();
    } catch (error) {
      console.error("Error saving tag:", error);
      toast.error(error.response?.data?.detail || "Failed to save tag");
    }
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
                  <th className="w-16 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clientGroup.entries.map(entry => {
                  const changes = localChanges[entry.id] || {};
                  const isSplit = hasSplitAllocations(entry.id);
                  const splitValues = isSplit ? getSplitDisplayValues(entry.id) : null;
                  const currentUcc = splitValues?.ucc || changes.target_ucc || entry.target_ucc || '';
                  const currentPortfolio = splitValues?.portfolio || changes.portfolio_category || entry.portfolio_category || '';
                  const currentTag = splitValues?.tag || changes.reinvestment_tag || entry.reinvestment_tag || '';
                  
                  return (
                    <tr key={entry.id} className={`hover:bg-gray-50 ${isSplit ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2">
                        {!isSplit && (
                          <Checkbox
                            checked={selectedEntries[entry.id] || false}
                            onCheckedChange={(checked) => handleEntrySelect(entry.id, checked)}
                          />
                        )}
                        {isSplit && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
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
                        {isSplit ? (
                          <Badge variant={currentUcc === 'Multi' ? 'secondary' : 'outline'} className="text-xs">
                            {currentUcc}
                          </Badge>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isSplit ? (
                          <Badge variant={currentPortfolio === 'Multi' ? 'secondary' : 'outline'} className="text-xs">
                            {currentPortfolio === 'Multi' ? 'Multi' : PORTFOLIO_OPTIONS.find(p => p.value === currentPortfolio)?.label || currentPortfolio}
                          </Badge>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isSplit ? (
                          <Badge className="text-xs bg-etihad-gold-100 text-etihad-gold-700 border-etihad-gold-200">
                            {TAG_OPTIONS.find(t => t.value === currentTag)?.label || currentTag}
                          </Badge>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isSplit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => editSplitEntry(entry, clientGroup)}
                            title="Edit split allocation"
                          >
                            <Pencil className="h-4 w-4 text-gray-500" />
                          </Button>
                        )}
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

  // Render tagged entries for a client in the new format
  const renderTaggedClientGroup = (clientGroup, monthConfig) => {
    const key = `tagged_${selectedMonth}_${clientGroup.client_id}`;
    const isExpanded = expandedClients[key] !== false;
    const totalNetAmount = clientGroup.entries.reduce((sum, e) => sum + (e.net_amount || 0), 0);
    const canTag = monthConfig?.canTag !== false;
    
    // Group entries by bond for summary display
    const entriesByBond = {};
    clientGroup.entries.forEach(entry => {
      const bondKey = `${entry.bond_code || entry.bond_name}_${entry.id}`;
      if (!entriesByBond[bondKey]) {
        entriesByBond[bondKey] = {
          bond_name: entry.bond_name,
          bond_code: entry.bond_code,
          date: entry.date || entry.expected_date,
          allocations: [],
          total_net_amount: 0,
          total_round_down_amount: 0,
          entry: entry
        };
      }
      
      // Calculate round down amount for this entry
      const portfolio = entry.portfolio_category;
      const netAmount = entry.net_amount || 0;
      const roundDownAmount = roundToHundred(netAmount);
      
      // Get investment date - default to T+1 of repayment date
      const repaymentDate = entry.expected_date || entry.date;
      const defaultInvestmentDate = repaymentDate 
        ? format(addDays(new Date(repaymentDate), 1), 'yyyy-MM-dd')
        : null;
      
      // Get allocation info - base allocation
      const baseAllocation = {
        entry_id: entry.id,
        ucc: entry.target_ucc || 'Default',
        portfolio: entry.portfolio_category || 'N/A',
        tag: entry.reinvestment_tag || 'N/A',
        net_amount: netAmount,
        round_down_amount: roundDownAmount,
        investment_date: entry.investment_date || entry.mf_investment_date || defaultInvestmentDate,
        approval_status: entry.approval_status || 'pending',
        client_approved: entry.client_approved || false,
        auto_tagged: entry.auto_tagged || false
      };
      
      // Check for split allocations in multiple sources:
      // 1. localChanges (when user just tagged with splits)
      // 2. splitAllocations state
      // 3. entry.allocations from backend
      const localSplits = localChanges[entry.id]?.ucc_allocations;
      const stateSplits = splitAllocations[entry.id];
      const entrySplits = entry.allocations;
      
      // Use splits from whichever source has them
      const splits = (localSplits && localSplits.length > 0) ? localSplits :
                     (stateSplits && stateSplits.length > 0) ? stateSplits :
                     (entrySplits && entrySplits.length > 0) ? entrySplits : null;
      
      if (splits && splits.length > 0) {
        // Multiple allocations - add each as a separate row
        splits.forEach(split => {
          const splitNetAmount = split.amount || split.net_amount || 0;
          const splitRoundDown = roundToHundred(splitNetAmount);
          entriesByBond[bondKey].allocations.push({
            ...baseAllocation,
            ucc: split.ucc || baseAllocation.ucc,
            portfolio: split.portfolio || split.portfolio_name || baseAllocation.portfolio,
            net_amount: splitNetAmount,
            round_down_amount: splitRoundDown,
            investment_date: split.investment_date || split.mf_investment_date || defaultInvestmentDate
          });
          entriesByBond[bondKey].total_round_down_amount += splitRoundDown;
        });
      } else {
        // Single allocation
        entriesByBond[bondKey].allocations.push(baseAllocation);
        entriesByBond[bondKey].total_round_down_amount += roundDownAmount;
      }
      
      entriesByBond[bondKey].total_net_amount += netAmount;
    });
    
    const totalRoundDownAmount = Object.values(entriesByBond).reduce((sum, b) => sum + b.total_round_down_amount, 0);
    
    return (
      <div key={key} className="bg-white rounded-lg border overflow-hidden border-green-200">
        {/* Client Header */}
        <div 
          className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-green-50 border-b border-green-100 bg-green-50/50"
          onClick={() => toggleClientExpand(clientGroup.client_id, `tagged_${selectedMonth}`)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">{clientGroup.client_name}</h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{clientGroup.client_pan}</span>
                <span>•</span>
                <span>{clientGroup.entries.length} pending entries</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-500">Net Repayment</p>
              <p className="font-semibold text-gray-800">₹{totalNetAmount.toLocaleString('en-IN')}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Investment Amt</p>
              <p className="font-semibold text-green-700">₹{totalRoundDownAmount.toLocaleString('en-IN')}</p>
            </div>
            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </div>
        </div>
        
        {/* Tagged Entries Table - Redesigned with grouped columns */}
        {isExpanded && (
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              {/* Two-level header */}
              <thead>
                {/* Top level - Group headers */}
                <tr className="bg-gray-100">
                  <th colSpan="3" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-blue-50">
                    Repayment Details
                  </th>
                  <th colSpan="4" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-green-50">
                    Investment Details
                  </th>
                  <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-gray-50 align-middle">
                    Status
                  </th>
                  <th rowSpan="2" className="text-center px-3 py-2 font-semibold text-gray-700 border border-gray-200 bg-gray-50 align-middle">
                    Actions
                  </th>
                </tr>
                {/* Second level - Individual column headers */}
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Date of Repayment</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Bond Name</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Net Amount</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Date of Investment</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Portfolio</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">UCC</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 border border-gray-200 text-xs">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(entriesByBond).map((bondGroup, bondIdx) => {
                  const allocations = bondGroup.allocations;
                  const hasMultiple = allocations.length > 1;
                  const rowCount = allocations.length;
                  const entry = bondGroup.entry;
                  const isPending = entry.approval_status === 'pending' || entry.approval_status === 'pending_reapproval' || entry.approval_status === 'pending_broker_approval' || !entry.approval_status;
                  const isAutoTagged = entry.auto_tagged;
                  
                  return (
                    <React.Fragment key={bondIdx}>
                      {allocations.map((alloc, allocIdx) => {
                        const isFirst = allocIdx === 0;
                        const isLast = allocIdx === allocations.length - 1;
                        
                        // Get investment date from allocation or calculate T+1
                        const investmentDate = alloc.investment_date || alloc.mf_investment_date || 
                          (bondGroup.date ? format(addDays(new Date(bondGroup.date), 1), 'yyyy-MM-dd') : '-');
                        
                        return (
                          <tr 
                            key={`${bondIdx}-${allocIdx}`}
                            className={`
                              ${hasMultiple ? (isFirst ? 'border-t-2 border-green-300' : '') : ''}
                              ${hasMultiple ? 'bg-green-50/30' : 'hover:bg-gray-50'}
                              ${isAutoTagged ? 'bg-gray-50' : ''}
                            `}
                          >
                            {/* REPAYMENT DETAILS - Date of Repayment (merged with rowSpan) */}
                            {isFirst && (
                              <td 
                                className={`px-3 py-2 border border-gray-200 align-middle ${hasMultiple ? 'border-l-4 border-l-green-400' : ''}`}
                                rowSpan={hasMultiple ? rowCount : 1}
                              >
                                <span className="whitespace-nowrap font-medium text-gray-800">
                                  {format(new Date(bondGroup.date), "dd MMM yyyy")}
                                </span>
                              </td>
                            )}
                            
                            {/* REPAYMENT DETAILS - Bond Name (merged with rowSpan) */}
                            {isFirst && (
                              <td 
                                className="px-3 py-2 border border-gray-200 align-middle"
                                rowSpan={hasMultiple ? rowCount : 1}
                              >
                                <div>
                                  <div className="font-medium text-gray-800">{bondGroup.bond_name}</div>
                                  {bondGroup.bond_code && (
                                    <div className="text-xs text-gray-500">({bondGroup.bond_code})</div>
                                  )}
                                </div>
                              </td>
                            )}
                            
                            {/* REPAYMENT DETAILS - Net Amount */}
                            <td className="px-3 py-2 text-right font-mono text-gray-800 border border-gray-200">
                              ₹{(alloc.net_amount || 0).toLocaleString('en-IN')}
                            </td>
                            
                            {/* INVESTMENT DETAILS - Date of Investment */}
                            <td className="px-3 py-2 border border-gray-200">
                              <span className="whitespace-nowrap text-gray-700">
                                {investmentDate !== '-' ? format(new Date(investmentDate), "dd MMM yyyy") : '-'}
                              </span>
                            </td>
                            
                            {/* INVESTMENT DETAILS - Portfolio */}
                            <td className="px-3 py-2 border border-gray-200">
                              <Badge className="bg-blue-100 text-blue-700 text-xs capitalize">
                                {alloc.portfolio || '-'}
                              </Badge>
                            </td>
                            
                            {/* INVESTMENT DETAILS - UCC */}
                            <td className="px-3 py-2 border border-gray-200">
                              <Badge variant="outline" className="text-xs font-mono">
                                {alloc.ucc || '-'}
                              </Badge>
                            </td>
                            
                            {/* INVESTMENT DETAILS - Amount (Round Down) */}
                            <td className="px-3 py-2 text-right font-mono text-green-700 font-semibold border border-gray-200">
                              ₹{(alloc.round_down_amount || 0).toLocaleString('en-IN')}
                            </td>
                            
                            {/* Status */}
                            <td className="px-3 py-2 text-center border border-gray-200">
                              {isAutoTagged ? (
                                <Badge className="bg-gray-100 text-gray-600 text-xs">
                                  Auto-Tagged
                                </Badge>
                              ) : isPending ? (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">
                                  <Clock className="h-3 w-3 mr-1 inline" />
                                  Pending
                                </Badge>
                              ) : alloc.approval_status === 'cancellation_pending' ? (
                                <Badge className="bg-red-100 text-red-700 text-xs">
                                  Cancel Pending
                                </Badge>
                              ) : alloc.approval_status === 'edit_pending' ? (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">
                                  Edit Pending
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600 text-xs">
                                  {alloc.approval_status || 'N/A'}
                                </Badge>
                              )}
                            </td>
                            
                            {/* Actions - Edit and Untag only for pending status */}
                            <td className="px-3 py-2 text-center border border-gray-200">
                              {isFirst && isPending && !isAutoTagged && canTag && (
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    onClick={() => editTaggedEntry(entry, clientGroup)}
                                    title="Edit tag"
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleUntagEntry(entry)}
                                    title="Untag and move back"
                                  >
                                    <X className="h-3 w-3 mr-1" />
                                    Untag
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Total row for multiple allocations */}
                      {hasMultiple && (
                        <tr className="bg-green-100/70 border-b-2 border-green-400">
                          <td colSpan="2" className="px-3 py-2 text-right font-semibold text-gray-700 border border-gray-200">
                            Total for {bondGroup.bond_name}:
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 border border-gray-200">
                            ₹{bondGroup.total_net_amount.toLocaleString('en-IN')}
                          </td>
                          <td colSpan="3" className="border border-gray-200"></td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-green-700 border border-gray-200">
                            ₹{bondGroup.total_round_down_amount.toLocaleString('en-IN')}
                          </td>
                          <td colSpan="2" className="border border-gray-200"></td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            
            {/* Client Total */}
            <div className="mt-3 p-3 bg-green-100 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-medium text-green-800">
                  Total for {clientGroup.client_name}
                </span>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-green-700">Net Repayment</p>
                    <p className="font-bold text-green-800">₹{totalNetAmount.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-green-700">Investment Amount</p>
                    <p className="font-bold text-green-800 text-lg">₹{totalRoundDownAmount.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Handle untag entry - move it back to untagged
  const handleUntagEntry = async (entry) => {
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API}/reinvestment/tag/${entry.id}`,
        {
          reinvestment_tag: "not_tagged",
          portfolio_category: null,
          target_ucc: null
        },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      
      toast.success("Entry untagged and moved back");
      fetchData();
    } catch (error) {
      console.error("Error untagging:", error);
      toast.error(error.response?.data?.detail || "Failed to untag entry");
    }
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
                <p className="text-sm text-gray-500">Tag client cashflows month-wise (next 3 months active)</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Month Tabs - Always visible */}
          <div className="px-6 border-t overflow-x-auto">
            <div className="flex min-w-max">
              {getMonthsConfig.map(month => {
                const counts = getMonthCounts[month.key] || { total: 0, untagged: 0 };
                const isSelected = selectedMonth === month.key;
                const isViewOnly = !month.canTag; // Can view but not tag
                  
                  return (
                    <button
                      key={month.key}
                      onClick={() => setSelectedMonth(month.key)}
                      className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                        isSelected
                          ? "border-etihad-gold-600 text-etihad-gold-600 bg-etihad-gold-50"
                          : isViewOnly
                          ? "border-transparent text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                          : month.isCurrent
                          ? "border-transparent text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          : month.isHistorical
                          ? "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                          : "border-transparent text-green-600 hover:text-green-700 hover:bg-green-50"
                      }`}
                      data-testid={`month-tab-${month.key}`}
                    >
                      {isViewOnly && <Eye className="h-3 w-3" />}
                      <span>{month.shortLabel}</span>
                      {counts.untagged > 0 && (
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${
                          isSelected ? 'bg-etihad-gold-200 text-etihad-gold-800' : 
                          isViewOnly ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {counts.untagged}
                        </Badge>
                      )}
                      {counts.tagged > 0 && counts.untagged === 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">
                          {counts.tagged}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
        </div>

        {/* Content - Month View Only */}
        <div className="p-6 pb-24">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="h-8 w-8 animate-spin text-etihad-gold-600" />
            </div>
          ) : (
            renderMonthView()
          )}
        </div>

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
                            <div className="flex-1 grid grid-cols-4 gap-3">
                              {/* UCC - Show as N/A if amount < 1000, show as text if only one UCC, otherwise dropdown */}
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block">UCC</Label>
                                {(alloc.amount !== '' && alloc.amount < 1000) ? (
                                  <div className="h-8 px-3 flex items-center text-xs bg-gray-100 border rounded-md text-gray-400 italic">
                                    N/A (amount &lt; ₹1000)
                                  </div>
                                ) : (data.entry?.ucc_list?.length === 1) ? (
                                  <div className="h-8 px-3 flex items-center text-xs bg-gray-100 border rounded-md font-medium">
                                    {data.entry.ucc_list[0]}
                                  </div>
                                ) : (
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
                                )}
                              </div>
                              
                              {/* Amount */}
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block">Amount (₹) <span className="text-gray-400">(multiples of 100)</span></Label>
                                <Input
                                  type="number"
                                  step="100"
                                  value={alloc.amount}
                                  onChange={(e) => updateAllocation(entryId, allocIndex, 'amount', e.target.value)}
                                  onBlur={() => handleAmountBlur(entryId, allocIndex)}
                                  className="h-8 text-xs"
                                  placeholder="Enter amount"
                                />
                                {alloc.amount !== '' && alloc.amount < 1000 && (
                                  <p className="text-[10px] text-amber-600 mt-0.5">Auto-tagged to None (amount &lt; ₹1000)</p>
                                )}
                              </div>
                              
                              {/* Portfolio */}
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block">Portfolio</Label>
                                <Select 
                                  value={alloc.portfolio} 
                                  onValueChange={(v) => updateAllocation(entryId, allocIndex, 'portfolio', v)}
                                  disabled={alloc.amount !== '' && alloc.amount < 1000}
                                >
                                  <SelectTrigger className={`h-8 text-xs ${alloc.amount !== '' && alloc.amount < 1000 ? 'bg-gray-100' : ''}`}>
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getFilteredPortfolioOptions(alloc.amount).map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {alloc.amount >= 1000 && alloc.amount < 1000000 && (
                                  <p className="text-[10px] text-gray-400 mt-0.5">Bonds: ≥₹10L | RE: ≥₹25L</p>
                                )}
                              </div>
                              
                              {/* Date of Investment - T+1 default, editable */}
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block">Date of Investment</Label>
                                <Input
                                  type="date"
                                  value={alloc.investment_date || ''}
                                  onChange={(e) => updateAllocation(entryId, allocIndex, 'investment_date', e.target.value)}
                                  className="h-8 text-xs"
                                  disabled={alloc.amount !== '' && alloc.amount < 1000}
                                />
                                <p className="text-[10px] text-gray-400 mt-0.5">Default: T+1</p>
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
                      
                      {/* Add Allocation Button - Always show to allow splitting across multiple portfolios */}
                      <button
                        onClick={() => addUccAllocation(entryId)}
                        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-etihad-gold-400 hover:text-etihad-gold-600 transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                        <Plus className="h-4 w-4" />
                        Add Portfolio Allocation
                      </button>
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

        {/* Cancel Reinvestment Modal */}
        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Ban className="h-5 w-5" />
                Cancel Reinvestment
              </DialogTitle>
              <DialogDescription>
                {selectedEntryForAction?.client_approved 
                  ? "This reinvestment has been approved by the client. Cancellation will require client re-approval."
                  : "Cancel this reinvestment tag. The entry will be reset to untagged."
                }
              </DialogDescription>
            </DialogHeader>
            
            {selectedEntryForAction && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Bond</span>
                    <span className="font-medium">{selectedEntryForAction.bond_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-medium">{formatCurrency(selectedEntryForAction.net_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Current Tag</span>
                    <span className="font-medium capitalize">{selectedEntryForAction.reinvestment_tag}</span>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Reason for cancellation (optional)</Label>
                  <Textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter reason..."
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancelModal(false)} disabled={processingAction}>
                Back
              </Button>
              <Button 
                onClick={handleCancelSubmit} 
                disabled={processingAction}
                className="bg-red-600 hover:bg-red-700"
              >
                {processingAction ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                {selectedEntryForAction?.client_approved ? "Request Cancellation" : "Cancel Tag"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Reinvestment Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-600" />
                Edit Reinvestment Tag
              </DialogTitle>
              <DialogDescription>
                {selectedEntryForAction?.client_approved 
                  ? "This reinvestment has been approved by the client. Changes will require client re-approval."
                  : "Update the reinvestment tag details."
                }
              </DialogDescription>
            </DialogHeader>
            
            {selectedEntryForAction && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="font-medium">{selectedEntryForAction.bond_name}</div>
                  <div className="text-sm text-gray-500">
                    {formatCurrency(selectedEntryForAction.net_amount)} • {format(new Date(selectedEntryForAction.date || selectedEntryForAction.expected_date), "dd MMM yyyy")}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Tag Type</Label>
                    <Select
                      value={editFormData.reinvestment_tag}
                      onValueChange={(value) => setEditFormData(prev => ({ ...prev, reinvestment_tag: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="principal">Principal</SelectItem>
                        <SelectItem value="interest">Interest</SelectItem>
                        <SelectItem value="both">Both (P+I)</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Portfolio</Label>
                    <Select
                      value={editFormData.portfolio_category}
                      onValueChange={(value) => setEditFormData(prev => ({ ...prev, portfolio_category: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        {getFilteredPortfolioOptions(selectedEntryForAction.net_amount).map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Reason for change (optional)</Label>
                    <Textarea
                      value={editFormData.reason || ''}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Enter reason..."
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={processingAction}>
                Cancel
              </Button>
              <Button 
                onClick={handleEditSubmit} 
                disabled={processingAction || !editFormData.reinvestment_tag || !editFormData.portfolio_category}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {processingAction ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Pencil className="h-4 w-4 mr-2" />
                )}
                {selectedEntryForAction?.client_approved ? "Request Edit" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
