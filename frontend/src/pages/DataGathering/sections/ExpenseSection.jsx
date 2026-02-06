import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, Plus, Trash2, ChevronDown, ChevronRight, User, EyeOff, Eye,
  Receipt, Home, Car, Heart, Zap, Phone, ShoppingBag, Utensils, GraduationCap, Users, CreditCard, Shirt, Tv, Scissors
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPENSE_CATEGORIES = [
  { value: "food_grocery", label: "Food & Grocery", icon: Utensils },
  { value: "house_rent", label: "House Rent/Maintenance/Repair", icon: Home },
  { value: "conveyance", label: "Conveyance, Fuel And Maintenance", icon: Car },
  { value: "healthcare", label: "Medicines / Doctor / Healthcare", icon: Heart },
  { value: "utilities", label: "Electricity / Water / Labour / AMC", icon: Zap },
  { value: "mobile", label: "Mobile", icon: Phone },
  { value: "gasline_internet", label: "GasLine / Telephone / Internet / Cable", icon: Tv },
  { value: "clothing", label: "Cloths and Accessories", icon: Shirt },
  { value: "shopping", label: "Shopping, Gifts, Whitegoods, Gadgets", icon: ShoppingBag },
  { value: "entertainment", label: "Dining / Movies / Sports", icon: Utensils },
  { value: "personal_care", label: "Personal Care / Others", icon: Scissors },
  { value: "mediclaim", label: "Mediclaim / PA / CI", icon: Heart },
  { value: "children_education", label: "Children's Schooling/College Expenses", icon: GraduationCap },
  { value: "family_support", label: "Contribution To Parents/Siblings", icon: Users },
  { value: "motor_insurance", label: "Motor Insurance", icon: Car },
  { value: "life_insurance", label: "Life Insurance - Term Plan", icon: Heart },
  { value: "emi", label: "EMI", icon: CreditCard }
];

// Generate year options from 2020 to 2080
const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());

export default function ExpenseSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [expenseItems, setExpenseItems] = useState({});

  const members = family?.members || [];
  const existingExpenses = family?.expense_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    EXPENSE_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingExpenses.forEach(exp => {
      const category = exp.expense_type;
      if (itemsByCategory[category]) {
        itemsByCategory[category].push({
          id: exp.id,
          memberId: exp.member_ids?.[0] || "",
          details: {
            annual_amount: exp.annual_amount,
            upto_year: exp.upto_year,
            inflation_percent: exp.inflation_percent,
            consider_post_retirement: exp.consider_post_retirement ? "Yes" : "No",
            percent_of_current: exp.percent_of_current || 100,
            applicable_to: exp.applicable_to || (exp.applies_to_self && exp.applies_to_spouse ? "Both" : exp.applies_to_spouse ? "Spouse" : "Self")
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setExpenseItems(itemsByCategory);
    const expanded = {};
    EXPENSE_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0) expanded[cat.value] = true;
    });
    setExpandedCategories(expanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, existingExpenses.length]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };
  const hideCategory = (category) => { setHiddenCategories(prev => [...prev, category]); setExpandedCategories(prev => ({ ...prev, [category]: false })); };
  const showCategory = (category) => setHiddenCategories(prev => prev.filter(c => c !== category));

  const addExpenseItem = (category) => {
    const currentYear = new Date().getFullYear();
    setExpenseItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: { 
          annual_amount: "", 
          upto_year: (currentYear + 30).toString(), 
          inflation_percent: 6,
          consider_post_retirement: "No",
          percent_of_current: 100,
          applicable_to: "Self"
        },
        isNew: true,
        isModified: false
      }]
    }));
    setExpandedCategories(prev => ({ ...prev, [category]: true }));
  };

  const removeExpenseItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/expense/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed to delete"); return; }
    }
    setExpenseItems(prev => ({ ...prev, [category]: prev[category].filter(item => item.id !== itemId) }));
  };

  const updateExpenseItem = (category, itemId, field, value) => {
    setExpenseItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          if (field === "memberId") return { ...item, memberId: value, isModified: !item.isNew };
          return { ...item, details: { ...item.details, [field]: value }, isModified: !item.isNew };
        }
        return item;
      })
    }));
  };

  const saveCategory = async (category) => {
    const items = expenseItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    if (itemsToSave.length === 0) { toast.info("No changes"); return; }

    for (const item of itemsToSave) {
      if (!item.memberId) { toast.error("Select a member"); return; }
      if (!item.details.annual_amount) { toast.error("Enter annual amount"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const payload = {
          family_id: family.id, 
          member_ids: [item.memberId], 
          expense_type: category,
          annual_amount: parseFloat(item.details.annual_amount),
          upto_year: parseInt(item.details.upto_year),
          inflation_percent: parseFloat(item.details.inflation_percent) || 6,
          consider_post_retirement: item.details.consider_post_retirement === "Yes",
          percent_of_current: parseFloat(item.details.percent_of_current) || 100,
          applicable_to: item.details.applicable_to || "Self",
          applies_to_self: item.details.applicable_to === "Self" || item.details.applicable_to === "Both",
          applies_to_spouse: item.details.applicable_to === "Spouse" || item.details.applicable_to === "Both"
        };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/expense`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/expense/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        }
      }
      toast.success("Saved");
      
      // Collapse current category and open next one with auto-add
      const visibleCategories = EXPENSE_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
      const currentIndex = visibleCategories.findIndex(c => c.value === category);
      const nextCategory = visibleCategories[currentIndex + 1];
      
      // Close current category
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      
      // If next category exists and has no items, auto-add an entry
      if (nextCategory) {
        const nextItems = expenseItems[nextCategory.value] || [];
        if (nextItems.length === 0) {
          const currentYear = new Date().getFullYear();
          setExpenseItems(prev => ({
            ...prev,
            [nextCategory.value]: [...(prev[nextCategory.value] || []), {
              id: `new_${Date.now()}`,
              memberId: members[0]?.id || "",
              details: { 
                annual_amount: "", 
                upto_year: (currentYear + 30).toString(), 
                inflation_percent: 6,
                consider_post_retirement: "No",
                percent_of_current: 100,
                applicable_to: "Self"
              },
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

  const getCategoryItemCount = (category) => expenseItems[category]?.length || 0;
  const totalAnnual = Object.values(expenseItems).flat().reduce((sum, e) => sum + (parseFloat(e.details?.annual_amount) || 0), 0);

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-orange-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const visibleCategories = EXPENSE_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
  const hiddenCategoryList = EXPENSE_CATEGORIES.filter(c => hiddenCategories.includes(c.value));

  return (
    <div className="space-y-2">
      {totalAnnual > 0 && (
        <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-orange-600">Total Annual Expenses</span>
          <span className="font-semibold text-orange-700">₹{totalAnnual.toLocaleString('en-IN')}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 px-1 mb-1">
        <span>Enter details for categories</span>
        <Badge variant="outline" className="text-xs">{members.length} member{members.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="space-y-1.5">
        {visibleCategories.map(category => {
          const Icon = category.icon;
          const itemCount = getCategoryItemCount(category.value);
          const isExpanded = expandedCategories[category.value];
          const items = expenseItems[category.value] || [];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
          
          return (
            <Card key={category.value} className={`overflow-hidden ${itemCount > 0 ? 'border-orange-200 bg-orange-50/30' : ''}`}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2 px-3 cursor-pointer hover:bg-gray-50/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                        <Icon className={`h-4 w-4 ${itemCount > 0 ? 'text-orange-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium">{category.label}</span>
                        {itemCount > 0 && <Badge className="bg-orange-100 text-orange-700 text-xs h-5 px-1.5">{itemCount}</Badge>}
                        {hasUnsavedChanges && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs h-5 px-1.5">•</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); hideCategory(category.value); }} disabled={isReadOnly || itemCount > 0} className="h-7 px-2 text-xs text-gray-400 hover:text-gray-600">
                          <EyeOff className="h-3 w-3 mr-1" />Skip
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); addExpenseItem(category.value); }} disabled={isReadOnly} className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50">
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
                      <div className="space-y-3 border-t pt-2">
                        {items.map((item) => (
                          <div key={item.id} className={`p-3 rounded border ${item.isNew ? 'bg-green-50/50 border-green-200' : item.isModified ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-gray-100'}`}>
                            {/* Fields - Row 1 */}
                            <div className="flex items-end gap-2 flex-wrap">
                              {/* Member Dropdown */}
                              <div className="w-32">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">Member</Label>
                                <Select value={item.memberId || ""} onValueChange={(v) => updateExpenseItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex-1 min-w-[100px]">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">Annual Amount</Label>
                                <Input
                                  type="number"
                                  value={item.details.annual_amount || ""}
                                  onChange={(e) => updateExpenseItem(category.value, item.id, "annual_amount", e.target.value)}
                                  placeholder="0"
                                  className="h-8 text-xs"
                                  disabled={isReadOnly}
                                />
                              </div>
                              <div className="w-28">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">Upto Year</Label>
                                <Select value={item.details.upto_year?.toString() || ""} onValueChange={(v) => updateExpenseItem(category.value, item.id, "upto_year", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {YEAR_OPTIONS.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="w-20">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">Inflation %</Label>
                                <Input
                                  type="number"
                                  value={item.details.inflation_percent || ""}
                                  onChange={(e) => updateExpenseItem(category.value, item.id, "inflation_percent", e.target.value)}
                                  placeholder="6"
                                  className="h-8 text-xs"
                                  disabled={isReadOnly}
                                />
                              </div>
                              <div className="w-32">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">Post Retirement</Label>
                                <Select value={item.details.consider_post_retirement || "No"} onValueChange={(v) => updateExpenseItem(category.value, item.id, "consider_post_retirement", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Yes">Yes</SelectItem>
                                    <SelectItem value="No">No</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="w-24">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">Applicable To</Label>
                                <Select value={item.details.applicable_to || "Self"} onValueChange={(v) => updateExpenseItem(category.value, item.id, "applicable_to", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Self">Self</SelectItem>
                                    <SelectItem value="Spouse">Spouse</SelectItem>
                                    <SelectItem value="Both">Both</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="w-20">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">% of Current</Label>
                                <Input
                                  type="number"
                                  value={item.details.percent_of_current || ""}
                                  onChange={(e) => updateExpenseItem(category.value, item.id, "percent_of_current", e.target.value)}
                                  placeholder="100"
                                  className="h-8 text-xs"
                                  disabled={isReadOnly}
                                />
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => removeExpenseItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-1">
                          <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} className="bg-orange-600 hover:bg-orange-700 text-white h-7 px-3 text-xs" size="sm">
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
                <button key={category.value} onClick={() => showCategory(category.value)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors">
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
