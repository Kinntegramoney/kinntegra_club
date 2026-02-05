import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, 
  DollarSign, Plus, Trash2, ChevronDown, ChevronRight, User
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Income categories with their fields
const INCOME_CATEGORIES = [
  { 
    value: "salary", 
    label: "Salary Income", 
    icon: Briefcase,
    fields: [
      { key: "net_income_monthly", label: "Net Monthly Income", type: "number" },
      { key: "increment_month", label: "Increment Month", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
      { key: "avg_growth_rate", label: "Avg Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" }
    ]
  },
  { 
    value: "business", 
    label: "Business Income", 
    icon: Building,
    fields: [
      { key: "net_income_yearly", label: "Net Yearly Income", type: "number" },
      { key: "avg_growth_rate", label: "Avg Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" }
    ]
  },
  { 
    value: "rental", 
    label: "Rental Income", 
    icon: Building,
    fields: [
      { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Land"] },
      { key: "purchase_value", label: "Purchase Value", type: "number" },
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "rental_monthly", label: "Monthly Rent", type: "number" },
      { key: "rental_increment_percent", label: "Rental Increment (%)", type: "number" }
    ]
  },
  { 
    value: "ppf", 
    label: "PPF", 
    icon: PiggyBank,
    fields: [
      { key: "amount", label: "Current Value", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "epf", 
    label: "EPF", 
    icon: PiggyBank,
    fields: [
      { key: "amount", label: "Current Value", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    fields: [
      { key: "amount", label: "Expected Amount", type: "number" },
      { key: "maturity_date", label: "Expected Date", type: "date" }
    ]
  },
  { 
    value: "fd", 
    label: "Fixed Deposit", 
    icon: Landmark,
    fields: [
      { key: "principal_amount", label: "Principal Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "rd_pis", 
    label: "RD / PIS", 
    icon: Landmark,
    fields: [
      { key: "monthly_contribution", label: "Monthly Contribution", type: "number" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" }
    ]
  },
  { 
    value: "pension", 
    label: "Pension Income", 
    icon: Wallet,
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "payable_cycle", label: "Payable Cycle", type: "select", options: ["Monthly", "Quarterly", "Yearly"] },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" }
    ]
  },
  { 
    value: "bond", 
    label: "Bond", 
    icon: Landmark,
    fields: [
      { key: "principal_amount", label: "Principal Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "insurance", 
    label: "Insurance", 
    icon: Landmark,
    fields: [
      { key: "principal_amount", label: "Sum Assured", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    fields: [
      { key: "market_value", label: "Current Market Value", type: "number" },
      { key: "sip_amount", label: "SIP Amount (if any)", type: "number" }
    ]
  },
  { 
    value: "cash", 
    label: "Cash in Hand", 
    icon: Wallet,
    fields: [
      { key: "market_value", label: "Amount", type: "number" }
    ]
  },
  { 
    value: "gold", 
    label: "Gold", 
    icon: Wallet,
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
  },
  { 
    value: "other", 
    label: "Other Income", 
    icon: DollarSign,
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "amount", label: "Amount", type: "number" }
    ]
  }
];

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  // incomeItems: { [category]: [{ id, memberId, details: {...}, isNew?, isModified? }] }
  const [incomeItems, setIncomeItems] = useState({});

  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];

  // Initialize income items from existing data
  useEffect(() => {
    const itemsByCategory = {};
    
    INCOME_CATEGORIES.forEach(cat => {
      itemsByCategory[cat.value] = [];
    });

    // Load existing incomes
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
    
    // Auto-expand categories that have items
    const expanded = {};
    INCOME_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0) {
        expanded[cat.value] = true;
      }
    });
    setExpandedCategories(expanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, existingIncomes.length]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const addIncomeItem = (category) => {
    const newItem = {
      id: `new_${Date.now()}`,
      memberId: members[0]?.id || "",
      details: {},
      isNew: true,
      isModified: false
    };
    
    setIncomeItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), newItem]
    }));
    
    // Auto-expand the category
    setExpandedCategories(prev => ({ ...prev, [category]: true }));
  };

  const removeIncomeItem = async (category, itemId, isNew) => {
    if (!isNew) {
      // Delete from backend
      try {
        const token = localStorage.getItem("token");
        await axios.delete(
          `${API}/data-gathering/family/${family.id}/income/${itemId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Income entry deleted");
        onRefresh();
      } catch (error) {
        toast.error("Failed to delete income entry");
        return;
      }
    }
    
    setIncomeItems(prev => ({
      ...prev,
      [category]: prev[category].filter(item => item.id !== itemId)
    }));
  };

  const updateIncomeItem = (category, itemId, field, value) => {
    setIncomeItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          if (field === "memberId") {
            return { ...item, memberId: value, isModified: !item.isNew };
          } else {
            return {
              ...item,
              details: { ...item.details, [field]: value },
              isModified: !item.isNew
            };
          }
        }
        return item;
      })
    }));
  };

  const saveCategory = async (category) => {
    const items = incomeItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    
    if (itemsToSave.length === 0) {
      toast.info("No changes to save");
      return;
    }

    // Validate
    for (const item of itemsToSave) {
      if (!item.memberId) {
        toast.error("Please select a family member for all entries");
        return;
      }
      // Check if at least one detail field has value
      const hasData = Object.values(item.details).some(v => v !== "" && v !== null && v !== undefined);
      if (!hasData) {
        toast.error("Please fill in at least one field for each entry");
        return;
      }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      
      for (const item of itemsToSave) {
        const payload = {
          family_id: family.id,
          category: category,
          member_ids: [item.memberId],
          details: item.details
        };

        if (item.isNew) {
          await axios.post(
            `${API}/data-gathering/family/${family.id}/income`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } else {
          await axios.put(
            `${API}/data-gathering/family/${family.id}/income/${item.id}`,
            payload,
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
      }
      
      toast.success(`${INCOME_CATEGORIES.find(c => c.value === category)?.label} saved successfully`);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save");
    } finally {
      setSavingCategory(null);
    }
  };

  const renderField = (category, itemId, field, value) => {
    if (field.type === "select") {
      return (
        <Select 
          value={value || ""} 
          onValueChange={(v) => updateIncomeItem(category, itemId, field.key, v)}
          disabled={isReadOnly}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    return (
      <Input
        type={field.type}
        value={value || ""}
        onChange={(e) => updateIncomeItem(category, itemId, field.key, e.target.value)}
        placeholder={field.type === "number" ? "0" : "Enter..."}
        className="h-9"
        disabled={isReadOnly}
      />
    );
  };

  const getCategoryItemCount = (category) => {
    return incomeItems[category]?.length || 0;
  };

  const getMemberName = (memberId) => {
    const member = members.find(m => m.id === memberId);
    return member?.name || "Unknown";
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <User className="h-8 w-8 text-amber-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-700 mb-2">No Family Members</h3>
        <p className="text-gray-500 text-center max-w-md">
          Please add family members in the Introduction tab first before entering income details.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-600">
          Add multiple income sources for each category. Each entry can be assigned to a specific family member.
        </p>
        <Badge variant="outline" className="text-gray-600">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Income Categories - Collapsible Accordions */}
      <div className="space-y-3">
        {INCOME_CATEGORIES.map(category => {
          const Icon = category.icon;
          const itemCount = getCategoryItemCount(category.value);
          const isExpanded = expandedCategories[category.value];
          const items = incomeItems[category.value] || [];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
          
          return (
            <Card key={category.value} className={`overflow-hidden ${itemCount > 0 ? 'ring-1 ring-blue-200' : ''}`}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-3 px-4 cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <Icon className={`h-5 w-5 ${itemCount > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
                        <CardTitle className="text-sm font-medium">{category.label}</CardTitle>
                        {itemCount > 0 && (
                          <Badge className="bg-blue-100 text-blue-700 text-xs">
                            {itemCount} {itemCount === 1 ? 'entry' : 'entries'}
                          </Badge>
                        )}
                        {hasUnsavedChanges && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                            Unsaved
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          addIncomeItem(category.value);
                        }}
                        disabled={isReadOnly}
                        className="gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-4 px-4">
                    {items.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 text-sm border-t">
                        No {category.label.toLowerCase()} entries yet. Click "Add" to create one.
                      </div>
                    ) : (
                      <div className="space-y-4 border-t pt-4">
                        {items.map((item, index) => (
                          <div 
                            key={item.id} 
                            className={`p-4 rounded-lg border ${item.isNew ? 'bg-green-50/50 border-green-200' : item.isModified ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50/50 border-gray-200'}`}
                          >
                            {/* All fields in one row including member dropdown */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                              {/* Member Dropdown - First Field */}
                              <div>
                                <Label className="text-xs text-gray-500 mb-1 block">Family Member</Label>
                                <Select 
                                  value={item.memberId || ""} 
                                  onValueChange={(v) => updateIncomeItem(category.value, item.id, "memberId", v)}
                                  disabled={isReadOnly}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Select Member" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {members.map(member => (
                                      <SelectItem key={member.id} value={member.id}>
                                        {member.name}{member.is_primary ? ' (Primary)' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {/* Category-specific Fields */}
                              {category.fields.map(field => (
                                <div key={field.key}>
                                  <Label className="text-xs text-gray-500 mb-1 block">{field.label}</Label>
                                  {renderField(category.value, item.id, field, item.details[field.key])}
                                </div>
                              ))}
                              
                              {/* Delete Button */}
                              <div className="flex items-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeIncomeItem(category.value, item.id, item.isNew)}
                                  disabled={isReadOnly}
                                  className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 w-9"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* Save button for this category */}
                        <div className="flex justify-end pt-2">
                          <Button
                            onClick={() => saveCategory(category.value)}
                            disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges}
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                            size="sm"
                          >
                            <Save className="h-4 w-4" />
                            {savingCategory === category.value ? "Saving..." : `Save ${category.label}`}
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
    </div>
  );
}
