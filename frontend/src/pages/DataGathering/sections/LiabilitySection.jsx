import React, { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, CreditCard, Save, Home, Car, User, ShoppingCart, GraduationCap, Wallet } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LIABILITY_CATEGORIES = [
  { value: "home_loan", label: "Home Loan", icon: Home },
  { value: "vehicle_loan", label: "Vehicle Loan", icon: Car },
  { value: "personal_loan", label: "Personal Loan", icon: User },
  { value: "consumer_durable", label: "Consumer Durable", icon: ShoppingCart },
  { value: "education_loan", label: "Education Loan", icon: GraduationCap },
  { value: "credit_card", label: "Credit Card", icon: CreditCard },
  { value: "other", label: "Other Loan", icon: Wallet }
];

export default function LiabilitySection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    category: "home_loan",
    amount_today: "",
    inflation_percent: 0,
    goal_year: new Date().getFullYear() + 15
  });
  const [selectedMembers, setSelectedMembers] = useState([]);

  const members = family.members || [];
  const liabilities = family.liabilities || [];

  const resetForm = () => {
    setFormData({
      category: "home_loan",
      amount_today: "",
      inflation_percent: 0,
      goal_year: new Date().getFullYear() + 15
    });
    setSelectedMembers([]);
    setEditItem(null);
  };

  const handleSubmit = async () => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }
    if (!formData.amount_today) {
      toast.error("Outstanding amount is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        family_id: family.id,
        member_ids: selectedMembers,
        category: formData.category,
        amount_today: parseFloat(formData.amount_today),
        inflation_percent: parseFloat(formData.inflation_percent),
        goal_year: parseInt(formData.goal_year)
      };

      if (editItem) {
        await axios.put(
          `${API}/data-gathering/family/${family.id}/liability/${editItem.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Liability updated");
      } else {
        await axios.post(
          `${API}/data-gathering/family/${family.id}/liability`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Liability added");
      }
      
      setShowAddDialog(false);
      resetForm();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save liability");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this liability?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API}/data-gathering/family/${family.id}/liability/${itemId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Liability deleted");
      onRefresh();
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const openEditDialog = (item) => {
    setFormData({
      category: item.category,
      amount_today: item.amount_today,
      inflation_percent: item.inflation_percent,
      goal_year: item.goal_year
    });
    setSelectedMembers(item.member_ids || []);
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

  const getCategoryInfo = (cat) => LIABILITY_CATEGORIES.find(c => c.value === cat) || { label: cat, icon: CreditCard };

  const formatAmount = (amount) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 40 }, (_, i) => currentYear + i);

  // Calculate total liabilities
  const totalLiabilities = liabilities.reduce((sum, l) => sum + (l.amount_today || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="bg-red-50 border-red-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600">Total Outstanding Liabilities</p>
              <p className="text-2xl font-bold text-red-700">{formatAmount(totalLiabilities)}</p>
            </div>
            <CreditCard className="h-10 w-10 text-red-300" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-red-600" />
              Liabilities ({liabilities.length})
            </CardTitle>
            {!isReadOnly && (
              <Dialog open={showAddDialog} onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Liability
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editItem ? "Edit Liability" : "Add Liability"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Category */}
                    <div>
                      <Label>Liability Type</Label>
                      <Select 
                        value={formData.category} 
                        onValueChange={(v) => setFormData({ ...formData, category: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LIABILITY_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              <div className="flex items-center gap-2">
                                <cat.icon className="h-4 w-4" />
                                {cat.label}
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
                              selectedMembers.includes(member.id) ? 'border-red-500 bg-red-50' : ''
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

                    {/* Outstanding Amount */}
                    <div>
                      <Label>Outstanding Amount</Label>
                      <Input
                        type="number"
                        value={formData.amount_today}
                        onChange={(e) => setFormData({ ...formData, amount_today: e.target.value })}
                        placeholder="Enter outstanding amount"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Inflation (for loans it's typically 0) */}
                      <div>
                        <Label>Interest/Growth Rate (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.inflation_percent}
                          onChange={(e) => setFormData({ ...formData, inflation_percent: e.target.value })}
                        />
                      </div>

                      {/* Goal Year */}
                      <div>
                        <Label>End Year</Label>
                        <Select 
                          value={String(formData.goal_year)} 
                          onValueChange={(v) => setFormData({ ...formData, goal_year: parseInt(v) })}
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
          {liabilities.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CreditCard className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p>No liabilities added yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {liabilities.map((liability) => {
                const catInfo = getCategoryInfo(liability.category);
                const yearsRemaining = liability.goal_year - currentYear;
                return (
                  <div 
                    key={liability.id} 
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                        <catInfo.icon className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <h4 className="font-medium">{catInfo.label}</h4>
                        <p className="text-xs text-gray-500">
                          {getMemberNames(liability.member_ids)} • {yearsRemaining > 0 ? `${yearsRemaining} yrs remaining` : 'Due'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-semibold text-red-600">{formatAmount(liability.amount_today)}</span>
                        {liability.inflation_percent > 0 && (
                          <p className="text-xs text-gray-500">@ {liability.inflation_percent}%</p>
                        )}
                      </div>
                      {!isReadOnly && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(liability)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-600"
                            onClick={() => handleDelete(liability.id)}
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
