import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, DollarSign, Users } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Income categories with their fields
const INCOME_CATEGORIES = [
  { 
    value: "salary", 
    label: "Salary Income", 
    icon: Briefcase,
    fields: [
      { key: "net_income_monthly", label: "Net Monthly Income", type: "number" },
      { key: "increment_month", label: "Increment Month", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
      { key: "avg_growth_rate", label: "Avg Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" }
    ]
  },
  { 
    value: "business", 
    label: "Business Income", 
    icon: Building,
    fields: [
      { key: "net_income_yearly", label: "Net Yearly Income", type: "number" },
      { key: "avg_growth_rate", label: "Avg Growth Rate (%)", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" }
    ]
  },
  { 
    value: "rental", 
    label: "Rental Income", 
    icon: Building,
    fields: [
      { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Land"] },
      { key: "purchase_value", label: "Purchase Value", type: "number" },
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "rental_monthly", label: "Monthly Rent", type: "number" },
      { key: "rental_increment_percent", label: "Rental Increment (%)", type: "number" }
    ]
  },
  { 
    value: "ppf", 
    label: "PPF", 
    icon: PiggyBank,
    fields: [
      { key: "amount", label: "Current Value", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "epf", 
    label: "EPF", 
    icon: PiggyBank,
    fields: [
      { key: "amount", label: "Current Value", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    fields: [
      { key: "amount", label: "Expected Amount", type: "number" },
      { key: "maturity_date", label: "Expected Date", type: "date" }
    ]
  },
  { 
    value: "fd", 
    label: "Fixed Deposit", 
    icon: Landmark,
    fields: [
      { key: "principal_amount", label: "Principal Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "rd_pis", 
    label: "RD / PIS", 
    icon: Landmark,
    fields: [
      { key: "monthly_contribution", label: "Monthly Contribution", type: "number" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" }
    ]
  },
  { 
    value: "pension", 
    label: "Pension Income", 
    icon: Wallet,
    fields: [
      { key: "amount", label: "Amount", type: "number" },
      { key: "payable_cycle", label: "Payable Cycle", type: "select", options: ["Monthly", "Quarterly", "Yearly"] },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" }
    ]
  },
  { 
    value: "bond", 
    label: "Bond", 
    icon: Landmark,
    fields: [
      { key: "principal_amount", label: "Principal Amount", type: "number" },
      { key: "interest_rate", label: "Interest Rate (%)", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "insurance", 
    label: "Insurance", 
    icon: Landmark,
    fields: [
      { key: "principal_amount", label: "Sum Assured", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" }
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    fields: [
      { key: "market_value", label: "Current Market Value", type: "number" },
      { key: "sip_amount", label: "SIP Amount (if any)", type: "number" }
    ]
  },
  { 
    value: "cash", 
    label: "Cash in Hand", 
    icon: Wallet,
    fields: [
      { key: "market_value", label: "Amount", type: "number" }
    ]
  },
  { 
    value: "gold", 
    label: "Gold", 
    icon: Wallet,
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "shares_pms", 
    label: "Shares / PMS", 
    icon: TrendingUp,
    fields: [
      { key: "market_value", label: "Market Value", type: "number" }
    ]
  },
  { 
    value: "other", 
    label: "Other Income", 
    icon: DollarSign,
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "amount", label: "Amount", type: "number" }
    ]
  }
];

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [incomeData, setIncomeData] = useState({});

  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];

  // Initialize income data from existing records
  useEffect(() => {
    const initialData = {};
    INCOME_CATEGORIES.forEach(cat => {
      const existing = existingIncomes.find(inc => inc.category === cat.value);
      if (existing) {
        initialData[cat.value] = existing.details || {};
      } else {
        initialData[cat.value] = {};
      }
    });
    setIncomeData(initialData);
    
    // Set selected members from existing records
    const memberIds = new Set();
    existingIncomes.forEach(inc => {
      (inc.member_ids || []).forEach(id => memberIds.add(id));
    });
    if (memberIds.size > 0) {
      setSelectedMembers(Array.from(memberIds));
    } else if (members.length > 0) {
      // Default select primary member
      const primary = members.find(m => m.is_primary);
      if (primary) setSelectedMembers([primary.id]);
    }
  }, [family?.id, existingIncomes, members]);

  const toggleMember = (memberId) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const updateCategoryField = (category, field, value) => {
    setIncomeData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const hasDataInCategory = (category) => {
    const data = incomeData[category] || {};
    return Object.values(data).some(v => v !== "" && v !== null && v !== undefined);
  };

  const handleSaveAll = async () => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one family member");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Save each category that has data
      for (const cat of INCOME_CATEGORIES) {
        if (hasDataInCategory(cat.value)) {
          const existing = existingIncomes.find(inc => inc.category === cat.value);
          const payload = {
            family_id: family.id,
            category: cat.value,
            member_ids: selectedMembers,
            details: incomeData[cat.value]
          };

          if (existing) {
            await axios.put(
              `${API}/data-gathering/family/${family.id}/income/${existing.id}`,
              payload,
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } else {
            await axios.post(
              `${API}/data-gathering/family/${family.id}/income`,
              payload,
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        }
      }
      
      toast.success("Income details saved successfully");
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save income details");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (category, field) => {
    const value = incomeData[category]?.[field.key] || "";
    
    if (field.type === "select") {
      return (
        <Select 
          value={value} 
          onValueChange={(v) => updateCategoryField(category, field.key, v)}
          disabled={isReadOnly}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    return (
      <Input
        type={field.type}
        value={value}
        onChange={(e) => updateCategoryField(category, field.key, e.target.value)}
        placeholder={field.type === "number" ? "0" : "Enter..."}
        className="h-9"
        disabled={isReadOnly}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Member Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Select Family Members for Income Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {members.map(member => (
              <label 
                key={member.id} 
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedMembers.includes(member.id) 
                    ? 'bg-blue-50 border-blue-300 text-blue-700' 
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <Checkbox
                  checked={selectedMembers.includes(member.id)}
                  onCheckedChange={() => toggleMember(member.id)}
                  disabled={isReadOnly}
                />
                <span className="font-medium">{member.name}</span>
                {member.is_primary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
              </label>
            ))}
          </div>
          {members.length === 0 && (
            <p className="text-gray-500 text-sm">No family members found. Please add members in the Introduction tab.</p>
          )}
        </CardContent>
      </Card>

      {/* Income Categories Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {INCOME_CATEGORIES.map(category => {
          const Icon = category.icon;
          const hasData = hasDataInCategory(category.value);
          
          return (
            <Card key={category.value} className={hasData ? "ring-1 ring-green-200" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${hasData ? 'text-green-600' : 'text-gray-400'}`} />
                  {category.label}
                  {hasData && <Badge variant="outline" className="text-green-600 border-green-300 text-xs ml-auto">Has Data</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-3">
                  {category.fields.map(field => (
                    <div key={field.key} className={category.fields.length === 1 ? "col-span-2" : ""}>
                      <Label className="text-xs text-gray-500 mb-1 block">{field.label}</Label>
                      {renderField(category.value, field)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button 
          onClick={handleSaveAll} 
          disabled={loading || isReadOnly || selectedMembers.length === 0}
          className="bg-etihad-gold-600 hover:bg-etihad-gold-700 text-white px-8 gap-2"
        >
          <Save className="h-4 w-4" />
          {loading ? "Saving..." : "Save Income Details"}
        </Button>
      </div>
    </div>
  );
}
