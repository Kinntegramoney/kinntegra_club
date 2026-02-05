import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Users, DollarSign, Target, Receipt, Shield, 
  CreditCard, TrendingUp, Plus, Edit, Trash2, User, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import IncomeSection from "./sections/IncomeSection";
import GoalSection from "./sections/GoalSection";
import ExpenseSection from "./sections/ExpenseSection";
import InsuranceSection from "./sections/InsuranceSection";
import LiabilitySection from "./sections/LiabilitySection";
import SurplusSection from "./sections/SurplusSection";
import MembersSection from "./sections/MembersSection";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function FamilyDetail({ family: initialFamily, onBack, onUpdate, user }) {
  const [family, setFamily] = useState(initialFamily);
  const [activeTab, setActiveTab] = useState("members");
  const [loading, setLoading] = useState(false);

  const isReadOnly = user?.role === 'client';

  useEffect(() => {
    refreshFamily();
  }, [initialFamily.id]);

  const refreshFamily = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/data-gathering/family/${initialFamily.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFamily(response.data);
      onUpdate(response.data);
    } catch (error) {
      console.error("Error refreshing family:", error);
    }
  };

  const handleDataUpdate = (section, data) => {
    const updatedFamily = { ...family, [section]: data };
    setFamily(updatedFamily);
    onUpdate(updatedFamily);
  };

  const tabs = [
    { id: "members", label: "Members", icon: Users, count: family.members?.length || 0 },
    { id: "income", label: "Income", icon: DollarSign, count: family.income_details?.length || 0 },
    { id: "goals", label: "Goals", icon: Target, count: family.goal_details?.length || 0 },
    { id: "expenses", label: "Expenses", icon: Receipt, count: family.expense_details?.length || 0 },
    { id: "insurance", label: "Insurance", icon: Shield, count: family.insurance_premiums?.length || 0 },
    { id: "liability", label: "Liability", icon: CreditCard, count: family.liabilities?.length || 0 },
    { id: "surplus", label: "Surplus", icon: TrendingUp, count: null }
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{family.family_name}</h1>
            <p className="text-sm text-gray-500">
              Created {format(new Date(family.created_at), "MMMM d, yyyy")}
              {family.sub_broker_id && " • Sub-broker assigned"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge 
            className={
              family.status === 'completed' 
                ? 'bg-green-100 text-green-700' 
                : family.status === 'in_progress'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700'
            }
          >
            {family.status || 'Draft'}
          </Badge>
          <Button variant="outline" size="sm" onClick={refreshFamily}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {tabs.map((tab) => (
          <Card 
            key={tab.id} 
            className={`cursor-pointer transition-colors ${activeTab === tab.id ? 'border-etihad-gold-500 bg-etihad-gold-50' : 'hover:bg-gray-50'}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-etihad-gold-600' : 'text-gray-400'}`} />
                <div>
                  <p className="text-xs text-gray-500">{tab.label}</p>
                  {tab.count !== null && (
                    <p className="text-lg font-semibold">{tab.count}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-2">
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count !== null && (
                <Badge variant="secondary" className="ml-1 text-xs">{tab.count}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="members">
          <MembersSection 
            family={family} 
            onUpdate={(members) => handleDataUpdate('members', members)}
            isReadOnly={isReadOnly}
            onRefresh={refreshFamily}
          />
        </TabsContent>

        <TabsContent value="income">
          <IncomeSection 
            family={family} 
            onUpdate={(data) => handleDataUpdate('income_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshFamily}
          />
        </TabsContent>

        <TabsContent value="goals">
          <GoalSection 
            family={family} 
            onUpdate={(data) => handleDataUpdate('goal_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshFamily}
          />
        </TabsContent>

        <TabsContent value="expenses">
          <ExpenseSection 
            family={family} 
            onUpdate={(data) => handleDataUpdate('expense_details', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshFamily}
          />
        </TabsContent>

        <TabsContent value="insurance">
          <InsuranceSection 
            family={family} 
            onUpdate={(data) => handleDataUpdate('insurance_premiums', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshFamily}
          />
        </TabsContent>

        <TabsContent value="liability">
          <LiabilitySection 
            family={family} 
            onUpdate={(data) => handleDataUpdate('liabilities', data)}
            isReadOnly={isReadOnly}
            onRefresh={refreshFamily}
          />
        </TabsContent>

        <TabsContent value="surplus">
          <SurplusSection 
            family={family}
            isReadOnly={isReadOnly}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
