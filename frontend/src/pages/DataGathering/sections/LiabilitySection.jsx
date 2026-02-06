import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Plus, Trash2, ChevronDown, ChevronUp, User, EyeOff, Eye,
  Home, Car, CreditCard, GraduationCap, Building, Coins
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LIABILITY_CATEGORIES = [
  { value: "home_loan", label: "Home Loan", icon: Home, color: "blue" },
  { value: "car_loan", label: "Car Loan", icon: Car, color: "slate" },
  { value: "personal_loan", label: "Personal Loan", icon: CreditCard, color: "purple" },
  { value: "education_loan", label: "Education Loan", icon: GraduationCap, color: "cyan" },
  { value: "business_loan", label: "Business Loan", icon: Building, color: "amber" },
  { value: "credit_card", label: "Credit Card Outstanding", icon: CreditCard, color: "red" },
  { value: "other_loan", label: "Other Loan", icon: Coins, color: "gray" }
];

const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());

const colorClasses = {
  blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "bg-blue-100 text-blue-600", badge: "bg-blue-100 text-blue-700", highlight: "bg-blue-500" },
  slate: { bg: "bg-slate-50", border: "border-slate-200", icon: "bg-slate-100 text-slate-600", badge: "bg-slate-100 text-slate-700", highlight: "bg-slate-500" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", icon: "bg-purple-100 text-purple-600", badge: "bg-purple-100 text-purple-700", highlight: "bg-purple-500" },
  cyan: { bg: "bg-cyan-50", border: "border-cyan-200", icon: "bg-cyan-100 text-cyan-600", badge: "bg-cyan-100 text-cyan-700", highlight: "bg-cyan-500" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "bg-amber-100 text-amber-600", badge: "bg-amber-100 text-amber-700", highlight: "bg-amber-500" },
  red: { bg: "bg-red-50", border: "border-red-200", icon: "bg-red-100 text-red-600", badge: "bg-red-100 text-red-700", highlight: "bg-red-500" },
  gray: { bg: "bg-gray-50", border: "border-gray-200", icon: "bg-gray-100 text-gray-600", badge: "bg-gray-100 text-gray-700", highlight: "bg-gray-500" }
};

export default function LiabilitySection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [liabilityItems, setLiabilityItems] = useState({});

  const members = family?.members || [];
  const existingLiabilities = family?.liability_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    LIABILITY_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingLiabilities.forEach(lib => {
      const category = lib.category;
      if (itemsByCategory[category]) {
        itemsByCategory[category].push({
          id: lib.id,
          memberId: lib.member_ids?.[0] || "",
          details: {
            amount_today: lib.amount_today,
            inflation_percent: lib.inflation_percent,
            goal_year: lib.goal_year
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setLiabilityItems(itemsByCategory);
    const expanded = {};
    LIABILITY_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0) expanded[cat.value] = true;
    });
    setExpandedCategories(expanded);
  }, [family?.id, existingLiabilities.length]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };
  const hideCategory = (category) => { setHiddenCategories(prev => [...prev, category]); setExpandedCategories(prev => ({ ...prev, [category]: false })); };
  const showCategory = (category) => setHiddenCategories(prev => prev.filter(c => c !== category));

  const addLiabilityItem = (category) => {
    const currentYear = new Date().getFullYear();
    setLiabilityItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: { amount_today: "", inflation_percent: 0, goal_year: (currentYear + 15).toString() },
        isNew: true,
        isModified: false
      }]
    }));
    setExpandedCategories(prev => ({ ...prev, [category]: true }));
  };

  const removeLiabilityItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/liability/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed to delete"); return; }
    }
    setLiabilityItems(prev => ({ ...prev, [category]: prev[category].filter(item => item.id !== itemId) }));
  };

  const updateLiabilityItem = (category, itemId, field, value) => {
    setLiabilityItems(prev => ({
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
    const items = liabilityItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    if (itemsToSave.length === 0) { toast.info("No changes"); return; }

    for (const item of itemsToSave) {
      if (!item.memberId) { toast.error("Select a member"); return; }
      if (!item.details.amount_today) { toast.error("Enter amount today"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const payload = {
          family_id: family.id, 
          member_ids: [item.memberId], 
          category,
          amount_today: parseFloat(item.details.amount_today),
          inflation_percent: parseFloat(item.details.inflation_percent) || 0,
          goal_year: parseInt(item.details.goal_year)
        };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/liability`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/liability/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
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

  const totalLiabilities = Object.values(liabilityItems).flat().reduce((sum, l) => sum + (parseFloat(l.details?.amount_today) || 0), 0);

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-red-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const visibleCategories = LIABILITY_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
  const hiddenCategoryList = LIABILITY_CATEGORIES.filter(c => hiddenCategories.includes(c.value));

  const CategoryCard = ({ category }) => {
    const Icon = category.icon;
    const colors = colorClasses[category.color];
    const items = liabilityItems[category.value] || [];
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
                {itemCount > 0 && <p className="text-xs text-gray-500">{itemCount} {itemCount === 1 ? 'entry' : 'entries'}</p>}
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
              <Button variant="outline" size="sm" onClick={() => addLiabilityItem(category.value)} disabled={isReadOnly} className="text-xs">
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
                        <Select value={item.memberId || ""} onValueChange={(v) => updateLiabilityItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 w-40 text-xs border-0 bg-gray-100"><SelectValue placeholder="Select Member" /></SelectTrigger>
                          <SelectContent>
                            {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeLiabilityItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 h-8 w-8 p-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Amount Today</p>
                        <Input type="number" value={item.details.amount_today || ""} onChange={(e) => updateLiabilityItem(category.value, item.id, "amount_today", e.target.value)} placeholder="0" className="h-8 text-xs border-0 bg-white" disabled={isReadOnly} />
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Goal Year</p>
                        <Select value={item.details.goal_year?.toString() || ""} onValueChange={(v) => updateLiabilityItem(category.value, item.id, "goal_year", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 text-xs border-0 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Inflation %</p>
                        <Input type="number" value={item.details.inflation_percent || ""} onChange={(e) => updateLiabilityItem(category.value, item.id, "inflation_percent", e.target.value)} placeholder="0" className="h-8 text-xs border-0 bg-white" disabled={isReadOnly} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} className="bg-red-600 hover:bg-red-700 text-white" size="sm">
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
      {totalLiabilities > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <span className="text-sm text-red-600 font-medium">Total Liabilities</span>
          <span className="font-bold text-red-700 text-lg">{formatCurrency(totalLiabilities)}</span>
        </div>
      )}

      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-sm text-gray-500">Select categories to add liability details</span>
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
                <button key={category.value} onClick={() => showCategory(category.value)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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
