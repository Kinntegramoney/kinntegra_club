import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Plus, Trash2, ChevronDown, ChevronUp, User, EyeOff, Eye,
  Shield, Heart, Car, Home, Briefcase, Umbrella
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const INSURANCE_CATEGORIES = [
  { value: "term_life", label: "Term Life Insurance", icon: Shield, color: "green" },
  { value: "health", label: "Health Insurance", icon: Heart, color: "red" },
  { value: "critical_illness", label: "Critical Illness", icon: Heart, color: "purple" },
  { value: "personal_accident", label: "Personal Accident", icon: Umbrella, color: "amber" },
  { value: "motor", label: "Motor Insurance", icon: Car, color: "blue" },
  { value: "home", label: "Home Insurance", icon: Home, color: "teal" },
  { value: "professional", label: "Professional Indemnity", icon: Briefcase, color: "indigo" }
];

const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());

const colorClasses = {
  green: { bg: "bg-green-50", border: "border-green-200", icon: "bg-green-100 text-green-600", badge: "bg-green-100 text-green-700", highlight: "bg-green-500" },
  red: { bg: "bg-red-50", border: "border-red-200", icon: "bg-red-100 text-red-600", badge: "bg-red-100 text-red-700", highlight: "bg-red-500" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", icon: "bg-purple-100 text-purple-600", badge: "bg-purple-100 text-purple-700", highlight: "bg-purple-500" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "bg-amber-100 text-amber-600", badge: "bg-amber-100 text-amber-700", highlight: "bg-amber-500" },
  blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "bg-blue-100 text-blue-600", badge: "bg-blue-100 text-blue-700", highlight: "bg-blue-500" },
  teal: { bg: "bg-teal-50", border: "border-teal-200", icon: "bg-teal-100 text-teal-600", badge: "bg-teal-100 text-teal-700", highlight: "bg-teal-500" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", icon: "bg-indigo-100 text-indigo-600", badge: "bg-indigo-100 text-indigo-700", highlight: "bg-indigo-500" }
};

export default function InsuranceSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [insuranceItems, setInsuranceItems] = useState({});

  const members = family?.members || [];
  const existingInsurance = family?.insurance_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    INSURANCE_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingInsurance.forEach(ins => {
      const category = ins.category;
      if (itemsByCategory[category]) {
        itemsByCategory[category].push({
          id: ins.id,
          memberId: ins.member_ids?.[0] || "",
          details: {
            amount_today: ins.amount_today,
            inflation_percent: ins.inflation_percent,
            goal_year: ins.goal_year
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setInsuranceItems(itemsByCategory);
    const expanded = {};
    INSURANCE_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0) expanded[cat.value] = true;
    });
    setExpandedCategories(expanded);
  }, [family?.id, existingInsurance.length]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };
  const hideCategory = (category) => { setHiddenCategories(prev => [...prev, category]); setExpandedCategories(prev => ({ ...prev, [category]: false })); };
  const showCategory = (category) => setHiddenCategories(prev => prev.filter(c => c !== category));

  const addInsuranceItem = (category) => {
    const currentYear = new Date().getFullYear();
    setInsuranceItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: { amount_today: "", inflation_percent: 5, goal_year: (currentYear + 20).toString() },
        isNew: true,
        isModified: false
      }]
    }));
    setExpandedCategories(prev => ({ ...prev, [category]: true }));
  };

  const removeInsuranceItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/insurance/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed to delete"); return; }
    }
    setInsuranceItems(prev => ({ ...prev, [category]: prev[category].filter(item => item.id !== itemId) }));
  };

  const updateInsuranceItem = (category, itemId, field, value) => {
    setInsuranceItems(prev => ({
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
    const items = insuranceItems[category] || [];
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
          inflation_percent: parseFloat(item.details.inflation_percent) || 5,
          goal_year: parseInt(item.details.goal_year)
        };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/insurance`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/insurance/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
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

  const totalCover = Object.values(insuranceItems).flat().reduce((sum, i) => sum + (parseFloat(i.details?.amount_today) || 0), 0);

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-teal-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const visibleCategories = INSURANCE_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
  const hiddenCategoryList = INSURANCE_CATEGORIES.filter(c => hiddenCategories.includes(c.value));

  const CategoryCard = ({ category }) => {
    const Icon = category.icon;
    const colors = colorClasses[category.color];
    const items = insuranceItems[category.value] || [];
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
              <Button variant="outline" size="sm" onClick={() => addInsuranceItem(category.value)} disabled={isReadOnly} className="text-xs">
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
                        <Select value={item.memberId || ""} onValueChange={(v) => updateInsuranceItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 w-40 text-xs border-0 bg-gray-100"><SelectValue placeholder="Select Member" /></SelectTrigger>
                          <SelectContent>
                            {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeInsuranceItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 h-8 w-8 p-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Amount Today</p>
                        <Input type="number" value={item.details.amount_today || ""} onChange={(e) => updateInsuranceItem(category.value, item.id, "amount_today", e.target.value)} placeholder="0" className="h-8 text-xs border-0 bg-white" disabled={isReadOnly} />
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Goal Year</p>
                        <Select value={item.details.goal_year?.toString() || ""} onValueChange={(v) => updateInsuranceItem(category.value, item.id, "goal_year", v)} disabled={isReadOnly}>
                          <SelectTrigger className="h-8 text-xs border-0 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className={`${colors.bg} rounded-lg p-3`}>
                        <p className="text-[10px] text-gray-500 mb-1 uppercase font-medium">Inflation %</p>
                        <Input type="number" value={item.details.inflation_percent || ""} onChange={(e) => updateInsuranceItem(category.value, item.id, "inflation_percent", e.target.value)} placeholder="5" className="h-8 text-xs border-0 bg-white" disabled={isReadOnly} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} className="bg-teal-600 hover:bg-teal-700 text-white" size="sm">
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
      {totalCover > 0 && (
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
          <span className="text-sm text-teal-600 font-medium">Total Insurance Cover</span>
          <span className="font-bold text-teal-700 text-lg">{formatCurrency(totalCover)}</span>
        </div>
      )}

      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-sm text-gray-500">Select categories to add insurance details</span>
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
                <button key={category.value} onClick={() => showCategory(category.value)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
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
