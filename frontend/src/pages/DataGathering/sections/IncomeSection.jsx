import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, DollarSign, User, ChevronRight } from "lucide-react";
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
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [incomeDataByMember, setIncomeDataByMember] = useState({});

  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];

  // Initialize - select first member and load existing data
  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) {
      const primary = members.find(m => m.is_primary);
      setSelectedMemberId(primary?.id || members[0].id);
    }
    
    // Load existing income data organized by member
    const dataByMember = {};
    members.forEach(member => {
      dataByMember[member.id] = {};
      INCOME_CATEGORIES.forEach(cat => {
        // Find income for this member and category
        const existing = existingIncomes.find(
          inc => inc.category === cat.value && inc.member_ids?.includes(member.id)
        );
        dataByMember[member.id][cat.value] = existing?.details || {};
      });
    });
    setIncomeDataByMember(dataByMember);
  }, [family?.id]);

  const updateCategoryField = (category, field, value) => {
    if (!selectedMemberId) return;
    
    setIncomeDataByMember(prev => ({
      ...prev,
      [selectedMemberId]: {
        ...prev[selectedMemberId],
        [category]: {
          ...(prev[selectedMemberId]?.[category] || {}),
          [field]: value
        }
      }
    }));
  };

  const hasDataInCategory = (memberId, category) => {
    const data = incomeDataByMember[memberId]?.[category] || {};
    return Object.values(data).some(v => v !== "" && v !== null && v !== undefined && v !== "0");
  };

  const getMemberIncomeCount = (memberId) => {
    let count = 0;
    INCOME_CATEGORIES.forEach(cat => {
      if (hasDataInCategory(memberId, cat.value)) count++;
    });
    return count;
  };

  const handleSaveForMember = async () => {
    if (!selectedMemberId) {
      toast.error("Please select a member");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const memberData = incomeDataByMember[selectedMemberId] || {};
      
      // Save each category that has data for this member
      for (const cat of INCOME_CATEGORIES) {
        const categoryData = memberData[cat.value] || {};
        const hasData = Object.values(categoryData).some(v => v !== "" && v !== null && v !== undefined && v !== "0");
        
        if (hasData) {
          // Find existing income for this member and category
          const existing = existingIncomes.find(
            inc => inc.category === cat.value && inc.member_ids?.includes(selectedMemberId)
          );
          
          const payload = {
            family_id: family.id,
            category: cat.value,
            member_ids: [selectedMemberId],
            details: categoryData
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
      
      const memberName = members.find(m => m.id === selectedMemberId)?.name || "Member";
      toast.success(`Income details saved for ${memberName}`);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save income details");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (category, field) => {
    const value = incomeDataByMember[selectedMemberId]?.[category]?.[field.key] || "";
    
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

  const selectedMember = members.find(m => m.id === selectedMemberId);

  return (
    <div className="space-y-6">
      {/* Member Tabs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Member to Enter Income Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {members.map(member => {
              const incomeCount = getMemberIncomeCount(member.id);
              const isSelected = selectedMemberId === member.id;
              
              return (
                <button
                  key={member.id}
                  onClick={() => setSelectedMemberId(member.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' 
                      : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <User className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="font-medium">{member.name}</span>
                  {member.is_primary && (
                    <Badge variant="secondary" className="text-xs">Primary</Badge>
                  )}
                  {incomeCount > 0 && (
                    <Badge className="bg-green-100 text-green-700 text-xs">{incomeCount} sources</Badge>
                  )}
                  {isSelected && <ChevronRight className="h-4 w-4 ml-1" />}
                </button>
              );
            })}
          </div>
          {members.length === 0 && (
            <p className="text-gray-500 text-sm">No family members found. Please add members in the Introduction tab.</p>
          )}
        </CardContent>
      </Card>

      {/* Selected Member's Income Forms */}
      {selectedMember && (
        <>
          <div className="flex items-center gap-2 px-1">
            <User className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-800">
              Income Details for {selectedMember.name}
            </h3>
            {selectedMember.is_primary && <Badge variant="outline">Primary Holder</Badge>}
          </div>

          {/* Income Categories Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {INCOME_CATEGORIES.map(category => {
              const Icon = category.icon;
              const hasData = hasDataInCategory(selectedMemberId, category.value);
              
              return (
                <Card key={category.value} className={hasData ? "ring-1 ring-green-200 bg-green-50/30" : ""}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${hasData ? 'text-green-600' : 'text-gray-400'}`} />
                      {category.label}
                      {hasData && (
                        <Badge variant="outline" className="text-green-600 border-green-300 text-xs ml-auto">
                          Filled
                        </Badge>
                      )}
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

          {/* Save Button for Selected Member */}
          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-gray-500">
              Saving income details for: <span className="font-medium text-gray-700">{selectedMember.name}</span>
            </p>
            <Button 
              onClick={handleSaveForMember} 
              disabled={loading || isReadOnly}
              className="bg-etihad-gold-600 hover:bg-etihad-gold-700 text-white px-8 gap-2"
            >
              <Save className="h-4 w-4" />
              {loading ? "Saving..." : `Save ${selectedMember.name}'s Income`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
