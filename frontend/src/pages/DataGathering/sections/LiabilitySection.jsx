import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus, Trash2, User, Home, Car, CreditCard, GraduationCap, Building, Coins, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Liability categories
const LIABILITY_CATEGORIES = [
  { value: "home_loan", label: "Home Loan", icon: Home },
  { value: "vehicle_loan", label: "Vehicle Loan", icon: Car },
  { value: "personal_loan", label: "Personal Loan", icon: CreditCard },
  { value: "consumer_durable", label: "Consumer Durable", icon: Building },
  { value: "education_loan", label: "Education Loan", icon: GraduationCap },
  { value: "credit_card", label: "Credit Card Outstanding", icon: CreditCard },
  { value: "other_loan", label: "Other Loan", icon: Coins }
];

export default function LiabilitySection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [liabilities, setLiabilities] = useState([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const members = family?.members || [];
  const existingLiabilities = family?.liability_details || [];

  useEffect(() => {
    // Load existing liabilities
    if (existingLiabilities.length > 0) {
      setLiabilities(existingLiabilities.map(lib => ({
        id: lib.id,
        category: lib.category,
        member_id: lib.member_ids?.[0] || "",
        loan_amount: lib.loan_amount || lib.principal_amount || "",
        interest_rate: lib.interest_rate || "",
        tenure_months: lib.tenure_months || "",
        monthly_emi: lib.monthly_emi || lib.emi_amount || "",
        start_date: lib.start_date || "",
        remaining_installments: lib.remaining_installments || lib.num_installments || "",
        outstanding_amount: lib.outstanding_amount || lib.amount_today || "",
        lender_name: lib.lender_name || "",
        isNew: false,
        isModified: false
      })));
    }
  }, [family?.id]);

  const addLiability = () => {
    const newLiability = {
      id: `new_${Date.now()}`,
      category: "",
      member_id: members[0]?.id || "",
      loan_amount: "",
      interest_rate: "",
      tenure_months: "",
      monthly_emi: "",
      start_date: "",
      remaining_installments: "",
      outstanding_amount: "",
      lender_name: "",
      isNew: true,
      isModified: false
    };
    setLiabilities([...liabilities, newLiability]);
    setHasChanges(true);
  };

  const updateLiability = (id, field, value) => {
    setLiabilities(prev => prev.map(lib => {
      if (lib.id === id) {
        const updated = { ...lib, [field]: value, isModified: !lib.isNew };
        
        // Auto-calculate outstanding if EMI and remaining installments are provided
        if (field === 'monthly_emi' || field === 'remaining_installments') {
          const emi = field === 'monthly_emi' ? parseFloat(value) || 0 : parseFloat(lib.monthly_emi) || 0;
          const remaining = field === 'remaining_installments' ? parseFloat(value) || 0 : parseFloat(lib.remaining_installments) || 0;
          if (emi > 0 && remaining > 0) {
            updated.outstanding_amount = Math.round(emi * remaining);
          }
        }
        
        return updated;
      }
      return lib;
    }));
    setHasChanges(true);
  };

  const removeLiability = (id) => {
    setLiabilities(prev => prev.filter(lib => lib.id !== id));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        liability_details: liabilities.map(lib => ({
          id: lib.isNew ? undefined : lib.id,
          category: lib.category,
          member_ids: [lib.member_id],
          loan_amount: parseFloat(lib.loan_amount) || 0,
          principal_amount: parseFloat(lib.loan_amount) || 0,
          interest_rate: parseFloat(lib.interest_rate) || 0,
          tenure_months: parseInt(lib.tenure_months) || 0,
          monthly_emi: parseFloat(lib.monthly_emi) || 0,
          emi_amount: parseFloat(lib.monthly_emi) || 0,
          start_date: lib.start_date,
          remaining_installments: parseInt(lib.remaining_installments) || 0,
          num_installments: parseInt(lib.remaining_installments) || 0,
          outstanding_amount: parseFloat(lib.outstanding_amount) || 0,
          amount_today: parseFloat(lib.outstanding_amount) || 0,
          lender_name: lib.lender_name
        }))
      };

      await axios.put(`${API}/data-gathering/family/${family.id}/liabilities`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success("Liabilities saved successfully");
      setHasChanges(false);
      onRefresh?.();
    } catch (error) {
      console.error("Error saving liabilities:", error);
      toast.error("Failed to save liabilities");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value || value === 0) return "₹0";
    return `₹${parseFloat(value).toLocaleString('en-IN')}`;
  };

  const getCategoryInfo = (categoryValue) => {
    return LIABILITY_CATEGORIES.find(c => c.value === categoryValue) || LIABILITY_CATEGORIES[LIABILITY_CATEGORIES.length - 1];
  };

  // Calculate totals
  const totalOutstanding = liabilities.reduce((sum, lib) => sum + (parseFloat(lib.outstanding_amount) || 0), 0);
  const totalEMI = liabilities.reduce((sum, lib) => sum + (parseFloat(lib.monthly_emi) || 0), 0);

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-red-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Members tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <div>
            <h3 className="font-medium text-red-800">Total Outstanding Liabilities</h3>
            <p className="text-xs text-red-600">Monthly EMI: {formatCurrency(totalEMI)}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-red-700">{formatCurrency(totalOutstanding)}</div>
        </div>
      </div>

      {/* Liability Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Type</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Member</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Loan Amount</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Interest %</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">EMI</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Remaining</th>
              <th className="text-right text-xs font-medium text-gray-600 px-3 py-2">Outstanding</th>
              <th className="text-left text-xs font-medium text-gray-600 px-3 py-2">Lender</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {liabilities.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-500">
                  <CreditCard className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                  <p>No liabilities added yet</p>
                  <p className="text-xs mt-1">Click "Add Liability" to start tracking</p>
                </td>
              </tr>
            ) : (
              liabilities.map((lib) => {
                const categoryInfo = getCategoryInfo(lib.category);
                const Icon = categoryInfo.icon;
                return (
                  <tr key={lib.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Select
                        value={lib.category}
                        onValueChange={(v) => updateLiability(lib.id, 'category', v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-8 text-xs w-36">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {LIABILITY_CATEGORIES.map(cat => (
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
                        value={lib.member_id}
                        onValueChange={(v) => updateLiability(lib.id, 'member_id', v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-8 text-xs w-28">
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
                        value={lib.loan_amount}
                        onChange={(e) => updateLiability(lib.id, 'loan_amount', e.target.value)}
                        placeholder="Amount"
                        className="h-8 text-xs w-24"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={lib.interest_rate}
                        onChange={(e) => updateLiability(lib.id, 'interest_rate', e.target.value)}
                        placeholder="%"
                        className="h-8 text-xs w-16"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={lib.monthly_emi}
                        onChange={(e) => updateLiability(lib.id, 'monthly_emi', e.target.value)}
                        placeholder="EMI"
                        className="h-8 text-xs w-20"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={lib.remaining_installments}
                        onChange={(e) => updateLiability(lib.id, 'remaining_installments', e.target.value)}
                        placeholder="Months"
                        className="h-8 text-xs w-16"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-xs font-medium text-red-600">
                        {formatCurrency(lib.outstanding_amount)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={lib.lender_name}
                        onChange={(e) => updateLiability(lib.id, 'lender_name', e.target.value)}
                        placeholder="Bank/NBFC"
                        className="h-8 text-xs w-24"
                        disabled={isReadOnly}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLiability(lib.id)}
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
            onClick={addLiability}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Liability
          </Button>

          {hasChanges && (
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Liabilities"}
            </Button>
          )}
        </div>
      )}

      {/* Category Summary */}
      {liabilities.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Summary by Loan Type</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {LIABILITY_CATEGORIES.filter(cat => 
              liabilities.some(lib => lib.category === cat.value && parseFloat(lib.outstanding_amount) > 0)
            ).map(cat => {
              const total = liabilities
                .filter(lib => lib.category === cat.value)
                .reduce((sum, lib) => sum + (parseFloat(lib.outstanding_amount) || 0), 0);
              const Icon = cat.icon;
              return (
                <div key={cat.value} className="bg-red-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-red-500" />
                    <span className="text-xs font-medium text-gray-600">{cat.label}</span>
                  </div>
                  <div className="text-sm font-semibold text-red-700">{formatCurrency(total)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
