import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Plus, Trash2, ChevronDown, ChevronRight, User, X, Home, Car, Heart, Zap, Phone, ShoppingBag, Utensils, GraduationCap, Users, CreditCard, Shirt, Tv, Scissors, Shield, FileText, Building, Coins } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPENSE_CATEGORIES = [
  { value: "food_grocery", label: "Food & Grocery", icon: Utensils, color: "orange" },
  { value: "house_rent", label: "House Rent / Maintenance / Repair", icon: Home, color: "blue" },
  { value: "conveyance", label: "Conveyance, Fuel & Maintenance", icon: Car, color: "slate" },
  { value: "healthcare", label: "Medicines / Doctor / Healthcare", icon: Heart, color: "red" },
  { value: "utilities", label: "Electricity / Water / Labour / AMC", icon: Zap, color: "yellow" },
  { value: "mobile", label: "Mobile", icon: Phone, color: "green" },
  { value: "gasline_internet", label: "Gas Line / Telephone / Internet / Cable", icon: Tv, color: "purple" },
  { value: "clothing", label: "Clothes and Accessories", icon: Shirt, color: "pink" },
  { value: "shopping", label: "Shopping, Gifts, White Goods, Gadgets", icon: ShoppingBag, color: "teal" },
  { value: "entertainment", label: "Dining / Movies / Sports", icon: Utensils, color: "indigo" },
  { value: "personal_care", label: "Personal Care / Others", icon: Scissors, color: "rose" },
  { value: "mediclaim", label: "Mediclaim / PA / CI", icon: Shield, color: "emerald" },
  { value: "children_education", label: "Children's Schooling / College Expenses", icon: GraduationCap, color: "cyan" },
  { value: "family_support", label: "Contribution To Parents / Siblings", icon: Users, color: "amber" },
  { value: "motor_insurance", label: "Motor Insurance", icon: Car, color: "gray" },
  { value: "life_insurance", label: "Life Insurance – Term Plan", icon: FileText, color: "violet" }
];

// Loan/Liability categories (EMI-based)
const LOAN_CATEGORIES = [
  { value: "home_loan", label: "Home Loan EMI", icon: Home, color: "red" },
  { value: "vehicle_loan", label: "Vehicle Loan EMI", icon: Car, color: "red" },
  { value: "personal_loan", label: "Personal Loan EMI", icon: CreditCard, color: "red" },
  { value: "consumer_durable", label: "Consumer Durable EMI", icon: Building, color: "red" },
  { value: "education_loan", label: "Education Loan EMI", icon: GraduationCap, color: "red" },
  { value: "credit_card", label: "Credit Card EMI", icon: CreditCard, color: "red" },
  { value: "other_loan", label: "Other Loan EMI", icon: Coins, color: "red" }
];

const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => (2020 + i).toString());
const colorMap = {
  orange: "bg-orange-500", blue: "bg-blue-500", slate: "bg-slate-500", red: "bg-red-500",
  yellow: "bg-yellow-500", green: "bg-green-500", purple: "bg-purple-500", pink: "bg-pink-500",
  teal: "bg-teal-500", indigo: "bg-indigo-500", rose: "bg-rose-500", emerald: "bg-emerald-500",
  cyan: "bg-cyan-500", amber: "bg-amber-500", gray: "bg-gray-500", violet: "bg-violet-500"
};

export default function ExpenseSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [expenseItems, setExpenseItems] = useState({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);

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
            monthly_amount: exp.monthly_amount || (exp.annual_amount ? Math.round(exp.annual_amount / 12) : ""),
            annual_amount: exp.annual_amount || "",
            upto_year: exp.upto_year, 
            inflation_percent: exp.inflation_percent ?? 5,
            consider_post_retirement: exp.consider_post_retirement || false,
            post_retirement_member: exp.post_retirement_member || "",
            post_retirement_percent: exp.post_retirement_percent ?? 100
          },
          isNew: false, 
          isModified: false
        });
      }
    });

    setExpenseItems(itemsByCategory);
    setAddedCategories(added);
    if (!initialLoadDone) {
      const expanded = {};
      added.forEach(cat => { expanded[cat] = true; });
      setExpandedCategories(expanded);
      setInitialLoadDone(true);
    }
  }, [family?.id, existingExpenses.length, initialLoadDone]);

  const addCategory = (val) => {
    if (!addedCategories.includes(val)) {
      setAddedCategories(prev => [...prev, val]);
      setExpandedCategories(prev => ({ ...prev, [val]: true }));
      addExpenseItem(val);
    }
  };

  const skipCategory = (val) => {
    setAddedCategories(prev => prev.filter(c => c !== val));
    setExpandedCategories(prev => ({ ...prev, [val]: false }));
    setExpenseItems(prev => ({ ...prev, [val]: [] }));
  };

  const toggleCategory = (cat) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const addExpenseItem = (cat) => {
    const year = new Date().getFullYear();
    setExpenseItems(prev => ({
      ...prev,
      [cat]: [...(prev[cat] || []), { 
        id: `new_${Date.now()}`, 
        memberId: members[0]?.id || "", 
        details: { 
          monthly_amount: "",
          annual_amount: "",
          upto_year: (year + 30).toString(), 
          inflation_percent: 5,
          consider_post_retirement: false,
          post_retirement_member: "",
          post_retirement_percent: 100
        }, 
        isNew: true, 
        isModified: false 
      }]
    }));
  };

  const removeExpenseItem = async (cat, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/expense/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed"); return; }
    }
    const updated = expenseItems[cat].filter(i => i.id !== itemId);
    setExpenseItems(prev => ({ ...prev, [cat]: updated }));
    if (updated.length === 0) setAddedCategories(prev => prev.filter(c => c !== cat));
  };

  const updateExpenseItem = (cat, itemId, field, value) => {
    setExpenseItems(prev => ({
      ...prev,
      [cat]: prev[cat].map(item => {
        if (item.id !== itemId) return item;
        
        if (field === "memberId") {
          return { ...item, memberId: value, isModified: !item.isNew };
        }
        
        let newDetails = { ...item.details, [field]: value };
        
        // Auto-calculate annual amount when monthly amount changes
        if (field === "monthly_amount") {
          const monthly = parseFloat(value) || 0;
          newDetails.annual_amount = monthly * 12;
        }
        
        // Reset post-retirement fields when checkbox is unchecked
        if (field === "consider_post_retirement" && !value) {
          newDetails.post_retirement_member = "";
          newDetails.post_retirement_percent = 100;
        }
        
        return { ...item, details: newDetails, isModified: !item.isNew };
      })
    }));
  };

  const saveCategory = async (cat) => {
    const items = expenseItems[cat] || [];
    const toSave = items.filter(i => i.isNew || i.isModified);
    if (toSave.length === 0) { toast.info("No changes"); return; }
    
    // Validate required fields
    for (const item of toSave) { 
      if (!item.memberId || !item.details.monthly_amount) { 
        toast.error("Fill required fields (Member and Monthly Amount)"); 
        return; 
      }
      // Validate post-retirement fields if checkbox is checked
      if (item.details.consider_post_retirement) {
        if (!item.details.post_retirement_member) {
          toast.error("Select Post-Retirement Applicable Member");
          return;
        }
        if (item.details.post_retirement_percent < 0 || item.details.post_retirement_percent > 100) {
          toast.error("% of Current Annual Expense must be between 0 and 100");
          return;
        }
      }
    }

    setSavingCategory(cat);
    try {
      const token = localStorage.getItem("token");
      for (const item of toSave) {
        const payload = { 
          family_id: family.id, 
          member_ids: [item.memberId], 
          expense_type: cat, 
          monthly_amount: parseFloat(item.details.monthly_amount),
          annual_amount: parseFloat(item.details.monthly_amount) * 12,
          upto_year: parseInt(item.details.upto_year), 
          inflation_percent: parseFloat(item.details.inflation_percent) || 5,
          consider_post_retirement: item.details.consider_post_retirement || false,
          post_retirement_member: item.details.consider_post_retirement ? item.details.post_retirement_member : null,
          post_retirement_percent: item.details.consider_post_retirement ? parseFloat(item.details.post_retirement_percent) : null
        };
        if (item.isNew) await axios.post(`${API}/data-gathering/family/${family.id}/expense`, payload, { headers: { Authorization: `Bearer ${token}` } });
        else await axios.put(`${API}/data-gathering/family/${family.id}/expense/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      toast.success("Saved");
      setExpandedCategories(prev => ({ ...prev, [cat]: false }));
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  if (members.length === 0) return <div className="flex flex-col items-center py-10"><User className="h-8 w-8 text-gray-400 mb-2" /><p className="text-gray-500 text-sm">Add members first</p></div>;

  const available = EXPENSE_CATEGORIES.filter(c => !addedCategories.includes(c.value));
  const active = EXPENSE_CATEGORIES.filter(c => addedCategories.includes(c.value));

  return (
    <div className="space-y-4">
      {available.length > 0 && (
        <div className="bg-gray-50/50 rounded-lg p-4">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-3">Click to add</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map(cat => {
              const Icon = cat.icon;
              return <button key={cat.value} onClick={() => addCategory(cat.value)} disabled={isReadOnly} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50/50 transition-all"><Plus className="h-3 w-3" /><Icon className="h-3 w-3" /><span>{cat.label}</span></button>;
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {active.map(cat => {
          const Icon = cat.icon;
          const items = expenseItems[cat.value] || [];
          const isExp = expandedCategories[cat.value];
          const hasChanges = items.some(i => i.isNew || i.isModified);

          return (
            <Collapsible key={cat.value} open={isExp} onOpenChange={() => toggleCategory(cat.value)}>
              <div className={`bg-white rounded-lg border transition-all ${hasChanges ? 'border-amber-300' : 'border-gray-200'}`}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1 h-6 rounded-full ${colorMap[cat.color]}`} />
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">{cat.label}</span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-gray-100">{items.length}</Badge>
                      {hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {hasChanges && (
                        <Button onClick={() => saveCategory(cat.value)} disabled={savingCategory === cat.value || isReadOnly} size="sm" className="h-7 px-3 text-xs bg-orange-600 hover:bg-orange-700">
                          <Save className="h-3 w-3 mr-1" />{savingCategory === cat.value ? "..." : "Save"}
                        </Button>
                      )}
                      <button onClick={() => skipCategory(cat.value)} disabled={isReadOnly} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"><X className="h-3.5 w-3.5" /></button>
                      <button onClick={() => addExpenseItem(cat.value)} disabled={isReadOnly} className="p-1.5 text-orange-500 hover:text-orange-600 hover:bg-orange-50 rounded"><Plus className="h-3.5 w-3.5" /></button>
                      <div className="p-1.5 text-gray-400">{isExp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                    {items.length === 0 ? <p className="text-center py-4 text-xs text-gray-400">Click + to add</p> : (
                      <div className="space-y-1">
                        {/* Common Header Row - shown when multiple items */}
                        {items.length > 1 && (
                          <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.6fr_auto_1.5fr_0.6fr_auto] gap-3 items-end px-2 py-1 bg-gray-50 rounded-t border-b border-gray-200">
                            <span className="text-[10px] text-gray-500 font-medium">Member *</span>
                            <span className="text-[10px] text-gray-500 font-medium">Monthly Amt *</span>
                            <span className="text-[10px] text-blue-500 font-medium">Annual Amt</span>
                            <span className="text-[10px] text-gray-500 font-medium">Upto Year *</span>
                            <span className="text-[10px] text-gray-500 font-medium">Inflation %</span>
                            <span className="text-[10px] text-gray-500 font-medium">Post Ret.</span>
                            <span className="text-[10px] text-gray-500 font-medium">Post-Ret. Member</span>
                            <span className="text-[10px] text-gray-500 font-medium">% of Exp</span>
                            <span style={{ width: '40px' }}></span>
                          </div>
                        )}
                        
                        {items.map((item, idx) => {
                          const isPostRetirementEnabled = item.details.consider_post_retirement;
                          const calculatedAnnual = (parseFloat(item.details.monthly_amount) || 0) * 12;
                          const showLabels = items.length === 1;
                          
                          return (
                            <div key={item.id} className={`rounded-md p-3 ${item.isNew ? 'bg-green-50/50 border border-green-200' : item.isModified ? 'bg-amber-50/50 border border-amber-200' : 'bg-gray-50/30 border border-gray-100'}`}>
                              <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr_0.6fr_auto_1.5fr_0.6fr_auto] gap-3 items-end">
                                <div className="flex flex-col min-w-0">
                                  {showLabels && <span className="text-[10px] text-gray-400 mb-1">Member *</span>}
                                  <Select value={item.memberId || ""} onValueChange={v => updateExpenseItem(cat.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="flex flex-col min-w-0">
                                  {showLabels && <span className="text-[10px] text-gray-400 mb-1">Monthly Amt *</span>}
                                  <Input 
                                    type="number" 
                                    value={item.details.monthly_amount || ""} 
                                    onChange={e => updateExpenseItem(cat.value, item.id, "monthly_amount", e.target.value)} 
                                    className="h-8 w-full text-xs bg-white border-gray-200" 
                                    disabled={isReadOnly}
                                    min="0"
                                  />
                                </div>
                                
                                <div className="flex flex-col min-w-0">
                                  {showLabels && <span className="text-[10px] text-blue-500 mb-1">Annual Amt</span>}
                                  <Input 
                                    type="number" 
                                    value={calculatedAnnual || ""} 
                                    className="h-8 w-full text-xs bg-gray-100 border-gray-200 text-gray-600" 
                                    disabled={true}
                                    readOnly
                                  />
                                </div>
                                
                                <div className="flex flex-col min-w-0">
                                  {showLabels && <span className="text-[10px] text-gray-400 mb-1">Upto Year *</span>}
                                  <Select value={item.details.upto_year?.toString() || ""} onValueChange={v => updateExpenseItem(cat.value, item.id, "upto_year", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200"><SelectValue /></SelectTrigger>
                                    <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="flex flex-col min-w-0">
                                  {showLabels && <span className="text-[10px] text-gray-400 mb-1">Inflation %</span>}
                                  <Input 
                                    type="number" 
                                    value={item.details.inflation_percent ?? ""} 
                                    onChange={e => updateExpenseItem(cat.value, item.id, "inflation_percent", e.target.value)} 
                                    className="h-8 w-full text-xs bg-white border-gray-200" 
                                    disabled={isReadOnly}
                                    min="0"
                                  />
                                </div>
                                
                                <div className="flex items-center h-8">
                                  <Checkbox 
                                    id={`post-retirement-${item.id}`}
                                    checked={item.details.consider_post_retirement || false}
                                    onCheckedChange={(checked) => updateExpenseItem(cat.value, item.id, "consider_post_retirement", checked)}
                                    disabled={isReadOnly}
                                    className="h-4 w-4"
                                  />
                                  {showLabels && (
                                    <label htmlFor={`post-retirement-${item.id}`} className="text-[9px] text-gray-600 cursor-pointer ml-1 whitespace-nowrap">
                                      Post Ret.
                                    </label>
                                  )}
                                </div>
                                
                                <div className="flex flex-col min-w-0">
                                  {showLabels && <span className="text-[10px] text-gray-400 mb-1">Post-Ret. Member</span>}
                                  <Select 
                                    value={item.details.post_retirement_member || ""} 
                                    onValueChange={v => updateExpenseItem(cat.value, item.id, "post_retirement_member", v)} 
                                    disabled={isReadOnly || !isPostRetirementEnabled}
                                  >
                                    <SelectTrigger className={`h-8 w-full text-xs border-gray-200 ${!isPostRetirementEnabled ? 'bg-gray-100 text-gray-400' : 'bg-white'}`}>
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div className="flex flex-col min-w-0">
                                  {showLabels && <span className="text-[10px] text-gray-400 mb-1">% of Exp</span>}
                                  <Input 
                                    type="number" 
                                    value={item.details.post_retirement_percent ?? 100} 
                                    onChange={e => updateExpenseItem(cat.value, item.id, "post_retirement_percent", e.target.value)} 
                                    className={`h-8 w-full text-xs border-gray-200 ${!isPostRetirementEnabled ? 'bg-gray-100 text-gray-400' : 'bg-white'}`}
                                    disabled={isReadOnly || !isPostRetirementEnabled}
                                    min="0"
                                    max="100"
                                  />
                                </div>
                                
                                {/* Delete button for additional items (idx > 0) */}
                                {idx > 0 ? (
                                  <div className="flex flex-col justify-end">
                                    <button 
                                      onClick={() => removeExpenseItem(cat.value, item.id, item.isNew)} 
                                      disabled={isReadOnly} 
                                      className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex items-center"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : <div style={{ width: '40px' }}></div>}
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
      {active.length === 0 && available.length > 0 && <p className="text-center py-6 text-xs text-gray-400">Select a category above to begin</p>}
    </div>
  );
}
