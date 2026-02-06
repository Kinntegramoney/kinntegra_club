import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Save, Plus, Trash2, ChevronDown, ChevronRight, User, EyeOff, Eye,
  Landmark, Home, Car, Gem, Wallet, TrendingUp, Building, PiggyBank, Coins
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Asset categories - Face values only (NO maturity dates)
// Items WITH maturity dates will also reflect in Income section for cashflow tracking
const ASSET_CATEGORIES = [
  { 
    value: "ppf", 
    label: "PPF", 
    icon: PiggyBank,
    hasMaturity: true, // Will also reflect in Income
    fields: [
      { key: "current_value", label: "Current Value", type: "number" }
    ]
  },
  { 
    value: "epf", 
    label: "EPF", 
    icon: PiggyBank,
    hasMaturity: true,
    fields: [
      { key: "current_value", label: "Current Value", type: "number" }
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    hasMaturity: true,
    fields: [
      { key: "expected_amount", label: "Expected Amount", type: "number" }
    ]
  },
  { 
    value: "fd", 
    label: "Fixed Deposits", 
    icon: Landmark,
    hasMaturity: true,
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "principal_amount", label: "Principal", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" }
    ]
  },
  { 
    value: "rd_pis", 
    label: "RD / PIS", 
    icon: Landmark,
    hasMaturity: true,
    fields: [
      { key: "current_value", label: "Current Value", type: "number" },
      { key: "monthly_contribution", label: "Monthly Contribution", type: "number" }
    ]
  },
  { 
    value: "bond", 
    label: "Bonds", 
    icon: Landmark,
    hasMaturity: true,
    fields: [
      { key: "principal_amount", label: "Principal", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" }
    ]
  },
  { 
    value: "insurance_corpus", 
    label: "Insurance", 
    icon: Building,
    hasMaturity: true,
    fields: [
      { key: "sum_assured", label: "Sum Assured", type: "number" },
      { key: "current_value", label: "Current Value", type: "number" }
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    hasMaturity: false, // No maturity - won't reflect in Income
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "sip_amount", label: "SIP Amount", type: "number" }
    ]
  },
  { 
    value: "shares_pms", 
    label: "Shares / PMS", 
    icon: TrendingUp,
    hasMaturity: false,
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "gold", 
    label: "Gold", 
    icon: Gem,
    hasMaturity: false,
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "cash", 
    label: "Cash in Hand", 
    icon: Coins,
    hasMaturity: false,
    fields: [
      { key: "amount", label: "Amount", type: "number" }
    ]
  },
  { 
    value: "real_estate", 
    label: "Real Estate", 
    icon: Home,
    hasMaturity: false,
    fields: [
      { key: "property_details", label: "Property Details", type: "text" },
      { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Land"] },
      { key: "purchase_value", label: "Purchase Value", type: "number" },
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "description", label: "Description", type: "text" }
    ]
  },
  { 
    value: "vehicle", 
    label: "Vehicles", 
    icon: Car,
    hasMaturity: false,
    fields: [
      { key: "vehicle_type", label: "Type", type: "text" },
      { key: "current_value", label: "Current Value", type: "number" }
    ]
  },
  { 
    value: "other", 
    label: "Other Assets", 
    icon: Wallet,
    hasMaturity: false,
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "value", label: "Value", type: "number" }
    ]
  }
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

  const toggleCategory = (category) => {
    const isCurrentlyExpanded = expandedCategories[category];
    const items = assetItems[category] || [];
    
    // If expanding and no items exist, auto-add one
    if (!isCurrentlyExpanded && items.length === 0) {
      addAssetItem(category);
    } else {
      setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
    }
  };
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
        const payload = { family_id: family.id, member_ids: [item.memberId], category, details: item.details };
        if (item.isNew) {
          await axios.post(`${API}/data-gathering/family/${family.id}/asset`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          await axios.put(`${API}/data-gathering/family/${family.id}/asset/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        }
      }
      toast.success("Saved");
      
      // Collapse current category and open next one with auto-add
      const visibleCategories = ASSET_CATEGORIES.filter(c => !hiddenCategories.includes(c.value));
      const currentIndex = visibleCategories.findIndex(c => c.value === category);
      const nextCategory = visibleCategories[currentIndex + 1];
      
      // Close current category
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      
      // If next category exists and has no items, auto-add an entry
      if (nextCategory) {
        const nextItems = assetItems[nextCategory.value] || [];
        if (nextItems.length === 0) {
          setAssetItems(prev => ({
            ...prev,
            [nextCategory.value]: [...(prev[nextCategory.value] || []), {
              id: `new_${Date.now()}`,
              memberId: members[0]?.id || "",
              details: {},
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
    const val = parseFloat(a.details?.market_value) || parseFloat(a.details?.current_value) || parseFloat(a.details?.amount) || parseFloat(a.details?.principal_amount) || parseFloat(a.details?.sum_assured) || parseFloat(a.details?.expected_amount) || parseFloat(a.details?.value) || 0;
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
    <div className="space-y-4">
      {/* Summary */}
      {totalAssets > 0 && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <span className="text-xs text-green-600">Total Assets Value</span>
          <span className="font-semibold text-green-700">₹{totalAssets.toLocaleString('en-IN')}</span>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>Record face values. Items with maturity will also reflect in Income.</span>
        <Badge variant="outline" className="text-xs">{members.length} member{members.length !== 1 ? 's' : ''}</Badge>
      </div>

      {/* Assets Summary Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-600 px-4 py-3">Particulars</th>
              <th className="text-right text-xs font-medium text-gray-600 px-4 py-3">Investment Value</th>
              <th className="text-right text-xs font-medium text-gray-600 px-4 py-3">Market Value</th>
              <th className="text-center text-xs font-medium text-gray-600 px-4 py-3 w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleCategories.map(category => {
              const Icon = category.icon;
              const items = assetItems[category.value] || [];
              const itemCount = items.length;
              const hasUnsavedChanges = items.some(item => item.isNew || item.isModified);
              const isExpanded = expandedCategories[category.value];
              
              // Calculate totals for this category
              const investmentTotal = items.reduce((sum, item) => {
                return sum + (parseFloat(item.details?.principal_amount) || parseFloat(item.details?.current_value) || parseFloat(item.details?.amount) || parseFloat(item.details?.sum_assured) || parseFloat(item.details?.expected_amount) || 0);
              }, 0);
              
              const marketTotal = items.reduce((sum, item) => {
                return sum + (parseFloat(item.details?.market_value) || parseFloat(item.details?.current_value) || parseFloat(item.details?.amount) || parseFloat(item.details?.principal_amount) || 0);
              }, 0);
              
              return (
                <React.Fragment key={category.value}>
                  <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-green-50/50' : ''}`} onClick={() => toggleCategory(category.value)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                        <Icon className={`h-4 w-4 ${itemCount > 0 ? 'text-green-600' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium text-gray-800">{category.label}</span>
                        {category.hasMaturity && <Badge variant="outline" className="text-[10px] h-4 px-1 text-blue-500 border-blue-200">→ Income</Badge>}
                        {itemCount > 0 && <Badge className="bg-green-100 text-green-700 text-[10px] h-4 px-1.5">{itemCount}</Badge>}
                        {hasUnsavedChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm ${investmentTotal > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                        {investmentTotal > 0 ? `₹${investmentTotal.toLocaleString('en-IN')}` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm ${marketTotal > 0 ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                        {marketTotal > 0 ? `₹${marketTotal.toLocaleString('en-IN')}` : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {hasUnsavedChanges && (
                          <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly} size="sm" className="h-6 px-2 text-[10px] bg-green-600 hover:bg-green-700">
                            <Save className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => addAssetItem(category.value)} disabled={isReadOnly} className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700 hover:bg-green-50">
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => hideCategory(category.value)} disabled={isReadOnly || itemCount > 0} className="h-6 px-1 text-[10px] text-gray-400 hover:text-gray-600">
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded Content - Show items */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 bg-gray-50/50">
                        {items.length === 0 ? (
                          <div className="text-center py-2 text-gray-400 text-xs">No entries. Click + to add.</div>
                        ) : (
                          <div className="space-y-2">
                            {items.map((item, idx) => (
                              <div key={item.id} className={`p-3 rounded border ${item.isNew ? 'bg-green-50/50 border-green-200' : item.isModified ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-gray-100'}`}>
                                <div className="flex flex-wrap gap-3 items-end">
                                  <div className="flex flex-col min-w-[120px] flex-1 max-w-[180px]">
                                    <Label className="text-[10px] text-gray-400 mb-1 block">Member</Label>
                                    <Select value={item.memberId || ""} onValueChange={(v) => updateAssetItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                      <SelectTrigger className="h-8 text-xs w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                                      <SelectContent>
                                        {members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {category.fields.map(field => (
                                    <div key={field.key} className="flex flex-col min-w-[100px] flex-1 max-w-[180px]">
                                      <Label className="text-[10px] text-gray-400 mb-1 block">{field.label}</Label>
                                      {renderField(category.value, item.id, field, item.details[field.key])}
                                    </div>
                                  ))}
                                  {idx > 0 && (
                                    <div className="flex flex-col justify-end">
                                      <button onClick={() => removeAssetItem(category.value, item.id, item.isNew)} disabled={isReadOnly} className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex items-center">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            
            {/* Total Row */}
            <tr className="bg-green-50 font-medium">
              <td className="px-4 py-3 text-sm text-green-800">Total</td>
              <td className="px-4 py-3 text-right text-sm text-green-800">
                ₹{visibleCategories.reduce((sum, cat) => {
                  const items = assetItems[cat.value] || [];
                  return sum + items.reduce((s, item) => s + (parseFloat(item.details?.principal_amount) || parseFloat(item.details?.current_value) || parseFloat(item.details?.amount) || parseFloat(item.details?.sum_assured) || parseFloat(item.details?.expected_amount) || 0), 0);
                }, 0).toLocaleString('en-IN')}
              </td>
              <td className="px-4 py-3 text-right text-sm text-green-800">
                ₹{totalAssets.toLocaleString('en-IN')}
              </td>
              <td className="px-4 py-3"></td>
            </tr>
          </tbody>
        </table>
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
