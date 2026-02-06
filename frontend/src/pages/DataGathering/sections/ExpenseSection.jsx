import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, Plus, Trash2, ChevronDown, ChevronRight, User, SkipForward, Circle,
  Home, Car, Heart, Zap, Phone, ShoppingBag, Utensils, GraduationCap, Users, CreditCard, Shirt, Tv, Scissors
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPENSE_CATEGORIES = [
  { value: "food_grocery", label: "Food & Grocery", icon: Utensils },
  { value: "house_rent", label: "House Rent/Maintenance", icon: Home },
  { value: "conveyance", label: "Conveyance & Fuel", icon: Car },
  { value: "healthcare", label: "Healthcare", icon: Heart },
  { value: "utilities", label: "Utilities & AMC", icon: Zap },
  { value: "mobile", label: "Mobile", icon: Phone },
  { value: "gasline_internet", label: "Internet & Cable", icon: Tv },
  { value: "clothing", label: "Clothing", icon: Shirt },
  { value: "shopping", label: "Shopping & Gifts", icon: ShoppingBag },
  { value: "entertainment", label: "Entertainment", icon: Utensils },
  { value: "personal_care", label: "Personal Care", icon: Scissors },
  { value: "mediclaim", label: "Mediclaim / PA / CI", icon: Heart },
  { value: "children_education", label: "Children Education", icon: GraduationCap },
  { value: "family_support", label: "Family Support", icon: Users },
  { value: "motor_insurance", label: "Motor Insurance", icon: Car },
  { value: "life_insurance", label: "Life Insurance - Term", icon: Heart },
  { value: "emi", label: "EMI", icon: CreditCard }
];

const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());

export default function ExpenseSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [expenseItems, setExpenseItems] = useState({});

  const members = family?.members || [];
  const existingExpenses = family?.expense_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    const added = [];
    
    EXPENSE_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingExpenses.forEach(exp => {
      const category = exp.expense_type;
      if (itemsByCategory[category]) {
        if (!added.includes(category)) added.push(category);
        itemsByCategory[category].push({
          id: exp.id,
          memberId: exp.member_ids?.[0] || "",
          details: {
            annual_amount: exp.annual_amount,
            upto_year: exp.upto_year,
            inflation_percent: exp.inflation_percent,
            consider_post_retirement: exp.consider_post_retirement ? "Yes" : "No",
            percent_of_current: exp.percent_of_current || 100,
            applicable_to: exp.applicable_to || "Self"
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setExpenseItems(itemsByCategory);
    setAddedCategories(added);
    const expanded = {};
    added.forEach(cat => { expanded[cat] = true; });
    setExpandedCategories(expanded);
  }, [family?.id, existingExpenses.length]);

  const addCategory = (categoryValue) => {
    if (!addedCategories.includes(categoryValue)) {
      setAddedCategories(prev => [...prev, categoryValue]);
      setExpandedCategories(prev => ({ ...prev, [categoryValue]: true }));
      addExpenseItem(categoryValue);
    }
  };

  const skipCategory = (categoryValue) => {
    setAddedCategories(prev => prev.filter(c => c !== categoryValue));
    setExpandedCategories(prev => ({ ...prev, [categoryValue]: false }));
    setExpenseItems(prev => ({ ...prev, [categoryValue]: [] }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

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
    const updatedItems = expenseItems[category].filter(item => item.id !== itemId);
    setExpenseItems(prev => ({ ...prev, [category]: updatedItems }));
    if (updatedItems.length === 0) {
      setAddedCategories(prev => prev.filter(c => c !== category));
    }
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
          applicable_to: item.details.applicable_to || "Self"
        };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/expense`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/expense/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
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
        <User className="h-10 w-10 text-orange-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const availableCategories = EXPENSE_CATEGORIES.filter(c => !addedCategories.includes(c.value));
  const activeCategories = EXPENSE_CATEGORIES.filter(c => addedCategories.includes(c.value));

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-600">Enter details for categories</p>
        <Badge variant="outline" className="text-sm">{members.length} members</Badge>
      </div>

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
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-full text-sm text-gray-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
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

      <div className="space-y-4">
        {activeCategories.map(category => {
          const Icon = category.icon;
          const items = expenseItems[category.value] || [];
          const isExpanded = expandedCategories[category.value];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);

          return (
            <Collapsible key={category.value} open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
              <div className={`border rounded-lg ${hasUnsavedChanges ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white'}`}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <button className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <Icon className="h-5 w-5 text-gray-600" />
                      <span className="font-medium text-gray-800">{category.label}</span>
                      <Badge className="bg-orange-100 text-orange-700 text-xs">{items.length}</Badge>
                      {hasUnsavedChanges && <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />}
                    </div>
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => skipCategory(category.value)} disabled={isReadOnly} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm">
                        <SkipForward className="h-3.5 w-3.5" />Skip
                      </button>
                      <button onClick={() => addExpenseItem(category.value)} disabled={isReadOnly} className="flex items-center gap-1 text-orange-600 hover:text-orange-700 text-sm font-medium">
                        <Plus className="h-3.5 w-3.5" />Add
                      </button>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {items.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">No entries. Click "+ Add" to create one.</div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {items.map((item, index) => (
                          <div key={item.id} className={`p-4 rounded-lg ${item.isNew ? 'bg-green-50 border border-green-200' : item.isModified ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                            <div className="flex items-end gap-3 flex-wrap">
                              <div className="w-32">
                                <Label className="text-xs text-gray-500 mb-1 block">Member</Label>
                                <Select value={item.memberId || ""} onValueChange={(v) => updateExpenseItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-10 text-sm bg-white"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex-1 min-w-[120px]">
                                <Label className="text-xs text-gray-500 mb-1 block">Annual Amount</Label>
                                <Input type="number" value={item.details.annual_amount || ""} onChange={(e) => updateExpenseItem(category.value, item.id, "annual_amount", e.target.value)} placeholder="0" className="h-10 text-sm bg-white" disabled={isReadOnly} />
                              </div>
                              <div className="w-28">
                                <Label className="text-xs text-gray-500 mb-1 block">Upto Year</Label>
                                <Select value={item.details.upto_year?.toString() || ""} onValueChange={(v) => updateExpenseItem(category.value, item.id, "upto_year", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-10 text-sm bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <div className="w-24">
                                <Label className="text-xs text-gray-500 mb-1 block">Inflation %</Label>
                                <Input type="number" value={item.details.inflation_percent || ""} onChange={(e) => updateExpenseItem(category.value, item.id, "inflation_percent", e.target.value)} placeholder="6" className="h-10 text-sm bg-white" disabled={isReadOnly} />
                              </div>
                              <div className="w-28">
                                <Label className="text-xs text-gray-500 mb-1 block">Applicable To</Label>
                                <Select value={item.details.applicable_to || "Self"} onValueChange={(v) => updateExpenseItem(category.value, item.id, "applicable_to", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-10 text-sm bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="Self">Self</SelectItem><SelectItem value="Spouse">Spouse</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent>
                                </Select>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => removeExpenseItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 hover:bg-red-50 h-10 w-10 shrink-0">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-2">
                          <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} className="bg-orange-600 hover:bg-orange-700 text-white" size="sm">
                            <Save className="h-4 w-4 mr-1" />{savingCategory === category.value ? "Saving..." : "Save"}
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

      {activeCategories.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p>Click on a category above to start adding expense details</p>
        </div>
      )}
    </div>
  );
}
