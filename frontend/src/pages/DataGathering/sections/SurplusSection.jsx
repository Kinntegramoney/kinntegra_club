import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, PiggyBank, Wallet, ArrowUpRight, ArrowDownRight, User, Briefcase, Building, Home } from "lucide-react";

// Income categories that generate cashflows (salary, business, rental income, pension)
const CASHFLOW_INCOME_CATEGORIES = ['salary', 'business', 'rental', 'pension'];

// Investment categories - regular outflows for wealth creation
const INVESTMENT_CATEGORIES = [
  { key: 'insurance_income', label: 'Insurance Premium', field: 'premium_amount', frequencyField: 'premium_frequency' },
  { key: 'rd_pis', label: 'Recurring Deposit', field: 'investment_value_monthly', isMonthly: true },
  { key: 'ppf', label: 'PPF', field: 'yearly_contribution' },
  { key: 'epf', label: 'EPF', field: 'yearly_contribution' },
  { key: 'mutual_fund', label: 'Mutual Fund SIP', field: 'sip_amount', isMonthly: true },
  { key: 'shares_pms', label: 'Stocks / PMS', field: 'monthly_investment', isMonthly: true },
  { key: 'commodities', label: 'Commodities', field: 'monthly_investment', isMonthly: true }
];

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
          const salaryYearly = parseFloat(details.net_income_yearly) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || 0;
          totalIncome += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          break;
        case 'business':
          totalIncome += parseFloat(details.net_income_yearly) || 0;
          break;
        case 'rental':
          if (details.is_on_rent === 'Yes') {
            const annualRent = parseFloat(details.annual_rent) || 0;
            const rentPerMonth = parseFloat(details.rent_per_month) || 0;
            totalIncome += annualRent > 0 ? annualRent : rentPerMonth * 12;
          }
          break;
        case 'pension':
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

  // Calculate annual expenses for a member (from expense_details)
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

  // Calculate annual investments for a member (SIPs, premiums, RD, PPF contributions, etc.)
  const getMemberInvestments = (memberId) => {
    const memberIncomes = incomeDetails.filter(
      income => income.member_ids?.includes(memberId)
    );
    
    let investments = {
      insurance: 0,
      rd: 0,
      ppf: 0,
      epf: 0,
      mutualFund: 0,
      stocks: 0,
      commodities: 0,
      total: 0
    };
    
    memberIncomes.forEach(income => {
      const details = income.details || {};
      
      switch (income.category) {
        case 'insurance_income':
          // Insurance premium payments
          const premiumAmount = parseFloat(details.premium_amount) || 0;
          const premiumFrequency = details.premium_frequency;
          const premiumMultiplier = premiumFrequency === 'Monthly' ? 12 : 
                                   premiumFrequency === 'Quarterly' ? 4 : 
                                   premiumFrequency === 'Half-Yearly' ? 2 : 1;
          investments.insurance += premiumAmount * premiumMultiplier;
          break;
        case 'rd_pis':
          // Recurring Deposit monthly contributions
          const rdMonthly = parseFloat(details.investment_value_monthly) || 0;
          investments.rd += rdMonthly * 12;
          break;
        case 'ppf':
          // PPF yearly contribution
          const ppfYearly = parseFloat(details.yearly_contribution) || 0;
          investments.ppf += ppfYearly;
          break;
        case 'epf':
          // EPF yearly contribution (employee contribution)
          const epfYearly = parseFloat(details.yearly_contribution) || 0;
          investments.epf += epfYearly;
          break;
        case 'mutual_fund':
          // Mutual Fund SIP
          const sipAmount = parseFloat(details.sip_amount) || 0;
          investments.mutualFund += sipAmount * 12;
          break;
        case 'shares_pms':
          // Stock/PMS monthly investment
          const stockMonthly = parseFloat(details.monthly_investment) || 0;
          investments.stocks += stockMonthly * 12;
          break;
        case 'commodities':
          // Commodities monthly investment
          const commodityMonthly = parseFloat(details.monthly_investment) || 0;
          investments.commodities += commodityMonthly * 12;
          break;
        default:
          break;
      }
    });
    
    investments.total = investments.insurance + investments.rd + investments.ppf + 
                        investments.epf + investments.mutualFund + investments.stocks + 
                        investments.commodities;
    
    return investments;
  };

  // Calculate totals
  const getTotals = () => {
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalInvestments = {
      insurance: 0, rd: 0, ppf: 0, epf: 0, mutualFund: 0, stocks: 0, commodities: 0, total: 0
    };
    
    members.forEach(member => {
      totalIncome += getMemberIncome(member.id);
      totalExpenses += getMemberExpenses(member.id);
      const memberInv = getMemberInvestments(member.id);
      totalInvestments.insurance += memberInv.insurance;
      totalInvestments.rd += memberInv.rd;
      totalInvestments.ppf += memberInv.ppf;
      totalInvestments.epf += memberInv.epf;
      totalInvestments.mutualFund += memberInv.mutualFund;
      totalInvestments.stocks += memberInv.stocks;
      totalInvestments.commodities += memberInv.commodities;
      totalInvestments.total += memberInv.total;
    });
    
    const savings = totalIncome - totalExpenses;
    const surplus = savings - totalInvestments.total;
    
    return {
      totalIncome,
      totalExpenses,
      savings,
      totalInvestments,
      surplus
    };
  };

  // Format currency
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null || amount === 0) return "0";
    const absValue = Math.abs(amount);
    if (absValue >= 10000000) return `${amount < 0 ? '-' : ''}${(absValue / 10000000).toFixed(2)} Cr`;
    if (absValue >= 100000) return `${amount < 0 ? '-' : ''}${(absValue / 100000).toFixed(2)} L`;
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);
  };

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null || amount === 0) return "₹0";
    return `₹${formatAmount(amount)}`;
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <ArrowUpRight className="h-4 w-4" />
                  Income
                </p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(totals.totalIncome)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-300" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 flex items-center gap-1">
                  <ArrowDownRight className="h-4 w-4" />
                  Expenses
                </p>
                <p className="text-xl font-bold text-orange-700">{formatCurrency(totals.totalExpenses)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-orange-300" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 flex items-center gap-1">
                  <PiggyBank className="h-4 w-4" />
                  Savings
                </p>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(totals.savings)}</p>
                <p className="text-[10px] text-blue-500">Income - Expenses</p>
              </div>
              <PiggyBank className="h-8 w-8 text-blue-300" />
            </div>
          </CardContent>
        </Card>

        <Card className={isSurplus ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm flex items-center gap-1 ${isSurplus ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isSurplus ? <TrendingUp className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                  {isSurplus ? 'Surplus' : 'Deficit'}
                </p>
                <p className={`text-xl font-bold ${isSurplus ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatCurrency(Math.abs(totals.surplus))}
                </p>
                <p className={`text-[10px] ${isSurplus ? 'text-emerald-500' : 'text-red-500'}`}>Savings - Investments</p>
              </div>
              {isSurplus ? (
                <TrendingUp className="h-8 w-8 text-emerald-300" />
              ) : (
                <Wallet className="h-8 w-8 text-red-300" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Surplus Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Surplus Calculation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-600 w-1/3">Particulars</th>
                  {members.map((member) => (
                    <th key={member.id} className="text-right py-3 px-4 font-medium text-gray-600">
                      {member.name}
                      {member.is_primary && <span className="text-emerald-500 ml-1">*</span>}
                    </th>
                  ))}
                  <th className="text-right py-3 px-4 font-medium text-gray-700 bg-gray-100">
                    {family?.family_name || 'Family Total'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Income Row */}
                <tr className="border-b bg-green-50/50">
                  <td className="py-3 px-4 font-medium text-green-700">Income</td>
                  {members.map((member) => (
                    <td key={member.id} className="text-right py-3 px-4 text-green-600">
                      {formatAmount(getMemberIncome(member.id))}
                    </td>
                  ))}
                  <td className="text-right py-3 px-4 font-semibold text-green-700 bg-green-100/50">
                    {formatAmount(totals.totalIncome)}
                  </td>
                </tr>

                {/* Expenses Row */}
                <tr className="border-b">
                  <td className="py-3 px-4 font-medium text-orange-700">Expenses</td>
                  {members.map((member) => (
                    <td key={member.id} className="text-right py-3 px-4 text-orange-600">
                      {formatAmount(getMemberExpenses(member.id))}
                    </td>
                  ))}
                  <td className="text-right py-3 px-4 font-semibold text-orange-700 bg-gray-100">
                    {formatAmount(totals.totalExpenses)}
                  </td>
                </tr>

                {/* Savings Row */}
                <tr className="border-b bg-blue-50/50">
                  <td className="py-3 px-4 font-semibold text-blue-700">Savings</td>
                  {members.map((member) => {
                    const memberSavings = getMemberIncome(member.id) - getMemberExpenses(member.id);
                    return (
                      <td key={member.id} className={`text-right py-3 px-4 font-medium ${memberSavings >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatAmount(memberSavings)}
                      </td>
                    );
                  })}
                  <td className={`text-right py-3 px-4 font-bold ${totals.savings >= 0 ? 'text-blue-700' : 'text-red-700'} bg-blue-100/50`}>
                    {formatAmount(totals.savings)}
                  </td>
                </tr>

                {/* Investments Header */}
                <tr className="bg-purple-50">
                  <td colSpan={members.length + 2} className="py-2 px-4 font-semibold text-purple-700 text-sm">
                    Investments
                  </td>
                </tr>

                {/* Insurance Premium */}
                {totals.totalInvestments.insurance > 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-600">Insurance Premium</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-600">
                        {getMemberInvestments(member.id).insurance > 0 ? formatAmount(getMemberInvestments(member.id).insurance) : '-'}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm font-medium text-purple-600 bg-gray-100">
                      {formatAmount(totals.totalInvestments.insurance)}
                    </td>
                  </tr>
                )}

                {/* Recurring Deposit */}
                {totals.totalInvestments.rd > 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-600">Recurring Deposit</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-600">
                        {getMemberInvestments(member.id).rd > 0 ? formatAmount(getMemberInvestments(member.id).rd) : '-'}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm font-medium text-purple-600 bg-gray-100">
                      {formatAmount(totals.totalInvestments.rd)}
                    </td>
                  </tr>
                )}

                {/* PPF */}
                {totals.totalInvestments.ppf > 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-600">PPF</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-600">
                        {getMemberInvestments(member.id).ppf > 0 ? formatAmount(getMemberInvestments(member.id).ppf) : '-'}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm font-medium text-purple-600 bg-gray-100">
                      {formatAmount(totals.totalInvestments.ppf)}
                    </td>
                  </tr>
                )}

                {/* EPF */}
                {totals.totalInvestments.epf > 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-600">EPF Contribution</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-600">
                        {getMemberInvestments(member.id).epf > 0 ? formatAmount(getMemberInvestments(member.id).epf) : '-'}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm font-medium text-purple-600 bg-gray-100">
                      {formatAmount(totals.totalInvestments.epf)}
                    </td>
                  </tr>
                )}

                {/* Mutual Fund SIP */}
                {totals.totalInvestments.mutualFund > 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-600">Mutual Fund SIP</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-600">
                        {getMemberInvestments(member.id).mutualFund > 0 ? formatAmount(getMemberInvestments(member.id).mutualFund) : '-'}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm font-medium text-purple-600 bg-gray-100">
                      {formatAmount(totals.totalInvestments.mutualFund)}
                    </td>
                  </tr>
                )}

                {/* Stocks */}
                {totals.totalInvestments.stocks > 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-600">Stocks / PMS</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-600">
                        {getMemberInvestments(member.id).stocks > 0 ? formatAmount(getMemberInvestments(member.id).stocks) : '-'}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm font-medium text-purple-600 bg-gray-100">
                      {formatAmount(totals.totalInvestments.stocks)}
                    </td>
                  </tr>
                )}

                {/* Commodities */}
                {totals.totalInvestments.commodities > 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-600">Commodities</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-600">
                        {getMemberInvestments(member.id).commodities > 0 ? formatAmount(getMemberInvestments(member.id).commodities) : '-'}
                      </td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm font-medium text-purple-600 bg-gray-100">
                      {formatAmount(totals.totalInvestments.commodities)}
                    </td>
                  </tr>
                )}

                {/* Show placeholder if no investments */}
                {totals.totalInvestments.total === 0 && (
                  <tr className="border-b">
                    <td className="py-2 px-4 pl-8 text-sm text-gray-400 italic">No investments recorded</td>
                    {members.map((member) => (
                      <td key={member.id} className="text-right py-2 px-4 text-sm text-gray-400">-</td>
                    ))}
                    <td className="text-right py-2 px-4 text-sm text-gray-400 bg-gray-100">0</td>
                  </tr>
                )}

                {/* Total Investments Row */}
                <tr className="border-b bg-purple-50/50">
                  <td className="py-2 px-4 font-medium text-purple-700">Total Investments</td>
                  {members.map((member) => (
                    <td key={member.id} className="text-right py-2 px-4 font-medium text-purple-600">
                      {formatAmount(getMemberInvestments(member.id).total)}
                    </td>
                  ))}
                  <td className="text-right py-2 px-4 font-bold text-purple-700 bg-purple-100/50">
                    {formatAmount(totals.totalInvestments.total)}
                  </td>
                </tr>

                {/* Surplus Row */}
                <tr className={isSurplus ? "bg-emerald-100" : "bg-red-100"}>
                  <td className={`py-3 px-4 font-bold ${isSurplus ? 'text-emerald-800' : 'text-red-800'}`}>
                    Surplus
                  </td>
                  {members.map((member) => {
                    const memberSavings = getMemberIncome(member.id) - getMemberExpenses(member.id);
                    const memberInvestments = getMemberInvestments(member.id).total;
                    const memberSurplus = memberSavings - memberInvestments;
                    return (
                      <td key={member.id} className={`text-right py-3 px-4 font-bold ${memberSurplus >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatAmount(memberSurplus)}
                      </td>
                    );
                  })}
                  <td className={`text-right py-3 px-4 font-bold text-lg ${isSurplus ? 'text-emerald-800 bg-emerald-200/50' : 'text-red-800 bg-red-200/50'}`}>
                    {formatAmount(totals.surplus)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary Note */}
      <div className="text-xs text-gray-500 px-1 space-y-1">
        <p><strong>Income:</strong> Salary + Business + Rental + Pension (Annual)</p>
        <p><strong>Savings:</strong> Income - Expenses</p>
        <p><strong>Investments:</strong> Insurance Premium + RD + PPF + EPF + Mutual Fund SIP + Stocks + Commodities (Annual)</p>
        <p><strong>Surplus:</strong> Savings - Investments (Available for additional savings/investment)</p>
      </div>
    </div>
  );
}
