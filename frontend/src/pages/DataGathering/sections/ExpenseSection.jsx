import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Plus, Trash2, ChevronDown, ChevronUp, User, EyeOff, Eye,
  Receipt, Home, Car, Heart, Zap, Phone, ShoppingBag, Utensils, GraduationCap, Users, CreditCard, Shirt, Tv, Scissors
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPENSE_CATEGORIES = [
  { value: "food_grocery", label: "Food & Grocery", icon: Utensils, color: "orange" },
  { value: "house_rent", label: "House Rent/Maintenance", icon: Home, color: "blue" },
  { value: "conveyance", label: "Conveyance & Fuel", icon: Car, color: "slate" },
  { value: "healthcare", label: "Healthcare", icon: Heart, color: "red" },
  { value: "utilities", label: "Utilities & AMC", icon: Zap, color: "yellow" },
  { value: "mobile", label: "Mobile", icon: Phone, color: "green" },
  { value: "gasline_internet", label: "Internet & Cable", icon: Tv, color: "purple" },
  { value: "clothing", label: "Clothing", icon: Shirt, color: "pink" },
  { value: "shopping", label: "Shopping & Gifts", icon: ShoppingBag, color: "teal" },
  { value: "entertainment", label: "Entertainment", icon: Utensils, color: "indigo" },
  { value: "personal_care", label: "Personal Care", icon: Scissors, color: "rose" },
  { value: "mediclaim", label: "Mediclaim / PA / CI", icon: Heart, color: "emerald" },
  { value: "children_education", label: "Children Education", icon: GraduationCap, color: "cyan" },
  { value: "family_support", label: "Family Support", icon: Users, color: "amber" },
  { value: "motor_insurance", label: "Motor Insurance", icon: Car, color: "gray" },
  { value: "life_insurance", label: "Life Insurance - Term", icon: Heart, color: "violet" },
  { value: "emi", label: "EMI", icon: CreditCard, color: "red" }
];

const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());

const colorClasses = {
  orange: { bg: "bg-orange-50", border: "border-orange-200", icon: "bg-orange-100 text-orange-600", badge: "bg-orange-100 text-orange-700", highlight: "bg-orange-500" },
  blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "bg-blue-100 text-blue-600", badge: "bg-blue-100 text-blue-700", highlight: "bg-blue-500" },
  slate: { bg: "bg-slate-50", border: "border-slate-200", icon: "bg-slate-100 text-slate-600", badge: "bg-slate-100 text-slate-700", highlight: "bg-slate-500" },
  red: { bg: "bg-red-50", border: "border-red-200", icon: "bg-red-100 text-red-600", badge: "bg-red-100 text-red-700", highlight: "bg-red-500" },
  yellow: { bg: "bg-yellow-50", border: "border-yellow-200", icon: "bg-yellow-100 text-yellow-600", badge: "bg-yellow-100 text-yellow-700", highlight: "bg-yellow-500" },
  green: { bg: "bg-green-50", border: "border-green-200", icon: "bg-green-100 text-green-600", badge: "bg-green-100 text-green-700", highlight: "bg-green-500" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", icon: "bg-purple-100 text-purple-600", badge: "bg-purple-100 text-purple-700", highlight: "bg-purple-500" },
  pink: { bg: "bg-pink-50", border: "border-pink-200", icon: "bg-pink-100 text-pink-600", badge: "bg-pink-100 text-pink-700", highlight: "bg-pink-500" },
  teal: { bg: "bg-teal-50", border: "border-teal-200", icon: "bg-teal-100 text-teal-600", badge: "bg-teal-100 text-teal-700", highlight: "bg-teal-500" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", icon: "bg-indigo-100 text-indigo-600", badge: "bg-indigo-100 text-indigo-700", highlight: "bg-indigo-500" },
  rose: { bg: "bg-rose-50", border: "border-rose-200", icon: "bg-rose-100 text-rose-600", badge: "bg-rose-100 text-rose-700", highlight: "bg-rose-500" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "bg-emerald-100 text-emerald-600", badge: "bg-emerald-100 text-emerald-700", highlight: "bg-emerald-500" },
  cyan: { bg: "bg-cyan-50", border: "border-cyan-200", icon: "bg-cyan-100 text-cyan-600", badge: "bg-cyan-100 text-cyan-700", highlight: "bg-cyan-500" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "bg-amber-100 text-amber-600", badge: "bg-amber-100 text-amber-700", highlight: "bg-amber-500" },
  gray: { bg: "bg-gray-50", border: "border-gray-200", icon: "bg-gray-100 text-gray-600", badge: "bg-gray-100 text-gray-700", highlight: "bg-gray-500" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", icon: "bg-violet-100 text-violet-600", badge: "bg-violet-100 text-violet-700", highlight: "bg-violet-500" }
};

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
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "₹0";
    return `₹${parseFloat(amount).toLocaleString('en-IN')}`;
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

  const CategoryCard = ({ category }) => {
    const Icon = category.icon;
    const colors = colorClasses[category.color];
    const items = expenseItems[category.value] || [];
    const isExpanded = expandedCategories[category.value];
    const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
    const itemCount = items.length;

    return (
      <div className={`bg-white border rounded-lg overflow-hidden transition-all ${isExpanded ? colors.border : 'border-gray-200'} hover:border-gray-300`}>
        <div className="p-4 cursor-pointer" onClick={() => toggleCategory(category.value)}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.icon}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-800">{category.label}</h3>
                {itemCount > 0 && (
                  <p className="text-xs text-gray-500">{itemCount} {itemCount === 1 ? 'entry' : 'entries'}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Unsaved</Badge>}
              {itemCount > 0 && <Badge className={`${colors.badge} text-xs`}>{itemCount}</Badge>}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t px-4 pb-4">
            <div className="flex justify-between items-center py-3">
              <Button variant="outline" size="sm" onClick={() => addExpenseItem(category.value)} disabled={isReadOnly} className="text-xs">
                <Plus className="h-3 w-3 mr-1" />Add Entry
              </Button>
              <Button variant="ghost" size="sm" onClick={() => hideCategory(category.value)} disabled={isReadOnly || itemCount > 0} className="text-xs text-gray-400">
                <EyeOff className="h-3 w-3 mr-1" />Skip
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No entries yet.</div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className={`border rounded-lg p-4 ${item.isNew ? 'border-green-300 bg-green-50/30' : item.isModified ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4 pb-3 border-b">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${colors.highlight}`}>{index + 1}</div>
                        <Select value={item.memberId || ""} onValueChange={(v) => updateExpenseItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 w-40 text-xs border-0 bg-gray-100"><SelectValue placeholder="Select Member" /></SelectTrigger>
                          <SelectContent>
                            {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeExpenseItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 h-8 w-8 p-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Annual Amount</p>
                        <Input type="number" value={item.details.annual_amount || ""} onChange={(e) => updateExpenseItem(category.value, item.id, "annual_amount", e.target.value)} placeholder="0" className="h-8 text-xs border-0 bg-white" disabled={isReadOnly} />
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Upto Year</p>
                        <Select value={item.details.upto_year?.toString() || ""} onValueChange={(v) => updateExpenseItem(category.value, item.id, "upto_year", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 text-xs border-0 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Inflation %</p>
                        <Input type="number" value={item.details.inflation_percent || ""} onChange={(e) => updateExpenseItem(category.value, item.id, "inflation_percent", e.target.value)} placeholder="6" className="h-8 text-xs border-0 bg-white" disabled={isReadOnly} />
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Post Retirement</p>
                        <Select value={item.details.consider_post_retirement || "No"} onValueChange={(v) => updateExpenseItem(category.value, item.id, "consider_post_retirement", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 text-xs border-0 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Applicable To</p>
                        <Select value={item.details.applicable_to || "Self"} onValueChange={(v) => updateExpenseItem(category.value, item.id, "applicable_to", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 text-xs border-0 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="Self">Self</SelectItem><SelectItem value="Spouse">Spouse</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">% of Current</p>
                        <Input type="number" value={item.details.percent_of_current || ""} onChange={(e) => updateExpenseItem(category.value, item.id, "percent_of_current", e.target.value)} placeholder="100" className="h-8 text-xs border-0 bg-white" disabled={isReadOnly} />
                      </div>
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
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {totalAnnual > 0 && (
        <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
          <span className="text-sm text-orange-600 font-medium">Total Annual Expenses</span>
          <span className="font-bold text-orange-700 text-lg">{formatCurrency(totalAnnual)}</span>
        </div>
      )}

      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-sm text-gray-500">Select categories to add expense details</span>
        <Badge variant="outline" className="text-xs">{members.length} member{members.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleCategories.map(category => (
          <CategoryCard key={category.value} category={category} />
        ))}
      </div>

      {hiddenCategoryList.length > 0 && (
        <div className="mt-6 pt-4 border-t border-dashed">
          <div className="text-xs text-gray-400 mb-3">Skipped Categories</div>
          <div className="flex flex-wrap gap-2">
            {hiddenCategoryList.map(category => {
              const Icon = category.icon;
              return (
                <button key={category.value} onClick={() => showCategory(category.value)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors">
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
