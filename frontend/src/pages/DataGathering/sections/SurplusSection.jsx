import React, { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, PiggyBank, Wallet, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SurplusSection({ family, isReadOnly }) {
  const [surplusData, setSurplusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("savings");

  useEffect(() => {
    fetchSurplus();
  }, [family.id]);

  const fetchSurplus = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/data-gathering/family/${family.id}/surplus`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSurplusData(response.data);
    } catch (error) {
      console.error("Error fetching surplus:", error);
      toast.error("Failed to load surplus data");
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return "-";
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const totals = surplusData?.totals || { total_income: 0, total_expense: 0, total_savings: 0 };
  const memberSummary = surplusData?.member_summary || [];
  const isSurplus = totals.total_savings >= 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <ArrowUpRight className="h-4 w-4" />
                  Total Income
                </p>
                <p className="text-2xl font-bold text-green-700">{formatAmount(totals.total_income)}</p>
                <p className="text-xs text-green-600">Annual</p>
              </div>
              <TrendingUp className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 flex items-center gap-1">
                  <ArrowDownRight className="h-4 w-4" />
                  Total Outflow
                </p>
                <p className="text-2xl font-bold text-orange-700">{formatAmount(totals.total_expense)}</p>
                <p className="text-xs text-orange-600">Expenses + Insurance + Liabilities</p>
              </div>
              <TrendingDown className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>

        <Card className={isSurplus ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm flex items-center gap-1 ${isSurplus ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isSurplus ? <PiggyBank className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                  {isSurplus ? 'Surplus' : 'Deficit'}
                </p>
                <p className={`text-2xl font-bold ${isSurplus ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatAmount(Math.abs(totals.total_savings))}
                </p>
                <p className={`text-xs ${isSurplus ? 'text-emerald-600' : 'text-red-600'}`}>
                  Available for savings/investment
                </p>
              </div>
              {isSurplus ? (
                <PiggyBank className="h-10 w-10 text-emerald-300" />
              ) : (
                <Wallet className="h-10 w-10 text-red-300" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Member-wise Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Member-wise Cash Flow</CardTitle>
        </CardHeader>
        <CardContent>
          {memberSummary.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No member data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Member</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-600">Income</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-600">Expenses</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-600">Insurance</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-600">Liability</th>
                    <th className="text-right py-3 px-2 font-medium text-gray-600">Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {memberSummary.map((member) => (
                    <tr key={member.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-sm font-medium">{member.name?.charAt(0)}</span>
                          </div>
                          <span className="font-medium">{member.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-2 text-green-600 font-medium">
                        {formatAmount(member.total_income)}
                      </td>
                      <td className="text-right py-3 px-2 text-orange-600">
                        {formatAmount(member.total_expense)}
                      </td>
                      <td className="text-right py-3 px-2 text-blue-600">
                        {formatAmount(member.total_insurance)}
                      </td>
                      <td className="text-right py-3 px-2 text-red-600">
                        {formatAmount(member.total_liability)}
                      </td>
                      <td className={`text-right py-3 px-2 font-semibold ${member.savings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatAmount(member.savings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="py-3 px-2">Total</td>
                    <td className="text-right py-3 px-2 text-green-600">{formatAmount(totals.total_income)}</td>
                    <td className="text-right py-3 px-2 text-orange-600">{formatAmount(totals.total_expense)}</td>
                    <td className="text-right py-3 px-2 text-blue-600">-</td>
                    <td className="text-right py-3 px-2 text-red-600">-</td>
                    <td className={`text-right py-3 px-2 ${totals.total_savings >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatAmount(totals.total_savings)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Savings & Investments Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Surplus Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="savings" className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4" />
                Savings
              </TabsTrigger>
              <TabsTrigger value="investments" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Investments
              </TabsTrigger>
            </TabsList>

            <TabsContent value="savings">
              <div className="space-y-4">
                {isSurplus ? (
                  <div className="bg-emerald-50 rounded-lg p-6 text-center">
                    <PiggyBank className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
                    <h3 className="text-lg font-semibold text-emerald-700">
                      Annual Savings Potential
                    </h3>
                    <p className="text-3xl font-bold text-emerald-600 my-2">
                      {formatAmount(totals.total_savings)}
                    </p>
                    <p className="text-sm text-emerald-600">
                      Monthly: {formatAmount(totals.total_savings / 12)}
                    </p>
                    <p className="text-xs text-gray-500 mt-3">
                      This amount is available after all expenses, insurance, and liability payments.
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-50 rounded-lg p-6 text-center">
                    <Wallet className="h-12 w-12 mx-auto text-red-500 mb-3" />
                    <h3 className="text-lg font-semibold text-red-700">
                      Cash Flow Deficit
                    </h3>
                    <p className="text-3xl font-bold text-red-600 my-2">
                      {formatAmount(Math.abs(totals.total_savings))}
                    </p>
                    <p className="text-sm text-red-600">
                      Monthly shortfall: {formatAmount(Math.abs(totals.total_savings) / 12)}
                    </p>
                    <p className="text-xs text-gray-500 mt-3">
                      Consider reducing expenses or increasing income to achieve positive cash flow.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="investments">
              <div className="space-y-4">
                {isSurplus && totals.total_savings > 0 ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-2 border-dashed">
                      <CardContent className="p-4 text-center">
                        <h4 className="font-medium text-gray-700 mb-2">Conservative (40%)</h4>
                        <p className="text-xl font-bold text-blue-600">
                          {formatAmount(totals.total_savings * 0.4)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">FD, PPF, Bonds</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-dashed">
                      <CardContent className="p-4 text-center">
                        <h4 className="font-medium text-gray-700 mb-2">Moderate (35%)</h4>
                        <p className="text-xl font-bold text-green-600">
                          {formatAmount(totals.total_savings * 0.35)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Mutual Funds, Gold</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-dashed">
                      <CardContent className="p-4 text-center">
                        <h4 className="font-medium text-gray-700 mb-2">Aggressive (25%)</h4>
                        <p className="text-xl font-bold text-purple-600">
                          {formatAmount(totals.total_savings * 0.25)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Equity, Stocks</p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <TrendingUp className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                    <p>No surplus available for investments</p>
                    <p className="text-sm mt-1">Address the deficit first before planning investments</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
