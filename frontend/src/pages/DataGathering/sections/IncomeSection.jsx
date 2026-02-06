import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, 
  DollarSign, Plus, Trash2, ChevronDown, ChevronRight, User, EyeOff, Eye
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Income categories with multi-row field layout based on documentation
const INCOME_CATEGORIES = [
  { 
    value: "salary", 
    label: "Salary Income", 
    icon: Briefcase,
    rows: [
      [
        { key: "net_income_monthly", label: "Net Income (Monthly)", type: "number" },
        { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number", disabled: true, calculated: true },
        { key: "increment_month", label: "Increment Month", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
        { key: "avg_growth_rate", label: "Average Growth Rate (%)", type: "number" }
      ],
      [
        { key: "retirement_age", label: "Retirement Age", type: "number" },
        { key: "year_of_retirement", label: "Year of Retirement", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "business", 
    label: "Business Income", 
    icon: Building,
    rows: [
      [
        { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number" },
        { key: "avg_growth_rate", label: "Average Growth Rate (%)", type: "number" },
        { key: "retirement_age", label: "Retirement Age", type: "number" },
        { key: "year_of_retirement", label: "Year of Retirement", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "rental", 
    label: "Rental Income", 
    icon: Building,
    rows: [
      [
        { key: "property_details", label: "Property Details", type: "text" },
        { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Land"] },
        { key: "purchase_value", label: "Property Purchase Value", type: "number" },
        { key: "market_value", label: "Property Market Value", type: "number" }
      ],
      [
        { key: "description", label: "Description", type: "text" },
        { key: "is_on_rent", label: "Is On Rent", type: "select", options: ["Yes", "No"] }
      ],
      [
        { key: "rental_details", label: "Rental Details", type: "text" },
        { key: "income_per_month", label: "Income - Per Month", type: "number" },
        { key: "annual_income", label: "Annual Income", type: "number", disabled: true, calculated: true },
        { key: "start_date", label: "Start Date", type: "date" }
      ],
      [
        { key: "end_date", label: "End Date", type: "date" },
        { key: "pay_date", label: "Pay Date", type: "select", options: ["1", "5", "10", "15", "20", "25", "Last Day"] },
        { key: "auto_renew", label: "Auto Renew", type: "select", options: ["Yes", "No"] },
        { key: "rental_increment_percent", label: "Rental Increment %", type: "number" }
      ]
    ]
  },
  { 
    value: "ppf", 
    label: "PPF (Public Provident Fund)", 
    icon: PiggyBank,
    rows: [
      [
        { key: "amount", label: "Amount", type: "number" },
        { key: "maturity_date", label: "Maturity Date", type: "date" },
        { key: "year_to_mature", label: "Year to Mature", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "epf", 
    label: "EPF (Employee Provident Fund)", 
    icon: PiggyBank,
    rows: [
      [
        { key: "amount", label: "Amount", type: "number" },
        { key: "maturity_date", label: "Maturity Date", type: "date" },
        { key: "year_to_mature", label: "Year to Mature", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    rows: [
      [
        { key: "amount", label: "Amount", type: "number" },
        { key: "maturity_date", label: "Maturity Date", type: "date" },
        { key: "year_to_mature", label: "Year to Mature", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "fd", 
    label: "FD (Fixed Deposit)", 
    icon: Landmark,
    rows: [
      [
        { key: "description", label: "Description", type: "text" },
        { key: "principal_amount", label: "Principal Amount", type: "number" },
        { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
        { key: "payable_cycle", label: "Payable Cycle", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "On Maturity"] }
      ],
      [
        { key: "start_date", label: "Start Date", type: "date" },
        { key: "maturity_date", label: "Maturity Date", type: "date" },
        { key: "payment_date", label: "Payment Date", type: "date" },
        { key: "payment_amount_yearly", label: "Payment Amount (Yearly)", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "rd_pis", 
    label: "RD / PIS", 
    icon: Landmark,
    rows: [
      [
        { key: "description", label: "Description", type: "text" },
        { key: "principal_amount_monthly", label: "Principal Amount (Monthly)", type: "number" },
        { key: "payable_cycle", label: "Payable Cycle", type: "select", options: ["Monthly", "Quarterly", "Yearly"] },
        { key: "start_date", label: "Start Date", type: "date" }
      ],
      [
        { key: "end_date", label: "End Date", type: "date" },
        { key: "num_installments", label: "No of Installments", type: "number", calculated: true },
        { key: "principal_amount", label: "Principal Amount (Total)", type: "number", disabled: true, calculated: true },
        { key: "interest_rate", label: "Interest Rate (%)", type: "number" }
      ],
      [
        { key: "maturity_amount", label: "Maturity Amount", type: "number" },
        { key: "maturity_date", label: "Maturity Date", type: "date" }
      ]
    ]
  },
  { 
    value: "pension", 
    label: "Pension Income", 
    icon: Wallet,
    rows: [
      [
        { key: "amount", label: "Amount", type: "number" },
        { key: "payable_type", label: "Payable Type", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"] },
        { key: "amount_yearly", label: "Amount (Yearly)", type: "number", disabled: true, calculated: true },
        { key: "start_date", label: "Start Date", type: "date" }
      ],
      [
        { key: "upto_life", label: "Upto Life", type: "select", options: ["Yes", "No"] },
        { key: "end_date", label: "End Date", type: "date" },
        { key: "payable_to_relation", label: "Payable To Relation", type: "select", options: ["Self", "Spouse"] }
      ]
    ]
  },
  { 
    value: "bond", 
    label: "Bond", 
    icon: Landmark,
    rows: [
      [
        { key: "description", label: "Description", type: "text" },
        { key: "principal_amount", label: "Principal Amount", type: "number" },
        { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
        { key: "payable_cycle", label: "Payable Cycle", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"] }
      ],
      [
        { key: "start_date", label: "Start Date", type: "date" },
        { key: "maturity_date", label: "Maturity Date", type: "date" },
        { key: "payment_date", label: "Payment Date", type: "date" },
        { key: "payment_amount_yearly", label: "Payment Amount (Yearly)", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "insurance_income", 
    label: "Insurance (Income)", 
    icon: Landmark,
    rows: [
      [
        { key: "description", label: "Description", type: "text" },
        { key: "principal_amount", label: "Premium Amount", type: "number" },
        { key: "payable_cycle", label: "Payable Cycle", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "On Maturity"] }
      ],
      [
        { key: "start_date", label: "Start Date", type: "date" },
        { key: "maturity_date", label: "Maturity Date", type: "date" },
        { key: "payment_date", label: "Payment Date", type: "date" },
        { key: "payment_amount_yearly", label: "Payment Amount (Yearly)", type: "number", disabled: true, calculated: true }
      ]
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    rows: [
      [
        { key: "market_value", label: "Market Value", type: "number" },
        { key: "sip_amount", label: "SIP Amount", type: "number" }
      ]
    ]
  },
  { 
    value: "cash", 
    label: "Cash In Hand", 
    icon: Wallet,
    rows: [
      [
        { key: "bank_balance", label: "Bank Balance", type: "number" }
      ]
    ]
  },
  { 
    value: "gold", 
    label: "Gold", 
    icon: DollarSign,
    rows: [
      [
        { key: "market_value", label: "Market Value", type: "number" }
      ]
    ]
  },
  { 
    value: "shares_pms", 
    label: "Shares / PMS", 
    icon: TrendingUp,
    rows: [
      [
        { key: "market_value", label: "Market Value", type: "number" }
      ]
    ]
  },
  { 
    value: "other", 
    label: "Other Income", 
    icon: DollarSign,
    rows: [
      [
        { key: "description", label: "Description", type: "text" },
        { key: "market_value", label: "Market Value", type: "number" }
      ]
    ]
  }
];

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [incomeItems, setIncomeItems] = useState({});

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
    const expanded = {};
    INCOME_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0) expanded[cat.value] = true;
    });
    setExpandedCategories(expanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, existingIncomes.length]);

  const toggleCategory = (category) => {
    const isCurrentlyExpanded = expandedCategories[category];
    const items = incomeItems[category] || [];
    
    // If expanding and no items exist, auto-add one
    if (!isCurrentlyExpanded && items.length === 0) {
      addIncomeItem(category);
    } else {
      setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
    }
  };
  const hideCategory = (category) => { setHiddenCategories(prev => [...prev, category]); setExpandedCategories(prev => ({ ...prev, [category]: false })); };
  const showCategory = (category) => setHiddenCategories(prev => prev.filter(c => c !== category));

  const addIncomeItem = (category) => {
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

  // Helper function to get member's birth year
  const getMemberBirthYear = (memberId) => {
    const member = members.find(m => m.id === memberId);
    if (member?.date_of_birth) {
      const dob = new Date(member.date_of_birth);
      return dob.getFullYear();
    }
    return null;
  };

  // Helper function to calculate year to mature from maturity date
  const calculateYearToMature = (maturityDate) => {
    if (!maturityDate) return null;
    const maturity = new Date(maturityDate);
    const now = new Date();
    const years = maturity.getFullYear() - now.getFullYear();
    return years > 0 ? years : 0;
  };

  // Helper function to calculate yearly payment amount
  const calculatePaymentYearly = (principal, interestRate, payableCycle) => {
    if (!principal || !interestRate) return null;
    const yearlyInterest = (parseFloat(principal) * parseFloat(interestRate)) / 100;
    return Math.round(yearlyInterest);
  };

  // Helper function to calculate pension yearly amount
  const calculatePensionYearly = (amount, payableType) => {
    if (!amount) return null;
    const multipliers = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1 };
    return Math.round(parseFloat(amount) * (multipliers[payableType] || 12));
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
            // Recalculate year_of_retirement when member changes
            if (newDetails.retirement_age) {
              const birthYear = getMemberBirthYear(value);
              if (birthYear) {
                newDetails.year_of_retirement = birthYear + parseInt(newDetails.retirement_age);
              }
            }
          } else {
            newDetails[field] = value;
            
            // Auto-calculate Net Income (Yearly) = Monthly × 12
            if (field === "net_income_monthly") {
              const monthly = parseFloat(value) || 0;
              newDetails.net_income_yearly = monthly * 12;
            }
            
            // Auto-calculate Year of Retirement = Birth Year + Retirement Age
            if (field === "retirement_age") {
              const birthYear = getMemberBirthYear(item.memberId);
              if (birthYear && value) {
                newDetails.year_of_retirement = birthYear + parseInt(value);
              }
            }
            
            // Auto-calculate Annual Income for Rental = Monthly × 12
            if (field === "income_per_month") {
              const monthly = parseFloat(value) || 0;
              newDetails.annual_income = monthly * 12;
            }
            
            // Auto-calculate Year to Mature for PPF/EPF/Gratuity
            if (field === "maturity_date" && ["ppf", "epf", "gratuity"].includes(category)) {
              newDetails.year_to_mature = calculateYearToMature(value);
            }
            
            // Auto-calculate Payment Amount (Yearly) for FD/Bond/Insurance
            if (["fd", "bond", "insurance_income"].includes(category)) {
              if (field === "principal_amount" || field === "interest_rate" || field === "payable_cycle") {
                const principal = field === "principal_amount" ? value : newDetails.principal_amount;
                const rate = field === "interest_rate" ? value : newDetails.interest_rate;
                newDetails.payment_amount_yearly = calculatePaymentYearly(principal, rate);
              }
            }
            
            // Auto-calculate Amount (Yearly) for Pension
            if (category === "pension") {
              if (field === "amount" || field === "payable_type") {
                const amount = field === "amount" ? value : newDetails.amount;
                const payableType = field === "payable_type" ? value : (newDetails.payable_type || "Monthly");
                newDetails.amount_yearly = calculatePensionYearly(amount, payableType);
              }
            }
            
            // Auto-calculate Principal Amount (Total) for RD/PIS
            if (category === "rd_pis") {
              if (field === "principal_amount_monthly" || field === "num_installments") {
                const monthly = field === "principal_amount_monthly" ? value : newDetails.principal_amount_monthly;
                const installments = field === "num_installments" ? value : newDetails.num_installments;
                if (monthly && installments) {
                  newDetails.principal_amount = parseFloat(monthly) * parseInt(installments);
                }
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
      toast.success("Saved");
      
      // Collapse current category and open next one with auto-add
      const visibleCategories = INCOME_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
      const currentIndex = visibleCategories.findIndex(c => c.value === category);
      const nextCategory = visibleCategories[currentIndex + 1];
      
      // Close current category
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      
      // If next category exists and has no items, auto-add an entry
      if (nextCategory) {
        const nextItems = incomeItems[nextCategory.value] || [];
        if (nextItems.length === 0) {
          // Add new item to next category
          setIncomeItems(prev => ({
            ...prev,
            [nextCategory.value]: [...(prev[nextCategory.value] || []), {
              id: `new_${Date.now()}`,
              memberId: members[0]?.id || "",
              details: {},
              isNew: true,
              isModified: false
            }]
          }));
        }
        setExpandedCategories(prev => ({ ...prev, [nextCategory.value]: true }));
      }
      
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  const renderField = (category, itemId, field, value) => {
    if (field.type === "select") {
      return (
        <Select value={value || ""} onValueChange={(v) => updateIncomeItem(category, itemId, field.key, v)} disabled={isReadOnly || field.disabled}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {field.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={field.type}
        value={value || ""}
        onChange={(e) => updateIncomeItem(category, itemId, field.key, e.target.value)}
        placeholder={field.type === "number" ? "0" : ""}
        className="h-8 text-xs"
        disabled={isReadOnly || field.disabled}
      />
    );
  };

  const getCategoryItemCount = (category) => incomeItems[category]?.length || 0;

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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500 px-1 mb-1">
        <span>Enter details for categories</span>
        <Badge variant="outline" className="text-xs">{members.length} member{members.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="space-y-1.5">
        {visibleCategories.map(category => {
          const Icon = category.icon;
          const itemCount = getCategoryItemCount(category.value);
          const isExpanded = expandedCategories[category.value];
          const items = incomeItems[category.value] || [];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
          
          return (
            <Card key={category.value} className={`overflow-hidden ${itemCount > 0 ? 'border-blue-200 bg-blue-50/30' : ''}`}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2 px-3 cursor-pointer hover:bg-gray-50/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                        <Icon className={`h-4 w-4 ${itemCount > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium">{category.label}</span>
                        {itemCount > 0 && <Badge className="bg-blue-100 text-blue-700 text-xs h-5 px-1.5">{itemCount}</Badge>}
                        {hasUnsavedChanges && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs h-5 px-1.5">•</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); hideCategory(category.value); }} disabled={isReadOnly || itemCount > 0} className="h-7 px-2 text-xs text-gray-400 hover:text-gray-600">
                          <EyeOff className="h-3 w-3 mr-1" />Skip
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); addIncomeItem(category.value); }} disabled={isReadOnly} className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                          <Plus className="h-3 w-3 mr-1" />Add
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-2 px-3">
                    {items.length === 0 ? (
                      <div className="text-center py-3 text-gray-400 text-xs border-t">No entries. Click "Add" to create one.</div>
                    ) : (
                      <div className="space-y-2 border-t pt-2">
                        {items.map((item) => (
                          <div key={item.id} className={`p-2 rounded border ${item.isNew ? 'bg-green-50/50 border-green-200' : item.isModified ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-gray-100'}`}>
                            {/* All fields inline including member */}
                            <div className="space-y-2">
                              {category.rows.map((row, rowIndex) => (
                                <div key={rowIndex} className="flex items-end gap-2 flex-wrap">
                                  {/* Add member dropdown only on first row */}
                                  {rowIndex === 0 && (
                                    <div className="w-32">
                                      <Label className="text-[10px] text-gray-400 mb-0.5 block">Member</Label>
                                      <Select value={item.memberId || ""} onValueChange={(v) => updateIncomeItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                        <SelectContent>
                                          {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                  {row.map(field => (
                                    <div key={field.key} className="flex-1 min-w-[90px]">
                                      <Label className="text-[10px] text-gray-400 mb-0.5 block">{field.label}</Label>
                                      {renderField(category.value, item.id, field, item.details[field.key])}
                                    </div>
                                  ))}
                                  {/* Add delete button only on first row */}
                                  {rowIndex === 0 && (
                                    <Button variant="ghost" size="icon" onClick={() => removeIncomeItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 shrink-0">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-1">
                          <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-3 text-xs" size="sm">
                            <Save className="h-3 w-3 mr-1" />{savingCategory === category.value ? "..." : "Save"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {hiddenCategoryList.length > 0 && (
        <div className="mt-4 pt-3 border-t border-dashed">
          <div className="text-xs text-gray-400 mb-2 px-1">Skipped (click to restore)</div>
          <div className="flex flex-wrap gap-1.5">
            {hiddenCategoryList.map(category => {
              const Icon = category.icon;
              return (
                <button key={category.value} onClick={() => showCategory(category.value)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Eye className="h-3 w-3" /><Icon className="h-3 w-3" />{category.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
