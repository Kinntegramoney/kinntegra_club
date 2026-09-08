import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Save, Plus, Trash2, ChevronDown, ChevronRight, User, SkipForward, Circle,
  Target, GraduationCap, Plane, Home, Car, Heart, Gift, PartyPopper, Sparkles, X, Calendar
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GOAL_CATEGORIES = [
  { value: "education", label: "Children Education", icon: GraduationCap },
  { value: "wedding", label: "Children Wedding", icon: PartyPopper },
  { value: "vacation", label: "Vacation", icon: Plane },
  { value: "home", label: "Home Purchase", icon: Home },
  { value: "car", label: "Car Purchase", icon: Car },
  { value: "retirement", label: "Retirement Corpus", icon: Target },
  { value: "medical", label: "Medical Emergency", icon: Heart },
  { value: "gift", label: "Gift / Donation", icon: Gift },
  { value: "other", label: "Other Goals", icon: Sparkles }
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 31 }, (_, i) => (currentYear + i).toString());

// Quick select options for recurring goals
const YEAR_PATTERNS = [
  { label: "Every Year", interval: 1 },
  { label: "Every 2 Years", interval: 2 },
  { label: "Every 3 Years", interval: 3 },
  { label: "Every 5 Years", interval: 5 }
];

export default function GoalSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [goalItems, setGoalItems] = useState({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState({});

  const members = family?.members || [];
  const existingGoals = family?.goal_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    const added = [];
    GOAL_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingGoals.forEach(goal => {
      const category = goal.category;
      if (itemsByCategory[category]) {
        if (!added.includes(category)) added.push(category);
        // Handle goal_years as array or single year
        const years = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
        // Check if it's a family goal (all members) or individual
        const memberId = goal.is_family_goal ? "family" : (goal.member_ids?.[0] || "");
        
        itemsByCategory[category].push({
          id: goal.id,
          memberId: memberId,
          details: { 
            amount_today: goal.goal_amount, 
            inflation_percent: goal.inflation_percent, 
            goal_years: years
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setGoalItems(itemsByCategory);
    setAddedCategories(added);
    
    if (!initialLoadDone) {
      const expanded = {};
      added.forEach(cat => { expanded[cat] = true; });
      setExpandedCategories(expanded);
      setInitialLoadDone(true);
    }
  }, [family?.id, existingGoals.length, initialLoadDone]);

  const addCategory = (categoryValue) => {
    if (!addedCategories.includes(categoryValue)) {
      setAddedCategories(prev => [...prev, categoryValue]);
      setExpandedCategories(prev => ({ ...prev, [categoryValue]: true }));
      addGoalItem(categoryValue);
    }
  };

  const skipCategory = async (categoryValue) => {
    // Persist deletion of existing goal items so they don't reappear on tab
    // switch. Skip-only-on-state was the same bug as in ExpenseSection.
    const existing = (goalItems[categoryValue] || []).filter(i => !i.isNew && i.id && !String(i.id).startsWith('new_'));
    if (existing.length > 0) {
      try {
        const token = localStorage.getItem("token");
        await Promise.all(existing.map(i =>
          axios.delete(
            `${API}/data-gathering/family/${family.id}/goal/${i.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        ));
        toast.success(`Removed ${existing.length} goal${existing.length > 1 ? 's' : ''}`);
        if (typeof onRefresh === 'function') onRefresh();
      } catch {
        toast.error("Failed to remove. Please retry.");
        return;
      }
    }
    setAddedCategories(prev => prev.filter(c => c !== categoryValue));
    setExpandedCategories(prev => ({ ...prev, [categoryValue]: false }));
    setGoalItems(prev => ({ ...prev, [categoryValue]: [] }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const addGoalItem = (category) => {
    setGoalItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: { amount_today: "", inflation_percent: 6, goal_years: [(currentYear + 5).toString()] },
        isNew: true,
        isModified: false
      }]
    }));
  };

  const removeGoalItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/goal/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed to delete"); return; }
    }
    const updatedItems = goalItems[category].filter(item => item.id !== itemId);
    setGoalItems(prev => ({ ...prev, [category]: updatedItems }));
    if (updatedItems.length === 0) setAddedCategories(prev => prev.filter(c => c !== category));
  };

  const updateGoalItem = (category, itemId, field, value) => {
    setGoalItems(prev => ({
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

  const toggleYear = (category, itemId, year) => {
    setGoalItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          const currentYears = item.details.goal_years || [];
          const newYears = currentYears.includes(year)
            ? currentYears.filter(y => y !== year)
            : [...currentYears, year].sort();
          return { ...item, details: { ...item.details, goal_years: newYears }, isModified: !item.isNew };
        }
        return item;
      })
    }));
  };

  const removeYear = (category, itemId, year) => {
    setGoalItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          const newYears = (item.details.goal_years || []).filter(y => y !== year);
          return { ...item, details: { ...item.details, goal_years: newYears }, isModified: !item.isNew };
        }
        return item;
      })
    }));
  };

  const toggleYearPicker = (itemId) => {
    setYearPickerOpen(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Apply year pattern (every year, every 2 years, etc.)
  const applyYearPattern = (category, itemId, interval, startYear = currentYear) => {
    const years = [];
    for (let year = startYear; year <= currentYear + 30; year += interval) {
      years.push(year.toString());
    }
    setGoalItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          return { ...item, details: { ...item.details, goal_years: years }, isModified: !item.isNew };
        }
        return item;
      })
    }));
  };

  // Clear all selected years
  const clearAllYears = (category, itemId) => {
    setGoalItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          return { ...item, details: { ...item.details, goal_years: [] }, isModified: !item.isNew };
        }
        return item;
      })
    }));
  };

  const saveCategory = async (category) => {
    const items = goalItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    if (itemsToSave.length === 0) { toast.info("No changes"); return; }

    for (const item of itemsToSave) {
      if (!item.memberId) { toast.error("Select a member or family"); return; }
      if (!item.details.amount_today) { toast.error("Enter amount"); return; }
      if (!item.details.goal_years || item.details.goal_years.length === 0) { toast.error("Select at least one year"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        // If "family" is selected, include all member IDs
        const memberIds = item.memberId === "family" 
          ? members.map(m => m.id) 
          : [item.memberId];
        
        const payload = {
          family_id: family.id, 
          member_ids: memberIds,
          is_family_goal: item.memberId === "family",
          category,
          goal_amount: parseFloat(item.details.amount_today),
          inflation_percent: parseFloat(item.details.inflation_percent) || 6,
          goal_years: item.details.goal_years,
          goal_year: parseInt(item.details.goal_years[0]) // For backward compatibility
        };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/goal`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/goal/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
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
        <User className="h-10 w-10 text-purple-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const availableCategories = GOAL_CATEGORIES.filter(c => !addedCategories.includes(c.value));
  const activeCategories = GOAL_CATEGORIES.filter(c => addedCategories.includes(c.value));

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-600">Enter details for categories (select multiple years for recurring goals)</p>
        <Badge variant="outline" className="text-sm">{members.length} members</Badge>
      </div>

      {availableCategories.length > 0 && (
        <div className="mb-6">
          <p className="text-gray-400 text-sm mb-3">Click To add</p>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map(category => {
              const Icon = category.icon;
              return (
                <button key={category.value} onClick={() => addCategory(category.value)} disabled={isReadOnly}
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-full text-sm text-gray-600 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
                  <Plus className="h-3.5 w-3.5" /><Icon className="h-3.5 w-3.5" /><span>{category.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {activeCategories.map(category => {
          const Icon = category.icon;
          const items = goalItems[category.value] || [];
          const isExpanded = expandedCategories[category.value];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);

          return (
            <Collapsible key={category.value} open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
              <div className={`border rounded-lg ${hasUnsavedChanges ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-white'}`}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <button className="text-gray-400">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                      <Icon className="h-5 w-5 text-gray-600" />
                      <span className="font-medium text-gray-800">{category.label}</span>
                      <Badge className="bg-purple-100 text-purple-700 text-xs">{items.length}</Badge>
                      {hasUnsavedChanges && <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />}
                    </div>
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      {hasUnsavedChanges && (
                        <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly} size="sm" className="h-7 px-3 text-xs bg-purple-600 hover:bg-purple-700">
                          <Save className="h-3 w-3 mr-1" />{savingCategory === category.value ? "..." : "Save"}
                        </Button>
                      )}
                      <button onClick={() => skipCategory(category.value)} disabled={isReadOnly} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm"><SkipForward className="h-3.5 w-3.5" />Skip</button>
                      <button onClick={() => addGoalItem(category.value)} disabled={isReadOnly} className="flex items-center gap-1 text-purple-600 hover:text-purple-700 text-sm font-medium"><Plus className="h-3.5 w-3.5" />Add</button>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {items.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">No entries. Click &quot;+ Add&quot;.</div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {items.map((item, idx) => (
                          <div key={item.id} className={`p-4 rounded-lg ${item.isNew ? 'bg-green-50 border border-green-200' : item.isModified ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                            <div className="flex flex-wrap gap-3 items-end">
                              <div className="flex flex-col min-w-[140px] flex-1 max-w-[180px]">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Member *</Label>
                                <Select value={item.memberId || ""} onValueChange={(v) => updateGoalItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs bg-white w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="family" className="text-xs font-medium text-purple-600">
                                      <span className="flex items-center gap-1">👨‍👩‍👧‍👦 Family (All Members)</span>
                                    </SelectItem>
                                    <div className="border-t border-gray-100 my-1"></div>
                                    {members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-col min-w-[120px] flex-1 max-w-[150px]">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Amount Today *</Label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                  <Input type="number" value={item.details.amount_today || ""} onChange={(e) => updateGoalItem(category.value, item.id, "amount_today", e.target.value)} placeholder="0" className="h-8 text-xs bg-white w-full pl-5" disabled={isReadOnly} />
                                </div>
                              </div>
                              <div className="flex flex-col min-w-[80px] max-w-[100px]">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Inflation %</Label>
                                <Input type="number" value={item.details.inflation_percent || ""} onChange={(e) => updateGoalItem(category.value, item.id, "inflation_percent", e.target.value)} placeholder="6" className="h-8 text-xs bg-white w-full" disabled={isReadOnly} />
                              </div>
                              
                              {/* Multi-select Years */}
                              <div className="flex flex-col min-w-[200px] flex-1">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Goal Year(s) * <span className="text-purple-500">(click to select multiple)</span></Label>
                                <div className="relative">
                                  <button 
                                    type="button"
                                    onClick={() => toggleYearPicker(item.id)}
                                    disabled={isReadOnly}
                                    className="h-8 w-full px-2 flex items-center gap-1 bg-white border border-gray-200 rounded-md text-xs text-left hover:border-purple-400 transition-colors"
                                  >
                                    <Calendar className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                    <div className="flex-1 flex flex-wrap gap-1 overflow-hidden">
                                      {(item.details.goal_years || []).length === 0 ? (
                                        <span className="text-gray-400">Select years...</span>
                                      ) : (
                                        (item.details.goal_years || []).slice(0, 5).map(year => (
                                          <span key={year} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">
                                            {year}
                                            <X 
                                              className="h-2.5 w-2.5 cursor-pointer hover:text-red-500" 
                                              onClick={(e) => { e.stopPropagation(); removeYear(category.value, item.id, year); }}
                                            />
                                          </span>
                                        ))
                                      )}
                                      {(item.details.goal_years || []).length > 5 && (
                                        <span className="text-[10px] text-gray-500">+{item.details.goal_years.length - 5} more</span>
                                      )}
                                    </div>
                                    <ChevronDown className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                  </button>
                                  
                                  {/* Year Picker Dropdown */}
                                  {yearPickerOpen[item.id] && (
                                    <div className="absolute z-50 top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
                                      {/* Quick Pattern Options */}
                                      <div className="p-2 border-b border-gray-100">
                                        <p className="text-[10px] text-gray-400 uppercase mb-2">Quick Select</p>
                                        <div className="flex flex-wrap gap-1">
                                          {YEAR_PATTERNS.map(pattern => (
                                            <button
                                              key={pattern.interval}
                                              type="button"
                                              onClick={() => applyYearPattern(category.value, item.id, pattern.interval)}
                                              className="px-2 py-1 text-[10px] bg-purple-50 text-purple-600 rounded hover:bg-purple-100 transition-colors"
                                            >
                                              {pattern.label}
                                            </button>
                                          ))}
                                          <button
                                            type="button"
                                            onClick={() => clearAllYears(category.value, item.id)}
                                            className="px-2 py-1 text-[10px] bg-gray-50 text-gray-500 rounded hover:bg-gray-100 transition-colors"
                                          >
                                            Clear All
                                          </button>
                                        </div>
                                      </div>
                                      
                                      {/* Year Grid */}
                                      <div className="p-2 max-h-40 overflow-y-auto">
                                        <p className="text-[10px] text-gray-400 uppercase mb-2">Or Select Individual Years</p>
                                        <div className="grid grid-cols-5 gap-1">
                                          {YEAR_OPTIONS.map(year => {
                                            const isSelected = (item.details.goal_years || []).includes(year);
                                            return (
                                              <button
                                                key={year}
                                                type="button"
                                                onClick={() => toggleYear(category.value, item.id, year)}
                                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                                  isSelected 
                                                    ? 'bg-purple-500 text-white' 
                                                    : 'bg-gray-50 text-gray-700 hover:bg-purple-100'
                                                }`}
                                              >
                                                {year}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      
                                      <div className="p-2 border-t border-gray-100 flex justify-between items-center">
                                        <span className="text-[10px] text-gray-400">
                                          {(item.details.goal_years || []).length} year(s) selected
                                        </span>
                                        <button 
                                          type="button"
                                          onClick={() => toggleYearPicker(item.id)}
                                          className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                                        >
                                          Done
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {idx > 0 && (
                                <div className="flex flex-col justify-end">
                                  <button onClick={() => removeGoalItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex items-center">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {activeCategories.length === 0 && <div className="text-center py-8 text-gray-400"><p>Click on a category above to start adding goal details</p></div>}
    </div>
  );
}
