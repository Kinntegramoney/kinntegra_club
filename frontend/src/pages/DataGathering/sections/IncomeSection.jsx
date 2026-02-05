import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, DollarSign, Save, Briefcase, Building, Wallet, Landmark, PiggyBank } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const INCOME_CATEGORIES = [
  { value: "salary", label: "Salary Income", icon: Briefcase },
  { value: "business", label: "Business Income", icon: Building },
  { value: "rental", label: "Rental Income", icon: Building },
  { value: "ppf", label: "PPF", icon: PiggyBank },
  { value: "epf", label: "EPF", icon: PiggyBank },
  { value: "gratuity", label: "Gratuity", icon: Wallet },
  { value: "fd", label: "Fixed Deposit", icon: Landmark },
  { value: "rd_pis", label: "RD / PIS", icon: Landmark },
  { value: "pension", label: "Pension Income", icon: Wallet },
  { value: "bond", label: "Bond", icon: Landmark },
  { value: "insurance", label: "Insurance", icon: Landmark },
  { value: "mutual_fund", label: "Mutual Fund", icon: TrendingUp },
  { value: "cash", label: "Cash in Hand", icon: Wallet },
  { value: "gold", label: "Gold", icon: Wallet },
  { value: "shares_pms", label: "Shares / PMS", icon: TrendingUp },
  { value: "other", label: "Other", icon: DollarSign }
];

import { TrendingUp } from "lucide-react";

const getCategoryFields = (category) => {
  switch (category) {
    case "salary":
      return ["net_income_monthly", "increment_month", "avg_growth_rate", "retirement_age"];
    case "business":
      return ["net_income_yearly", "avg_growth_rate", "retirement_age"];
    case "rental":
      return ["property_type", "purchase_value", "market_value", "rental_monthly", "rental_increment_percent"];
    case "ppf":
    case "epf":
    case "gratuity":
      return ["amount", "maturity_date"];
    case "fd":
    case "bond":
    case "insurance":
      return ["principal_amount", "interest_rate", "start_date", "maturity_date", "payment_cycle"];
    case "rd_pis":
      return ["monthly_contribution", "start_date", "end_date", "interest_rate", "maturity_amount"];
    case "pension":
      return ["amount", "payable_cycle", "start_date", "end_date"];
    case "mutual_fund":
      return ["market_value", "sip_amount"];
    case "cash":
    case "gold":
    case "shares_pms":
      return ["market_value"];
    default:
      return ["description", "amount"];
  }
};

const FIELD_LABELS = {
  net_income_monthly: "Net Monthly Income",
  net_income_yearly: "Net Yearly Income",
  increment_month: "Increment Month",
  avg_growth_rate: "Avg Growth Rate (%)",
  retirement_age: "Retirement Age",
  property_type: "Property Type",
  purchase_value: "Purchase Value",
  market_value: "Market Value",
  rental_monthly: "Monthly Rent",
  rental_increment_percent: "Rental Increment (%)",
  amount: "Amount",
  maturity_date: "Maturity Date",
  principal_amount: "Principal Amount",
  interest_rate: "Interest Rate (%)",
  start_date: "Start Date",
  end_date: "End Date",
  payment_cycle: "Payment Cycle",
  monthly_contribution: "Monthly Contribution",
  maturity_amount: "Maturity Amount",
  payable_cycle: "Payable Cycle",
  sip_amount: "SIP Amount",
  description: "Description"
};

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("salary");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [details, setDetails] = useState({});

  const members = family.members || [];
  const incomeDetails = family.income_details || [];

  const resetForm = () => {
    setSelectedCategory("salary");
    setSelectedMembers([]);
    setDetails({});
    setEditItem(null);
  };

  const handleSubmit = async () => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        family_id: family.id,
        category: selectedCategory,
        member_ids: selectedMembers,
        details: details
      };

      if (editItem) {
        await axios.put(
          `${API}/data-gathering/family/${family.id}/income/${editItem.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Income updated");
      } else {
        await axios.post(
          `${API}/data-gathering/family/${family.id}/income`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Income added");
      }
      
      setShowAddDialog(false);
      resetForm();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save income");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this income entry?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API}/data-gathering/family/${family.id}/income/${itemId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Income deleted");
      onRefresh();
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const openEditDialog = (item) => {
    setSelectedCategory(item.category);
    setSelectedMembers(item.member_ids || []);
    setDetails(item.details || {});
    setEditItem(item);
    setShowAddDialog(true);
  };

  const toggleMember = (memberId) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const getMemberNames = (memberIds) => {
    return memberIds
      ?.map(id => members.find(m => m.id === id)?.name)
      .filter(Boolean)
      .join(", ") || "Unknown";
  };

  const getCategoryLabel = (cat) => INCOME_CATEGORIES.find(c => c.value === cat)?.label || cat;

  const formatAmount = (amount) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const getDisplayAmount = (income) => {
    const d = income.details || {};
    if (d.net_income_monthly) return formatAmount(d.net_income_monthly * 12) + "/yr";
    if (d.net_income_yearly) return formatAmount(d.net_income_yearly) + "/yr";
    if (d.rental_monthly) return formatAmount(d.rental_monthly * 12) + "/yr";
    if (d.market_value) return formatAmount(d.market_value);
    if (d.principal_amount) return formatAmount(d.principal_amount);
    if (d.amount) return formatAmount(d.amount);
    return "-";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Income Details ({incomeDetails.length})
            </CardTitle>
            {!isReadOnly && (
              <Dialog open={showAddDialog} onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Income
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editItem ? "Edit Income" : "Add Income Source"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Category Selection */}
                    <div>
                      <Label>Income Category</Label>
                      <Select value={selectedCategory} onValueChange={(v) => {
                        setSelectedCategory(v);
                        setDetails({});
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INCOME_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Member Selection */}
                    <div>
                      <Label>Select Members</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {members.map(member => (
                          <div 
                            key={member.id}
                            className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${
                              selectedMembers.includes(member.id) ? 'border-etihad-gold-500 bg-etihad-gold-50' : ''
                            }`}
                            onClick={() => toggleMember(member.id)}
                          >
                            <Checkbox 
                              checked={selectedMembers.includes(member.id)}
                              onCheckedChange={() => toggleMember(member.id)}
                            />
                            <span className="text-sm">{member.name}</span>
                            <Badge variant="outline" className="text-xs ml-auto">{member.relation}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic Fields based on Category */}
                    <div className="border-t pt-4">
                      <Label className="text-sm font-medium text-gray-700 mb-3 block">
                        {getCategoryLabel(selectedCategory)} Details
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        {getCategoryFields(selectedCategory).map(field => (
                          <div key={field}>
                            <Label className="text-xs">{FIELD_LABELS[field] || field}</Label>
                            {field.includes('date') ? (
                              <Input
                                type="date"
                                value={details[field] || ''}
                                onChange={(e) => setDetails({ ...details, [field]: e.target.value })}
                              />
                            ) : field === 'payment_cycle' || field === 'payable_cycle' ? (
                              <Select 
                                value={details[field] || 'monthly'} 
                                onValueChange={(v) => setDetails({ ...details, [field]: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="monthly">Monthly</SelectItem>
                                  <SelectItem value="quarterly">Quarterly</SelectItem>
                                  <SelectItem value="half_yearly">Half Yearly</SelectItem>
                                  <SelectItem value="yearly">Yearly</SelectItem>
                                  <SelectItem value="maturity">At Maturity</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : field === 'property_type' ? (
                              <Select 
                                value={details[field] || 'residential'} 
                                onValueChange={(v) => setDetails({ ...details, [field]: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="residential">Residential</SelectItem>
                                  <SelectItem value="commercial">Commercial</SelectItem>
                                  <SelectItem value="land">Land</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : field === 'increment_month' ? (
                              <Select 
                                value={details[field] || 'april'} 
                                onValueChange={(v) => setDetails({ ...details, [field]: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {['January', 'February', 'March', 'April', 'May', 'June', 
                                    'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                                    <SelectItem key={m} value={m.toLowerCase()}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={field.includes('rate') || field.includes('age') || field.includes('amount') || 
                                      field.includes('value') || field.includes('contribution') || field.includes('income') ||
                                      field.includes('rent') ? 'number' : 'text'}
                                value={details[field] || ''}
                                onChange={(e) => setDetails({ ...details, [field]: e.target.value })}
                                placeholder={FIELD_LABELS[field]}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => {
                        setShowAddDialog(false);
                        resetForm();
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Saving..." : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            {editItem ? "Update" : "Add"}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {incomeDetails.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <DollarSign className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p>No income sources added yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomeDetails.map((income) => {
                const CategoryIcon = INCOME_CATEGORIES.find(c => c.value === income.category)?.icon || DollarSign;
                return (
                  <div 
                    key={income.id} 
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                        <CategoryIcon className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h4 className="font-medium">{getCategoryLabel(income.category)}</h4>
                        <p className="text-xs text-gray-500">{getMemberNames(income.member_ids)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-green-600">{getDisplayAmount(income)}</span>
                      {!isReadOnly && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(income)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-600"
                            onClick={() => handleDelete(income.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
