import React, { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Receipt, Save, Home, Car, Heart, Zap, Phone, ShoppingBag, Utensils, User, GraduationCap, Users, CreditCard } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPENSE_TYPES = [
  { value: "rent_maintenance", label: "House Rent / Maintenance", icon: Home },
  { value: "conveyance", label: "Conveyance & Fuel", icon: Car },
  { value: "healthcare", label: "Healthcare", icon: Heart },
  { value: "utilities", label: "Utilities (Electric/Water)", icon: Zap },
  { value: "communication", label: "Communication", icon: Phone },
  { value: "clothing", label: "Clothing & Accessories", icon: ShoppingBag },
  { value: "shopping", label: "Shopping & Gadgets", icon: ShoppingBag },
  { value: "entertainment", label: "Entertainment", icon: Utensils },
  { value: "personal_care", label: "Personal Care", icon: User },
  { value: "health_insurance", label: "Health Insurance", icon: Heart },
  { value: "education", label: "Education Expenses", icon: GraduationCap },
  { value: "family_support", label: "Family Support", icon: Users },
  { value: "motor_insurance", label: "Motor Insurance", icon: Car },
  { value: "life_insurance", label: "Life Insurance", icon: Heart },
  { value: "emi", label: "EMI Expense", icon: CreditCard }
];

export default function ExpenseSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    expense_type: "rent_maintenance",
    annual_amount: "",
    upto_year: new Date().getFullYear() + 30,
    inflation_percent: 6,
    percent_of_current: 100
  });
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [postRetirement, setPostRetirement] = useState({ self: true, spouse: true });

  const members = family.members || [];
  const expenseDetails = family.expense_details || [];

  const resetForm = () => {
    setFormData({
      expense_type: "rent_maintenance",
      annual_amount: "",
      upto_year: new Date().getFullYear() + 30,
      inflation_percent: 6,
      percent_of_current: 100
    });
    setSelectedMembers([]);
    setPostRetirement({ self: true, spouse: true });
    setEditItem(null);
  };

  const handleSubmit = async () => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }
    if (!formData.annual_amount) {
      toast.error("Annual amount is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        family_id: family.id,
        member_ids: selectedMembers,
        expense_type: formData.expense_type,
        annual_amount: parseFloat(formData.annual_amount),
        upto_year: parseInt(formData.upto_year),
        inflation_percent: parseFloat(formData.inflation_percent),
        consider_post_retirement: postRetirement,
        percent_of_current: parseFloat(formData.percent_of_current)
      };

      if (editItem) {
        await axios.put(
          `${API}/data-gathering/family/${family.id}/expense/${editItem.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Expense updated");
      } else {
        await axios.post(
          `${API}/data-gathering/family/${family.id}/expense`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Expense added");
      }
      
      setShowAddDialog(false);
      resetForm();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save expense");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this expense?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API}/data-gathering/family/${family.id}/expense/${itemId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Expense deleted");
      onRefresh();
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const openEditDialog = (item) => {
    setFormData({
      expense_type: item.expense_type,
      annual_amount: item.annual_amount,
      upto_year: item.upto_year,
      inflation_percent: item.inflation_percent,
      percent_of_current: item.percent_of_current || 100
    });
    setSelectedMembers(item.member_ids || []);
    setPostRetirement(item.consider_post_retirement || { self: true, spouse: true });
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

  const getExpenseInfo = (type) => EXPENSE_TYPES.find(e => e.value === type) || { label: type, icon: Receipt };

  const formatAmount = (amount) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 60 }, (_, i) => currentYear + i);

  // Calculate total annual expenses
  const totalAnnualExpenses = expenseDetails.reduce((sum, e) => sum + (e.annual_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="bg-orange-50 border-orange-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600">Total Annual Expenses</p>
              <p className="text-2xl font-bold text-orange-700">{formatAmount(totalAnnualExpenses)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-orange-600">Monthly Average</p>
              <p className="text-lg font-semibold text-orange-700">{formatAmount(totalAnnualExpenses / 12)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-orange-600" />
              Expense Details ({expenseDetails.length})
            </CardTitle>
            {!isReadOnly && (
              <Dialog open={showAddDialog} onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Expense
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editItem ? "Edit Expense" : "Add Expense"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Expense Type */}
                    <div>
                      <Label>Expense Type</Label>
                      <Select 
                        value={formData.expense_type} 
                        onValueChange={(v) => setFormData({ ...formData, expense_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              <div className="flex items-center gap-2">
                                <type.icon className="h-4 w-4" />
                                {type.label}
                              </div>
                            </SelectItem>
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
                              selectedMembers.includes(member.id) ? 'border-orange-500 bg-orange-50' : ''
                            }`}
                            onClick={() => toggleMember(member.id)}
                          >
                            <Checkbox 
                              checked={selectedMembers.includes(member.id)}
                              onCheckedChange={() => toggleMember(member.id)}
                            />
                            <span className="text-sm">{member.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Annual Amount */}
                    <div>
                      <Label>Annual Amount</Label>
                      <Input
                        type="number"
                        value={formData.annual_amount}
                        onChange={(e) => setFormData({ ...formData, annual_amount: e.target.value })}
                        placeholder="Enter annual amount"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Upto Year */}
                      <div>
                        <Label>Upto Year</Label>
                        <Select 
                          value={String(formData.upto_year)} 
                          onValueChange={(v) => setFormData({ ...formData, upto_year: parseInt(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {yearOptions.map(year => (
                              <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Inflation */}
                      <div>
                        <Label>Inflation (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.inflation_percent}
                          onChange={(e) => setFormData({ ...formData, inflation_percent: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Post Retirement */}
                    <div className="border rounded-lg p-3 space-y-3">
                      <Label className="text-sm font-medium">Consider Post Retirement</Label>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Self</span>
                        <Switch 
                          checked={postRetirement.self}
                          onCheckedChange={(v) => setPostRetirement({ ...postRetirement, self: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Spouse</span>
                        <Switch 
                          checked={postRetirement.spouse}
                          onCheckedChange={(v) => setPostRetirement({ ...postRetirement, spouse: v })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">% of Current Expense</Label>
                        <Input
                          type="number"
                          value={formData.percent_of_current}
                          onChange={(e) => setFormData({ ...formData, percent_of_current: e.target.value })}
                          placeholder="100"
                        />
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
          {expenseDetails.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Receipt className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p>No expenses added yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {expenseDetails.map((expense) => {
                const expInfo = getExpenseInfo(expense.expense_type);
                return (
                  <div 
                    key={expense.id} 
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <expInfo.icon className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <h4 className="font-medium">{expInfo.label}</h4>
                        <p className="text-xs text-gray-500">
                          {getMemberNames(expense.member_ids)} • Upto {expense.upto_year}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-semibold text-orange-600">{formatAmount(expense.annual_amount)}</span>
                        <p className="text-xs text-gray-500">/year @ {expense.inflation_percent}%</p>
                      </div>
                      {!isReadOnly && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(expense)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-600"
                            onClick={() => handleDelete(expense.id)}
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
