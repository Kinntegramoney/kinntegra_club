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
  Home, Car, CreditCard, GraduationCap, Building, Coins
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LIABILITY_CATEGORIES = [
  { value: "home_loan", label: "Home Loan", icon: Home },
  { value: "vehicle_loan", label: "Vehicle Loan", icon: Car },
  { value: "personal_loan", label: "Personal Loan", icon: CreditCard },
  { value: "consumer_durable", label: "Consumer Durable", icon: Building },
  { value: "education_loan", label: "Education Loan", icon: GraduationCap },
  { value: "credit_card", label: "Credit Card", icon: CreditCard },
  { value: "other_loan", label: "Other Loan", icon: Coins }
];

export default function LiabilitySection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [liabilityItems, setLiabilityItems] = useState({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const members = family?.members || [];
  const existingLiabilities = family?.liability_details || [];
  const currentYear = new Date().getFullYear();

  // Calculate outstanding amount = EMI × Installments
  const calculateOutstanding = (emi, installments) => {
    const emiVal = parseFloat(emi) || 0;
    const instVal = parseFloat(installments) || 0;
    return emiVal * instVal;
  };

  // Calculate completion year = Current Year + (Installments / 12)
  const calculateCompletionYear = (installments) => {
    const instVal = parseFloat(installments) || 0;
    const yearsToAdd = Math.ceil(instVal / 12);
    return currentYear + yearsToAdd;
  };

  useEffect(() => {
    const itemsByCategory = {};
    const added = [];
    LIABILITY_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingLiabilities.forEach(lib => {
      const category = lib.category;
      if (itemsByCategory[category]) {
        if (!added.includes(category)) added.push(category);
        itemsByCategory[category].push({
          id: lib.id,
          memberId: lib.member_ids?.[0] || "",
          details: { 
            monthly_emi: lib.monthly_emi || lib.amount_today || "",
            num_installments: lib.num_installments || ""
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setLiabilityItems(itemsByCategory);
    setAddedCategories(added);
    
    if (!initialLoadDone) {
      const expanded = {};
      added.forEach(cat => { expanded[cat] = true; });
      setExpandedCategories(expanded);
      setInitialLoadDone(true);
    }
  }, [family?.id, existingLiabilities.length, initialLoadDone]);

  const addCategory = (categoryValue) => {
    if (!addedCategories.includes(categoryValue)) {
      setAddedCategories(prev => [...prev, categoryValue]);
      setExpandedCategories(prev => ({ ...prev, [categoryValue]: true }));
      addLiabilityItem(categoryValue);
    }
  };

  const skipCategory = (categoryValue) => {
    setAddedCategories(prev => prev.filter(c => c !== categoryValue));
    setExpandedCategories(prev => ({ ...prev, [categoryValue]: false }));
    setLiabilityItems(prev => ({ ...prev, [categoryValue]: [] }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const addLiabilityItem = (category) => {
    setLiabilityItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: { 
          monthly_emi: "",
          num_installments: ""
        },
        isNew: true,
        isModified: false
      }]
    }));
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
    const updatedItems = liabilityItems[category].filter(item => item.id !== itemId);
    setLiabilityItems(prev => ({ ...prev, [category]: updatedItems }));
    if (updatedItems.length === 0) setAddedCategories(prev => prev.filter(c => c !== category));
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
      if (!item.details.monthly_emi) { toast.error("Enter Monthly EMI Amount"); return; }
      if (!item.details.num_installments) { toast.error("Enter No. of Installments"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const outstanding = calculateOutstanding(item.details.monthly_emi, item.details.num_installments);
        const completionYear = calculateCompletionYear(item.details.num_installments);
        
        const payload = {
          family_id: family.id, 
          member_ids: [item.memberId], 
          category,
          monthly_emi: parseFloat(item.details.monthly_emi),
          num_installments: parseInt(item.details.num_installments),
          amount_today: outstanding, // Store calculated outstanding as amount_today for compatibility
          goal_year: completionYear  // Store calculated completion year
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

  // Format currency for display
  const formatCurrency = (value) => {
    if (!value || value === 0) return "₹0";
    return `₹${parseFloat(value).toLocaleString('en-IN')}`;
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-red-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const availableCategories = LIABILITY_CATEGORIES.filter(c => !addedCategories.includes(c.value));
  const activeCategories = LIABILITY_CATEGORIES.filter(c => addedCategories.includes(c.value));

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-600">Enter loan details for each category</p>
        <Badge variant="outline" className="text-sm">{members.length} members</Badge>
      </div>

      {availableCategories.length > 0 && (
        <div className="mb-6">
          <p className="text-gray-400 text-sm mb-3">Click to add</p>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map(category => {
              const Icon = category.icon;
              return (
                <button key={category.value} onClick={() => addCategory(category.value)} disabled={isReadOnly}
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-full text-sm text-gray-600 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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
          const items = liabilityItems[category.value] || [];
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
                      <Badge className="bg-red-100 text-red-700 text-xs">{items.length}</Badge>
                      {hasUnsavedChanges && <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />}
                    </div>
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      {hasUnsavedChanges && (
                        <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly} size="sm" className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700">
                          <Save className="h-3 w-3 mr-1" />{savingCategory === category.value ? "..." : "Save"}
                        </Button>
                      )}
                      <button onClick={() => skipCategory(category.value)} disabled={isReadOnly} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm"><SkipForward className="h-3.5 w-3.5" />Skip</button>
                      <button onClick={() => addLiabilityItem(category.value)} disabled={isReadOnly} className="flex items-center gap-1 text-red-600 hover:text-red-700 text-sm font-medium"><Plus className="h-3.5 w-3.5" />Add</button>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {items.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm">No entries. Click &quot;+ Add&quot;.</div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {items.map((item, idx) => {
                          const outstanding = calculateOutstanding(item.details.monthly_emi, item.details.num_installments);
                          const completionYear = calculateCompletionYear(item.details.num_installments);
                          
                          return (
                            <div key={item.id} className={`p-4 rounded-lg ${item.isNew ? 'bg-green-50 border border-green-200' : item.isModified ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                              <div className="flex flex-wrap gap-3 items-end">
                                {/* Member */}
                                <div className="flex flex-col min-w-[140px] flex-1 max-w-[180px]">
                                  <Label className="text-[10px] text-gray-500 mb-1 block">Member <span className="text-red-500">*</span></Label>
                                  <Select value={item.memberId || ""} onValueChange={(v) => updateLiabilityItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 text-xs bg-white w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                
                                {/* Monthly EMI Amount */}
                                <div className="flex flex-col min-w-[130px] max-w-[150px]">
                                  <Label className="text-[10px] text-gray-500 mb-1 block">Monthly EMI <span className="text-red-500">*</span></Label>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                    <Input 
                                      type="number" 
                                      value={item.details.monthly_emi || ""} 
                                      onChange={(e) => updateLiabilityItem(category.value, item.id, "monthly_emi", e.target.value)} 
                                      placeholder="0" 
                                      className="h-8 text-xs bg-white w-full pl-5" 
                                      disabled={isReadOnly} 
                                    />
                                  </div>
                                </div>
                                
                                {/* No. of Installments */}
                                <div className="flex flex-col min-w-[100px] max-w-[120px]">
                                  <Label className="text-[10px] text-gray-500 mb-1 block">No. of Installments <span className="text-red-500">*</span></Label>
                                  <Input 
                                    type="number" 
                                    value={item.details.num_installments || ""} 
                                    onChange={(e) => updateLiabilityItem(category.value, item.id, "num_installments", e.target.value)} 
                                    placeholder="0" 
                                    className="h-8 text-xs bg-white w-full" 
                                    disabled={isReadOnly} 
                                  />
                                </div>
                                
                                {/* Outstanding Amount (Auto-calculated) */}
                                <div className="flex flex-col min-w-[130px] max-w-[150px]">
                                  <Label className="text-[10px] text-gray-500 mb-1 block">Outstanding Amount</Label>
                                  <div className="h-8 px-3 flex items-center bg-gray-100 border border-gray-200 rounded-md text-xs text-gray-700 font-medium">
                                    {formatCurrency(outstanding)}
                                  </div>
                                </div>
                                
                                {/* Loan Completion Year (Auto-calculated) */}
                                <div className="flex flex-col min-w-[100px] max-w-[120px]">
                                  <Label className="text-[10px] text-gray-500 mb-1 block">Completion Year</Label>
                                  <div className="h-8 px-3 flex items-center bg-gray-100 border border-gray-200 rounded-md text-xs text-gray-700 font-medium">
                                    {item.details.num_installments ? completionYear : '-'}
                                  </div>
                                </div>
                                
                                {/* Delete Button */}
                                {idx > 0 && (
                                  <div className="flex flex-col justify-end">
                                    <button onClick={() => removeLiabilityItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex items-center">
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {activeCategories.length === 0 && <div className="text-center py-8 text-gray-400"><p>Click on a category above to start adding liability details</p></div>}
    </div>
  );
}
