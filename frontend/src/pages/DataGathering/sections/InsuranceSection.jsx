import React, { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Shield, Save, Car, Heart, Stethoscope, FileCheck } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const INSURANCE_CATEGORIES = [
  { value: "motor", label: "Motor Insurance", icon: Car },
  { value: "life", label: "Life Insurance", icon: Heart },
  { value: "health", label: "Health Insurance", icon: Stethoscope },
  { value: "term", label: "Term Insurance", icon: FileCheck }
];

export default function InsuranceSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    category: "life",
    amount_today: "",
    inflation_percent: 5,
    goal_year: new Date().getFullYear() + 20
  });
  const [selectedMembers, setSelectedMembers] = useState([]);

  const members = family.members || [];
  const insurancePremiums = family.insurance_premiums || [];

  const resetForm = () => {
    setFormData({
      category: "life",
      amount_today: "",
      inflation_percent: 5,
      goal_year: new Date().getFullYear() + 20
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
      toast.error("Premium amount is required");
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
          `${API}/data-gathering/family/${family.id}/insurance/${editItem.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Insurance updated");
      } else {
        await axios.post(
          `${API}/data-gathering/family/${family.id}/insurance`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Insurance added");
      }
      
      setShowAddDialog(false);
      resetForm();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save insurance");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this insurance entry?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API}/data-gathering/family/${family.id}/insurance/${itemId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Insurance deleted");
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

  const getCategoryInfo = (cat) => INSURANCE_CATEGORIES.find(c => c.value === cat) || { label: cat, icon: Shield };

  const formatAmount = (amount) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 50 }, (_, i) => currentYear + i);

  // Calculate total annual premiums
  const totalPremiums = insurancePremiums.reduce((sum, i) => sum + (i.amount_today || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600">Total Annual Premiums</p>
              <p className="text-2xl font-bold text-blue-700">{formatAmount(totalPremiums)}</p>
            </div>
            <Shield className="h-10 w-10 text-blue-300" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Insurance Premiums ({insurancePremiums.length})
            </CardTitle>
            {!isReadOnly && (
              <Dialog open={showAddDialog} onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Insurance
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editItem ? "Edit Insurance" : "Add Insurance Premium"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Category */}
                    <div>
                      <Label>Insurance Type</Label>
                      <Select 
                        value={formData.category} 
                        onValueChange={(v) => setFormData({ ...formData, category: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INSURANCE_CATEGORIES.map(cat => (
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
                              selectedMembers.includes(member.id) ? 'border-blue-500 bg-blue-50' : ''
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

                    {/* Premium Amount */}
                    <div>
                      <Label>Annual Premium Amount</Label>
                      <Input
                        type="number"
                        value={formData.amount_today}
                        onChange={(e) => setFormData({ ...formData, amount_today: e.target.value })}
                        placeholder="Enter annual premium"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Inflation */}
                      <div>
                        <Label>Inflation Rate (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.inflation_percent}
                          onChange={(e) => setFormData({ ...formData, inflation_percent: e.target.value })}
                        />
                      </div>

                      {/* Goal Year */}
                      <div>
                        <Label>Upto Year</Label>
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
          {insurancePremiums.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Shield className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p>No insurance premiums added yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {insurancePremiums.map((insurance) => {
                const catInfo = getCategoryInfo(insurance.category);
                return (
                  <div 
                    key={insurance.id} 
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <catInfo.icon className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-medium">{catInfo.label}</h4>
                        <p className="text-xs text-gray-500">
                          {getMemberNames(insurance.member_ids)} • Upto {insurance.goal_year}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-semibold text-blue-600">{formatAmount(insurance.amount_today)}</span>
                        <p className="text-xs text-gray-500">/year @ {insurance.inflation_percent}%</p>
                      </div>
                      {!isReadOnly && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(insurance)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-600"
                            onClick={() => handleDelete(insurance.id)}
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
