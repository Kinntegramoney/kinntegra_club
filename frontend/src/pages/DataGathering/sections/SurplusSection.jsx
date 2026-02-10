import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { User, TrendingUp, TrendingDown, PiggyBank, Calendar, Info } from "lucide-react";

export default function SurplusSection({ family, isReadOnly }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const expenseDetails = family?.expense_details || [];
  const investmentDetails = family?.investment_details || [];

  const currentYear = new Date().getFullYear();
  
  // State for selected year
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  // Get primary member for retirement calculation
  const primaryMember = members.find(m => m.is_primary) || members[0];
  
  // Calculate age from DOB
  const calculateAge = (dob) => {
    if (!dob) return 35;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  // Get retirement info from income data
  const getRetirementInfo = () => {
    let earliestRetirementAge = 60;
    let earliestRetirementYear = null;
    
    incomeDetails.forEach(income => {
      if (income.category === 'salary' || income.category === 'business') {
        const retAge = parseInt(income.details?.retirement_age);
        const retYear = parseInt(income.details?.year_of_retirement);
        if (retAge && retAge < earliestRetirementAge) {
          earliestRetirementAge = retAge;
        }
        if (retYear && (!earliestRetirementYear || retYear < earliestRetirementYear)) {
          earliestRetirementYear = retYear;
        }
      }
    });
    
    const primaryAge = calculateAge(primaryMember?.date_of_birth);
    if (!earliestRetirementYear) {
      earliestRetirementYear = currentYear + (earliestRetirementAge - primaryAge);
    }
    
    return { retirementAge: earliestRetirementAge, retirementYear: earliestRetirementYear };
  };

  const { retirementAge, retirementYear } = getRetirementInfo();
  const primaryAge = calculateAge(primaryMember?.date_of_birth);
  const lifeExpectancy = parseInt(primaryMember?.life_expectancy) || 85;
  const endYear = currentYear + (lifeExpectancy - primaryAge);

  // Get income growth rates from actual data
  const getIncomeGrowthRates = () => {
    const rates = { salary: 0, business: 0, rental: 3, pension: 0 };
    
    incomeDetails.forEach(income => {
      const growthRate = parseFloat(income.details?.avg_growth_rate) || 0;
      if (income.category === 'salary' && growthRate > rates.salary) {
        rates.salary = growthRate;
      }
      if (income.category === 'business' && growthRate > rates.business) {
        rates.business = growthRate;
      }
    });
    
    return rates;
  };

  const incomeGrowthRates = getIncomeGrowthRates();

  // Calculate base year income by category
  const getBaseIncomeByCategory = () => {
    const income = { salary: 0, business: 0, rental: 0, pension: 0, total: 0 };
    
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      switch (inc.category) {
        case 'salary':
          const salaryYearly = parseFloat(details.net_income_yearly) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || 0;
          income.salary += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          break;
        case 'business':
          income.business += parseFloat(details.net_income_yearly) || 0;
          break;
        case 'rental':
          if (details.is_on_rent === 'Yes') {
            const annualRent = parseFloat(details.annual_rent) || 0;
            const rentPerMonth = parseFloat(details.rent_per_month) || 0;
            income.rental += annualRent > 0 ? annualRent : rentPerMonth * 12;
          }
          break;
        case 'pension':
          const pensionYearly = parseFloat(details.amount_yearly) || 0;
          if (pensionYearly > 0) {
            income.pension += pensionYearly;
          } else {
            const pensionAmount = parseFloat(details.amount) || 0;
            const frequency = details.payable_type;
            const multiplier = frequency === 'Monthly' ? 12 : frequency === 'Quarterly' ? 4 : frequency === 'Half-Yearly' ? 2 : 1;
            income.pension += pensionAmount * multiplier;
          }
          break;
        default:
          break;
      }
    });
    
    income.total = income.salary + income.business + income.rental + income.pension;
    return income;
  };

  // Calculate base year expenses with individual inflation rates
  const getBaseExpensesWithInflation = () => {
    return expenseDetails.map(expense => ({
      id: expense.id,
      category: expense.expense_type,
      annualAmount: parseFloat(expense.annual_amount) || (parseFloat(expense.monthly_amount) || 0) * 12,
      inflationRate: parseFloat(expense.inflation_percent) ?? 5,
      uptoYear: parseInt(expense.upto_year) || endYear,
      considerPostRetirement: expense.consider_post_retirement || false,
      postRetirementPercent: parseFloat(expense.post_retirement_percent) ?? 100
    }));
  };

  const baseIncome = getBaseIncomeByCategory();
  const baseExpensesWithInflation = getBaseExpensesWithInflation();
  const baseExpensesTotal = baseExpensesWithInflation.reduce((sum, exp) => sum + exp.annualAmount, 0);
  const baseInvestments = investmentDetails.reduce((sum, inv) => sum + (parseFloat(inv.annual_amount) || 0), 0);

  // Calculate projected income for a given year
  const getProjectedIncome = (year) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= retirementYear;
    
    if (yearsFromNow < 0) return baseIncome;
    
    let projected = { salary: 0, business: 0, rental: 0, pension: 0, total: 0 };
    
    if (isPostRetirement) {
      // Post-retirement: Only rental and pension continue
      const yearsFromRetirement = targetYear - retirementYear;
      projected.rental = baseIncome.rental * Math.pow(1 + incomeGrowthRates.rental / 100, retirementYear - currentYear + yearsFromRetirement);
      projected.pension = baseIncome.pension * Math.pow(1 + incomeGrowthRates.pension / 100, yearsFromNow);
    } else {
      // Pre-retirement: All income sources with their growth rates
      projected.salary = baseIncome.salary * Math.pow(1 + incomeGrowthRates.salary / 100, yearsFromNow);
      projected.business = baseIncome.business * Math.pow(1 + incomeGrowthRates.business / 100, yearsFromNow);
      projected.rental = baseIncome.rental * Math.pow(1 + incomeGrowthRates.rental / 100, yearsFromNow);
      projected.pension = baseIncome.pension * Math.pow(1 + incomeGrowthRates.pension / 100, yearsFromNow);
    }
    
    projected.total = projected.salary + projected.business + projected.rental + projected.pension;
    return projected;
  };

  // Calculate projected expenses for a given year (using individual inflation rates)
  const getProjectedExpenses = (year) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= retirementYear;
    
    if (yearsFromNow < 0) return baseExpensesTotal;
    
    let total = 0;
    baseExpensesWithInflation.forEach(expense => {
      // Check if expense is still applicable in this year
      if (targetYear > expense.uptoYear) return;
      
      let projectedAmount = expense.annualAmount * Math.pow(1 + expense.inflationRate / 100, yearsFromNow);
      
      // Apply post-retirement adjustment if applicable
      if (isPostRetirement && expense.considerPostRetirement) {
        projectedAmount = projectedAmount * (expense.postRetirementPercent / 100);
      }
      
      total += projectedAmount;
    });
    
    return total;
  };

  // Calculate projected investments (assume 5% growth in investment capacity)
  const getProjectedInvestments = (year) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= retirementYear;
    
    if (yearsFromNow < 0) return baseInvestments;
    
    // Post-retirement: reduce investments to 50%
    if (isPostRetirement) {
      const yearsFromRetirement = targetYear - retirementYear;
      return baseInvestments * 0.5 * Math.pow(1.03, yearsFromRetirement);
    }
    
    return baseInvestments * Math.pow(1.05, yearsFromNow);
  };

  // Generate year options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y <= Math.min(endYear, currentYear + 30); y++) {
      years.push(y.toString());
    }
    return years;
  }, [currentYear, endYear]);

  // Calculate average expense inflation
  const avgExpenseInflation = baseExpensesWithInflation.length > 0
    ? (baseExpensesWithInflation.reduce((sum, e) => sum + e.inflationRate, 0) / baseExpensesWithInflation.length).toFixed(1)
    : 5;

  // Values for selected year
  const selectedYearInt = parseInt(selectedYear);
  const isPostRetirement = selectedYearInt >= retirementYear;
  const projectedIncome = getProjectedIncome(selectedYear);
  const projectedExpenses = getProjectedExpenses(selectedYear);
  const projectedInvestments = getProjectedInvestments(selectedYear);
  const projectedSavings = projectedIncome.total - projectedExpenses;
  const projectedSurplus = projectedSavings - projectedInvestments;

  // Format currency
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return "0";
    const absValue = Math.abs(amount);
    let formatted;
    if (absValue >= 10000000) {
      formatted = `${(absValue / 10000000).toFixed(2)} Cr`;
    } else if (absValue >= 100000) {
      formatted = `${(absValue / 100000).toFixed(2)} L`;
    } else {
      formatted = absValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }
    return amount < 0 ? `-₹${formatted}` : `₹${formatted}`;
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

  return (
    <div className="space-y-5">
      {/* Year Selector & Info */}
      <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <Label className="text-xs text-slate-500 mb-1 block">Select Year</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => (
                  <SelectItem key={y} value={y}>
                    {y} {parseInt(y) === retirementYear && '(R)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            {isPostRetirement ? (
              <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                Post-Retirement
              </span>
            ) : (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                Pre-Retirement
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Retirement: {retirementYear} (Age {retirementAge})</div>
          <div>Life Expectancy: Age {lifeExpectancy}</div>
        </div>
      </div>

      {/* Growth Rates Info */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-blue-700">
          <span className="font-medium">Using rates from your data:</span>
          <span className="ml-2">Salary Growth: {incomeGrowthRates.salary}%</span>
          <span className="ml-2">| Business Growth: {incomeGrowthRates.business}%</span>
          <span className="ml-2">| Avg Expense Inflation: {avgExpenseInflation}%</span>
        </div>
      </div>

      {/* Main Cash Flow Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="text-left py-2.5 px-4 font-medium text-slate-700">Particulars</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-500 w-32">Base ({currentYear})</th>
              <th className="text-right py-2.5 px-4 font-medium text-slate-700 w-36 bg-slate-200">
                Year {selectedYear}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Income Section */}
            <tr className="bg-green-50/60 border-b">
              <td className="py-2.5 px-4 font-medium text-green-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Income
              </td>
              <td className="text-right py-2.5 px-4 text-green-600">{formatAmount(baseIncome.total)}</td>
              <td className="text-right py-2.5 px-4 font-semibold text-green-700 bg-green-100/50">
                {formatAmount(projectedIncome.total)}
              </td>
            </tr>
            {/* Income Breakdown */}
            {baseIncome.salary > 0 && (
              <tr className="border-b text-xs">
                <td className="py-1.5 px-4 pl-10 text-slate-500">Salary ({incomeGrowthRates.salary}% growth)</td>
                <td className="text-right py-1.5 px-4 text-slate-400">{formatAmount(baseIncome.salary)}</td>
                <td className="text-right py-1.5 px-4 text-green-600 bg-slate-50">{formatAmount(projectedIncome.salary)}</td>
              </tr>
            )}
            {baseIncome.business > 0 && (
              <tr className="border-b text-xs">
                <td className="py-1.5 px-4 pl-10 text-slate-500">Business ({incomeGrowthRates.business}% growth)</td>
                <td className="text-right py-1.5 px-4 text-slate-400">{formatAmount(baseIncome.business)}</td>
                <td className="text-right py-1.5 px-4 text-green-600 bg-slate-50">{formatAmount(projectedIncome.business)}</td>
              </tr>
            )}
            {baseIncome.rental > 0 && (
              <tr className="border-b text-xs">
                <td className="py-1.5 px-4 pl-10 text-slate-500">Rental ({incomeGrowthRates.rental}% growth)</td>
                <td className="text-right py-1.5 px-4 text-slate-400">{formatAmount(baseIncome.rental)}</td>
                <td className="text-right py-1.5 px-4 text-green-600 bg-slate-50">{formatAmount(projectedIncome.rental)}</td>
              </tr>
            )}
            {baseIncome.pension > 0 && (
              <tr className="border-b text-xs">
                <td className="py-1.5 px-4 pl-10 text-slate-500">Pension</td>
                <td className="text-right py-1.5 px-4 text-slate-400">{formatAmount(baseIncome.pension)}</td>
                <td className="text-right py-1.5 px-4 text-green-600 bg-slate-50">{formatAmount(projectedIncome.pension)}</td>
              </tr>
            )}

            {/* Expenses */}
            <tr className="border-b">
              <td className="py-2.5 px-4 font-medium text-orange-700 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Expenses
                <span className="text-[10px] font-normal text-orange-500">(avg {avgExpenseInflation}% inflation)</span>
              </td>
              <td className="text-right py-2.5 px-4 text-orange-600">{formatAmount(baseExpensesTotal)}</td>
              <td className="text-right py-2.5 px-4 font-semibold text-orange-700 bg-slate-50">
                {formatAmount(projectedExpenses)}
              </td>
            </tr>

            {/* Savings */}
            <tr className="bg-blue-50/60 border-b">
              <td className="py-2.5 px-4 font-semibold text-blue-700 flex items-center gap-2">
                <PiggyBank className="h-4 w-4" />
                Savings
                <span className="text-[10px] font-normal text-blue-500">(Income - Expenses)</span>
              </td>
              <td className="text-right py-2.5 px-4 text-blue-600">{formatAmount(baseIncome.total - baseExpensesTotal)}</td>
              <td className={`text-right py-2.5 px-4 font-bold ${projectedSavings >= 0 ? 'text-blue-700 bg-blue-100/50' : 'text-red-700 bg-red-100/50'}`}>
                {formatAmount(projectedSavings)}
              </td>
            </tr>

            {/* Investments */}
            <tr className="border-b">
              <td className="py-2.5 px-4 font-medium text-purple-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Investments
                <span className="text-[10px] font-normal text-purple-500">(from Investments tab)</span>
              </td>
              <td className="text-right py-2.5 px-4 text-purple-600">{formatAmount(baseInvestments)}</td>
              <td className="text-right py-2.5 px-4 font-semibold text-purple-700 bg-slate-50">
                {formatAmount(projectedInvestments)}
              </td>
            </tr>

            {/* Surplus */}
            <tr className={projectedSurplus >= 0 ? 'bg-emerald-100' : 'bg-red-100'}>
              <td className="py-3 px-4 font-bold text-slate-800">
                Surplus / (Deficit)
                <span className="text-[10px] font-normal text-slate-500 ml-2">(Savings - Investments)</span>
              </td>
              <td className="text-right py-3 px-4 font-semibold text-slate-600">
                {formatAmount(baseIncome.total - baseExpensesTotal - baseInvestments)}
              </td>
              <td className={`text-right py-3 px-4 font-bold text-lg ${projectedSurplus >= 0 ? 'text-emerald-700 bg-emerald-200/50' : 'text-red-700 bg-red-200/50'}`}>
                {formatAmount(projectedSurplus)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Multi-Year Overview */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 border-b flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-700">Year-wise Projection</h4>
          <span className="text-[10px] text-slate-500">(R) = Retirement Year</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="text-left py-2 px-3 font-medium text-slate-600 sticky left-0 bg-slate-50">Year</th>
                <th className="text-right py-2 px-3 font-medium text-green-600 min-w-[80px]">Income</th>
                <th className="text-right py-2 px-3 font-medium text-orange-600 min-w-[80px]">Expenses</th>
                <th className="text-right py-2 px-3 font-medium text-blue-600 min-w-[80px]">Savings</th>
                <th className="text-right py-2 px-3 font-medium text-purple-600 min-w-[80px]">Investments</th>
                <th className="text-right py-2 px-3 font-medium text-slate-700 min-w-[80px]">Surplus</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5, 10, 15, 20].filter(offset => currentYear + offset <= endYear).map(offset => {
                const year = currentYear + offset;
                const yearStr = year.toString();
                const isRetired = year >= retirementYear;
                const isSelected = yearStr === selectedYear;
                const inc = getProjectedIncome(yearStr);
                const exp = getProjectedExpenses(yearStr);
                const inv = getProjectedInvestments(yearStr);
                const sav = inc.total - exp;
                const sur = sav - inv;
                
                return (
                  <tr 
                    key={year} 
                    className={`border-b ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'} ${year === retirementYear ? 'bg-amber-50' : ''}`}
                    onClick={() => setSelectedYear(yearStr)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={`py-2 px-3 font-medium sticky left-0 ${isSelected ? 'bg-blue-50' : year === retirementYear ? 'bg-amber-50' : 'bg-white'}`}>
                      {year}
                      {year === retirementYear && <span className="text-amber-600 ml-1">(R)</span>}
                    </td>
                    <td className="text-right py-2 px-3 text-green-600">{formatAmount(inc.total)}</td>
                    <td className="text-right py-2 px-3 text-orange-600">{formatAmount(exp)}</td>
                    <td className={`text-right py-2 px-3 ${sav >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatAmount(sav)}
                    </td>
                    <td className="text-right py-2 px-3 text-purple-600">{formatAmount(inv)}</td>
                    <td className={`text-right py-2 px-3 font-semibold ${sur >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatAmount(sur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="text-[11px] text-slate-500 space-y-1 px-1">
        <p>• Income growth rates and expense inflation rates are captured from Income and Expenses sections respectively</p>
        <p>• Post-retirement: Salary & Business income stops. Only Pension & Rental income continues.</p>
        <p>• Click on any year row in the table above to view detailed projection for that year</p>
      </div>
    </div>
  );
}
