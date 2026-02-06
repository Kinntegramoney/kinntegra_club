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
  Target, GraduationCap, Plane, Home, Car, Heart, Gift, PartyPopper, Sparkles
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

const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());

export default function GoalSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [goalItems, setGoalItems] = useState({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);

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
        itemsByCategory[category].push({
          id: goal.id,
          memberId: goal.member_ids?.[0] || "",
          details: { amount_today: goal.goal_amount, inflation_percent: goal.inflation_percent, goal_year: goal.goal_year },
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

  const skipCategory = (categoryValue) => {
    setAddedCategories(prev => prev.filter(c => c !== categoryValue));
    setExpandedCategories(prev => ({ ...prev, [categoryValue]: false }));
    setGoalItems(prev => ({ ...prev, [categoryValue]: [] }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const addGoalItem = (category) => {
    const currentYear = new Date().getFullYear();
    setGoalItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: { amount_today: "", inflation_percent: 6, goal_year: (currentYear + 5).toString() },
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

  const saveCategory = async (category) => {
    const items = goalItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    if (itemsToSave.length === 0) { toast.info("No changes"); return; }

    for (const item of itemsToSave) {
      if (!item.memberId) { toast.error("Select a member"); return; }
      if (!item.details.amount_today) { toast.error("Enter amount"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const payload = {
          family_id: family.id, member_ids: [item.memberId], category,
          goal_amount: parseFloat(item.details.amount_today),
          inflation_percent: parseFloat(item.details.inflation_percent) || 6,
          goal_year: parseInt(item.details.goal_year)
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
                      <div className="text-center py-6 text-gray-400 text-sm">No entries. Click "+ Add".</div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {items.map((item, idx) => (
                          <div key={item.id} className={`p-4 rounded-lg ${item.isNew ? 'bg-green-50 border border-green-200' : item.isModified ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                            <div className="flex flex-wrap gap-3 items-end">
                              <div className="flex flex-col min-w-[120px] flex-1 max-w-[180px]">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Member</Label>
                                <Select value={item.memberId || ""} onValueChange={(v) => updateGoalItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs bg-white w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-col min-w-[120px] flex-1 max-w-[180px]">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Amount Today</Label>
                                <Input type="number" value={item.details.amount_today || ""} onChange={(e) => updateGoalItem(category.value, item.id, "amount_today", e.target.value)} placeholder="0" className="h-8 text-xs bg-white w-full" disabled={isReadOnly} />
                              </div>
                              <div className="flex flex-col min-w-[100px] flex-1 max-w-[120px]">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Inflation %</Label>
                                <Input type="number" value={item.details.inflation_percent || ""} onChange={(e) => updateGoalItem(category.value, item.id, "inflation_percent", e.target.value)} placeholder="6" className="h-8 text-xs bg-white w-full" disabled={isReadOnly} />
                              </div>
                              <div className="flex flex-col min-w-[100px] flex-1 max-w-[120px]">
                                <Label className="text-[10px] text-gray-500 mb-1 block">Goal Year</Label>
                                <Select value={item.details.goal_year?.toString() || ""} onValueChange={(v) => updateGoalItem(category.value, item.id, "goal_year", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs bg-white w-full"><SelectValue /></SelectTrigger>
                                  <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
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
