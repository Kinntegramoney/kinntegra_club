import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, PiggyBank, Wallet, ArrowUpRight, ArrowDownRight, User, Briefcase, Building, Home } from "lucide-react";

// Income categories that generate cashflows (salary, business, rental income, pension)
const CASHFLOW_INCOME_CATEGORIES = ['salary', 'business', 'rental', 'pension'];

export default function SurplusSection({ family, isReadOnly }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const expenseDetails = family?.expense_details || [];

  // Calculate annual income for a member from cashflow-generating categories
  const getMemberIncome = (memberId) => {
    const memberIncomes = incomeDetails.filter(
      income => CASHFLOW_INCOME_CATEGORIES.includes(income.category) && income.member_ids?.includes(memberId)
    );
    
    let totalIncome = 0;
    memberIncomes.forEach(income => {
      const details = income.details || {};
      
      switch (income.category) {
        case 'salary':
          // Salary: net_income_yearly or net_income_monthly * 12
          const salaryYearly = parseFloat(details.net_income_yearly) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || 0;
          totalIncome += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          break;
        case 'business':
          // Business: net_income_yearly
          totalIncome += parseFloat(details.net_income_yearly) || 0;
          break;
        case 'rental':
          // Rental: annual_rent (only if property is on rent)
          if (details.is_on_rent === 'Yes') {
            const annualRent = parseFloat(details.annual_rent) || 0;
            const rentPerMonth = parseFloat(details.rent_per_month) || 0;
            totalIncome += annualRent > 0 ? annualRent : rentPerMonth * 12;
          }
          break;
        case 'pension':
          // Pension: amount_yearly or calculated from amount and frequency
          const pensionYearly = parseFloat(details.amount_yearly) || 0;
          if (pensionYearly > 0) {
            totalIncome += pensionYearly;
          } else {
            const pensionAmount = parseFloat(details.amount) || 0;
            const frequency = details.payable_type;
            const multiplier = frequency === 'Monthly' ? 12 : frequency === 'Quarterly' ? 4 : frequency === 'Half-Yearly' ? 2 : 1;
            totalIncome += pensionAmount * multiplier;
          }
          break;
        default:
          break;
      }
    });
    
    return totalIncome;
  };

  // Calculate annual expenses for a member
  const getMemberExpenses = (memberId) => {
    const memberExpenses = expenseDetails.filter(
      expense => expense.member_ids?.includes(memberId)
    );
    
    return memberExpenses.reduce((sum, expense) => {
      const annualAmount = parseFloat(expense.annual_amount) || 0;
      const monthlyAmount = parseFloat(expense.monthly_amount) || 0;
      return sum + (annualAmount > 0 ? annualAmount : monthlyAmount * 12);
    }, 0);
  };

  // Get income breakdown by category for a member
  const getMemberIncomeBreakdown = (memberId) => {
    const memberIncomes = incomeDetails.filter(
      income => CASHFLOW_INCOME_CATEGORIES.includes(income.category) && income.member_ids?.includes(memberId)
    );
    
    const breakdown = { salary: 0, business: 0, rental: 0, pension: 0 };
    
    memberIncomes.forEach(income => {
      const details = income.details || {};
      
      switch (income.category) {
        case 'salary':
          const salaryYearly = parseFloat(details.net_income_yearly) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || 0;
          breakdown.salary += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          break;
        case 'business':
          breakdown.business += parseFloat(details.net_income_yearly) || 0;
          break;
        case 'rental':
          if (details.is_on_rent === 'Yes') {
            const annualRent = parseFloat(details.annual_rent) || 0;
            const rentPerMonth = parseFloat(details.rent_per_month) || 0;
            breakdown.rental += annualRent > 0 ? annualRent : rentPerMonth * 12;
          }
          break;
        case 'pension':
          const pensionYearly = parseFloat(details.amount_yearly) || 0;
          if (pensionYearly > 0) {
            breakdown.pension += pensionYearly;
          } else {
            const pensionAmount = parseFloat(details.amount) || 0;
            const frequency = details.payable_type;
            const multiplier = frequency === 'Monthly' ? 12 : frequency === 'Quarterly' ? 4 : frequency === 'Half-Yearly' ? 2 : 1;
            breakdown.pension += pensionAmount * multiplier;
          }
          break;
        default:
          break;
      }
    });
    
    return breakdown;
  };

  // Calculate totals
  const getTotals = () => {
    let totalIncome = 0;
    let totalExpenses = 0;
    
    members.forEach(member => {
      totalIncome += getMemberIncome(member.id);
      totalExpenses += getMemberExpenses(member.id);
    });
    
    return {
      totalIncome,
      totalExpenses,
      surplus: totalIncome - totalExpenses
    };
  };

  // Format currency
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null || amount === 0) return "₹0";
    const absValue = Math.abs(amount);
    if (absValue >= 10000000) return `${amount < 0 ? '-' : ''}₹${(absValue / 10000000).toFixed(2)} Cr`;
    if (absValue >= 100000) return `${amount < 0 ? '-' : ''}₹${(absValue / 100000).toFixed(2)} L`;
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(amount);
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-emerald-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Members tab first.</p>
      </div>
    );
  }

  const totals = getTotals();
  const isSurplus = totals.surplus >= 0;

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
                <p className="text-2xl font-bold text-green-700">{formatAmount(totals.totalIncome)}</p>
                <p className="text-xs text-green-600">Salary + Business + Rental + Pension (Annual)</p>
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
                  Total Expenses
                </p>
                <p className="text-2xl font-bold text-orange-700">{formatAmount(totals.totalExpenses)}</p>
                <p className="text-xs text-orange-600">Annual Expenses</p>
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
                  {formatAmount(Math.abs(totals.surplus))}
                </p>
                <p className={`text-xs ${isSurplus ? 'text-emerald-600' : 'text-red-600'}`}>
                  Income - Expenses
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-2 font-medium text-gray-600">Member</th>
                  <th className="text-right py-3 px-2 font-medium text-blue-600">
                    <div className="flex items-center justify-end gap-1">
                      <Briefcase className="h-3 w-3" />
                      Salary
                    </div>
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-purple-600">
                    <div className="flex items-center justify-end gap-1">
                      <Building className="h-3 w-3" />
                      Business
                    </div>
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-teal-600">
                    <div className="flex items-center justify-end gap-1">
                      <Home className="h-3 w-3" />
                      Rental
                    </div>
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-rose-600">Pension</th>
                  <th className="text-right py-3 px-2 font-medium text-green-600">Total Income</th>
                  <th className="text-right py-3 px-2 font-medium text-orange-600">Expenses</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-700">Surplus</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const breakdown = getMemberIncomeBreakdown(member.id);
                  const totalIncome = getMemberIncome(member.id);
                  const expenses = getMemberExpenses(member.id);
                  const surplus = totalIncome - expenses;
                  
                  return (
                    <tr key={member.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-sm font-medium">{member.name?.charAt(0)}</span>
                          </div>
                          <span className="font-medium">{member.name}</span>
                          {member.is_primary && <span className="text-emerald-500">*</span>}
                        </div>
                      </td>
                      <td className="text-right py-3 px-2 text-blue-600">
                        {breakdown.salary > 0 ? formatAmount(breakdown.salary) : '-'}
                      </td>
                      <td className="text-right py-3 px-2 text-purple-600">
                        {breakdown.business > 0 ? formatAmount(breakdown.business) : '-'}
                      </td>
                      <td className="text-right py-3 px-2 text-teal-600">
                        {breakdown.rental > 0 ? formatAmount(breakdown.rental) : '-'}
                      </td>
                      <td className="text-right py-3 px-2 text-rose-600">
                        {breakdown.pension > 0 ? formatAmount(breakdown.pension) : '-'}
                      </td>
                      <td className="text-right py-3 px-2 text-green-600 font-medium">
                        {formatAmount(totalIncome)}
                      </td>
                      <td className="text-right py-3 px-2 text-orange-600">
                        {formatAmount(expenses)}
                      </td>
                      <td className={`text-right py-3 px-2 font-semibold ${surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatAmount(surplus)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-semibold">
                  <td className="py-3 px-2">Total</td>
                  <td className="text-right py-3 px-2 text-blue-600">
                    {formatAmount(members.reduce((sum, m) => sum + getMemberIncomeBreakdown(m.id).salary, 0))}
                  </td>
                  <td className="text-right py-3 px-2 text-purple-600">
                    {formatAmount(members.reduce((sum, m) => sum + getMemberIncomeBreakdown(m.id).business, 0))}
                  </td>
                  <td className="text-right py-3 px-2 text-teal-600">
                    {formatAmount(members.reduce((sum, m) => sum + getMemberIncomeBreakdown(m.id).rental, 0))}
                  </td>
                  <td className="text-right py-3 px-2 text-rose-600">
                    {formatAmount(members.reduce((sum, m) => sum + getMemberIncomeBreakdown(m.id).pension, 0))}
                  </td>
                  <td className="text-right py-3 px-2 text-green-600">{formatAmount(totals.totalIncome)}</td>
                  <td className="text-right py-3 px-2 text-orange-600">{formatAmount(totals.totalExpenses)}</td>
                  <td className={`text-right py-3 px-2 ${totals.surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatAmount(totals.surplus)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Surplus Allocation */}
      {isSurplus && totals.surplus > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Surplus Allocation Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-2 border-dashed border-blue-200 bg-blue-50/30">
                <CardContent className="p-4 text-center">
                  <h4 className="font-medium text-gray-700 mb-2">Conservative (40%)</h4>
                  <p className="text-xl font-bold text-blue-600">
                    {formatAmount(totals.surplus * 0.4)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">FD, PPF, Bonds</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-dashed border-green-200 bg-green-50/30">
                <CardContent className="p-4 text-center">
                  <h4 className="font-medium text-gray-700 mb-2">Moderate (35%)</h4>
                  <p className="text-xl font-bold text-green-600">
                    {formatAmount(totals.surplus * 0.35)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Mutual Funds, Gold</p>
                </CardContent>
              </Card>
              <Card className="border-2 border-dashed border-purple-200 bg-purple-50/30">
                <CardContent className="p-4 text-center">
                  <h4 className="font-medium text-gray-700 mb-2">Aggressive (25%)</h4>
                  <p className="text-xl font-bold text-purple-600">
                    {formatAmount(totals.surplus * 0.25)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Equity, Stocks</p>
                </CardContent>
              </Card>
            </div>
            <p className="text-xs text-gray-500 mt-4 text-center">
              Monthly Surplus: {formatAmount(totals.surplus / 12)} available for investment
            </p>
          </CardContent>
        </Card>
      )}

      {/* Deficit Warning */}
      {!isSurplus && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-6 text-center">
            <Wallet className="h-12 w-12 mx-auto text-red-500 mb-3" />
            <h3 className="text-lg font-semibold text-red-700">Cash Flow Deficit</h3>
            <p className="text-3xl font-bold text-red-600 my-2">
              {formatAmount(Math.abs(totals.surplus))}
            </p>
            <p className="text-sm text-red-600">
              Monthly shortfall: {formatAmount(Math.abs(totals.surplus) / 12)}
            </p>
            <p className="text-xs text-gray-500 mt-3">
              Consider reducing expenses or increasing income to achieve positive cash flow.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
        <span>* Primary member</span>
        <span>Income sources: Salary, Business, Rental & Pension</span>
      </div>
    </div>
  );
}
