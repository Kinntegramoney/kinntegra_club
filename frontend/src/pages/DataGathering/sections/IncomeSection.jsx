import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, 
  DollarSign, Plus, Trash2, ChevronDown, ChevronRight, User, SkipForward, Circle
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
    fields: [
      { key: "net_income_monthly", label: "Net Income (Monthly)", type: "number" },
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number", readOnly: true, calculated: true },
      { key: "increment_month", label: "Increment Month", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
      { key: "avg_growth_rate", label: "Average Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" },
      { key: "year_of_retirement", label: "Year of Retirement", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "business", 
    label: "Business Income", 
    icon: Building,
    fields: [
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number" },
      { key: "avg_growth_rate", label: "Average Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" }
    ]
  },
  { 
    value: "rental", 
    label: "Rental Income", 
    icon: Building,
    fields: [
      { key: "property_details", label: "Property Details", type: "text" },
      { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Land"] },
      { key: "income_per_month", label: "Income/Month", type: "number" },
      { key: "rental_increment_percent", label: "Increment %", type: "number" }
    ]
  },
  { 
    value: "ppf", 
    label: "PPF (Public Provident Fund)", 
    icon: PiggyBank,
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "epf", 
    label: "EPF (Employee Provident Fund)", 
    icon: PiggyBank,
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "fd", 
    label: "FD (Fixed Deposit)", 
    icon: Landmark,
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Principal Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "rd_pis", 
    label: "RD / PIS", 
    icon: Landmark,
    fields: [
      { key: "principal_amount_monthly", label: "Monthly Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "pension", 
    label: "Pension Income", 
    icon: Wallet,
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "payable_type", label: "Payable Type", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"] },
      { key: "start_date", label: "Start Date", type: "date" }
    ]
  },
  { 
    value: "bond", 
    label: "Bond", 
    icon: Landmark,
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Principal Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "insurance_income", 
    label: "Insurance", 
    icon: Landmark,
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Premium Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "sip_amount", label: "SIP Amount", type: "number" }
    ]
  },
  { 
    value: "cash", 
    label: "Cash In Hand", 
    icon: Wallet,
    fields: [
      { key: "bank_balance", label: "Bank Balance", type: "number" }
    ]
  },
  { 
    value: "gold", 
    label: "Gold", 
    icon: DollarSign,
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "shares_pms", 
    label: "Shares / PMS", 
    icon: TrendingUp,
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  }
];

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [incomeItems, setIncomeItems] = useState({});

  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];
  const [initialLoadDone, setInitialLoadDone] = useState(false);

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
    
    // Only expand categories on initial load, not on refresh
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
      // Auto-add first entry
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
    
    const updatedItems = incomeItems[category].filter(item => item.id !== itemId);
    setIncomeItems(prev => ({ ...prev, [category]: updatedItems }));
    
    // If no items left, remove category from added list
    if (updatedItems.length === 0) {
      setAddedCategories(prev => prev.filter(c => c !== category));
    }
  };

  // Helper function to get member's birth year
  const getMemberBirthYear = (memberId) => {
    const member = members.find(m => m.id === memberId);
    if (member?.date_of_birth) {
      return new Date(member.date_of_birth).getFullYear();
    }
    return null;
  };

  // Calculate Year of Retirement = Birth Year + Retirement Age
  const calculateYearOfRetirement = (memberId, retirementAge) => {
    const birthYear = getMemberBirthYear(memberId);
    if (birthYear && retirementAge) {
      return birthYear + parseInt(retirementAge);
    }
    return null;
  };

  // Calculate Net Income Yearly = Monthly × 12
  const calculateNetIncomeYearly = (monthlyIncome) => {
    if (monthlyIncome) {
      return parseFloat(monthlyIncome) * 12;
    }
    return null;
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
            // Recalculate Year of Retirement when member changes
            if (category === "salary" && newDetails.retirement_age) {
              newDetails.year_of_retirement = calculateYearOfRetirement(value, newDetails.retirement_age);
            }
          } else {
            newDetails[field] = value;
            
            // Auto-calculate Net Income (Yearly) when Monthly changes
            if (field === "net_income_monthly" && category === "salary") {
              newDetails.net_income_yearly = calculateNetIncomeYearly(value);
            }
            
            // Auto-calculate Year of Retirement when Retirement Age changes
            if (field === "retirement_age" && category === "salary") {
              newDetails.year_of_retirement = calculateYearOfRetirement(item.memberId, value);
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
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
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

  // Categories not yet added
  const availableCategories = INCOME_CATEGORIES.filter(c => !addedCategories.includes(c.value));
  // Categories that have been added
  const activeCategories = INCOME_CATEGORIES.filter(c => addedCategories.includes(c.value));

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-600">Enter details for categories</p>
        <Badge variant="outline" className="text-sm">{members.length} members</Badge>
      </div>

      {/* Available Categories - Click to Add */}
      {availableCategories.length > 0 && (
        <div className="mb-6">
          <p className="text-gray-400 text-sm mb-3">Click To add</p>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map(category => {
              const Icon = category.icon;
              return (
                <button
                  key={category.value}
                  onClick={() => addCategory(category.value)}
                  disabled={isReadOnly}
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-full text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <Icon className="h-3.5 w-3.5" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Added Categories */}
      <div className="space-y-4">
        {activeCategories.map(category => {
          const Icon = category.icon;
          const items = incomeItems[category.value] || [];
          const isExpanded = expandedCategories[category.value];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);

          return (
            <Collapsible 
              key={category.value} 
              open={isExpanded} 
              onOpenChange={() => toggleCategory(category.value)}
            >
              <div className={`border rounded-lg ${hasUnsavedChanges ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white'}`}>
                {/* Category Header */}
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <button className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <Icon className="h-5 w-5 text-gray-600" />
                      <span className="font-medium text-gray-800">{category.label}</span>
                      <Badge className="bg-blue-100 text-blue-700 text-xs">{items.length}</Badge>
                      {hasUnsavedChanges && <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />}
                    </div>
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => skipCategory(category.value)}
                        disabled={isReadOnly}
                        className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Skip
                      </button>
                      <button
                        onClick={() => addIncomeItem(category.value)}
                        disabled={isReadOnly}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </CollapsibleTrigger>

                {/* Category Content */}
                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {items.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        No entries. Click "+ Add" to create one.
                      </div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {items.map((item, index) => (
                          <div 
                            key={item.id} 
                            className={`p-4 rounded-lg ${item.isNew ? 'bg-green-50 border border-green-200' : item.isModified ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}
                          >
                            {/* Entry Fields - All in one row */}
                            <div className="flex items-end gap-3 flex-wrap">
                              {/* Member Dropdown */}
                              <div className="w-36">
                                <Label className="text-xs text-gray-500 mb-1 block">Member</Label>
                                <Select 
                                  value={item.memberId || ""} 
                                  onValueChange={(v) => updateIncomeItem(category.value, item.id, "memberId", v)} 
                                  disabled={isReadOnly}
                                >
                                  <SelectTrigger className="h-10 text-sm bg-white">
                                    <SelectValue placeholder="Select" />
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

                              {/* Dynamic Fields */}
                              {category.fields.map(field => (
                                <div key={field.key} className={`flex-1 min-w-[140px] ${field.readOnly ? 'min-w-[120px]' : ''}`}>
                                  <Label className={`text-xs mb-1 block ${field.calculated ? 'text-blue-600' : 'text-gray-500'}`}>
                                    {field.label}
                                    {field.calculated && <span className="ml-1 text-[10px]">(Auto)</span>}
                                  </Label>
                                  {field.type === "select" ? (
                                    <Select 
                                      value={item.details[field.key] || ""} 
                                      onValueChange={(v) => updateIncomeItem(category.value, item.id, field.key, v)} 
                                      disabled={isReadOnly || field.readOnly}
                                    >
                                      <SelectTrigger className="h-10 text-sm bg-white">
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {field.options.map(opt => (
                                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : field.readOnly ? (
                                    <div className="h-10 px-3 flex items-center text-sm bg-gray-100 border border-gray-200 rounded-md text-gray-700 font-medium">
                                      {field.key === "net_income_yearly" && item.details[field.key] 
                                        ? `₹${parseFloat(item.details[field.key]).toLocaleString('en-IN')}`
                                        : item.details[field.key] || "-"
                                      }
                                    </div>
                                  ) : (
                                    <Input
                                      type={field.type}
                                      value={item.details[field.key] || ""}
                                      onChange={(e) => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                      placeholder={field.type === "number" ? "0" : ""}
                                      className="h-10 text-sm bg-white"
                                      disabled={isReadOnly}
                                    />
                                  )}
                                </div>
                              ))}

                              {/* Delete Button */}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => removeIncomeItem(category.value, item.id, item.isNew)} 
                                disabled={isReadOnly} 
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 h-10 w-10 shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}

                        {/* Save Button */}
                        <div className="flex justify-end pt-2">
                          <Button 
                            onClick={() => saveCategory(category.value)} 
                            disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} 
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            size="sm"
                          >
                            <Save className="h-4 w-4 mr-1" />
                            {savingCategory === category.value ? "Saving..." : "Save"}
                          </Button>
                        </div>
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
      {activeCategories.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p>Click on a category above to start adding income details</p>
        </div>
      )}
    </div>
  );
}
