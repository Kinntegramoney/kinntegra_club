import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus, Trash2, User, TrendingUp, PiggyBank, Landmark, Coins, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Investment categories
const INVESTMENT_CATEGORIES = [
  { value: "mutual_fund_equity", label: "Equity Mutual Fund SIP", icon: TrendingUp, color: "emerald" },
  { value: "mutual_fund_debt", label: "Debt Mutual Fund SIP", icon: Landmark, color: "blue" },
  { value: "elss", label: "ELSS SIP", icon: TrendingUp, color: "green" },
  { value: "ppf", label: "PPF", icon: PiggyBank, color: "amber" },
  { value: "epf", label: "EPF (Employee Contribution)", icon: PiggyBank, color: "orange" },
  { value: "nps", label: "NPS", icon: Landmark, color: "indigo" },
  { value: "rd", label: "Recurring Deposit", icon: Coins, color: "cyan" },
  { value: "stocks", label: "Stocks / Direct Equity", icon: BarChart3, color: "purple" },
  { value: "gold", label: "Gold / SGB", icon: Coins, color: "yellow" },
  { value: "ulip", label: "ULIP", icon: TrendingUp, color: "pink" },
  { value: "other", label: "Other Investment", icon: Coins, color: "gray" }
];

const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "Monthly", multiplier: 12 },
  { value: "quarterly", label: "Quarterly", multiplier: 4 },
  { value: "half_yearly", label: "Half-Yearly", multiplier: 2 },
  { value: "yearly", label: "Yearly", multiplier: 1 }
];

// Generate year options from current year to +50 years
const generateYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i <= 50; i++) {
    years.push(currentYear + i);
  }
  return years;
};

const YEAR_OPTIONS = generateYearOptions();

export default function InvestmentSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [investments, setInvestments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const members = family?.members || [];
  const existingInvestments = family?.investment_details || [];
  const incomeDetails = family?.income_details || [];

  // Extract SIP investments from income_details (mutual funds with SIP amounts)
  const sipFromIncome = incomeDetails
    .filter(inc => inc.category === 'mutual_fund' && inc.sip_amount > 0)
    .map(inc => ({
      id: `income_sip_${inc.id}`,
      category: 'mutual_fund_equity', // Map to investment category
      member_id: inc.member_id,
      amount: inc.sip_amount || 0,
      frequency: 'monthly',
      annual_amount: (inc.sip_amount || 0) * 12,
      description: inc.description || 'MF SIP (from Income)',
      isFromIncome: true, // Flag to indicate this is derived from income
      isReadOnly: true // Cannot edit here, must edit in Income section
    }));

  useEffect(() => {
    // Load existing investments + SIPs from income
    const allInvestments = [];
    
    // Add dedicated investments
    if (existingInvestments.length > 0) {
      existingInvestments.forEach(inv => {
        allInvestments.push({
          id: inv.id,
          category: inv.category,
          member_id: inv.member_id,
          amount: inv.amount || "",
          frequency: inv.frequency || "monthly",
          annual_amount: inv.annual_amount || 0,
          start_date: inv.start_date || "",
          end_date: inv.end_date || "",
          upto_year: inv.upto_year || "",
          description: inv.description || "",
          isNew: false,
          isModified: false
        });
      });
    }
    
    // Add SIPs from income (these are read-only in this section)
    sipFromIncome.forEach(sip => {
      allInvestments.push(sip);
    });
    
    setInvestments(allInvestments);
  }, [family?.id, existingInvestments.length, sipFromIncome.length]);

  const addInvestment = () => {
    const newInvestment = {
      id: `new_${Date.now()}`,
      category: "",
      member_id: members[0]?.id || "",
      amount: "",
      frequency: "monthly",
      annual_amount: 0,
      start_date: "",
      end_date: "",
      upto_year: "",
      description: "",
      isNew: true,
      isModified: false
    };
    setInvestments([...investments, newInvestment]);
    setHasChanges(true);
  };

  const updateInvestment = (id, field, value) => {
    setInvestments(prev => prev.map(inv => {
      if (inv.id === id) {
        const updated = { ...inv, [field]: value, isModified: !inv.isNew };
        
        // Calculate annual amount when amount or frequency changes
        if (field === 'amount' || field === 'frequency') {
          const amount = field === 'amount' ? parseFloat(value) || 0 : parseFloat(inv.amount) || 0;
          const freq = field === 'frequency' ? value : inv.frequency;
          const multiplier = FREQUENCY_OPTIONS.find(f => f.value === freq)?.multiplier || 12;
          updated.annual_amount = amount * multiplier;
        }
        
        return updated;
      }
      return inv;
    }));
    setHasChanges(true);
  };

  const removeInvestment = (id) => {
    setInvestments(prev => prev.filter(inv => inv.id !== id));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        investment_details: investments.map(inv => ({
          id: inv.isNew ? undefined : inv.id,
          category: inv.category,
          member_id: inv.member_id,
          amount: parseFloat(inv.amount) || 0,
          frequency: inv.frequency,
          annual_amount: inv.annual_amount,
          start_date: inv.start_date,
          end_date: inv.end_date,
          upto_year: inv.upto_year ? parseInt(inv.upto_year) : null,
          description: inv.description
        }))
      };

      await axios.put(`${API}/data-gathering/family/${family.id}/investments`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Investments saved successfully");
      setHasChanges(false);
      onRefresh?.();
    } catch (error) {
      console.error("Error saving investments:", error);
      toast.error("Failed to save investments");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value || value === 0) return "₹0";
    return `₹${parseFloat(value).toLocaleString('en-IN')}`;
  };

  const getCategoryInfo = (categoryValue) => {
    return INVESTMENT_CATEGORIES.find(c => c.value === categoryValue) || INVESTMENT_CATEGORIES[INVESTMENT_CATEGORIES.length - 1];
  };

  // Calculate totals
  const totalAnnualInvestment = investments.reduce((sum, inv) => sum + (inv.annual_amount || 0), 0);
  const totalMonthlyInvestment = totalAnnualInvestment / 12;

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-purple-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Members tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-purple-600" />
          <div>
            <h3 className="font-medium text-purple-800">Total Investment Outflow</h3>
            <p className="text-xs text-purple-600">Regular investments for wealth creation</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-purple-700">{formatCurrency(totalAnnualInvestment)}</div>
          <div className="text-xs text-purple-500">Monthly: {formatCurrency(totalMonthlyInvestment)}</div>
        </div>
      </div>

      {/* Investment Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Category</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Member</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Amount</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Frequency</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Up to Year</th>
              <th className="text-right text-xs font-medium text-gray-600 px-3 py-2">Annual</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Description</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {investments.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">
                  <TrendingUp className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                  <p>No investments added yet</p>
                  <p className="text-xs mt-1">Click "Add Investment" to start tracking</p>
                </td>
              </tr>
            ) : (
              investments.map((inv) => {
                const categoryInfo = getCategoryInfo(inv.category);
                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Select
                        value={inv.category}
                        onValueChange={(v) => updateInvestment(inv.id, 'category', v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-8 text-xs w-40">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {INVESTMENT_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              <span className="flex items-center gap-2">
                                <cat.icon className="h-3 w-3" />
                                {cat.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={inv.member_id}
                        onValueChange={(v) => updateInvestment(inv.id, 'member_id', v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-8 text-xs w-32">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={inv.amount}
                        onChange={(e) => updateInvestment(inv.id, 'amount', e.target.value)}
                        placeholder="Amount"
                        className="h-8 text-xs w-24"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={inv.frequency}
                        onValueChange={(v) => updateInvestment(inv.id, 'frequency', v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-8 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FREQUENCY_OPTIONS.map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={inv.upto_year?.toString() || ""}
                        onValueChange={(v) => updateInvestment(inv.id, 'upto_year', v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-8 text-xs w-24">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {YEAR_OPTIONS.map(year => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-xs font-medium text-purple-600">
                        {formatCurrency(inv.annual_amount)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={inv.description}
                        onChange={(e) => updateInvestment(inv.id, 'description', e.target.value)}
                        placeholder="Optional"
                        className="h-8 text-xs w-32"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeInvestment(inv.id)}
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      {!isReadOnly && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={addInvestment}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Investment
          </Button>

          {hasChanges && (
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Investments"}
            </Button>
          )}
        </div>
      )}

      {/* Category Summary */}
      {investments.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Investment Summary by Category</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {INVESTMENT_CATEGORIES.filter(cat => 
              investments.some(inv => inv.category === cat.value && inv.annual_amount > 0)
            ).map(cat => {
              const total = investments
                .filter(inv => inv.category === cat.value)
                .reduce((sum, inv) => sum + (inv.annual_amount || 0), 0);
              const Icon = cat.icon;
              return (
                <div key={cat.value} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-purple-500" />
                    <span className="text-xs font-medium text-gray-600">{cat.label}</span>
                  </div>
                  <div className="text-sm font-semibold text-gray-800">{formatCurrency(total)}</div>
                  <div className="text-[10px] text-gray-500">per year</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
