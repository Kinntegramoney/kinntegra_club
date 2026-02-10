import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark } from "lucide-react";

export default function SurplusSection({ family, isReadOnly }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const expenseDetails = family?.expense_details || [];
  const investmentDetails = family?.investment_details || [];

  const currentYear = new Date().getFullYear();
  
  // Generate default years to show
  const defaultYears = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4, currentYear + 5];
  const [displayYears, setDisplayYears] = useState(defaultYears.map(String));

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

  // Calculate base year income
  const getBaseIncome = () => {
    let total = 0;
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      switch (inc.category) {
        case 'salary':
          const salaryYearly = parseFloat(details.net_income_yearly) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || 0;
          total += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          break;
        case 'business':
          total += parseFloat(details.net_income_yearly) || 0;
          break;
        case 'rental':
          if (details.is_on_rent === 'Yes') {
            const annualRent = parseFloat(details.annual_rent) || 0;
            const rentPerMonth = parseFloat(details.rent_per_month) || 0;
            total += annualRent > 0 ? annualRent : rentPerMonth * 12;
          }
          break;
        case 'pension':
          const pensionYearly = parseFloat(details.amount_yearly) || 0;
          if (pensionYearly > 0) {
            total += pensionYearly;
          } else {
            const pensionAmount = parseFloat(details.amount) || 0;
            const frequency = details.payable_type;
            const multiplier = frequency === 'Monthly' ? 12 : frequency === 'Quarterly' ? 4 : frequency === 'Half-Yearly' ? 2 : 1;
            total += pensionAmount * multiplier;
          }
          break;
        default:
          break;
      }
    });
    return total;
  };

  // Get base income by category for post-retirement calculation
  const getBaseIncomeByCategory = () => {
    const income = { salary: 0, business: 0, rental: 0, pension: 0 };
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
    return income;
  };

  // Calculate base year expenses with individual inflation rates
  const getBaseExpensesWithInflation = () => {
    return expenseDetails.map(expense => ({
      annualAmount: parseFloat(expense.annual_amount) || (parseFloat(expense.monthly_amount) || 0) * 12,
      inflationRate: parseFloat(expense.inflation_percent) ?? 5,
      uptoYear: parseInt(expense.upto_year) || endYear,
      considerPostRetirement: expense.consider_post_retirement || false,
      postRetirementPercent: parseFloat(expense.post_retirement_percent) ?? 100
    }));
  };

  const baseIncome = getBaseIncome();
  const baseIncomeByCategory = getBaseIncomeByCategory();
  const baseExpensesWithInflation = getBaseExpensesWithInflation();
  const baseExpensesTotal = baseExpensesWithInflation.reduce((sum, exp) => sum + exp.annualAmount, 0);
  const baseInvestments = investmentDetails.reduce((sum, inv) => sum + (parseFloat(inv.annual_amount) || 0), 0);

  // Calculate projected income for a given year
  const getProjectedIncome = (year) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= retirementYear;
    
    if (yearsFromNow <= 0) return baseIncome;
    
    if (isPostRetirement) {
      // Post-retirement: Only rental and pension continue
      const yearsFromRetirement = targetYear - retirementYear;
      const preRetirementYears = retirementYear - currentYear;
      const rental = baseIncomeByCategory.rental * Math.pow(1 + incomeGrowthRates.rental / 100, preRetirementYears + yearsFromRetirement);
      const pension = baseIncomeByCategory.pension;
      return rental + pension;
    }
    
    // Pre-retirement: Apply growth rates
    const salary = baseIncomeByCategory.salary * Math.pow(1 + incomeGrowthRates.salary / 100, yearsFromNow);
    const business = baseIncomeByCategory.business * Math.pow(1 + incomeGrowthRates.business / 100, yearsFromNow);
    const rental = baseIncomeByCategory.rental * Math.pow(1 + incomeGrowthRates.rental / 100, yearsFromNow);
    const pension = baseIncomeByCategory.pension;
    
    return salary + business + rental + pension;
  };

  // Calculate projected expenses for a given year
  const getProjectedExpenses = (year) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= retirementYear;
    
    if (yearsFromNow <= 0) return baseExpensesTotal;
    
    let total = 0;
    baseExpensesWithInflation.forEach(expense => {
      if (targetYear > expense.uptoYear) return;
      
      let projectedAmount = expense.annualAmount * Math.pow(1 + expense.inflationRate / 100, yearsFromNow);
      
      if (isPostRetirement && expense.considerPostRetirement) {
        projectedAmount = projectedAmount * (expense.postRetirementPercent / 100);
      }
      
      total += projectedAmount;
    });
    
    return total;
  };

  // Calculate projected investments
  const getProjectedInvestments = (year) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= retirementYear;
    
    if (yearsFromNow <= 0) return baseInvestments;
    
    if (isPostRetirement) {
      return baseInvestments * 0.5;
    }
    
    return baseInvestments * Math.pow(1.05, yearsFromNow);
  };

  // Generate year options for dropdown
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y <= Math.min(endYear, currentYear + 40); y++) {
      years.push(y.toString());
    }
    return years;
  }, [currentYear, endYear]);

  // Handle year selection change
  const handleYearChange = (index, newYear) => {
    const newYears = [...displayYears];
    newYears[index] = newYear;
    // Sort years in ascending order
    newYears.sort((a, b) => parseInt(a) - parseInt(b));
    setDisplayYears(newYears);
  };

  // Format currency
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return "-";
    const absValue = Math.abs(amount);
    if (absValue === 0) return "-";
    if (absValue >= 10000000) return `${amount < 0 ? '-' : ''}${(absValue / 10000000).toFixed(2)} Cr`;
    if (absValue >= 100000) return `${amount < 0 ? '-' : ''}${(absValue / 100000).toFixed(2)} L`;
    return `${amount < 0 ? '-' : ''}${absValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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

  // Calculate values for each display year
  const yearData = displayYears.map(year => {
    const yearInt = parseInt(year);
    const income = getProjectedIncome(year);
    const expenses = getProjectedExpenses(year);
    const investments = getProjectedInvestments(year);
    const savings = income - expenses;
    const surplus = savings - investments;
    const isRetired = yearInt >= retirementYear;
    
    return { year, yearInt, income, expenses, investments, savings, surplus, isRetired };
  });

  return (
    <div className="space-y-4">
      {/* Info Text */}
      <div className="text-xs text-gray-500 px-1">
        Year-wise cash flow projection based on income growth rates and expense inflation from your data. 
        <span className="ml-1 text-blue-600">
          (Salary: {incomeGrowthRates.salary}% | Business: {incomeGrowthRates.business}% growth)
        </span>
      </div>

      {/* Main Projection Table */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            {/* Year Selection Row */}
            <tr className="bg-blue-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-700 px-4 py-2 border-r border-gray-200 min-w-[160px]">
                Particulars
              </th>
              {displayYears.map((year, idx) => {
                const yearInt = parseInt(year);
                const isRetired = yearInt >= retirementYear;
                return (
                  <th key={idx} className={`text-center px-2 py-2 min-w-[100px] ${idx < displayYears.length - 1 ? 'border-r border-gray-200' : ''}`}>
                    <Select value={year} onValueChange={(v) => handleYearChange(idx, v)}>
                      <SelectTrigger className="h-7 text-xs w-full border-0 bg-transparent shadow-none justify-center font-semibold text-blue-700">
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
                    {isRetired && (
                      <span className="text-[9px] text-amber-600 font-normal">Post-Ret</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Income Row */}
            <tr className="bg-green-50/50 hover:bg-green-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-800">Income</span>
                </div>
                <div className="text-[10px] text-green-600 mt-0.5">Salary + Business + Rental + Pension</div>
              </td>
              {yearData.map((data, idx) => (
                <td key={idx} className={`px-2 py-2.5 text-right ${idx < yearData.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className="text-sm font-medium text-green-700">{formatAmount(data.income)}</span>
                </td>
              ))}
            </tr>

            {/* Expenses Row */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-gray-800">Expenses</span>
                </div>
                <div className="text-[10px] text-orange-600 mt-0.5">With individual inflation rates</div>
              </td>
              {yearData.map((data, idx) => (
                <td key={idx} className={`px-2 py-2.5 text-right ${idx < yearData.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className="text-sm font-medium text-orange-700">{formatAmount(data.expenses)}</span>
                </td>
              ))}
            </tr>

            {/* Savings Row */}
            <tr className="bg-blue-50/50 hover:bg-blue-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-800">Savings</span>
                </div>
                <div className="text-[10px] text-blue-600 mt-0.5">Income - Expenses</div>
              </td>
              {yearData.map((data, idx) => (
                <td key={idx} className={`px-2 py-2.5 text-right ${idx < yearData.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className={`text-sm font-semibold ${data.savings >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                    {formatAmount(data.savings)}
                  </span>
                </td>
              ))}
            </tr>

            {/* Investments Row */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-800">Investments</span>
                </div>
                <div className="text-[10px] text-purple-600 mt-0.5">SIP, PPF, NPS, etc.</div>
              </td>
              {yearData.map((data, idx) => (
                <td key={idx} className={`px-2 py-2.5 text-right ${idx < yearData.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className="text-sm font-medium text-purple-700">{formatAmount(data.investments)}</span>
                </td>
              ))}
            </tr>

            {/* Surplus Row */}
            <tr className="bg-emerald-100">
              <td className="px-4 py-3 border-r border-emerald-200">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-700" />
                  <span className="text-sm font-bold text-emerald-800">Surplus / (Deficit)</span>
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">Savings - Investments</div>
              </td>
              {yearData.map((data, idx) => (
                <td key={idx} className={`px-2 py-3 text-right ${idx < yearData.length - 1 ? 'border-r border-emerald-200' : ''} ${data.surplus >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className={`text-sm font-bold ${data.surplus >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatAmount(data.surplus)}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary Info */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <div>
          <span className="font-medium">Retirement Year:</span> {retirementYear} (Age {retirementAge})
          <span className="mx-2">|</span>
          <span className="font-medium">Life Expectancy:</span> Age {lifeExpectancy}
        </div>
        <div className="text-[10px]">
          <span className="text-amber-600">(R)</span> = Retirement Year
        </div>
      </div>

      {/* Notes */}
      <div className="text-[10px] text-gray-400 px-1">
        • Post-retirement: Salary & Business income stops. Only Pension & Rental continue.
        • Use dropdowns to select different years for comparison.
      </div>
    </div>
  );
}
