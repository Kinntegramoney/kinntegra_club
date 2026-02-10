import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, TrendingUp, TrendingDown, PiggyBank, Calculator, Calendar } from "lucide-react";

export default function SurplusSection({ family, isReadOnly }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const expenseDetails = family?.expense_details || [];
  const investmentDetails = family?.investment_details || [];

  const currentYear = new Date().getFullYear();
  
  // State for projection settings
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [incomeInflation, setIncomeInflation] = useState(5);
  const [expenseInflation, setExpenseInflation] = useState(6);

  // Get primary member for retirement calculation
  const primaryMember = members.find(m => m.is_primary) || members[0];
  
  // Calculate age from DOB
  const calculateAge = (dob) => {
    if (!dob) return 35; // default
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  // Get retirement age from salary/business income
  const getRetirementAge = () => {
    const salaryIncome = incomeDetails.find(i => i.category === 'salary' || i.category === 'business');
    return parseInt(salaryIncome?.details?.retirement_age) || 60;
  };

  const primaryAge = calculateAge(primaryMember?.date_of_birth);
  const retirementAge = getRetirementAge();
  const retirementYear = currentYear + (retirementAge - primaryAge);
  const lifeExpectancy = parseInt(primaryMember?.life_expectancy) || 85;
  const endYear = currentYear + (lifeExpectancy - primaryAge);

  // Calculate base year values
  const getBaseIncome = () => {
    let total = 0;
    incomeDetails.forEach(income => {
      const details = income.details || {};
      switch (income.category) {
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

  const getBaseExpenses = () => {
    return expenseDetails.reduce((sum, expense) => {
      const annualAmount = parseFloat(expense.annual_amount) || 0;
      const monthlyAmount = parseFloat(expense.monthly_amount) || 0;
      return sum + (annualAmount > 0 ? annualAmount : monthlyAmount * 12);
    }, 0);
  };

  const getBaseInvestments = () => {
    return investmentDetails.reduce((sum, inv) => sum + (parseFloat(inv.annual_amount) || 0), 0);
  };

  const baseIncome = getBaseIncome();
  const baseExpenses = getBaseExpenses();
  const baseInvestments = getBaseInvestments();

  // Calculate projected value for a given year
  const getProjectedValue = (baseValue, inflationRate, year, isIncome = false) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    
    if (yearsFromNow < 0) return baseValue;
    
    // Check if post-retirement (income stops or reduces)
    if (isIncome && targetYear >= retirementYear) {
      // After retirement, only pension/rental income continues
      let pensionIncome = 0;
      let rentalIncome = 0;
      
      incomeDetails.forEach(income => {
        const details = income.details || {};
        if (income.category === 'pension') {
          const pensionYearly = parseFloat(details.amount_yearly) || 0;
          if (pensionYearly > 0) {
            pensionIncome += pensionYearly;
          } else {
            const pensionAmount = parseFloat(details.amount) || 0;
            const frequency = details.payable_type;
            const multiplier = frequency === 'Monthly' ? 12 : frequency === 'Quarterly' ? 4 : frequency === 'Half-Yearly' ? 2 : 1;
            pensionIncome += pensionAmount * multiplier;
          }
        }
        if (income.category === 'rental' && details.is_on_rent === 'Yes') {
          const annualRent = parseFloat(details.annual_rent) || 0;
          const rentPerMonth = parseFloat(details.rent_per_month) || 0;
          rentalIncome += annualRent > 0 ? annualRent : rentPerMonth * 12;
        }
      });
      
      // Apply inflation to post-retirement income
      const yearsFromRetirement = targetYear - retirementYear;
      return (pensionIncome + rentalIncome) * Math.pow(1 + inflationRate / 100, yearsFromRetirement);
    }
    
    return baseValue * Math.pow(1 + inflationRate / 100, yearsFromNow);
  };

  // Generate year options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y <= endYear; y++) {
      years.push(y.toString());
    }
    return years;
  }, [currentYear, endYear]);

  // Calculate values for selected year
  const selectedYearInt = parseInt(selectedYear);
  const isPostRetirement = selectedYearInt >= retirementYear;
  
  const projectedIncome = getProjectedValue(baseIncome, incomeInflation, selectedYear, true);
  const projectedExpenses = getProjectedValue(baseExpenses, expenseInflation, selectedYear, false);
  const projectedInvestments = getProjectedValue(baseInvestments, 5, selectedYear, false); // Assume 5% increase in investments
  
  const projectedSavings = projectedIncome - projectedExpenses;
  const projectedSurplus = projectedSavings - projectedInvestments;

  // Format currency
  const formatAmount = (amount, showSign = false) => {
    if (amount === undefined || amount === null) return "₹0";
    const absValue = Math.abs(amount);
    let formatted;
    if (absValue >= 10000000) {
      formatted = `${(absValue / 10000000).toFixed(2)} Cr`;
    } else if (absValue >= 100000) {
      formatted = `${(absValue / 100000).toFixed(2)} L`;
    } else {
      formatted = absValue.toLocaleString('en-IN');
    }
    
    if (showSign && amount !== 0) {
      return amount >= 0 ? `+₹${formatted}` : `-₹${formatted}`;
    }
    return `₹${formatted}`;
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
    <div className="space-y-6">
      {/* Settings Panel */}
      <div className="bg-slate-50 border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="h-5 w-5 text-slate-600" />
          <h3 className="font-medium text-slate-800">Projection Settings</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Year</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => (
                  <SelectItem key={y} value={y}>
                    {y} {parseInt(y) === retirementYear && '(Retirement)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Income Growth %</Label>
            <Input
              type="number"
              value={incomeInflation}
              onChange={(e) => setIncomeInflation(parseFloat(e.target.value) || 0)}
              className="h-9"
              min="0"
              max="20"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600 mb-1 block">Expense Inflation %</Label>
            <Input
              type="number"
              value={expenseInflation}
              onChange={(e) => setExpenseInflation(parseFloat(e.target.value) || 0)}
              className="h-9"
              min="0"
              max="20"
            />
          </div>
          <div className="flex flex-col justify-end">
            <div className="text-xs text-slate-500">
              <div>Retirement: {retirementYear} (Age {retirementAge})</div>
              <div>Life Expectancy: {endYear} (Age {lifeExpectancy})</div>
            </div>
          </div>
        </div>
      </div>

      {/* Year Status Badge */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">Year {selectedYear}</span>
        {isPostRetirement ? (
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
            Post-Retirement
          </span>
        ) : (
          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            Pre-Retirement
          </span>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {selectedYearInt - currentYear} years from now
        </span>
      </div>

      {/* Main Cash Flow Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100">
              <th className="text-left py-3 px-4 font-medium text-slate-700 w-1/2">Particulars</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600 w-1/4">
                Base ({currentYear})
              </th>
              <th className="text-right py-3 px-4 font-medium text-slate-700 w-1/4 bg-slate-200">
                Projected ({selectedYear})
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Income */}
            <tr className="border-b bg-green-50/50">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800">Income</span>
                </div>
                <div className="text-xs text-green-600 mt-0.5">Salary + Business + Rental + Pension</div>
              </td>
              <td className="text-right py-3 px-4 text-green-700">
                {formatAmount(baseIncome)}
              </td>
              <td className="text-right py-3 px-4 font-semibold text-green-700 bg-green-100/50">
                {formatAmount(projectedIncome)}
              </td>
            </tr>

            {/* Expenses */}
            <tr className="border-b">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-600" />
                  <span className="font-medium text-orange-800">Expenses</span>
                </div>
                <div className="text-xs text-orange-600 mt-0.5">All living expenses @ {expenseInflation}% inflation</div>
              </td>
              <td className="text-right py-3 px-4 text-orange-700">
                {formatAmount(baseExpenses)}
              </td>
              <td className="text-right py-3 px-4 font-semibold text-orange-700 bg-slate-50">
                {formatAmount(projectedExpenses)}
              </td>
            </tr>

            {/* Savings */}
            <tr className="border-b bg-blue-50/50">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-blue-600" />
                  <span className="font-semibold text-blue-800">Savings</span>
                </div>
                <div className="text-xs text-blue-600 mt-0.5">Income - Expenses</div>
              </td>
              <td className="text-right py-3 px-4 text-blue-700">
                {formatAmount(baseIncome - baseExpenses)}
              </td>
              <td className={`text-right py-3 px-4 font-bold ${projectedSavings >= 0 ? 'text-blue-700 bg-blue-100/50' : 'text-red-700 bg-red-100/50'}`}>
                {formatAmount(projectedSavings)}
              </td>
            </tr>

            {/* Investments */}
            <tr className="border-b">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  <span className="font-medium text-purple-800">Investments</span>
                </div>
                <div className="text-xs text-purple-600 mt-0.5">SIP + PPF + NPS + RD + Stocks</div>
              </td>
              <td className="text-right py-3 px-4 text-purple-700">
                {formatAmount(baseInvestments)}
              </td>
              <td className="text-right py-3 px-4 font-semibold text-purple-700 bg-slate-50">
                {formatAmount(projectedInvestments)}
              </td>
            </tr>

            {/* Surplus */}
            <tr className={projectedSurplus >= 0 ? 'bg-emerald-100' : 'bg-red-100'}>
              <td className="py-4 px-4">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5 text-emerald-700" />
                  <span className="font-bold text-lg text-slate-800">Surplus / (Deficit)</span>
                </div>
                <div className="text-xs text-slate-600 mt-0.5">Savings - Investments</div>
              </td>
              <td className="text-right py-4 px-4 font-semibold text-slate-700">
                {formatAmount(baseIncome - baseExpenses - baseInvestments)}
              </td>
              <td className={`text-right py-4 px-4 font-bold text-xl ${projectedSurplus >= 0 ? 'text-emerald-800 bg-emerald-200/50' : 'text-red-800 bg-red-200/50'}`}>
                {formatAmount(projectedSurplus)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Quick Year Comparison */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 border-b">
          <h4 className="text-sm font-medium text-slate-700">5-Year Overview</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left py-2 px-3 font-medium text-slate-600">Year</th>
                <th className="text-right py-2 px-3 font-medium text-green-600">Income</th>
                <th className="text-right py-2 px-3 font-medium text-orange-600">Expenses</th>
                <th className="text-right py-2 px-3 font-medium text-blue-600">Savings</th>
                <th className="text-right py-2 px-3 font-medium text-purple-600">Investments</th>
                <th className="text-right py-2 px-3 font-medium text-slate-700">Surplus</th>
                <th className="text-center py-2 px-3 font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5].map(offset => {
                const year = currentYear + offset;
                const yearStr = year.toString();
                const isRetired = year >= retirementYear;
                const inc = getProjectedValue(baseIncome, incomeInflation, yearStr, true);
                const exp = getProjectedValue(baseExpenses, expenseInflation, yearStr, false);
                const inv = getProjectedValue(baseInvestments, 5, yearStr, false);
                const sav = inc - exp;
                const sur = sav - inv;
                
                return (
                  <tr key={year} className={`border-b hover:bg-slate-50 ${year.toString() === selectedYear ? 'bg-blue-50' : ''}`}>
                    <td className="py-2 px-3 font-medium">
                      {year}
                      {year === retirementYear && <span className="text-xs text-amber-600 ml-1">(R)</span>}
                    </td>
                    <td className="text-right py-2 px-3 text-green-600">{formatAmount(inc)}</td>
                    <td className="text-right py-2 px-3 text-orange-600">{formatAmount(exp)}</td>
                    <td className={`text-right py-2 px-3 ${sav >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatAmount(sav)}
                    </td>
                    <td className="text-right py-2 px-3 text-purple-600">{formatAmount(inv)}</td>
                    <td className={`text-right py-2 px-3 font-semibold ${sur >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatAmount(sur)}
                    </td>
                    <td className="text-center py-2 px-3">
                      {isRetired ? (
                        <span className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded">Post-Ret</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded">Working</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="text-xs text-slate-500 space-y-1 px-1">
        <p><strong>Note:</strong> Post-retirement, only Pension and Rental income continues. Salary/Business income stops at retirement.</p>
        <p>Investments from the Investments tab are considered as outflows from savings.</p>
      </div>
    </div>
  );
}
