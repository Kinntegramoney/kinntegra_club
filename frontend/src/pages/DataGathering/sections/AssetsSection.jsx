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
  Landmark, Home, Car, Gem, Wallet, TrendingUp, Building, PiggyBank, Coins
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ASSET_CATEGORIES = [
  { value: "real_estate", label: "Real Estate", icon: Home, fields: [
    { key: "property_type", label: "Type", type: "select", options: ["Residential", "Commercial", "Land", "Plot"] },
    { key: "purchase_value", label: "Purchase Value", type: "number" },
    { key: "current_value", label: "Current Value", type: "number" },
    { key: "purchase_year", label: "Purchase Year", type: "number" }
  ]},
  { value: "gold_jewellery", label: "Gold & Jewellery", icon: Gem, fields: [
    { key: "weight_grams", label: "Weight (gms)", type: "number" },
    { key: "current_value", label: "Current Value", type: "number" }
  ]},
  { value: "fixed_deposit", label: "Fixed Deposits", icon: Landmark, fields: [
    { key: "principal", label: "Principal", type: "number" },
    { key: "interest_rate", label: "Rate %", type: "number" },
    { key: "maturity_date", label: "Maturity", type: "date" }
  ]},
  { value: "ppf", label: "PPF", icon: PiggyBank, fields: [
    { key: "current_value", label: "Current Value", type: "number" },
    { key: "yearly_contribution", label: "Yearly Contribution", type: "number" }
  ]},
  { value: "epf", label: "EPF / PF", icon: PiggyBank, fields: [
    { key: "current_value", label: "Current Value", type: "number" },
    { key: "monthly_contribution", label: "Monthly Contribution", type: "number" }
  ]},
  { value: "nps", label: "NPS", icon: PiggyBank, fields: [
    { key: "current_value", label: "Current Value", type: "number" },
    { key: "monthly_contribution", label: "Monthly Contribution", type: "number" }
  ]},
  { value: "mutual_funds", label: "Mutual Funds", icon: TrendingUp, fields: [
    { key: "current_value", label: "Current Value", type: "number" },
    { key: "sip_amount", label: "SIP Amount", type: "number" }
  ]},
  { value: "stocks", label: "Stocks / Equity", icon: TrendingUp, fields: [
    { key: "current_value", label: "Current Value", type: "number" },
    { key: "invested_amount", label: "Invested Amount", type: "number" }
  ]},
  { value: "bonds", label: "Bonds / Debentures", icon: Landmark, fields: [
    { key: "face_value", label: "Face Value", type: "number" },
    { key: "current_value", label: "Current Value", type: "number" },
    { key: "maturity_date", label: "Maturity", type: "date" }
  ]},
  { value: "vehicle", label: "Vehicles", icon: Car, fields: [
    { key: "vehicle_type", label: "Type", type: "select", options: ["Car", "Two Wheeler", "Commercial"] },
    { key: "purchase_value", label: "Purchase Value", type: "number" },
    { key: "current_value", label: "Current Value", type: "number" }
  ]},
  { value: "savings_account", label: "Savings Account", icon: Wallet, fields: [
    { key: "bank_name", label: "Bank", type: "text" },
    { key: "balance", label: "Balance", type: "number" }
  ]},
  { value: "cash", label: "Cash in Hand", icon: Coins, fields: [
    { key: "amount", label: "Amount", type: "number" }
  ]},
  { value: "insurance_corpus", label: "Insurance Corpus", icon: Building, fields: [
    { key: "policy_type", label: "Type", type: "select", options: ["Endowment", "ULIP", "Money Back", "Pension"] },
    { key: "sum_assured", label: "Sum Assured", type: "number" },
    { key: "current_value", label: "Current Value", type: "number" }
  ]},
  { value: "other", label: "Other Assets", icon: Wallet, fields: [
    { key: "description", label: "Description", type: "text" },
    { key: "current_value", label: "Current Value", type: "number" }
  ]}
];

export default function AssetsSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [assetItems, setAssetItems] = useState({});

  const members = family?.members || [];
  const existingAssets = family?.asset_details || [];

  useEffect(() => {
    const itemsByCategory = {};
    ASSET_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingAssets.forEach(asset => {
      const category = asset.category;
      if (itemsByCategory[category]) {
        itemsByCategory[category].push({
          id: asset.id,
          memberId: asset.member_ids?.[0] || "",
          details: asset.details || {},
          isNew: false,
          isModified: false
        });
      }
    });

    setAssetItems(itemsByCategory);
    const expanded = {};
    ASSET_CATEGORIES.forEach(cat => {
      if (itemsByCategory[cat.value]?.length > 0) expanded[cat.value] = true;
    });
    setExpandedCategories(expanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family?.id, existingAssets.length]);

  const toggleCategory = (category) => setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  const hideCategory = (category) => { setHiddenCategories(prev => [...prev, category]); setExpandedCategories(prev => ({ ...prev, [category]: false })); };
  const showCategory = (category) => setHiddenCategories(prev => prev.filter(c => c !== category));

  const addAssetItem = (category) => {
    setAssetItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: {},
        isNew: true,
        isModified: false
      }]
    }));
    setExpandedCategories(prev => ({ ...prev, [category]: true }));
  };

  const removeAssetItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/asset/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed to delete"); return; }
    }
    setAssetItems(prev => ({ ...prev, [category]: prev[category].filter(item => item.id !== itemId) }));
  };

  const updateAssetItem = (category, itemId, field, value) => {
    setAssetItems(prev => ({
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
    const items = assetItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    if (itemsToSave.length === 0) { toast.info("No changes"); return; }

    for (const item of itemsToSave) {
      if (!item.memberId) { toast.error("Select a member"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const payload = {
          family_id: family.id,
          member_ids: [item.memberId],
          category,
          details: item.details
        };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/asset`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/asset/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        }
      }
      toast.success("Saved");
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  const renderField = (category, itemId, field, value) => {
    if (field.type === "select") {
      return (
        <Select value={value || ""} onValueChange={(v) => updateAssetItem(category, itemId, field.key, v)} disabled={isReadOnly}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {field.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={field.type}
        value={value || ""}
        onChange={(e) => updateAssetItem(category, itemId, field.key, e.target.value)}
        placeholder={field.type === "number" ? "0" : ""}
        className="h-8 text-xs"
        disabled={isReadOnly}
      />
    );
  };

  const getCategoryItemCount = (category) => assetItems[category]?.length || 0;
  
  // Calculate total assets
  const totalAssets = Object.values(assetItems).flat().reduce((sum, a) => {
    const val = parseFloat(a.details?.current_value) || parseFloat(a.details?.balance) || parseFloat(a.details?.amount) || 0;
    return sum + val;
  }, 0);

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-green-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const visibleCategories = ASSET_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
  const hiddenCategoryList = ASSET_CATEGORIES.filter(c => hiddenCategories.includes(c.value));

  return (
    <div className="space-y-2">
      {/* Summary */}
      {totalAssets > 0 && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
          <span className="text-xs text-green-600">Total Assets Value</span>
          <span className="font-semibold text-green-700">₹{totalAssets.toLocaleString('en-IN')}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 px-1 mb-1">
        <span>Click "Skip" to hide asset types you don't have</span>
        <Badge variant="outline" className="text-xs">{members.length} member{members.length !== 1 ? 's' : ''}</Badge>
      </div>

      <div className="space-y-1.5">
        {visibleCategories.map(category => {
          const Icon = category.icon;
          const itemCount = getCategoryItemCount(category.value);
          const isExpanded = expandedCategories[category.value];
          const items = assetItems[category.value] || [];
          const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
          
          return (
            <Card key={category.value} className={`overflow-hidden ${itemCount > 0 ? 'border-green-200 bg-green-50/30' : ''}`}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2 px-3 cursor-pointer hover:bg-gray-50/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                        <Icon className={`h-4 w-4 ${itemCount > 0 ? 'text-green-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium">{category.label}</span>
                        {itemCount > 0 && <Badge className="bg-green-100 text-green-700 text-xs h-5 px-1.5">{itemCount}</Badge>}
                        {hasUnsavedChanges && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs h-5 px-1.5">•</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); hideCategory(category.value); }} disabled={isReadOnly || itemCount > 0} className="h-7 px-2 text-xs text-gray-400 hover:text-gray-600">
                          <EyeOff className="h-3 w-3 mr-1" />Skip
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); addAssetItem(category.value); }} disabled={isReadOnly} className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50">
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
                      <div className="space-y-2 border-t pt-2">
                        {items.map((item) => (
                          <div key={item.id} className={`p-2 rounded border ${item.isNew ? 'bg-green-50/50 border-green-200' : item.isModified ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-gray-100'}`}>
                            <div className="flex items-end gap-2 flex-wrap">
                              <div className="w-32">
                                <Label className="text-[10px] text-gray-400 mb-0.5 block">Member</Label>
                                <Select value={item.memberId || ""} onValueChange={(v) => updateAssetItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                  <SelectContent>
                                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              {category.fields.map(field => (
                                <div key={field.key} className="flex-1 min-w-[80px]">
                                  <Label className="text-[10px] text-gray-400 mb-0.5 block">{field.label}</Label>
                                  {renderField(category.value, item.id, field, item.details[field.key])}
                                </div>
                              ))}
                              <Button variant="ghost" size="icon" onClick={() => removeAssetItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end pt-1">
                          <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly || !hasUnsavedChanges} className="bg-green-600 hover:bg-green-700 text-white h-7 px-3 text-xs" size="sm">
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
          <div className="text-xs text-gray-400 mb-2 px-1">Skipped Assets (click to restore)</div>
          <div className="flex flex-wrap gap-1.5">
            {hiddenCategoryList.map(category => {
              const Icon = category.icon;
              return (
                <button key={category.value} onClick={() => showCategory(category.value)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-colors">
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
