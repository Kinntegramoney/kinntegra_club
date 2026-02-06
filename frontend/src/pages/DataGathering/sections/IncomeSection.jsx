import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, 
  DollarSign, Plus, Trash2, ChevronDown, ChevronUp, User, EyeOff, Eye, Check, RotateCcw
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Income categories with fields
const INCOME_CATEGORIES = [
  { 
    value: "salary", 
    label: "Salary Income", 
    icon: Briefcase,
    color: "blue",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=200&fit=crop",
    fields: [
      { key: "net_income_monthly", label: "Net Income (Monthly)", type: "number" },
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number", disabled: true },
      { key: "increment_month", label: "Increment Month", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
      { key: "avg_growth_rate", label: "Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" },
      { key: "year_of_retirement", label: "Year of Retirement", type: "number", disabled: true }
    ]
  },
  { 
    value: "business", 
    label: "Business Income", 
    icon: Building,
    color: "purple",
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=200&fit=crop",
    fields: [
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number" },
      { key: "avg_growth_rate", label: "Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" },
      { key: "year_of_retirement", label: "Year of Retirement", type: "number", disabled: true }
    ]
  },
  { 
    value: "rental", 
    label: "Rental Income", 
    icon: Building,
    color: "teal",
    image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=200&fit=crop",
    fields: [
      { key: "property_details", label: "Property Details", type: "text" },
      { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Land"] },
      { key: "purchase_value", label: "Purchase Value", type: "number" },
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "is_on_rent", label: "Is On Rent", type: "select", options: ["Yes", "No"] },
      { key: "income_per_month", label: "Income/Month", type: "number" },
      { key: "annual_income", label: "Annual Income", type: "number", disabled: true },
      { key: "rental_increment_percent", label: "Increment %", type: "number" }
    ]
  },
  { 
    value: "ppf", 
    label: "PPF", 
    icon: PiggyBank,
    color: "green",
    image: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400&h=200&fit=crop",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", disabled: true }
    ]
  },
  { 
    value: "epf", 
    label: "EPF", 
    icon: PiggyBank,
    color: "emerald",
    image: "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=400&h=200&fit=crop",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", disabled: true }
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    color: "amber",
    image: "https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=400&h=200&fit=crop",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", disabled: true }
    ]
  },
  { 
    value: "fd", 
    label: "Fixed Deposit", 
    icon: Landmark,
    color: "indigo",
    image: "https://images.unsplash.com/photo-1518458028785-8fbcd101ebb9?w=400&h=200&fit=crop",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Principal Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "payable_cycle", label: "Payable Cycle", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "On Maturity"] },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "payment_amount_yearly", label: "Yearly Payment", type: "number", disabled: true }
    ]
  },
  { 
    value: "pension", 
    label: "Pension Income", 
    icon: Wallet,
    color: "rose",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=200&fit=crop",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "payable_type", label: "Payable Type", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"] },
      { key: "amount_yearly", label: "Amount (Yearly)", type: "number", disabled: true },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "upto_life", label: "Upto Life", type: "select", options: ["Yes", "No"] },
      { key: "end_date", label: "End Date", type: "date" },
      { key: "payable_to_relation", label: "Payable To", type: "select", options: ["Self", "Spouse"] }
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    color: "cyan",
    image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "sip_amount", label: "SIP Amount", type: "number" }
    ]
  },
  { 
    value: "shares_pms", 
    label: "Shares / PMS", 
    icon: TrendingUp,
    color: "violet",
    image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&h=200&fit=crop",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "gold", 
    label: "Gold", 
    icon: DollarSign,
    color: "yellow",
    image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400&h=200&fit=crop",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "cash", 
    label: "Cash In Hand", 
    icon: Wallet,
    color: "slate",
    image: "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=400&h=200&fit=crop",
    fields: [
      { key: "bank_balance", label: "Bank Balance", type: "number" }
    ]
  },
  { 
    value: "other", 
    label: "Other Income", 
    icon: DollarSign,
    color: "gray",
    image: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=400&h=200&fit=crop",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  }
];

const colorClasses = {
  blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "bg-blue-100 text-blue-600", badge: "bg-blue-100 text-blue-700", highlight: "bg-blue-500", accent: "text-blue-600" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", icon: "bg-purple-100 text-purple-600", badge: "bg-purple-100 text-purple-700", highlight: "bg-purple-500", accent: "text-purple-600" },
  teal: { bg: "bg-teal-50", border: "border-teal-200", icon: "bg-teal-100 text-teal-600", badge: "bg-teal-100 text-teal-700", highlight: "bg-teal-500", accent: "text-teal-600" },
  green: { bg: "bg-green-50", border: "border-green-200", icon: "bg-green-100 text-green-600", badge: "bg-green-100 text-green-700", highlight: "bg-green-500", accent: "text-green-600" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "bg-emerald-100 text-emerald-600", badge: "bg-emerald-100 text-emerald-700", highlight: "bg-emerald-500", accent: "text-emerald-600" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "bg-amber-100 text-amber-600", badge: "bg-amber-100 text-amber-700", highlight: "bg-amber-500", accent: "text-amber-600" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", icon: "bg-indigo-100 text-indigo-600", badge: "bg-indigo-100 text-indigo-700", highlight: "bg-indigo-500", accent: "text-indigo-600" },
  rose: { bg: "bg-rose-50", border: "border-rose-200", icon: "bg-rose-100 text-rose-600", badge: "bg-rose-100 text-rose-700", highlight: "bg-rose-500", accent: "text-rose-600" },
  cyan: { bg: "bg-cyan-50", border: "border-cyan-200", icon: "bg-cyan-100 text-cyan-600", badge: "bg-cyan-100 text-cyan-700", highlight: "bg-cyan-500", accent: "text-cyan-600" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", icon: "bg-violet-100 text-violet-600", badge: "bg-violet-100 text-violet-700", highlight: "bg-violet-500", accent: "text-violet-600" },
  yellow: { bg: "bg-yellow-50", border: "border-yellow-200", icon: "bg-yellow-100 text-yellow-600", badge: "bg-yellow-100 text-yellow-700", highlight: "bg-yellow-500", accent: "text-yellow-600" },
  slate: { bg: "bg-slate-50", border: "border-slate-200", icon: "bg-slate-100 text-slate-600", badge: "bg-slate-100 text-slate-700", highlight: "bg-slate-500", accent: "text-slate-600" },
  gray: { bg: "bg-gray-50", border: "border-gray-200", icon: "bg-gray-100 text-gray-600", badge: "bg-gray-100 text-gray-700", highlight: "bg-gray-500", accent: "text-gray-600" }
};

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [incomeItems, setIncomeItems] = useState({});
  const [flippedCards, setFlippedCards] = useState({});

  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    INCOME_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingIncomes.forEach(inc => {
      const category = inc.category;
      if (itemsByCategory[category]) {
        itemsByCategory[category].push({
          id: inc.id,
          memberId: inc.member_ids?.[0] || "",
          details: inc.details || {},
          isNew: false,
          isModified: false
        });
      }
    });

    setIncomeItems(itemsByCategory);
    
    // Auto-flip cards that have saved data
    const flipped = {};
    INCOME_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0 && !itemsByCategory[cat.value].some(i => i.isNew || i.isModified)) {
        flipped[cat.value] = true;
      }
    });
    setFlippedCards(flipped);
  }, [family?.id, existingIncomes.length]);

  const toggleCategory = (category) => {
    // If card is flipped (showing image), flip it back first
    if (flippedCards[category]) {
      setFlippedCards(prev => ({ ...prev, [category]: false }));
      setTimeout(() => {
        setExpandedCategories(prev => ({ ...prev, [category]: true }));
      }, 300);
    } else {
      setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
    }
  };
  
  const hideCategory = (category) => { 
    setHiddenCategories(prev => [...prev, category]); 
    setExpandedCategories(prev => ({ ...prev, [category]: false })); 
  };
  
  const showCategory = (category) => setHiddenCategories(prev => prev.filter(c => c !== category));

  const addIncomeItem = (category) => {
    setFlippedCards(prev => ({ ...prev, [category]: false }));
    setIncomeItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: {},
        isNew: true,
        isModified: false
      }]
    }));
    setExpandedCategories(prev => ({ ...prev, [category]: true }));
  };

  const removeIncomeItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/income/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed to delete"); return; }
    }
    setIncomeItems(prev => ({ ...prev, [category]: prev[category].filter(item => item.id !== itemId) }));
  };

  const getMemberBirthYear = (memberId) => {
    const member = members.find(m => m.id === memberId);
    if (member?.date_of_birth) {
      return new Date(member.date_of_birth).getFullYear();
    }
    return null;
  };

  const calculateYearToMature = (maturityDate) => {
    if (!maturityDate) return null;
    const years = new Date(maturityDate).getFullYear() - new Date().getFullYear();
    return years > 0 ? years : 0;
  };

  const updateIncomeItem = (category, itemId, field, value) => {
    setIncomeItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          let newDetails = { ...item.details };
          let newMemberId = item.memberId;
          
          if (field === "memberId") {
            newMemberId = value;
            if (newDetails.retirement_age) {
              const birthYear = getMemberBirthYear(value);
              if (birthYear) {
                newDetails.year_of_retirement = birthYear + parseInt(newDetails.retirement_age);
              }
            }
          } else {
            newDetails[field] = value;
            
            if (field === "net_income_monthly") {
              newDetails.net_income_yearly = (parseFloat(value) || 0) * 12;
            }
            if (field === "retirement_age") {
              const birthYear = getMemberBirthYear(item.memberId);
              if (birthYear && value) {
                newDetails.year_of_retirement = birthYear + parseInt(value);
              }
            }
            if (field === "income_per_month") {
              newDetails.annual_income = (parseFloat(value) || 0) * 12;
            }
            if (field === "maturity_date" && ["ppf", "epf", "gratuity"].includes(category)) {
              newDetails.year_to_mature = calculateYearToMature(value);
            }
            if (field === "amount" && category === "pension") {
              const multipliers = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1 };
              newDetails.amount_yearly = (parseFloat(value) || 0) * (multipliers[newDetails.payable_type] || 12);
            }
            if (field === "payable_type" && category === "pension") {
              const multipliers = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1 };
              newDetails.amount_yearly = (parseFloat(newDetails.amount) || 0) * (multipliers[value] || 12);
            }
            if ((field === "principal_amount" || field === "interest_rate") && ["fd", "bond"].includes(category)) {
              const principal = field === "principal_amount" ? value : newDetails.principal_amount;
              const rate = field === "interest_rate" ? value : newDetails.interest_rate;
              if (principal && rate) {
                newDetails.payment_amount_yearly = Math.round((parseFloat(principal) * parseFloat(rate)) / 100);
              }
            }
          }
          
          return { ...item, memberId: newMemberId, details: newDetails, isModified: !item.isNew };
        }
        return item;
      })
    }));
  };

  const saveCategory = async (category) => {
    const items = incomeItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    if (itemsToSave.length === 0) { toast.info("No changes"); return; }

    for (const item of itemsToSave) {
      if (!item.memberId) { toast.error("Select a member"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const payload = { family_id: family.id, category, member_ids: [item.memberId], details: item.details };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/income`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/income/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        }
      }
      toast.success("Saved successfully!");
      
      // Collapse and flip the card
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      setTimeout(() => {
        setFlippedCards(prev => ({ ...prev, [category]: true }));
      }, 200);
      
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0";
    return `₹${parseFloat(amount).toLocaleString('en-IN')}`;
  };

  const getCategoryTotal = (category) => {
    const items = incomeItems[category] || [];
    return items.reduce((sum, item) => {
      const val = item.details?.net_income_yearly || item.details?.annual_income || 
                  item.details?.amount || item.details?.market_value || 
                  item.details?.bank_balance || item.details?.principal_amount || 0;
      return sum + (parseFloat(val) || 0);
    }, 0);
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-blue-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const visibleCategories = INCOME_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
  const hiddenCategoryList = INCOME_CATEGORIES.filter(c => hiddenCategories.includes(c.value));

  // Card Component with Flip Animation
  const CategoryCard = ({ category }) => {
    const Icon = category.icon;
    const colors = colorClasses[category.color];
    const items = incomeItems[category.value] || [];
    const isExpanded = expandedCategories[category.value];
    const isFlipped = flippedCards[category.value];
    const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
    const itemCount = items.length;
    const totalValue = getCategoryTotal(category.value);

    return (
      <div className="perspective-1000" style={{ perspective: "1000px" }}>
        <div 
          className={`relative transition-transform duration-500 transform-style-preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}
          style={{ 
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
          }}
        >
          {/* Front of Card */}
          <div 
            className="bg-white border border-gray-200 rounded-lg p-5 hover:border-blue-300 transition-colors"
            style={{ backfaceVisibility: "hidden" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.icon}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{category.label}</h3>
                  {itemCount > 0 && (
                    <p className="text-xs text-gray-500">{itemCount} {itemCount === 1 ? 'entry' : 'entries'}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={`${colors.badge} hover:${colors.badge}`}>{category.label.split(' ')[0]}</Badge>
                {hasUnsavedChanges && (
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Unsaved</span>
                )}
              </div>
            </div>

            {/* Summary Box */}
            {itemCount > 0 && totalValue > 0 && (
              <div className={`${colors.bg} rounded-lg p-3 mb-4`}>
                <p className="text-xs text-gray-500 mb-1">Total Value</p>
                <p className={`font-bold text-lg ${colors.accent}`}>{formatCurrency(totalValue)}</p>
              </div>
            )}

            {/* Toggle/Expand Area */}
            <div 
              className="cursor-pointer"
              onClick={() => toggleCategory(category.value)}
            >
              {!isExpanded && (
                <div className="flex items-center justify-between py-2 border-t">
                  <span className="text-sm text-gray-500">
                    {itemCount > 0 ? `${itemCount} entries recorded` : 'Click to add entries'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t pt-4">
                {/* Action Buttons */}
                <div className="flex justify-between items-center mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addIncomeItem(category.value)}
                    disabled={isReadOnly}
                    className="text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Entry
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedCategories(prev => ({ ...prev, [category.value]: false }))}
                      className="text-xs text-gray-400"
                    >
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Collapse
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => hideCategory(category.value)}
                      disabled={isReadOnly || itemCount > 0}
                      className="text-xs text-gray-400"
                    >
                      <EyeOff className="h-3 w-3 mr-1" />
                      Skip
                    </Button>
                  </div>
                </div>

                {/* Entries */}
                {items.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed rounded-lg">
                    No entries yet. Click "Add Entry" to create one.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, index) => {
                      const memberName = members.find(m => m.id === item.memberId)?.name || "Select Member";
                      
                      return (
                        <div 
                          key={item.id} 
                          className={`border rounded-lg overflow-hidden ${item.isNew ? 'border-green-300' : item.isModified ? 'border-amber-300' : 'border-gray-200'}`}
                        >
                          {/* Entry Header */}
                          <div className={`flex items-center justify-between p-3 ${item.isNew ? 'bg-green-50' : item.isModified ? 'bg-amber-50' : 'bg-gray-50'}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium ${colors.highlight}`}>
                                {index + 1}
                              </div>
                              <Select 
                                value={item.memberId || ""} 
                                onValueChange={(v) => updateIncomeItem(category.value, item.id, "memberId", v)} 
                                disabled={isReadOnly}
                              >
                                <SelectTrigger className="h-8 w-36 text-xs border-0 bg-white">
                                  <SelectValue placeholder="Select Member" />
                                </SelectTrigger>
                                <SelectContent>
                                  {members.map(m => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.name}{m.is_primary ? ' *' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => removeIncomeItem(category.value, item.id, item.isNew)} 
                              disabled={isReadOnly} 
                              className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Fields Grid */}
                          <div className="p-3 grid grid-cols-2 gap-3">
                            {category.fields.map(field => (
                              <div key={field.key} className={`${colors.bg} rounded-lg p-3`}>
                                <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">{field.label}</p>
                                {field.type === "select" ? (
                                  <Select 
                                    value={item.details[field.key] || ""} 
                                    onValueChange={(v) => updateIncomeItem(category.value, item.id, field.key, v)} 
                                    disabled={isReadOnly || field.disabled}
                                  >
                                    <SelectTrigger className="h-8 text-xs border-0 bg-white">
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {field.options.map(opt => (
                                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : field.disabled ? (
                                  <p className={`font-semibold text-sm ${colors.accent}`}>
                                    {field.type === "number" ? formatCurrency(item.details[field.key]) : (item.details[field.key] || "-")}
                                  </p>
                                ) : (
                                  <Input
                                    type={field.type}
                                    value={item.details[field.key] || ""}
                                    onChange={(e) => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                    placeholder={field.type === "number" ? "0" : ""}
                                    className="h-8 text-xs border-0 bg-white"
                                    disabled={isReadOnly}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Save Button */}
                    <div className="flex justify-end pt-2">
                      <Button 
                        onClick={() => saveCategory(category.value)} 
                        disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} 
                        className={`${colors.highlight} hover:opacity-90 text-white`}
                        size="sm"
                      >
                        <Save className="h-4 w-4 mr-1" />
                        {savingCategory === category.value ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Back of Card (Flipped - Shows Image) */}
          <div 
            className="absolute inset-0 bg-white border border-gray-200 rounded-lg overflow-hidden"
            style={{ 
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)"
            }}
          >
            {/* Image */}
            <div className="relative h-32">
              <img 
                src={category.image} 
                alt={category.label}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <h3 className="text-white font-bold text-lg">{category.label}</h3>
              </div>
              <div className="absolute top-3 right-3">
                <Badge className="bg-green-500 text-white hover:bg-green-500">
                  <Check className="h-3 w-3 mr-1" />
                  Saved
                </Badge>
              </div>
            </div>

            {/* Summary Info */}
            <div className="p-4">
              <div className={`${colors.bg} rounded-lg p-3 mb-3`}>
                <p className="text-xs text-gray-500 mb-1">Total Value</p>
                <p className={`font-bold text-xl ${colors.accent}`}>{formatCurrency(totalValue)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Entries</p>
                  <p className="text-2xl font-bold text-gray-700">{itemCount}</p>
                </div>
                <div className={`${colors.bg} rounded-lg p-3 text-center`}>
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <p className={`text-sm font-semibold ${colors.accent}`}>Complete</p>
                </div>
              </div>

              {/* Edit Button */}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setFlippedCards(prev => ({ ...prev, [category.value]: false }));
                  setTimeout(() => {
                    setExpandedCategories(prev => ({ ...prev, [category.value]: true }));
                  }, 300);
                }}
                className="w-full"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Edit Entries
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-sm text-gray-500">Select categories to add income details</span>
        <Badge variant="outline" className="text-xs">{members.length} member{members.length !== 1 ? 's' : ''}</Badge>
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleCategories.map(category => (
          <CategoryCard key={category.value} category={category} />
        ))}
      </div>

      {/* Hidden Categories */}
      {hiddenCategoryList.length > 0 && (
        <div className="mt-6 pt-4 border-t border-dashed">
          <div className="text-xs text-gray-400 mb-3">Skipped Categories (click to restore)</div>
          <div className="flex flex-wrap gap-2">
            {hiddenCategoryList.map(category => {
              const Icon = category.icon;
              return (
                <button 
                  key={category.value} 
                  onClick={() => showCategory(category.value)} 
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  <Icon className="h-3 w-3" />
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
