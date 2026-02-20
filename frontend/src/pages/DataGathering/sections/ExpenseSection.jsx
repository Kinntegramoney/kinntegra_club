import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Plus, Trash2, ChevronDown, ChevronRight, User, X, Home, Car, Heart, Zap, Phone, ShoppingBag, Utensils, GraduationCap, Users, CreditCard, Shirt, Tv, Scissors, Shield, FileText, Building, Coins, Umbrella, Briefcase } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPENSE_CATEGORIES = [
  // Regular expenses
  { value: "food_grocery", label: "Food & Grocery", icon: Utensils, color: "orange", type: "expense" },
  { value: "house_rent", label: "House Rent / Maintenance / Repair", icon: Home, color: "blue", type: "expense" },
  { value: "conveyance", label: "Conveyance, Fuel & Maintenance", icon: Car, color: "slate", type: "expense" },
  { value: "healthcare", label: "Medicines / Doctor / Healthcare", icon: Heart, color: "red", type: "expense" },
  { value: "utilities", label: "Electricity / Water / Labour / AMC", icon: Zap, color: "yellow", type: "expense" },
  { value: "mobile", label: "Mobile", icon: Phone, color: "green", type: "expense" },
  { value: "gasline_internet", label: "Gas Line / Telephone / Internet / Cable", icon: Tv, color: "purple", type: "expense" },
  { value: "clothing", label: "Clothes and Accessories", icon: Shirt, color: "pink", type: "expense" },
  { value: "shopping", label: "Shopping, Gifts, White Goods, Gadgets", icon: ShoppingBag, color: "teal", type: "expense" },
  { value: "entertainment", label: "Dining / Movies / Sports", icon: Utensils, color: "indigo", type: "expense" },
  { value: "personal_care", label: "Personal Care / Others", icon: Scissors, color: "rose", type: "expense" },
  { value: "children_education", label: "Children's Schooling / College Expenses", icon: GraduationCap, color: "cyan", type: "expense" },
  { value: "family_support", label: "Contribution To Parents / Siblings", icon: Users, color: "amber", type: "expense" },
  // Insurance Premium categories
  { value: "term_life", label: "Term Life Insurance Premium", icon: Shield, color: "teal", type: "insurance" },
  { value: "health", label: "Health Insurance Premium", icon: Heart, color: "teal", type: "insurance" },
  { value: "critical_illness", label: "Critical Illness Premium", icon: Heart, color: "teal", type: "insurance" },
  { value: "personal_accident", label: "Personal Accident Premium", icon: Umbrella, color: "teal", type: "insurance" },
  { value: "motor", label: "Motor Insurance Premium", icon: Car, color: "teal", type: "insurance" },
  { value: "home_insurance", label: "Home Insurance Premium", icon: Home, color: "teal", type: "insurance" },
  { value: "professional", label: "Professional Indemnity Premium", icon: Briefcase, color: "teal", type: "insurance" },
  // Loan EMI categories
  { value: "home_loan", label: "Home Loan EMI", icon: Home, color: "red", type: "loan" },
  { value: "vehicle_loan", label: "Vehicle Loan EMI", icon: Car, color: "red", type: "loan" },
  { value: "personal_loan", label: "Personal Loan EMI", icon: CreditCard, color: "red", type: "loan" },
  { value: "consumer_durable", label: "Consumer Durable EMI", icon: Building, color: "red", type: "loan" },
  { value: "education_loan", label: "Education Loan EMI", icon: GraduationCap, color: "red", type: "loan" },
  { value: "credit_card", label: "Credit Card EMI", icon: CreditCard, color: "red", type: "loan" },
  { value: "other_loan", label: "Other Loan EMI", icon: Coins, color: "red", type: "loan" }
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
  const [items, setItems] = useState({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const members = family?.members || [];
  const existingExpenses = family?.expense_details || [];
  const existingLiabilities = family?.liability_details || [];
  const existingInsurance = family?.insurance_details || [];
  const currentYear = new Date().getFullYear();

  // Calculate the latest retirement year among all family members
  // Priority: Use explicitly set retirement_year from members, fallback to calculating from DOB + 60
  const RETIREMENT_AGE = 60;
  const getLatestMemberRetirementYear = () => {
    if (members.length === 0) return currentYear + 30; // Default fallback
    
    let latestRetirementYear = currentYear;
    
    for (const member of members) {
      let memberRetirementYear = null;
      
      // First priority: Use explicitly set retirement_year
      if (member.retirement_year) {
        memberRetirementYear = parseInt(member.retirement_year);
      }
      // Second priority: Calculate from DOB + retirement age
      else if (member.date_of_birth) {
        const dob = new Date(member.date_of_birth);
        const birthYear = dob.getFullYear();
        memberRetirementYear = birthYear + RETIREMENT_AGE;
      }
      
      // Track the latest (maximum) retirement year
      if (memberRetirementYear && memberRetirementYear > latestRetirementYear) {
        latestRetirementYear = memberRetirementYear;
      }
    }
    
    // Ensure we return a reasonable value even if no valid dates found
    return latestRetirementYear > currentYear ? latestRetirementYear : currentYear + 30;
  };
  
  const defaultRetirementYear = getLatestMemberRetirementYear();

  // Loan calculation helpers
  const calculateOutstanding = (emi, installments) => (parseFloat(emi) || 0) * (parseFloat(installments) || 0);
  const calculateCompletionYear = (installments) => currentYear + Math.ceil((parseFloat(installments) || 0) / 12);
  const formatCurrency = (value) => (!value || value === 0) ? "₹0" : `₹${parseFloat(value).toLocaleString('en-IN')}`;

  useEffect(() => {
    const itemsByCategory = {};
    const added = [];
    EXPENSE_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    // Load expense items
    existingExpenses.forEach(exp => {
      const category = exp.expense_type;
      if (itemsByCategory[category] !== undefined) {
        if (!added.includes(category)) added.push(category);
        // Determine amount_source: if monthly was stored and annual matches monthly*12, source is monthly
        const monthlyAmt = exp.monthly_amount || 0;
        const annualAmt = exp.annual_amount || 0;
        let amountSource = null;
        if (monthlyAmt > 0 && annualAmt === monthlyAmt * 12) {
          amountSource = "monthly";
        } else if (annualAmt > 0) {
          amountSource = "annual";
        } else if (monthlyAmt > 0) {
          amountSource = "monthly";
        }
        
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
            post_retirement_percent: exp.post_retirement_percent ?? 100,
            amount_source: amountSource
          },
          isNew: false, 
          isModified: false
        });
      }
    });

    // Load loan/liability items
    existingLiabilities.forEach(lib => {
      const category = lib.category;
      if (itemsByCategory[category] !== undefined) {
        if (!added.includes(category)) added.push(category);
        itemsByCategory[category].push({
          id: lib.id,
          memberId: lib.member_ids?.[0] || "",
          details: {
            monthly_emi: lib.monthly_emi || "",
            num_installments: lib.num_installments || ""
          },
          isNew: false,
          isModified: false
        });
      }
    });

    // Load insurance items
    existingInsurance.forEach(ins => {
      const category = ins.category;
      if (itemsByCategory[category] !== undefined) {
        if (!added.includes(category)) added.push(category);
        itemsByCategory[category].push({
          id: ins.id,
          memberId: ins.member_ids?.[0] || "",
          details: {
            yearly_premium: ins.yearly_premium || ins.amount_today || "",
            upto_year: ins.upto_year || ins.goal_year || "",
            coverage_amount: ins.coverage_amount || ""
          },
          isNew: false,
          isModified: false
        });
      }
    });

    setItems(itemsByCategory);
    setAddedCategories(added);
    
    if (!initialLoadDone) {
      const expanded = {};
      added.forEach(cat => { expanded[cat] = true; });
      setExpandedCategories(expanded);
      setInitialLoadDone(true);
    }
  }, [family?.id, existingExpenses.length, existingLiabilities.length, existingInsurance.length, initialLoadDone]);

  const getCategoryConfig = (val) => EXPENSE_CATEGORIES.find(c => c.value === val);

  const addCategory = (val) => {
    if (!addedCategories.includes(val)) {
      setAddedCategories(prev => [...prev, val]);
      setExpandedCategories(prev => ({ ...prev, [val]: true }));
      addItem(val);
    }
  };

  const skipCategory = (val) => {
    setAddedCategories(prev => prev.filter(c => c !== val));
    setExpandedCategories(prev => ({ ...prev, [val]: false }));
    setItems(prev => ({ ...prev, [val]: [] }));
  };

  const toggleCategory = (cat) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const addItem = (cat) => {
    const config = getCategoryConfig(cat);
    const type = config?.type;
    
    let details;
    let defaultMemberId;
    
    if (type === "loan") {
      details = { monthly_emi: "", num_installments: "" };
      defaultMemberId = members[0]?.id || "";
    } else if (type === "insurance") {
      details = { yearly_premium: "", upto_year: defaultRetirementYear.toString(), coverage_amount: "" };
      defaultMemberId = members[0]?.id || "";
    } else {
      // For expenses, default upto_year to latest member's retirement year and default member to "family"
      details = { monthly_amount: "", annual_amount: "", upto_year: defaultRetirementYear.toString(), inflation_percent: 5, consider_post_retirement: false, post_retirement_member: "", post_retirement_percent: 100 };
      defaultMemberId = "family"; // Default to "Family" for expenses
    }
    
    setItems(prev => ({
      ...prev,
      [cat]: [...(prev[cat] || []), {
        id: `new_${Date.now()}`,
        memberId: defaultMemberId,
        details,
        isNew: true,
        isModified: false
      }]
    }));
  };

  const removeItem = async (cat, itemId, isNew) => {
    const config = getCategoryConfig(cat);
    const type = config?.type;
    
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        let endpoint;
        if (type === "loan") {
          endpoint = `${API}/data-gathering/family/${family.id}/liability/${itemId}`;
        } else if (type === "insurance") {
          endpoint = `${API}/data-gathering/family/${family.id}/insurance/${itemId}`;
        } else {
          endpoint = `${API}/data-gathering/family/${family.id}/expense/${itemId}`;
        }
        await axios.delete(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed"); return; }
    }
    const updated = items[cat].filter(i => i.id !== itemId);
    setItems(prev => ({ ...prev, [cat]: updated }));
    if (updated.length === 0) setAddedCategories(prev => prev.filter(c => c !== cat));
  };

  const updateItem = (cat, itemId, field, value) => {
    setItems(prev => ({
      ...prev,
      [cat]: prev[cat].map(item => {
        if (item.id !== itemId) return item;
        if (field === "memberId") return { ...item, memberId: value, isModified: !item.isNew };
        return { ...item, details: { ...item.details, [field]: value }, isModified: !item.isNew };
      })
    }));
  };

  const saveCategory = async (cat) => {
    const catItems = items[cat] || [];
    const toSave = catItems.filter(i => i.isNew || i.isModified);
    if (toSave.length === 0) { toast.info("No changes"); return; }

    const config = getCategoryConfig(cat);
    const type = config?.type;

    // Validation
    for (const item of toSave) {
      if (!item.memberId) { toast.error("Select a member"); return; }
      if (type === "loan") {
        if (!item.details.monthly_emi) { toast.error("Enter Monthly EMI"); return; }
        if (!item.details.num_installments) { toast.error("Enter No. of Installments"); return; }
      } else if (type === "insurance") {
        if (!item.details.yearly_premium) { toast.error("Enter Yearly Premium"); return; }
        if (!item.details.coverage_amount) { toast.error("Enter Coverage Amount"); return; }
      } else {
        if (!item.details.monthly_amount) { toast.error("Enter Monthly Amount"); return; }
        if (item.details.consider_post_retirement && !item.details.post_retirement_member) {
          toast.error("Select Post-Retirement Member"); return;
        }
      }
    }

    setSavingCategory(cat);
    try {
      const token = localStorage.getItem("token");
      for (const item of toSave) {
        if (type === "loan") {
          const outstanding = calculateOutstanding(item.details.monthly_emi, item.details.num_installments);
          const completionYear = calculateCompletionYear(item.details.num_installments);
          const payload = {
            family_id: family.id,
            member_ids: [item.memberId],
            category: cat,
            monthly_emi: parseFloat(item.details.monthly_emi) || 0,
            num_installments: parseInt(item.details.num_installments) || 0,
            amount_today: outstanding,
            goal_year: completionYear,
            inflation_percent: 0
          };
          if (item.isNew) {
            await axios.post(`${API}/data-gathering/family/${family.id}/liability`, payload, { headers: { Authorization: `Bearer ${token}` } });
          } else {
            await axios.put(`${API}/data-gathering/family/${family.id}/liability/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
          }
        } else if (type === "insurance") {
          const payload = {
            family_id: family.id,
            member_ids: [item.memberId],
            category: cat,
            yearly_premium: parseFloat(item.details.yearly_premium) || 0,
            amount_today: parseFloat(item.details.yearly_premium) || 0,
            upto_year: parseInt(item.details.upto_year) || currentYear + 20,
            goal_year: parseInt(item.details.upto_year) || currentYear + 20,
            coverage_amount: parseFloat(item.details.coverage_amount) || 0,
            inflation_percent: 0
          };
          if (item.isNew) {
            await axios.post(`${API}/data-gathering/family/${family.id}/insurance`, payload, { headers: { Authorization: `Bearer ${token}` } });
          } else {
            await axios.put(`${API}/data-gathering/family/${family.id}/insurance/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
          }
        } else {
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
          if (item.isNew) {
            await axios.post(`${API}/data-gathering/family/${family.id}/expense`, payload, { headers: { Authorization: `Bearer ${token}` } });
          } else {
            await axios.put(`${API}/data-gathering/family/${family.id}/expense/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
          }
        }
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
    <div className="border border-dashed border-gray-300 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-600 text-sm">Enter expense and EMI details for each category</p>
        <Badge variant="outline">{members.length} members</Badge>
      </div>

      {available.length > 0 && (
        <div className="bg-gray-50/50 rounded-lg p-3 mb-4">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">Click to add</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map(cat => {
              const Icon = cat.icon;
              const type = cat.type;
              const borderClass = type === "loan" ? 'border-red-200 hover:border-red-400 hover:text-red-600' 
                : type === "insurance" ? 'border-teal-200 hover:border-teal-400 hover:text-teal-600'
                : 'border-gray-200 hover:border-gray-400';
              return (
                <button 
                  key={cat.value} 
                  onClick={() => addCategory(cat.value)} 
                  disabled={isReadOnly} 
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border rounded-md text-xs text-gray-600 hover:bg-gray-50 transition-all ${borderClass}`}
                >
                  <Plus className="h-3 w-3" />
                  <Icon className="h-3 w-3" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {active.map(cat => {
          const Icon = cat.icon;
          const catItems = items[cat.value] || [];
          const isExp = expandedCategories[cat.value];
          const hasChanges = catItems.some(i => i.isNew || i.isModified);
          const type = cat.type;
          const borderClass = hasChanges ? 'border-amber-300' 
            : type === "loan" ? 'border-red-200' 
            : type === "insurance" ? 'border-teal-200'
            : 'border-gray-200';
          const iconClass = type === "loan" ? 'text-red-500' : type === "insurance" ? 'text-teal-500' : 'text-gray-500';
          const badgeClass = type === "loan" ? 'bg-red-100 text-red-700' : type === "insurance" ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600';
          const saveClass = type === "loan" ? 'bg-red-600 hover:bg-red-700' : type === "insurance" ? 'bg-teal-600 hover:bg-teal-700' : 'bg-emerald-600 hover:bg-emerald-700';
          const addClass = type === "loan" ? 'text-red-500 hover:text-red-600 hover:bg-red-50' : type === "insurance" ? 'text-teal-500 hover:text-teal-600 hover:bg-teal-50' : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50';

          return (
            <Collapsible key={cat.value} open={isExp} onOpenChange={() => toggleCategory(cat.value)}>
              <div className={`bg-white rounded-lg border transition-all ${borderClass}`}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1 h-6 rounded-full ${colorMap[cat.color] || 'bg-gray-500'}`} />
                      <Icon className={`h-4 w-4 ${iconClass}`} />
                      <span className="text-sm font-medium text-gray-700">{cat.label}</span>
                      <Badge variant="secondary" className={`h-5 px-1.5 text-[10px] ${badgeClass}`}>{catItems.length}</Badge>
                      {hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {hasChanges && (
                        <Button onClick={() => saveCategory(cat.value)} disabled={savingCategory === cat.value || isReadOnly} size="sm" className={`h-7 px-3 text-xs ${saveClass}`}>
                          <Save className="h-3 w-3 mr-1" />{savingCategory === cat.value ? "..." : "Save"}
                        </Button>
                      )}
                      <button onClick={() => skipCategory(cat.value)} disabled={isReadOnly} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"><X className="h-3.5 w-3.5" /></button>
                      <button onClick={() => addItem(cat.value)} disabled={isReadOnly} className={`p-1.5 rounded ${addClass}`}><Plus className="h-3.5 w-3.5" /></button>
                      <div className="p-1.5 text-gray-400">{isExp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                    {catItems.length === 0 ? <p className="text-center py-4 text-xs text-gray-400">Click + to add</p> : (
                      <div className="space-y-2 mt-2">
                        {catItems.map((item, idx) => (
                          <div key={item.id} className={`rounded-md p-3 ${item.isNew ? 'bg-green-50/50 border border-green-200' : item.isModified ? 'bg-amber-50/50 border border-amber-200' : 'bg-gray-50/30 border border-gray-100'}`}>
                            {type === "loan" ? (
                              // LOAN EMI FORM
                              <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex flex-col min-w-[140px] flex-1 max-w-[180px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Member *</span>
                                  <Select value={item.memberId || ""} onValueChange={v => updateItem(cat.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div className="flex flex-col min-w-[120px] max-w-[140px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Monthly EMI *</span>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                    <Input type="number" value={item.details.monthly_emi || ""} onChange={e => updateItem(cat.value, item.id, "monthly_emi", e.target.value)} className="h-8 w-full text-xs bg-white border-gray-200 pl-5" disabled={isReadOnly} />
                                  </div>
                                </div>
                                <div className="flex flex-col min-w-[100px] max-w-[120px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Installments *</span>
                                  <Input type="number" value={item.details.num_installments || ""} onChange={e => updateItem(cat.value, item.id, "num_installments", e.target.value)} className="h-8 w-full text-xs bg-white border-gray-200" disabled={isReadOnly} />
                                </div>
                                <div className="flex flex-col min-w-[120px] max-w-[140px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Outstanding</span>
                                  <div className="h-8 px-3 flex items-center bg-gray-100 border border-gray-200 rounded-md text-xs text-gray-700 font-medium">
                                    {formatCurrency(calculateOutstanding(item.details.monthly_emi, item.details.num_installments))}
                                  </div>
                                </div>
                                <div className="flex flex-col min-w-[90px] max-w-[100px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Ends</span>
                                  <div className="h-8 px-3 flex items-center bg-gray-100 border border-gray-200 rounded-md text-xs text-gray-700 font-medium">
                                    {item.details.num_installments ? calculateCompletionYear(item.details.num_installments) : '-'}
                                  </div>
                                </div>
                                {idx > 0 && (
                                  <button onClick={() => removeItem(cat.value, item.id, item.isNew)} disabled={isReadOnly} className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
                                )}
                              </div>
                            ) : type === "insurance" ? (
                              // INSURANCE PREMIUM FORM
                              <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex flex-col min-w-[140px] flex-1 max-w-[180px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Member *</span>
                                  <Select value={item.memberId || ""} onValueChange={v => updateItem(cat.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div className="flex flex-col min-w-[130px] max-w-[150px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Yearly Premium *</span>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                    <Input type="number" value={item.details.yearly_premium || ""} onChange={e => updateItem(cat.value, item.id, "yearly_premium", e.target.value)} className="h-8 w-full text-xs bg-white border-gray-200 pl-5" disabled={isReadOnly} />
                                  </div>
                                </div>
                                <div className="flex flex-col min-w-[100px] max-w-[120px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Upto Year *</span>
                                  <Select value={item.details.upto_year?.toString() || ""} onValueChange={v => updateItem(cat.value, item.id, "upto_year", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200"><SelectValue /></SelectTrigger>
                                    <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div className="flex flex-col min-w-[130px] max-w-[150px]">
                                  <span className="text-[10px] text-gray-400 mb-1">Coverage Amount *</span>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                    <Input type="number" value={item.details.coverage_amount || ""} onChange={e => updateItem(cat.value, item.id, "coverage_amount", e.target.value)} className="h-8 w-full text-xs bg-white border-gray-200 pl-5" disabled={isReadOnly} />
                                  </div>
                                </div>
                                {idx > 0 && (
                                  <button onClick={() => removeItem(cat.value, item.id, item.isNew)} disabled={isReadOnly} className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
                                )}
                              </div>
                            ) : (
                              // REGULAR EXPENSE FORM - evenly spread across the box
                              <div className="grid gap-3 items-end" style={{ gridTemplateColumns: item.details.consider_post_retirement ? '1.5fr 1fr 1fr 0.8fr 0.6fr 0.8fr 0.6fr auto' : '1.5fr 1fr 1fr 0.8fr 0.6fr 0.8fr auto' }}>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 mb-1">Member *</span>
                                  <Select value={item.memberId || ""} onValueChange={v => updateItem(cat.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="family" className="text-xs font-medium text-blue-600">{members.find(m => m.is_primary)?.name || 'Family'} & Family</SelectItem>
                                      {members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}{m.is_primary ? ' *' : ''}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 mb-1">Monthly</span>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                    <Input 
                                      type="number" 
                                      value={item.details.monthly_amount || ""} 
                                      onChange={e => {
                                        const monthly = e.target.value;
                                        updateItem(cat.value, item.id, "monthly_amount", monthly);
                                        updateItem(cat.value, item.id, "amount_source", monthly && parseFloat(monthly) > 0 ? "monthly" : null);
                                        if (monthly && parseFloat(monthly) > 0) {
                                          updateItem(cat.value, item.id, "annual_amount", (parseFloat(monthly) * 12).toString());
                                        } else {
                                          updateItem(cat.value, item.id, "annual_amount", "");
                                        }
                                      }} 
                                      className={`h-8 w-full text-xs border-gray-200 pl-5 ${item.details.amount_source === 'annual' ? 'bg-gray-100' : 'bg-white'}`}
                                      disabled={isReadOnly || item.details.amount_source === 'annual'} 
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 mb-1">Annual</span>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                    <Input 
                                      type="number" 
                                      value={item.details.annual_amount || ""} 
                                      onChange={e => {
                                        const annual = e.target.value;
                                        updateItem(cat.value, item.id, "annual_amount", annual);
                                        updateItem(cat.value, item.id, "amount_source", annual && parseFloat(annual) > 0 ? "annual" : null);
                                        if (annual && parseFloat(annual) > 0) {
                                          updateItem(cat.value, item.id, "monthly_amount", (parseFloat(annual) / 12).toFixed(0));
                                        } else {
                                          updateItem(cat.value, item.id, "monthly_amount", "");
                                        }
                                      }} 
                                      className={`h-8 w-full text-xs border-gray-200 pl-5 ${item.details.amount_source === 'monthly' ? 'bg-gray-100' : 'bg-white'}`}
                                      disabled={isReadOnly || item.details.amount_source === 'monthly'} 
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 mb-1">Upto Year</span>
                                  <Select value={item.details.upto_year?.toString() || ""} onValueChange={v => updateItem(cat.value, item.id, "upto_year", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200"><SelectValue /></SelectTrigger>
                                    <SelectContent>{YEAR_OPTIONS.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 mb-1">Infl. %</span>
                                  <Input type="number" value={item.details.inflation_percent ?? 5} onChange={e => updateItem(cat.value, item.id, "inflation_percent", e.target.value)} className="h-8 w-full text-xs bg-white border-gray-200" disabled={isReadOnly} />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 mb-1">&nbsp;</span>
                                  <div className="flex items-center gap-1 h-8 px-2 bg-gray-50 border border-gray-200 rounded-md">
                                    <Checkbox id={`pr-${item.id}`} checked={item.details.consider_post_retirement || false} onCheckedChange={v => updateItem(cat.value, item.id, "consider_post_retirement", v)} disabled={isReadOnly} className="h-3.5 w-3.5" />
                                    <label htmlFor={`pr-${item.id}`} className="text-[10px] text-gray-500 whitespace-nowrap">Post Ret.</label>
                                  </div>
                                </div>
                                {item.details.consider_post_retirement && (
                                  <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 mb-1">Ret. %</span>
                                    <Input type="number" value={item.details.post_retirement_percent ?? 100} onChange={e => updateItem(cat.value, item.id, "post_retirement_percent", e.target.value)} className="h-8 w-full text-xs bg-white border-gray-200" disabled={isReadOnly} min={0} />
                                  </div>
                                )}
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-gray-400 mb-1">&nbsp;</span>
                                  {idx > 0 && (
                                    <button onClick={() => removeItem(cat.value, item.id, item.isNew)} disabled={isReadOnly} className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
                                  )}
                                </div>
                              </div>
                            )}
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

      {active.length === 0 && available.length > 0 && <p className="text-center py-6 text-xs text-gray-400">Select a category above to begin</p>}
    </div>
  );
}
