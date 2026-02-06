import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, 
  DollarSign, Plus, Trash2, ChevronDown, ChevronRight, User, X
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Income categories with inline fields
const INCOME_CATEGORIES = [
  { 
    value: "salary", 
    label: "Salary Income", 
    icon: Briefcase,
    color: "blue",
    fields: [
      { key: "net_income_monthly", label: "Net Income (Monthly)", type: "number" },
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number", readOnly: true, calculated: true },
      { key: "increment_month", label: "Increment Month", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
      { key: "avg_growth_rate", label: "Growth Rate %", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" },
      { key: "year_of_retirement", label: "Year of Retirement", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "business", 
    label: "Business Income", 
    icon: Building,
    color: "purple",
    fields: [
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number" },
      { key: "avg_growth_rate", label: "Growth Rate %", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" },
      { key: "year_of_retirement", label: "Year of Retirement", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "rental", 
    label: "Rental Income", 
    icon: Building,
    color: "teal",
    fields: [
      { key: "property_details", label: "Property Details", type: "text" },
      { key: "property_type", label: "Type", type: "select", options: ["Residential", "Commercial", "Land"] },
      { key: "purchase_value", label: "Purchase Value", type: "number" },
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "is_on_rent", label: "Is On Rent", type: "select", options: ["Yes", "No"], defaultValue: "No" },
      { key: "rental_details", label: "Rental Details", type: "text", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "income_per_month", label: "Income – Per Month", type: "number", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "annual_income", label: "Annual Income", type: "number", readOnly: true, calculated: true, dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "start_date", label: "Start Date", type: "date", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "end_date", label: "End Date", type: "date", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "pay_date", label: "Pay Date", type: "number", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "auto_renew", label: "Auto Renew", type: "select", options: ["Yes", "No"], dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "rental_increment_percent", label: "Rental Increment %", type: "number", dependsOn: "is_on_rent", showWhen: "Yes" }
    ]
  },
  { 
    value: "ppf", 
    label: "PPF", 
    icon: PiggyBank,
    color: "green",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "epf", 
    label: "EPF", 
    icon: PiggyBank,
    color: "emerald",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    color: "amber",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "fd", 
    label: "Fixed Deposit", 
    icon: Landmark,
    color: "indigo",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Principal", type: "number" },
      { key: "interest_rate", label: "Interest %", type: "number" },
      { key: "payable_cycle", label: "Cycle", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "On Maturity"], defaultValue: "Monthly" },
      { key: "maturity_date", label: "Maturity", type: "date" },
      { key: "payment_amount_yearly", label: "Yearly Payment", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "rd_pis", 
    label: "RD / PIS", 
    icon: Landmark,
    color: "cyan",
    fields: [
      { key: "principal_amount_monthly", label: "Monthly Amt", type: "number" },
      { key: "start_date", label: "Start", type: "date" },
      { key: "end_date", label: "End", type: "date" },
      { key: "num_installments", label: "Installments", type: "number", readOnly: true, calculated: true },
      { key: "principal_amount", label: "Total Principal", type: "number", readOnly: true, calculated: true },
      { key: "interest_rate", label: "Interest %", type: "number" },
      { key: "maturity_amount", label: "Maturity Amt", type: "number" }
    ]
  },
  { 
    value: "pension", 
    label: "Pension", 
    icon: Wallet,
    color: "rose",
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "payable_type", label: "Payable", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], defaultValue: "Monthly" },
      { key: "amount_yearly", label: "Yearly Amt", type: "number", readOnly: true, calculated: true },
      { key: "start_date", label: "Start", type: "date" },
      { key: "upto_life", label: "Upto Life", type: "select", options: ["Yes", "No"] },
      { key: "end_date", label: "End", type: "date", dependsOn: "upto_life", showWhen: "No" },
      { key: "payable_to_relation", label: "Payable To", type: "select", options: ["Self", "Spouse"] }
    ]
  },
  { 
    value: "bond", 
    label: "Bond", 
    icon: Landmark,
    color: "violet",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Principal", type: "number" },
      { key: "interest_rate", label: "Interest %", type: "number" },
      { key: "payable_cycle", label: "Cycle", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], defaultValue: "Monthly" },
      { key: "maturity_date", label: "Maturity", type: "date" },
      { key: "payment_amount_yearly", label: "Yearly Payment", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "insurance_income", 
    label: "Insurance", 
    icon: Landmark,
    color: "pink",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Premium", type: "number" },
      { key: "payable_cycle", label: "Cycle", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "On Maturity"], defaultValue: "Monthly" },
      { key: "maturity_date", label: "Maturity", type: "date" },
      { key: "payment_amount_yearly", label: "Yearly Payment", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    color: "sky",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "sip_amount", label: "SIP Amount", type: "number" }
    ]
  },
  { 
    value: "cash", 
    label: "Cash In Hand", 
    icon: Wallet,
    color: "slate",
    fields: [
      { key: "bank_balance", label: "Bank Balance", type: "number" }
    ]
  },
  { 
    value: "gold", 
    label: "Gold", 
    icon: DollarSign,
    color: "yellow",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "shares_pms", 
    label: "Shares / PMS", 
    icon: TrendingUp,
    color: "orange",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "other", 
    label: "Other", 
    icon: DollarSign,
    color: "gray",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "market_value", label: "Value", type: "number" }
    ]
  }
];

const colorMap = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  teal: "bg-teal-500",
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  sky: "bg-sky-500",
  slate: "bg-slate-500",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  gray: "bg-gray-500"
};

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [incomeItems, setIncomeItems] = useState({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    const added = [];
    INCOME_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingIncomes.forEach(inc => {
      const category = inc.category;
      if (itemsByCategory[category]) {
        if (!added.includes(category)) added.push(category);
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
    setAddedCategories(added);
    
    if (!initialLoadDone) {
      const expanded = {};
      added.forEach(cat => { expanded[cat] = true; });
      setExpandedCategories(expanded);
      setInitialLoadDone(true);
    }
  }, [family?.id, existingIncomes.length, initialLoadDone]);

  const addCategory = (categoryValue) => {
    if (!addedCategories.includes(categoryValue)) {
      setAddedCategories(prev => [...prev, categoryValue]);
      setExpandedCategories(prev => ({ ...prev, [categoryValue]: true }));
      addIncomeItem(categoryValue);
    }
  };

  const skipCategory = (categoryValue) => {
    setAddedCategories(prev => prev.filter(c => c !== categoryValue));
    setExpandedCategories(prev => ({ ...prev, [categoryValue]: false }));
    setIncomeItems(prev => ({ ...prev, [categoryValue]: [] }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const addIncomeItem = (category) => {
    const categoryConfig = INCOME_CATEGORIES.find(c => c.value === category);
    const defaultDetails = {};
    categoryConfig?.fields?.forEach(field => {
      if (field.defaultValue) defaultDetails[field.key] = field.defaultValue;
    });

    setIncomeItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: defaultDetails,
        isNew: true,
        isModified: false
      }]
    }));
  };

  const removeIncomeItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/income/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed"); return; }
    }
    const updatedItems = incomeItems[category].filter(item => item.id !== itemId);
    setIncomeItems(prev => ({ ...prev, [category]: updatedItems }));
    if (updatedItems.length === 0) setAddedCategories(prev => prev.filter(c => c !== category));
  };

  const getMemberBirthYear = (memberId) => {
    const member = members.find(m => m.id === memberId);
    return member?.date_of_birth ? new Date(member.date_of_birth).getFullYear() : null;
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
            if ((category === "salary" || category === "business") && newDetails.retirement_age) {
              const birthYear = getMemberBirthYear(value);
              if (birthYear) newDetails.year_of_retirement = birthYear + parseInt(newDetails.retirement_age);
            }
          } else {
            newDetails[field] = value;
            
            // Salary calculations
            if (category === "salary") {
              if (field === "net_income_monthly") newDetails.net_income_yearly = parseFloat(value || 0) * 12;
              if (field === "retirement_age") {
                const birthYear = getMemberBirthYear(item.memberId);
                if (birthYear) newDetails.year_of_retirement = birthYear + parseInt(value);
              }
            }
            
            // Business calculations
            if (category === "business" && field === "retirement_age") {
              const birthYear = getMemberBirthYear(item.memberId);
              if (birthYear) newDetails.year_of_retirement = birthYear + parseInt(value);
            }
            
            // Rental calculations
            if (category === "rental") {
              if (field === "income_per_month") {
                newDetails.annual_income = Math.round(parseFloat(value || 0) * 12);
              }
              if (field === "is_on_rent") {
                if (value === "No") {
                  // Clear all rental-related fields when switching to No
                  newDetails.rental_details = "";
                  newDetails.income_per_month = "";
                  newDetails.annual_income = 0;
                  newDetails.start_date = "";
                  newDetails.end_date = "";
                  newDetails.pay_date = "";
                  newDetails.auto_renew = "";
                  newDetails.rental_increment_percent = "";
                }
              }
            }
            
            // PPF/EPF/Gratuity calculations
            if (["ppf", "epf", "gratuity"].includes(category) && field === "maturity_date") {
              const maturityYear = new Date(value).getFullYear();
              newDetails.year_to_mature = Math.max(0, maturityYear - new Date().getFullYear());
            }
            
            // FD/Bond calculations
            if (["fd", "bond"].includes(category)) {
              if (["principal_amount", "interest_rate"].includes(field)) {
                const principal = field === "principal_amount" ? value : newDetails.principal_amount;
                const rate = field === "interest_rate" ? value : newDetails.interest_rate;
                if (principal && rate) newDetails.payment_amount_yearly = Math.round((parseFloat(principal) * parseFloat(rate)) / 100);
              }
            }
            
            // RD/PIS calculations
            if (category === "rd_pis") {
              if (["start_date", "end_date"].includes(field)) {
                const start = new Date(field === "start_date" ? value : newDetails.start_date);
                const end = new Date(field === "end_date" ? value : newDetails.end_date);
                if (start && end) {
                  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
                  newDetails.num_installments = Math.max(0, months);
                  if (newDetails.principal_amount_monthly) {
                    newDetails.principal_amount = parseFloat(newDetails.principal_amount_monthly) * newDetails.num_installments;
                  }
                }
              }
              if (field === "principal_amount_monthly" && newDetails.num_installments) {
                newDetails.principal_amount = parseFloat(value) * newDetails.num_installments;
              }
            }
            
            // Pension calculations
            if (category === "pension") {
              if (["amount", "payable_type"].includes(field)) {
                const amount = field === "amount" ? value : newDetails.amount;
                const type = field === "payable_type" ? value : (newDetails.payable_type || "Monthly");
                const multipliers = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1 };
                if (amount) newDetails.amount_yearly = Math.round(parseFloat(amount) * (multipliers[type] || 12));
              }
              if (field === "upto_life" && value === "Yes") newDetails.end_date = "";
            }
            
            // Insurance calculations
            if (category === "insurance_income") {
              if (["principal_amount", "payable_cycle"].includes(field)) {
                const premium = field === "principal_amount" ? value : newDetails.principal_amount;
                const cycle = field === "payable_cycle" ? value : (newDetails.payable_cycle || "Monthly");
                const multipliers = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1, "On Maturity": 1 };
                if (premium) newDetails.payment_amount_yearly = Math.round(parseFloat(premium) * (multipliers[cycle] || 12));
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
      if (!item.memberId) { toast.error("Select member"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const payload = { family_id: family.id, category, member_ids: [item.memberId], details: item.details };
        if (item.isNew) await axios.post(`${API}/data-gathering/family/${family.id}/income`, payload, { headers: { Authorization: `Bearer ${token}` } });
        else await axios.put(`${API}/data-gathering/family/${family.id}/income/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      toast.success("Saved");
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  const shouldShowField = (field, details) => {
    if (!field.dependsOn) return true;
    return details[field.dependsOn] === field.showWhen;
  };

  const formatValue = (value, key) => {
    if (!value) return "-";
    if (key.includes("amount") || key.includes("income") || key.includes("payment") || key.includes("value") || key.includes("balance") || key.includes("principal")) {
      return `₹${parseFloat(value).toLocaleString('en-IN')}`;
    }
    return value;
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <User className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-gray-500 text-sm">Add members in Introduction tab first</p>
      </div>
    );
  }

  const availableCategories = INCOME_CATEGORIES.filter(c => !addedCategories.includes(c.value));
  const activeCategories = INCOME_CATEGORIES.filter(c => addedCategories.includes(c.value));

  return (
    <div className="space-y-4">
      {/* Available Categories */}
      {availableCategories.length > 0 && (
        <div className="bg-gray-50/50 rounded-lg p-4">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-3">Click to add</p>
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map(cat => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.value}
                  onClick={() => addCategory(cat.value)}
                  disabled={isReadOnly}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all duration-150"
                >
                  <Plus className="h-3 w-3" />
                  <Icon className="h-3 w-3" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Categories */}
      <div className="space-y-2">
        {activeCategories.map(category => {
          const Icon = category.icon;
          const items = incomeItems[category.value] || [];
          const isExpanded = expandedCategories[category.value];
          const hasChanges = items.some(item => item.isNew || item.isModified);

          return (
            <Collapsible key={category.value} open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
              <div className={`bg-white rounded-lg border transition-all duration-150 ${hasChanges ? 'border-amber-300' : 'border-gray-200'}`}>
                {/* Header */}
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1 h-6 rounded-full ${colorMap[category.color]}`} />
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">{category.label}</span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-gray-100">{items.length}</Badge>
                      {hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {hasChanges && (
                        <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly} size="sm" className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                          <Save className="h-3 w-3 mr-1" />{savingCategory === category.value ? "..." : "Save"}
                        </Button>
                      )}
                      <button onClick={() => skipCategory(category.value)} disabled={isReadOnly} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => addIncomeItem(category.value)} disabled={isReadOnly} className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <div className="p-1.5 text-gray-400">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>

                {/* Content */}
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                    {items.length === 0 ? (
                      <p className="text-center py-4 text-xs text-gray-400">Click + to add entry</p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((item, idx) => {
                          const visibleFields = category.fields.filter(f => shouldShowField(f, item.details));
                          return (
                            <div key={item.id} className={`rounded-md p-4 ${item.isNew ? 'bg-green-50/50 border border-green-200' : item.isModified ? 'bg-amber-50/50 border border-amber-200' : 'bg-gray-50/50 border border-gray-100'}`}>
                              <div className="flex flex-wrap gap-3 items-end">
                                {/* Member */}
                                <div className="flex flex-col" style={{ minWidth: '150px', maxWidth: '200px', flex: '1.5' }}>
                                  <span className="text-[10px] text-gray-400 mb-1">Member</span>
                                  <Select value={item.memberId || ""} onValueChange={v => updateIncomeItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200">
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Fields */}
                                {visibleFields.map(field => {
                                  const isSmallField = ['growth_rate_percent', 'retirement_age', 'inflation_percent', 'rental_increment_percent', 'interest_rate', 'pay_date'].includes(field.key);
                                  const fieldStyle = isSmallField 
                                    ? { minWidth: '70px', maxWidth: '100px', flex: '0.5' }
                                    : { minWidth: '100px', maxWidth: '180px', flex: '1' };
                                  
                                  return (
                                    <div key={field.key} className="flex flex-col" style={fieldStyle}>
                                      <span className={`text-[10px] mb-1 truncate ${field.calculated ? 'text-blue-500' : 'text-gray-400'}`}>{field.label}</span>
                                      {field.type === "select" ? (
                                      <Select value={item.details[field.key] || field.defaultValue || ""} onValueChange={v => updateIncomeItem(category.value, item.id, field.key, v)} disabled={isReadOnly || field.readOnly}>
                                        <SelectTrigger className={`h-8 w-full text-xs ${field.readOnly ? 'bg-gray-100' : 'bg-white'} border-gray-200`}>
                                          <SelectValue placeholder="-" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {field.options.map(opt => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    ) : field.type === "date" ? (
                                      <Input
                                        type="date"
                                        value={item.details[field.key] || ""}
                                        onChange={e => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                        className={`h-8 w-full text-xs ${field.readOnly ? 'bg-gray-100' : 'bg-white'} border-gray-200`}
                                        disabled={isReadOnly || field.readOnly}
                                      />
                                    ) : field.readOnly ? (
                                      <div className="h-8 px-3 w-full flex items-center text-xs bg-gray-100 border border-gray-200 rounded-md text-gray-600 font-medium">
                                        {formatValue(item.details[field.key], field.key)}
                                      </div>
                                    ) : (field.key.includes('amount') || field.key.includes('income') || field.key.includes('value') || field.key.includes('payment') || field.key.includes('principal') || field.key.includes('balance')) ? (
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">₹</span>
                                        <Input
                                          type="text"
                                          value={item.details[field.key] ? parseFloat(item.details[field.key]).toLocaleString('en-IN') : ""}
                                          onChange={e => {
                                            const rawValue = e.target.value.replace(/,/g, '');
                                            if (rawValue === '' || !isNaN(rawValue)) {
                                              updateIncomeItem(category.value, item.id, field.key, rawValue);
                                            }
                                          }}
                                          placeholder="0"
                                          className="h-8 w-full text-xs bg-white border-gray-200 pl-5"
                                          disabled={isReadOnly}
                                        />
                                      </div>
                                    ) : (
                                      <Input
                                        type={field.type}
                                        value={item.details[field.key] || ""}
                                        onChange={e => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                        placeholder="0"
                                        className="h-8 w-full text-xs bg-white border-gray-200"
                                        disabled={isReadOnly}
                                      />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Empty State */}
      {activeCategories.length === 0 && availableCategories.length > 0 && (
        <p className="text-center py-6 text-xs text-gray-400">Select a category above to begin</p>
      )}
    </div>
  );
}
