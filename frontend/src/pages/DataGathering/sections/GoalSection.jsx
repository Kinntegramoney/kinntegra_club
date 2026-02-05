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
  Target, GraduationCap, Heart, Home, Car, Gift, Baby, Gem, Laptop, Plane, Rocket
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GOAL_CATEGORIES = [
  { value: "charity", label: "Charity", icon: Heart },
  { value: "child_birth", label: "Child Birth Expense", icon: Baby },
  { value: "education", label: "Education", icon: GraduationCap },
  { value: "family_gifting", label: "Family Gifting", icon: Gift },
  { value: "gadgets", label: "Gadgets", icon: Laptop },
  { value: "home_renovation", label: "Home Renovation", icon: Home },
  { value: "jewellery", label: "Jewellery", icon: Gem },
  { value: "marriage", label: "Marriage", icon: Heart },
  { value: "new_car", label: "New Car", icon: Car },
  { value: "new_home", label: "New Home", icon: Home },
  { value: "post_graduation", label: "Post Graduation", icon: GraduationCap },
  { value: "startup", label: "Startup", icon: Rocket },
  { value: "vacation", label: "Vacation", icon: Plane }
];

// Generate year options
const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());

export default function GoalSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [goalItems, setGoalItems] = useState({});

  const members = family?.members || [];
  const existingGoals = family?.goal_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    GOAL_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingGoals.forEach(goal => {
      const category = goal.category;
      if (itemsByCategory[category]) {
        itemsByCategory[category].push({
          id: goal.id,
          memberId: goal.member_ids?.[0] || "",
          details: { 
            amount_today: goal.goal_amount || goal.amount_today, 
            inflation_percent: goal.inflation_percent, 
            goal_year: goal.goal_year 
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setGoalItems(itemsByCategory);
    const expanded = {};
    GOAL_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0) expanded[cat.value] = true;
    });
    setExpandedCategories(expanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, existingGoals.length]);

  const toggleCategory = (category) => setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  const hideCategory = (category) => { setHiddenCategories(prev => [...prev, category]); setExpandedCategories(prev => ({ ...prev, [category]: false })); };
  const showCategory = (category) => setHiddenCategories(prev => prev.filter(c => c !== category));

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
    setExpandedCategories(prev => ({ ...prev, [category]: true }));
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
    setGoalItems(prev => ({ ...prev, [category]: prev[category].filter(item => item.id !== itemId) }));
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
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  const getCategoryItemCount = (category) => goalItems[category]?.length || 0;

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-purple-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const visibleCategories = GOAL_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
  const hiddenCategoryList = GOAL_CATEGORIES.filter(c => hiddenCategories.includes(c.value));

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
          const items = goalItems[category.value] || [];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
          
          return (
            <Card key={category.value} className={`overflow-hidden ${itemCount > 0 ? 'border-purple-200 bg-purple-50/30' : ''}`}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2 px-3 cursor-pointer hover:bg-gray-50/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                        <Icon className={`h-4 w-4 ${itemCount > 0 ? 'text-purple-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium">{category.label}</span>
                        {itemCount > 0 && <Badge className="bg-purple-100 text-purple-700 text-xs h-5 px-1.5">{itemCount}</Badge>}
                        {hasUnsavedChanges && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs h-5 px-1.5">•</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); hideCategory(category.value); }} disabled={isReadOnly || itemCount > 0} className="h-7 px-2 text-xs text-gray-400 hover:text-gray-600">
                          <EyeOff className="h-3 w-3 mr-1" />Skip
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); addGoalItem(category.value); }} disabled={isReadOnly} className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50">
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
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-dashed">
                              <div className="flex items-center gap-2">
                                <Label className="text-[10px] text-gray-400">Member:</Label>
                                <Select value={item.memberId || ""} onValueChange={(v) => updateGoalItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => removeGoalItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            
                            {/* Fields */}
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block font-medium uppercase">Amount Today</Label>
                                <Input
                                  type="number"
                                  value={item.details.amount_today || ""}
                                  onChange={(e) => updateGoalItem(category.value, item.id, "amount_today", e.target.value)}
                                  placeholder="0"
                                  className="h-8 text-xs"
                                  disabled={isReadOnly}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block font-medium uppercase">Inflation %</Label>
                                <Input
                                  type="number"
                                  value={item.details.inflation_percent || ""}
                                  onChange={(e) => updateGoalItem(category.value, item.id, "inflation_percent", e.target.value)}
                                  placeholder="6"
                                  className="h-8 text-xs"
                                  disabled={isReadOnly}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-gray-500 mb-1 block font-medium uppercase">Goal Year</Label>
                                <Select value={item.details.goal_year?.toString() || ""} onValueChange={(v) => updateGoalItem(category.value, item.id, "goal_year", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {YEAR_OPTIONS.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-1">
                          <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} className="bg-purple-600 hover:bg-purple-700 text-white h-7 px-3 text-xs" size="sm">
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
                <button key={category.value} onClick={() => showCategory(category.value)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
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
