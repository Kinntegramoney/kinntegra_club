import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark, Target } from "lucide-react";

export default function SurplusSection({ family, isReadOnly }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const expenseDetails = family?.expense_details || [];
  const investmentDetails = family?.investment_details || [];
  const goalDetails = family?.goal_details || [];

  const currentYear = new Date().getFullYear();
  
  // Selected year for detailed view
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

  const primaryAge = calculateAge(primaryMember?.date_of_birth);
  const lifeExpectancy = parseInt(primaryMember?.life_expectancy) || 85;
  const endYear = currentYear + (lifeExpectancy - primaryAge);

  // Get member-specific income growth rates and retirement info
  const getMemberIncomeInfo = (memberId) => {
    const memberIncomes = incomeDetails.filter(inc => inc.member_ids?.includes(memberId));
    
    let salaryGrowth = 0, businessGrowth = 0, retirementAge = 60, retirementYear = null;
    let baseSalary = 0, baseBusiness = 0, baseRental = 0, basePension = 0;
    
    memberIncomes.forEach(income => {
      const details = income.details || {};
      
      switch (income.category) {
        case 'salary':
          const salaryYearly = parseFloat(details.net_income_yearly) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || 0;
          baseSalary += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          salaryGrowth = Math.max(salaryGrowth, parseFloat(details.avg_growth_rate) || 0);
          if (details.retirement_age) retirementAge = Math.min(retirementAge, parseInt(details.retirement_age));
          if (details.year_of_retirement) {
            const yr = parseInt(details.year_of_retirement);
            retirementYear = retirementYear ? Math.min(retirementYear, yr) : yr;
          }
          break;
        case 'business':
          baseBusiness += parseFloat(details.net_income_yearly) || 0;
          businessGrowth = Math.max(businessGrowth, parseFloat(details.avg_growth_rate) || 0);
          if (details.retirement_age) retirementAge = Math.min(retirementAge, parseInt(details.retirement_age));
          if (details.year_of_retirement) {
            const yr = parseInt(details.year_of_retirement);
            retirementYear = retirementYear ? Math.min(retirementYear, yr) : yr;
          }
          break;
        case 'rental':
          if (details.is_on_rent === 'Yes') {
            const annualRent = parseFloat(details.annual_rent) || 0;
            const rentPerMonth = parseFloat(details.rent_per_month) || 0;
            baseRental += annualRent > 0 ? annualRent : rentPerMonth * 12;
          }
          break;
        case 'pension':
          const pensionYearly = parseFloat(details.amount_yearly) || 0;
          if (pensionYearly > 0) {
            basePension += pensionYearly;
          } else {
            const pensionAmount = parseFloat(details.amount) || 0;
            const frequency = details.payable_type;
            const multiplier = frequency === 'Monthly' ? 12 : frequency === 'Quarterly' ? 4 : frequency === 'Half-Yearly' ? 2 : 1;
            basePension += pensionAmount * multiplier;
          }
          break;
        default:
          break;
      }
    });
    
    const memberAge = calculateAge(members.find(m => m.id === memberId)?.date_of_birth);
    if (!retirementYear) {
      retirementYear = currentYear + (retirementAge - memberAge);
    }
    
    return {
      salaryGrowth,
      businessGrowth,
      rentalGrowth: 3,
      retirementAge,
      retirementYear,
      baseSalary,
      baseBusiness,
      baseRental,
      basePension,
      baseTotal: baseSalary + baseBusiness + baseRental + basePension
    };
  };

  // Get member expenses with inflation
  const getMemberExpenses = (memberId) => {
    return expenseDetails
      .filter(exp => exp.member_ids?.includes(memberId))
      .map(expense => ({
        annualAmount: parseFloat(expense.annual_amount) || (parseFloat(expense.monthly_amount) || 0) * 12,
        inflationRate: parseFloat(expense.inflation_percent) ?? 5,
        uptoYear: parseInt(expense.upto_year) || endYear,
        considerPostRetirement: expense.consider_post_retirement || false,
        postRetirementPercent: parseFloat(expense.post_retirement_percent) ?? 100
      }));
  };

  // Get member investments
  const getMemberInvestments = (memberId) => {
    return investmentDetails
      .filter(inv => inv.member_id === memberId)
      .reduce((sum, inv) => sum + (parseFloat(inv.annual_amount) || 0), 0);
  };

  // Get goals by year (family-level or member-specific)
  const getGoalsByYear = () => {
    const goalsByYear = {};
    
    goalDetails.forEach(goal => {
      const amountToday = parseFloat(goal.goal_amount) || 0;
      const inflationRate = parseFloat(goal.inflation_percent) || 6;
      const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
      const isFamilyGoal = goal.is_family_goal;
      const memberIds = isFamilyGoal ? members.map(m => m.id) : (goal.member_ids || []);
      
      goalYears.forEach(yearStr => {
        const year = parseInt(yearStr);
        if (!year || isNaN(year)) return;
        
        const yearsFromNow = year - currentYear;
        const inflatedAmount = yearsFromNow > 0 
          ? amountToday * Math.pow(1 + inflationRate / 100, yearsFromNow)
          : amountToday;
        
        if (!goalsByYear[year]) {
          goalsByYear[year] = { total: 0, byMember: {} };
          members.forEach(m => { goalsByYear[year].byMember[m.id] = 0; });
        }
        
        // Distribute goal amount among members
        const perMemberAmount = inflatedAmount / memberIds.length;
        memberIds.forEach(mid => {
          if (goalsByYear[year].byMember[mid] !== undefined) {
            goalsByYear[year].byMember[mid] += perMemberAmount;
          }
        });
        goalsByYear[year].total += inflatedAmount;
      });
    });
    
    return goalsByYear;
  };

  const goalsByYear = getGoalsByYear();

  // Calculate projected income for member for a given year
  const getProjectedMemberIncome = (memberId, year) => {
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) return info.baseTotal;
    
    if (isPostRetirement) {
      const preRetYears = info.retirementYear - currentYear;
      const postRetYears = targetYear - info.retirementYear;
      const rental = info.baseRental * Math.pow(1 + info.rentalGrowth / 100, preRetYears + postRetYears);
      return rental + info.basePension;
    }
    
    const salary = info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow);
    const business = info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow);
    const rental = info.baseRental * Math.pow(1 + info.rentalGrowth / 100, yearsFromNow);
    
    return salary + business + rental + info.basePension;
  };

  // Calculate projected expenses for member for a given year
  const getProjectedMemberExpenses = (memberId, year) => {
    const memberExpenses = getMemberExpenses(memberId);
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) {
      return memberExpenses.reduce((sum, exp) => sum + exp.annualAmount, 0);
    }
    
    let total = 0;
    memberExpenses.forEach(expense => {
      if (targetYear > expense.uptoYear) return;
      
      let projectedAmount = expense.annualAmount * Math.pow(1 + expense.inflationRate / 100, yearsFromNow);
      
      if (isPostRetirement && expense.considerPostRetirement) {
        projectedAmount = projectedAmount * (expense.postRetirementPercent / 100);
      }
      
      total += projectedAmount;
    });
    
    return total;
  };

  // Calculate projected investments for member
  const getProjectedMemberInvestments = (memberId, year) => {
    const baseInv = getMemberInvestments(memberId);
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) return baseInv;
    if (isPostRetirement) return baseInv * 0.5;
    return baseInv * Math.pow(1.05, yearsFromNow);
  };

  // Get goal expenses for member for a year
  const getMemberGoalExpenses = (memberId, year) => {
    const yearInt = parseInt(year);
    return goalsByYear[yearInt]?.byMember[memberId] || 0;
  };

  // Generate year options
  const yearOptions = useMemo(() => {
    const years = [];
    for (let y = currentYear; y <= Math.min(endYear, currentYear + 40); y++) {
      years.push(y.toString());
    }
    return years;
  }, [currentYear, endYear]);

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

  // Calculate data for selected year
  const selectedYearInt = parseInt(selectedYear);
  const hasGoalsThisYear = goalsByYear[selectedYearInt]?.total > 0;

  const memberData = members.map(member => {
    const info = getMemberIncomeInfo(member.id);
    const income = getProjectedMemberIncome(member.id, selectedYear);
    const expenses = getProjectedMemberExpenses(member.id, selectedYear);
    const goalExpenses = getMemberGoalExpenses(member.id, selectedYear);
    const totalOutflow = expenses + goalExpenses;
    const investments = getProjectedMemberInvestments(member.id, selectedYear);
    const savings = income - totalOutflow;
    const surplus = savings - investments;
    const isRetired = selectedYearInt >= info.retirementYear;
    
    return {
      id: member.id,
      name: member.name,
      isPrimary: member.is_primary,
      salaryGrowth: info.salaryGrowth,
      businessGrowth: info.businessGrowth,
      retirementYear: info.retirementYear,
      isRetired,
      income,
      expenses,
      goalExpenses,
      totalOutflow,
      investments,
      savings,
      surplus
    };
  });

  // Calculate family totals
  const familyTotals = {
    income: memberData.reduce((sum, m) => sum + m.income, 0),
    expenses: memberData.reduce((sum, m) => sum + m.expenses, 0),
    goalExpenses: memberData.reduce((sum, m) => sum + m.goalExpenses, 0),
    totalOutflow: memberData.reduce((sum, m) => sum + m.totalOutflow, 0),
    investments: memberData.reduce((sum, m) => sum + m.investments, 0),
    savings: memberData.reduce((sum, m) => sum + m.savings, 0),
    surplus: memberData.reduce((sum, m) => sum + m.surplus, 0)
  };

  // Get earliest retirement year for any member
  const earliestRetirement = Math.min(...memberData.map(m => m.retirementYear));

  return (
    <div className="space-y-4">
      {/* Year Selector */}
      <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Select Year</label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => {
                  const yInt = parseInt(y);
                  const hasGoal = goalsByYear[yInt]?.total > 0;
                  const isRetYear = yInt === earliestRetirement;
                  return (
                    <SelectItem key={y} value={y}>
                      {y} {isRetYear && '(R)'} {hasGoal && '🎯'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {hasGoalsThisYear && (
            <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
              Goal Year: {formatAmount(goalsByYear[selectedYearInt]?.total)}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 text-right">
          {selectedYearInt - currentYear} years from now
        </div>
      </div>

      {/* Member Growth Rates Info */}
      <div className="text-xs text-gray-500 px-1 flex flex-wrap gap-x-4 gap-y-1">
        {memberData.map(m => (
          <span key={m.id} className="whitespace-nowrap">
            <span className="font-medium">{m.name}:</span>
            <span className="text-blue-600 ml-1">Sal {m.salaryGrowth}%</span>
            {m.businessGrowth > 0 && <span className="text-purple-600 ml-1">Biz {m.businessGrowth}%</span>}
            <span className="text-amber-600 ml-1">Ret {m.retirementYear}</span>
          </span>
        ))}
      </div>

      {/* Main Table - Member-wise */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="bg-blue-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-700 px-4 py-2 border-r border-gray-200 min-w-[140px]">
                Particulars
              </th>
              {members.map((member, idx) => (
                <th 
                  key={member.id} 
                  className={`text-center text-xs font-semibold text-blue-700 px-3 py-2 min-w-[100px] ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <User className="h-3 w-3" />
                    {member.name}
                    {member.is_primary && <span className="text-blue-500">*</span>}
                  </div>
                  {memberData.find(m => m.id === member.id)?.isRetired && (
                    <span className="text-[9px] text-amber-600 font-normal">Post-Ret</span>
                  )}
                </th>
              ))}
              <th className="text-center text-xs font-semibold text-blue-800 px-3 py-2 bg-blue-100 border-l border-gray-200 min-w-[100px]">
                Family Total
              </th>
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
              </td>
              {memberData.map((m, idx) => (
                <td key={m.id} className={`px-3 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className="text-sm font-medium text-green-700">{formatAmount(m.income)}</span>
                </td>
              ))}
              <td className="px-3 py-2.5 text-right bg-green-100/50 border-l border-gray-200">
                <span className="text-sm font-bold text-green-800">{formatAmount(familyTotals.income)}</span>
              </td>
            </tr>

            {/* Expenses Row */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-gray-800">Expenses</span>
                </div>
              </td>
              {memberData.map((m, idx) => (
                <td key={m.id} className={`px-3 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className="text-sm text-orange-700">{formatAmount(m.expenses)}</span>
                </td>
              ))}
              <td className="px-3 py-2.5 text-right bg-gray-50 border-l border-gray-200">
                <span className="text-sm font-semibold text-orange-800">{formatAmount(familyTotals.expenses)}</span>
              </td>
            </tr>

            {/* Goals Row - Only show if there are goals this year */}
            {hasGoalsThisYear && (
              <tr className="bg-purple-50/30 hover:bg-purple-50/50">
                <td className="px-4 py-2.5 border-r border-gray-100">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-gray-800">Goals</span>
                  </div>
                </td>
                {memberData.map((m, idx) => (
                  <td key={m.id} className={`px-3 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                    <span className={`text-sm ${m.goalExpenses > 0 ? 'text-purple-700' : 'text-gray-300'}`}>
                      {m.goalExpenses > 0 ? formatAmount(m.goalExpenses) : '-'}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right bg-purple-50 border-l border-gray-200">
                  <span className="text-sm font-semibold text-purple-800">{formatAmount(familyTotals.goalExpenses)}</span>
                </td>
              </tr>
            )}

            {/* Total Outflow Row */}
            <tr className="bg-orange-50/50 hover:bg-orange-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-orange-700" />
                  <span className="text-sm font-semibold text-gray-800">Total Outflow</span>
                </div>
              </td>
              {memberData.map((m, idx) => (
                <td key={m.id} className={`px-3 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className="text-sm font-semibold text-orange-800">{formatAmount(m.totalOutflow)}</span>
                </td>
              ))}
              <td className="px-3 py-2.5 text-right bg-orange-100/50 border-l border-gray-200">
                <span className="text-sm font-bold text-orange-900">{formatAmount(familyTotals.totalOutflow)}</span>
              </td>
            </tr>

            {/* Savings Row */}
            <tr className="bg-blue-50/50 hover:bg-blue-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-800">Savings</span>
                </div>
              </td>
              {memberData.map((m, idx) => (
                <td key={m.id} className={`px-3 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className={`text-sm font-semibold ${m.savings >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                    {formatAmount(m.savings)}
                  </span>
                </td>
              ))}
              <td className={`px-3 py-2.5 text-right border-l border-gray-200 ${familyTotals.savings >= 0 ? 'bg-blue-100/50' : 'bg-red-100/50'}`}>
                <span className={`text-sm font-bold ${familyTotals.savings >= 0 ? 'text-blue-800' : 'text-red-700'}`}>
                  {formatAmount(familyTotals.savings)}
                </span>
              </td>
            </tr>

            {/* Investments Row */}
            <tr className="hover:bg-gray-50">
              <td className="px-4 py-2.5 border-r border-gray-100">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-medium text-gray-800">Investments</span>
                </div>
              </td>
              {memberData.map((m, idx) => (
                <td key={m.id} className={`px-3 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                  <span className="text-sm text-indigo-700">{formatAmount(m.investments)}</span>
                </td>
              ))}
              <td className="px-3 py-2.5 text-right bg-gray-50 border-l border-gray-200">
                <span className="text-sm font-semibold text-indigo-800">{formatAmount(familyTotals.investments)}</span>
              </td>
            </tr>

            {/* Surplus Row */}
            <tr className="bg-emerald-100">
              <td className="px-4 py-3 border-r border-emerald-200">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-700" />
                  <span className="text-sm font-bold text-emerald-800">Surplus</span>
                </div>
              </td>
              {memberData.map((m, idx) => (
                <td key={m.id} className={`px-3 py-3 text-right ${idx < members.length - 1 ? 'border-r border-emerald-200' : ''} ${m.surplus >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className={`text-sm font-bold ${m.surplus >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatAmount(m.surplus)}
                  </span>
                </td>
              ))}
              <td className={`px-3 py-3 text-right border-l border-emerald-200 ${familyTotals.surplus >= 0 ? 'bg-emerald-200/50' : 'bg-red-200/50'}`}>
                <span className={`text-sm font-bold ${familyTotals.surplus >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                  {formatAmount(familyTotals.surplus)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Quick Year Comparison - Family Total Only */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 border-b">
          <h4 className="text-xs font-medium text-slate-700">Family Total - Year Overview</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="text-left py-2 px-3 font-medium text-slate-600 min-w-[60px]">Year</th>
                <th className="text-right py-2 px-3 font-medium text-green-600 min-w-[70px]">Income</th>
                <th className="text-right py-2 px-3 font-medium text-orange-600 min-w-[70px]">Outflow</th>
                <th className="text-right py-2 px-3 font-medium text-blue-600 min-w-[70px]">Savings</th>
                <th className="text-right py-2 px-3 font-medium text-indigo-600 min-w-[70px]">Invest</th>
                <th className="text-right py-2 px-3 font-medium text-slate-700 min-w-[70px]">Surplus</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5, 10, 15, 20].filter(offset => currentYear + offset <= endYear).map(offset => {
                const year = currentYear + offset;
                const yearStr = year.toString();
                const isSelected = yearStr === selectedYear;
                const hasGoal = goalsByYear[year]?.total > 0;
                
                // Calculate family totals for this year
                let totalIncome = 0, totalExpenses = 0, totalGoals = 0, totalInvestments = 0;
                members.forEach(member => {
                  totalIncome += getProjectedMemberIncome(member.id, yearStr);
                  totalExpenses += getProjectedMemberExpenses(member.id, yearStr);
                  totalGoals += getMemberGoalExpenses(member.id, yearStr);
                  totalInvestments += getProjectedMemberInvestments(member.id, yearStr);
                });
                const totalOutflow = totalExpenses + totalGoals;
                const savings = totalIncome - totalOutflow;
                const surplus = savings - totalInvestments;
                
                return (
                  <tr 
                    key={year} 
                    className={`border-b cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    onClick={() => setSelectedYear(yearStr)}
                  >
                    <td className={`py-2 px-3 font-medium ${isSelected ? 'text-blue-700' : ''}`}>
                      {year}
                      {hasGoal && <span className="ml-1">🎯</span>}
                    </td>
                    <td className="text-right py-2 px-3 text-green-600">{formatAmount(totalIncome)}</td>
                    <td className="text-right py-2 px-3 text-orange-600">{formatAmount(totalOutflow)}</td>
                    <td className={`text-right py-2 px-3 ${savings >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatAmount(savings)}
                    </td>
                    <td className="text-right py-2 px-3 text-indigo-600">{formatAmount(totalInvestments)}</td>
                    <td className={`text-right py-2 px-3 font-semibold ${surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatAmount(surplus)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="text-[10px] text-gray-400 px-1 space-y-0.5">
        <p>• Each member's salary/business growth rate is applied individually from their Income data</p>
        <p>• Goals are inflated to target year and distributed among assigned members</p>
        <p>• Click any year in the overview to see member-wise breakdown</p>
      </div>
    </div>
  );
}
