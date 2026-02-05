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
import { Plus, Edit, Trash2, Target, Save, GraduationCap, Heart, Home, Car, Gift, Baby, Gem, Laptop, Plane, Rocket } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GOAL_CATEGORIES = [
  { value: "charity", label: "Charity", icon: Heart },
  { value: "child_birth", label: "Child Birth Expense", icon: Baby },
  { value: "education", label: "Education", icon: GraduationCap },
  { value: "family_gifting", label: "Family Gifting", icon: Gift },
  { value: "gadgets", label: "Gadgets", icon: Laptop },
  { value: "home_renovation", label: "Home Renovation", icon: Home },
  { value: "jewellery", label: "Jewellery", icon: Gem },
  { value: "marriage", label: "Marriage", icon: Heart },
  { value: "new_car", label: "New Car", icon: Car },
  { value: "new_home", label: "New Home", icon: Home },
  { value: "post_graduation", label: "Post Graduation", icon: GraduationCap },
  { value: "startup", label: "Startup", icon: Rocket },
  { value: "vacation", label: "Vacation", icon: Plane }
];

export default function GoalSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    category: "education",
    goal_amount: "",
    inflation_percent: 6,
    goal_year: new Date().getFullYear() + 5
  });
  const [selectedMembers, setSelectedMembers] = useState([]);

  const members = family.members || [];
  const goalDetails = family.goal_details || [];

  const resetForm = () => {
    setFormData({
      category: "education",
      goal_amount: "",
      inflation_percent: 6,
      goal_year: new Date().getFullYear() + 5
    });
    setSelectedMembers([]);
    setEditItem(null);
  };

  const handleSubmit = async () => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member");
      return;
    }
    if (!formData.goal_amount) {
      toast.error("Goal amount is required");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const payload = {
        family_id: family.id,
        member_ids: selectedMembers,
        category: formData.category,
        goal_amount: parseFloat(formData.goal_amount),
        inflation_percent: parseFloat(formData.inflation_percent),
        goal_year: parseInt(formData.goal_year)
      };

      if (editItem) {
        await axios.put(
          `${API}/data-gathering/family/${family.id}/goal/${editItem.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Goal updated");
      } else {
        await axios.post(
          `${API}/data-gathering/family/${family.id}/goal`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Goal added");
      }
      
      setShowAddDialog(false);
      resetForm();
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this goal?")) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${API}/data-gathering/family/${family.id}/goal/${itemId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Goal deleted");
      onRefresh();
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const openEditDialog = (item) => {
    setFormData({
      category: item.category,
      goal_amount: item.goal_amount,
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

  const getCategoryInfo = (cat) => GOAL_CATEGORIES.find(c => c.value === cat) || { label: cat, icon: Target };

  const formatAmount = (amount) => {
    if (!amount) return "-";
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 50 }, (_, i) => currentYear + i);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-600" />
              Financial Goals ({goalDetails.length})
            </CardTitle>
            {!isReadOnly && (
              <Dialog open={showAddDialog} onOpenChange={(open) => {
                setShowAddDialog(open);
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Goal
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editItem ? "Edit Goal" : "Add Financial Goal"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Goal Category */}
                    <div>
                      <Label>Goal Category</Label>
                      <Select 
                        value={formData.category} 
                        onValueChange={(v) => setFormData({ ...formData, category: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GOAL_CATEGORIES.map(cat => (
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
                      <Label>Select Members (For whom is this goal)</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {members.map(member => (
                          <div 
                            key={member.id}
                            className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${
                              selectedMembers.includes(member.id) ? 'border-purple-500 bg-purple-50' : ''
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

                    {/* Goal Amount */}
                    <div>
                      <Label>Goal Amount (Today&apos;s Value)</Label>
                      <Input
                        type="number"
                        value={formData.goal_amount}
                        onChange={(e) => setFormData({ ...formData, goal_amount: e.target.value })}
                        placeholder="Enter amount"
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
                        <Label>Goal Year</Label>
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

                    {/* Future Value Calculation */}
                    {formData.goal_amount && formData.goal_year && (
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">Future Value (approx.):</p>
                        <p className="text-lg font-semibold text-purple-700">
                          {formatAmount(
                            formData.goal_amount * Math.pow(1 + (formData.inflation_percent / 100), formData.goal_year - currentYear)
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          In {formData.goal_year - currentYear} years at {formData.inflation_percent}% inflation
                        </p>
                      </div>
                    )}

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
          {goalDetails.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Target className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p>No financial goals added yet</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {goalDetails.map((goal) => {
                const catInfo = getCategoryInfo(goal.category);
                const yearsAway = goal.goal_year - currentYear;
                const futureValue = goal.goal_amount * Math.pow(1 + (goal.inflation_percent / 100), yearsAway);
                
                return (
                  <Card key={goal.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mt-1">
                            <catInfo.icon className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">{catInfo.label}</h4>
                            <p className="text-xs text-gray-500">{getMemberNames(goal.member_ids)}</p>
                            <div className="mt-2 space-y-1">
                              <p className="text-sm">
                                <span className="text-gray-500">Today:</span>{" "}
                                <span className="font-medium">{formatAmount(goal.goal_amount)}</span>
                              </p>
                              <p className="text-sm">
                                <span className="text-gray-500">Future ({goal.goal_year}):</span>{" "}
                                <span className="font-medium text-purple-600">{formatAmount(futureValue)}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="outline">
                            {yearsAway > 0 ? `${yearsAway} yrs` : 'This year'}
                          </Badge>
                          {!isReadOnly && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(goal)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-red-600"
                                onClick={() => handleDelete(goal.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
