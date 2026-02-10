import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark, Target, Info, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function SurplusSection({ family, isReadOnly }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const expenseDetails = family?.expense_details || [];
  const investmentDetails = family?.investment_details || [];
  const goalDetails = family?.goal_details || [];

  const currentYear = new Date().getFullYear();
  
  // Generate default years to show (base year fixed + 5 more)
  const defaultYears = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4, currentYear + 5];
  const [displayYears, setDisplayYears] = useState(defaultYears.map(String));

  // Get primary member
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

  // Get member-specific income info and growth rates
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
    
    return { salaryGrowth, businessGrowth, rentalGrowth: 3, retirementYear, baseSalary, baseBusiness, baseRental, basePension };
  };

  // Get member expenses with inflation (including family expenses distributed)
  const getMemberBaseExpenses = (memberId) => {
    const memberExpenses = [];
    
    expenseDetails.forEach(exp => {
      const expMemberIds = exp.member_ids || [];
      const isFamilyExpense = expMemberIds.includes('family') || expMemberIds.length === 0;
      const isAssignedToMember = expMemberIds.includes(memberId);
      
      if (isAssignedToMember || isFamilyExpense) {
        const baseAmount = parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) || 0) * 12;
        // If family expense, divide among all members
        const amount = isFamilyExpense ? baseAmount / members.length : baseAmount;
        
        memberExpenses.push({
          annualAmount: amount,
          inflationRate: parseFloat(exp.inflation_percent) ?? 5,
          uptoYear: parseInt(exp.upto_year) || endYear,
          considerPostRetirement: exp.consider_post_retirement || false,
          postRetirementPercent: parseFloat(exp.post_retirement_percent) ?? 100
        });
      }
    });
    
    return memberExpenses;
  };

  // Get member investments
  const getMemberBaseInvestments = (memberId) => {
    return investmentDetails
      .filter(inv => inv.member_id === memberId)
      .reduce((sum, inv) => sum + (parseFloat(inv.annual_amount) || 0), 0);
  };

  // Get member investment breakdown by category
  const getMemberInvestmentBreakdown = (memberId) => {
    const breakdown = {};
    investmentDetails
      .filter(inv => inv.member_id === memberId)
      .forEach(inv => {
        const cat = inv.category || 'other';
        if (!breakdown[cat]) breakdown[cat] = 0;
        breakdown[cat] += parseFloat(inv.annual_amount) || 0;
      });
    return breakdown;
  };

  // Get member income breakdown (salary, business, rental, pension)
  const getMemberIncomeBreakdown = (memberId, year) => {
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) {
      return { salary: info.baseSalary, business: info.baseBusiness, rental: info.baseRental, pension: info.basePension };
    }
    
    if (isPostRetirement) {
      const preRetYears = info.retirementYear - currentYear;
      const postRetYears = targetYear - info.retirementYear;
      return {
        salary: 0,
        business: 0,
        rental: info.baseRental * Math.pow(1 + info.rentalGrowth / 100, preRetYears + postRetYears),
        pension: info.basePension
      };
    }
    
    return {
      salary: info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow),
      business: info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow),
      rental: info.baseRental * Math.pow(1 + info.rentalGrowth / 100, yearsFromNow),
      pension: info.basePension
    };
  };

  // Get member expense breakdown by category
  const getMemberExpenseBreakdown = (memberId, year) => {
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    const breakdown = {};
    
    expenseDetails.forEach(exp => {
      const expMemberIds = exp.member_ids || [];
      const isFamilyExpense = expMemberIds.includes('family') || expMemberIds.length === 0;
      const isAssignedToMember = expMemberIds.includes(memberId);
      
      if (isAssignedToMember || isFamilyExpense) {
        const category = exp.expense_type || 'other';
        const baseAmount = parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) || 0) * 12;
        const amount = isFamilyExpense ? baseAmount / members.length : baseAmount;
        const inflationRate = parseFloat(exp.inflation_percent) ?? 5;
        const uptoYear = parseInt(exp.upto_year) || endYear;
        
        if (targetYear > uptoYear) return;
        
        let projectedAmount = yearsFromNow <= 0 ? amount : amount * Math.pow(1 + inflationRate / 100, yearsFromNow);
        
        if (isPostRetirement && exp.consider_post_retirement) {
          projectedAmount = projectedAmount * ((parseFloat(exp.post_retirement_percent) ?? 100) / 100);
        }
        
        if (!breakdown[category]) breakdown[category] = 0;
        breakdown[category] += projectedAmount;
      }
    });
    
    return breakdown;
  };

  // Get goals by year
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

  // Calculate projected member income for a year
  const getProjectedMemberIncome = (memberId, year) => {
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) {
      return info.baseSalary + info.baseBusiness + info.baseRental + info.basePension;
    }
    
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

  // Calculate projected member expenses for a year
  const getProjectedMemberExpenses = (memberId, year) => {
    const memberExpenses = getMemberBaseExpenses(memberId);
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

  // Calculate projected member investments
  const getProjectedMemberInvestments = (memberId, year) => {
    const baseInv = getMemberBaseInvestments(memberId);
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) return baseInv;
    if (isPostRetirement) return baseInv * 0.5;
    return baseInv * Math.pow(1.05, yearsFromNow);
  };

  // Get member goal expenses for a year
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

  // Handle year selection change (exclude index 0 which is base year)
  const handleYearChange = (index, newYear) => {
    if (index === 0) return; // Don't allow changing base year
    const newYears = [...displayYears];
    newYears[index] = newYear;
    // Sort years but keep base year first
    const baseYear = newYears[0];
    const otherYears = newYears.slice(1).sort((a, b) => parseInt(a) - parseInt(b));
    setDisplayYears([baseYear, ...otherYears]);
  };

  // Get available years for dropdown (exclude already selected years)
  const getAvailableYears = (currentIndex) => {
    const selectedYears = displayYears.filter((_, idx) => idx !== currentIndex);
    return yearOptions.filter(y => !selectedYears.includes(y));
  };

  // Export to Excel function
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Get additional family data
    const liabilities = family?.liabilities || [];
    const insurancePremiums = family?.insurance_premiums || [];
    
    // Generate all years from current to life expectancy
    const allYears = [];
    for (let y = currentYear; y <= endYear; y++) {
      allYears.push(y);
    }

    // Sheet 1: Summary
    const summaryData = [
      ["Family Cash Flow Projection"],
      ["Family Name:", family?.family_name || "Family"],
      ["Generated On:", new Date().toLocaleDateString()],
      ["Base Year:", currentYear],
      ["Life Expectancy:", lifeExpectancy],
      ["Earliest Retirement Year:", earliestRetirement],
      [],
      ["Members:"],
      ...members.map(m => {
        const info = getMemberIncomeInfo(m.id);
        return [`  ${m.name}${m.is_primary ? ' (Primary)' : ''}`, `Retirement: ${info.retirementYear}`, `Salary Growth: ${info.salaryGrowth}%`, `Business Growth: ${info.businessGrowth}%`];
      }),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Sheet 2: Year-wise Cash Flow
    const cashFlowHeaders = [
      "Year", 
      "Age",
      ...members.flatMap(m => [`${m.name.split(' ')[0]} Income`, `${m.name.split(' ')[0]} Expenses`, `${m.name.split(' ')[0]} Goals`, `${m.name.split(' ')[0]} Investments`, `${m.name.split(' ')[0]} Surplus`]),
      "Total Income",
      "Total Expenses", 
      "Total Goals",
      "Total Investments",
      "Total Savings",
      "Total Surplus"
    ];

    const cashFlowData = allYears.map(year => {
      const yearStr = year.toString();
      const age = primaryAge + (year - currentYear);
      
      const memberValues = members.flatMap(m => {
        const inc = getProjectedMemberIncome(m.id, yearStr);
        const exp = getProjectedMemberExpenses(m.id, yearStr);
        const goal = getMemberGoalExpenses(m.id, yearStr);
        const inv = getProjectedMemberInvestments(m.id, yearStr);
        const surplus = inc - exp - goal - inv;
        return [Math.round(inc), Math.round(exp), Math.round(goal), Math.round(inv), Math.round(surplus)];
      });

      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const totalInvestments = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, yearStr), 0);
      const totalSavings = totalIncome - totalExpenses - totalGoals;
      const totalSurplus = totalSavings - totalInvestments;

      return [
        year,
        age,
        ...memberValues,
        Math.round(totalIncome),
        Math.round(totalExpenses),
        Math.round(totalGoals),
        Math.round(totalInvestments),
        Math.round(totalSavings),
        Math.round(totalSurplus)
      ];
    });

    const cashFlowSheet = XLSX.utils.aoa_to_sheet([cashFlowHeaders, ...cashFlowData]);
    
    // Set column widths
    cashFlowSheet['!cols'] = [
      { wch: 8 }, { wch: 6 },
      ...members.flatMap(() => [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]),
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
    ];
    
    XLSX.utils.book_append_sheet(wb, cashFlowSheet, "Cash Flow");

    // Sheet 3: Income Breakdown
    const incomeHeaders = [
      "Year",
      ...members.flatMap(m => [`${m.name.split(' ')[0]} Salary`, `${m.name.split(' ')[0]} Business`, `${m.name.split(' ')[0]} Rental`, `${m.name.split(' ')[0]} Pension`]),
      "Total Salary", "Total Business", "Total Rental", "Total Pension", "Grand Total"
    ];

    const incomeData = allYears.map(year => {
      const yearStr = year.toString();
      const memberBreakdowns = members.map(m => getMemberIncomeBreakdown(m.id, yearStr));
      
      const totalSalary = memberBreakdowns.reduce((sum, b) => sum + b.salary, 0);
      const totalBusiness = memberBreakdowns.reduce((sum, b) => sum + b.business, 0);
      const totalRental = memberBreakdowns.reduce((sum, b) => sum + b.rental, 0);
      const totalPension = memberBreakdowns.reduce((sum, b) => sum + b.pension, 0);

      return [
        year,
        ...memberBreakdowns.flatMap(b => [Math.round(b.salary), Math.round(b.business), Math.round(b.rental), Math.round(b.pension)]),
        Math.round(totalSalary), Math.round(totalBusiness), Math.round(totalRental), Math.round(totalPension),
        Math.round(totalSalary + totalBusiness + totalRental + totalPension)
      ];
    });

    const incomeSheet = XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeData]);
    XLSX.utils.book_append_sheet(wb, incomeSheet, "Income Breakdown");

    // Sheet 4: Expense Breakdown
    const expenseCategories = [...new Set(expenseDetails.map(e => e.expense_type || 'other'))];
    const expenseHeaders = ["Year", ...expenseCategories.map(c => c.replace(/_/g, ' ').toUpperCase()), "Total Expenses"];

    const expenseData = allYears.map(year => {
      const yearStr = year.toString();
      const categoryTotals = {};
      expenseCategories.forEach(cat => { categoryTotals[cat] = 0; });
      
      members.forEach(m => {
        const breakdown = getMemberExpenseBreakdown(m.id, yearStr);
        Object.entries(breakdown).forEach(([cat, amt]) => {
          if (categoryTotals[cat] !== undefined) {
            categoryTotals[cat] += amt;
          }
        });
      });

      const total = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);
      return [year, ...expenseCategories.map(cat => Math.round(categoryTotals[cat] || 0)), Math.round(total)];
    });

    const expenseSheet = XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseData]);
    XLSX.utils.book_append_sheet(wb, expenseSheet, "Expense Breakdown");

    // Sheet 5: Goals
    if (goalDetails.length > 0) {
      const goalsHeaders = ["Year", ...goalDetails.map(g => g.category || 'Goal'), "Total Goals"];
      
      const goalsData = allYears.map(year => {
        const yearStr = year.toString();
        const yearInt = parseInt(yearStr);
        
        const goalAmounts = goalDetails.map(goal => {
          const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
          if (!goalYears.includes(yearStr)) return 0;
          
          const amountToday = parseFloat(goal.goal_amount) || 0;
          const inflationRate = parseFloat(goal.inflation_percent) || 6;
          const yearsFromNow = yearInt - currentYear;
          return yearsFromNow > 0 ? amountToday * Math.pow(1 + inflationRate / 100, yearsFromNow) : amountToday;
        });

        const total = goalAmounts.reduce((sum, v) => sum + v, 0);
        return [year, ...goalAmounts.map(a => Math.round(a)), Math.round(total)];
      });

      const goalsSheet = XLSX.utils.aoa_to_sheet([goalsHeaders, ...goalsData]);
      XLSX.utils.book_append_sheet(wb, goalsSheet, "Goals");
    }

    // Sheet 6: Investments
    if (investmentDetails.length > 0) {
      const investmentCategories = [...new Set(investmentDetails.map(i => i.category || 'other'))];
      const investmentHeaders = ["Year", ...investmentCategories.map(c => c.replace(/_/g, ' ').toUpperCase()), "Total Investments"];

      const investmentData = allYears.map(year => {
        const yearStr = year.toString();
        const yearInt = parseInt(yearStr);
        const yearsFromNow = yearInt - currentYear;
        const isPostRetirement = yearInt >= earliestRetirement;
        
        const categoryTotals = {};
        investmentCategories.forEach(cat => { categoryTotals[cat] = 0; });
        
        investmentDetails.forEach(inv => {
          const cat = inv.category || 'other';
          const baseAmount = parseFloat(inv.annual_amount) || 0;
          let projectedAmount = baseAmount;
          
          if (yearsFromNow > 0) {
            projectedAmount = isPostRetirement ? baseAmount * 0.5 : baseAmount * Math.pow(1.05, yearsFromNow);
          }
          
          if (categoryTotals[cat] !== undefined) {
            categoryTotals[cat] += projectedAmount;
          }
        });

        const total = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);
        return [year, ...investmentCategories.map(cat => Math.round(categoryTotals[cat] || 0)), Math.round(total)];
      });

      const investmentSheet = XLSX.utils.aoa_to_sheet([investmentHeaders, ...investmentData]);
      XLSX.utils.book_append_sheet(wb, investmentSheet, "Investments");
    }

    // Sheet 7: Assets
    const assetCategories = [
      { key: 'salary', label: 'Salary Income' },
      { key: 'business', label: 'Business' },
      { key: 'rental', label: 'Real Estate' },
      { key: 'mutual_fund', label: 'Mutual Funds' },
      { key: 'shares_pms', label: 'Stocks/PMS' },
      { key: 'fd', label: 'Fixed Deposits' },
      { key: 'bonds', label: 'Bonds' },
      { key: 'ppf', label: 'PPF' },
      { key: 'epf', label: 'EPF' },
      { key: 'nps', label: 'NPS' },
      { key: 'commodities', label: 'Gold/Commodities' },
      { key: 'insurance_income', label: 'Insurance' },
      { key: 'cash', label: 'Cash' }
    ];

    const assetsHeaderRow1 = ["Category", ...members.flatMap(m => [m.name, ""]), "Total", ""];
    const assetsHeaderRow2 = ["", ...members.flatMap(() => ["Inv Value", "Mkt Value"]), "Inv Value", "Mkt Value"];
    
    const assetsData = assetCategories.map(cat => {
      const memberValues = members.flatMap(m => {
        const memberIncomes = incomeDetails.filter(inc => inc.category === cat.key && inc.member_ids?.includes(m.id));
        let invValue = 0, mktValue = 0;
        
        memberIncomes.forEach(inc => {
          const details = inc.details || {};
          invValue += parseFloat(details.investment_value) || parseFloat(details.total_investment) || 0;
          mktValue += parseFloat(details.market_value) || parseFloat(details.maturity_value) || parseFloat(details.current_value) || invValue;
        });
        
        return [invValue, mktValue];
      });

      const totalInv = memberValues.filter((_, i) => i % 2 === 0).reduce((sum, v) => sum + v, 0);
      const totalMkt = memberValues.filter((_, i) => i % 2 === 1).reduce((sum, v) => sum + v, 0);

      return [cat.label, ...memberValues, totalInv, totalMkt];
    });

    // Add totals row
    const assetsTotals = ["TOTAL"];
    for (let i = 0; i < members.length; i++) {
      const invTotal = assetsData.reduce((sum, row) => sum + (row[1 + i * 2] || 0), 0);
      const mktTotal = assetsData.reduce((sum, row) => sum + (row[2 + i * 2] || 0), 0);
      assetsTotals.push(invTotal, mktTotal);
    }
    const grandInvTotal = assetsData.reduce((sum, row) => sum + (row[row.length - 2] || 0), 0);
    const grandMktTotal = assetsData.reduce((sum, row) => sum + (row[row.length - 1] || 0), 0);
    assetsTotals.push(grandInvTotal, grandMktTotal);

    const assetsSheet = XLSX.utils.aoa_to_sheet([assetsHeaderRow1, assetsHeaderRow2, ...assetsData, assetsTotals]);
    XLSX.utils.book_append_sheet(wb, assetsSheet, "Assets");

    // Sheet 8: Liabilities
    if (liabilities.length > 0) {
      const liabilitiesHeaders = ["Type", "Member", "Principal", "EMI", "Interest Rate", "Remaining Tenure", "Outstanding"];
      const liabilitiesData = liabilities.map(l => {
        const memberName = members.find(m => m.id === l.member_id)?.name || 'Family';
        return [
          l.loan_type || l.type || 'Loan',
          memberName,
          l.principal_amount || l.loan_amount || 0,
          l.emi_amount || l.emi || 0,
          l.interest_rate || 0,
          l.remaining_tenure || l.tenure || 0,
          l.outstanding_amount || l.principal_amount || 0
        ];
      });

      const totalOutstanding = liabilities.reduce((sum, l) => sum + (parseFloat(l.outstanding_amount) || parseFloat(l.principal_amount) || 0), 0);
      liabilitiesData.push(["TOTAL", "", "", "", "", "", totalOutstanding]);

      const liabilitiesSheet = XLSX.utils.aoa_to_sheet([liabilitiesHeaders, ...liabilitiesData]);
      XLSX.utils.book_append_sheet(wb, liabilitiesSheet, "Liabilities");
    }

    // Sheet 9: Insurance
    const insuranceFromIncome = incomeDetails.filter(inc => inc.category === 'insurance_income');
    if (insuranceFromIncome.length > 0 || insurancePremiums.length > 0) {
      const insuranceHeaders = ["Policy Type", "Member", "Sum Assured", "Premium", "Premium Frequency", "Maturity Year", "Maturity Value"];
      const insuranceData = insuranceFromIncome.map(ins => {
        const details = ins.details || {};
        const memberNames = (ins.member_ids || []).map(mid => members.find(m => m.id === mid)?.name || '').join(', ');
        return [
          details.policy_type || 'Life Insurance',
          memberNames || 'Family',
          details.sum_assured || 0,
          details.premium_amount || 0,
          details.premium_frequency || 'Yearly',
          details.maturity_year || '',
          details.maturity_value || 0
        ];
      });

      // Add insurance premiums if available
      insurancePremiums.forEach(prem => {
        const memberName = members.find(m => m.id === prem.member_id)?.name || 'Family';
        insuranceData.push([
          prem.policy_type || prem.type || 'Insurance',
          memberName,
          prem.sum_assured || 0,
          prem.premium || prem.amount || 0,
          prem.frequency || 'Yearly',
          prem.maturity_year || '',
          prem.maturity_value || 0
        ]);
      });

      const totalSumAssured = insuranceData.reduce((sum, row) => sum + (parseFloat(row[2]) || 0), 0);
      const totalPremium = insuranceData.reduce((sum, row) => sum + (parseFloat(row[3]) || 0), 0);
      insuranceData.push(["TOTAL", "", totalSumAssured, totalPremium, "", "", ""]);

      const insuranceSheet = XLSX.utils.aoa_to_sheet([insuranceHeaders, ...insuranceData]);
      XLSX.utils.book_append_sheet(wb, insuranceSheet, "Insurance");
    }

    // Sheet 10: Net Worth Projection
    const networthHeaders = ["Year", "Age", "Total Assets", "Total Liabilities", "Net Worth", "Cumulative Surplus"];
    
    let cumulativeSurplus = 0;
    const networthData = allYears.map(year => {
      const yearStr = year.toString();
      const age = primaryAge + (year - currentYear);
      const yearsFromNow = year - currentYear;
      
      // Calculate projected assets (simplified - using income as proxy + accumulated surplus)
      let totalAssets = 0;
      incomeDetails.forEach(inc => {
        const details = inc.details || {};
        const baseValue = parseFloat(details.market_value) || parseFloat(details.maturity_value) || parseFloat(details.investment_value) || 0;
        const growthRate = inc.category === 'mutual_fund' || inc.category === 'shares_pms' ? 12 : 
                         inc.category === 'rental' ? 5 : 
                         inc.category === 'fd' || inc.category === 'bonds' ? 7 : 8;
        totalAssets += baseValue * Math.pow(1 + growthRate / 100, yearsFromNow);
      });

      // Calculate remaining liabilities
      let totalLiabilities = 0;
      liabilities.forEach(l => {
        const remainingTenure = (parseInt(l.remaining_tenure) || 0) - yearsFromNow;
        if (remainingTenure > 0) {
          const emi = parseFloat(l.emi_amount) || parseFloat(l.emi) || 0;
          totalLiabilities += emi * 12 * remainingTenure;
        }
      });

      // Calculate year's surplus and add to cumulative
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const totalInvestments = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, yearStr), 0);
      const yearSurplus = totalIncome - totalExpenses - totalGoals - totalInvestments;
      cumulativeSurplus += yearSurplus;

      const netWorth = totalAssets + cumulativeSurplus - totalLiabilities;

      return [
        year,
        age,
        Math.round(totalAssets),
        Math.round(totalLiabilities),
        Math.round(netWorth),
        Math.round(cumulativeSurplus)
      ];
    });

    const networthSheet = XLSX.utils.aoa_to_sheet([networthHeaders, ...networthData]);
    networthSheet['!cols'] = [{ wch: 8 }, { wch: 6 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, networthSheet, "Net Worth");

    // Generate and save file
    const fileName = `cashflow_${(family?.family_name || 'family').toLowerCase().replace(/\s+/g, '_')}_${currentYear}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, fileName);
  };

  // Format currency
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null || isNaN(amount)) return "-";
    const absValue = Math.abs(amount);
    if (absValue === 0) return "-";
    if (absValue >= 10000000) return `${amount < 0 ? '-' : ''}${(absValue / 10000000).toFixed(1)}Cr`;
    if (absValue >= 100000) return `${amount < 0 ? '-' : ''}${(absValue / 100000).toFixed(1)}L`;
    return `${amount < 0 ? '-' : ''}${Math.round(absValue / 1000)}K`;
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

  // Check if any display year has goals
  const anyYearHasGoals = displayYears.some(y => goalsByYear[parseInt(y)]?.total > 0);

  // Get earliest retirement year
  const earliestRetirement = Math.min(...members.map(m => getMemberIncomeInfo(m.id).retirementYear));

  return (
    <div className="space-y-4">
      {/* Header with Info and Download */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Year-wise cash flow with member breakdown. Growth rates from Income section, inflation from Expenses.
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={exportToExcel}
          className="gap-2 text-xs"
        >
          <Download className="h-3 w-3" />
          Download Excel
        </Button>
      </div>

      {/* Main Projection Table */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead>
            {/* Year Selection Row */}
            <tr className="bg-blue-50 border-b border-gray-200">
              <th rowSpan={2} className="text-left text-xs font-semibold text-gray-700 px-3 py-2 border-r border-gray-200 min-w-[100px] align-bottom">
                Particulars
              </th>
              {displayYears.map((year, idx) => {
                const yearInt = parseInt(year);
                const hasGoals = goalsByYear[yearInt]?.total > 0;
                const isBaseYear = idx === 0;
                return (
                  <th 
                    key={idx} 
                    colSpan={members.length + 1}
                    className={`text-center px-1 py-1 ${idx < displayYears.length - 1 ? 'border-r border-gray-200' : ''}`}
                  >
                    {isBaseYear ? (
                      <div className="h-6 flex items-center justify-center text-[11px] font-semibold text-blue-700">
                        {year} (Base)
                      </div>
                    ) : (
                      <Select value={year} onValueChange={(v) => handleYearChange(idx, v)}>
                        <SelectTrigger className="h-6 text-[11px] w-full border-0 bg-transparent shadow-none justify-center font-semibold text-blue-700">
                          {year} {yearInt === earliestRetirement && '(R)'} {hasGoals && '🎯'}
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableYears(idx).map(y => {
                            const yInt = parseInt(y);
                            const yHasGoal = goalsByYear[yInt]?.total > 0;
                            return (
                              <SelectItem key={y} value={y}>
                                {y} {yInt === earliestRetirement && '(R)'} {yHasGoal && '🎯'}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    {hasGoals && isBaseYear && <span className="text-[8px] text-purple-600">Goal</span>}
                  </th>
                );
              })}
            </tr>
            {/* Member Sub-headers Row */}
            <tr className="bg-gray-50 border-b border-gray-200">
              {displayYears.map((year, yearIdx) => (
                <React.Fragment key={`sub-${year}`}>
                  {members.map((member, mIdx) => (
                    <th 
                      key={`${year}-${member.id}`}
                      className="text-center text-[9px] font-medium text-gray-500 px-1 py-1 min-w-[55px]"
                    >
                      {member.name.split(' ')[0]}
                      {member.is_primary && '*'}
                    </th>
                  ))}
                  <th className={`text-center text-[9px] font-semibold text-blue-600 px-1 py-1 min-w-[55px] bg-blue-50/50 ${yearIdx < displayYears.length - 1 ? 'border-r border-gray-200' : ''}`}>
                    Total
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Income Row */}
            <tr className="bg-green-50/30 hover:bg-green-50/50">
              <td className="px-3 py-2 border-r border-gray-100">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-xs font-medium text-gray-800">Income</span>
                  <Info className="h-3 w-3 text-gray-400" />
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                const total = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, year), 0);
                return (
                  <React.Fragment key={`income-${year}`}>
                    {members.map((member) => {
                      const breakdown = getMemberIncomeBreakdown(member.id, year);
                      const value = getProjectedMemberIncome(member.id, year);
                      return (
                        <td key={`income-${year}-${member.id}`} className="px-1 py-2 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-green-700 cursor-help">{formatAmount(value)}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <div className="space-y-1">
                                  <div className="font-semibold border-b pb-1">{member.name} - {year}</div>
                                  {breakdown.salary > 0 && <div>Salary: {formatAmount(breakdown.salary)}</div>}
                                  {breakdown.business > 0 && <div>Business: {formatAmount(breakdown.business)}</div>}
                                  {breakdown.rental > 0 && <div>Rental: {formatAmount(breakdown.rental)}</div>}
                                  {breakdown.pension > 0 && <div>Pension: {formatAmount(breakdown.pension)}</div>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      );
                    })}
                    <td className={`px-1 py-2 text-center bg-green-50/50 ${yearIdx < displayYears.length - 1 ? 'border-r border-gray-100' : ''}`}>
                      <span className="text-[10px] font-semibold text-green-800">{formatAmount(total)}</span>
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* Expenses Row */}
            <tr className="hover:bg-gray-50">
              <td className="px-3 py-2 border-r border-gray-100">
                <div className="flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-orange-600" />
                  <span className="text-xs font-medium text-gray-800">Expenses</span>
                  <Info className="h-3 w-3 text-gray-400" />
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                const total = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, year), 0);
                return (
                  <React.Fragment key={`exp-${year}`}>
                    {members.map((member) => {
                      const breakdown = getMemberExpenseBreakdown(member.id, year);
                      const value = getProjectedMemberExpenses(member.id, year);
                      return (
                        <td key={`exp-${year}-${member.id}`} className="px-1 py-2 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-orange-700 cursor-help">{formatAmount(value)}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[200px]">
                                <div className="space-y-1">
                                  <div className="font-semibold border-b pb-1">{member.name} - {year}</div>
                                  {Object.entries(breakdown).map(([cat, amt]) => (
                                    <div key={cat} className="flex justify-between gap-2">
                                      <span className="capitalize">{cat.replace(/_/g, ' ')}:</span>
                                      <span>{formatAmount(amt)}</span>
                                    </div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      );
                    })}
                    <td className={`px-1 py-2 text-center bg-gray-50 ${yearIdx < displayYears.length - 1 ? 'border-r border-gray-100' : ''}`}>
                      <span className="text-[10px] font-semibold text-orange-800">{formatAmount(total)}</span>
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* Goals Row */}
            {anyYearHasGoals && (
              <tr className="bg-purple-50/30 hover:bg-purple-50/50">
                <td className="px-3 py-2 border-r border-gray-100">
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-purple-600" />
                    <span className="text-xs font-medium text-gray-800">Goals</span>
                    <Info className="h-3 w-3 text-gray-400" />
                  </div>
                </td>
                {displayYears.map((year, yearIdx) => {
                  const yearInt = parseInt(year);
                  const total = goalsByYear[yearInt]?.total || 0;
                  const yearGoals = goalDetails.filter(g => {
                    const goalYears = g.goal_years || (g.goal_year ? [g.goal_year.toString()] : []);
                    return goalYears.includes(year);
                  });
                  return (
                    <React.Fragment key={`goal-${year}`}>
                      {members.map((member) => {
                        const val = getMemberGoalExpenses(member.id, year);
                        return (
                          <td key={`goal-${year}-${member.id}`} className="px-1 py-2 text-center">
                            {val > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-[10px] text-purple-700 cursor-help">{formatAmount(val)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                                    <div className="space-y-1">
                                      <div className="font-semibold border-b pb-1">{member.name} Goals - {year}</div>
                                      {yearGoals.map((g, i) => (
                                        <div key={i}>{g.category}: {formatAmount(parseFloat(g.goal_amount) || 0)} (Today)</div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-[10px] text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className={`px-1 py-2 text-center bg-purple-50/50 ${yearIdx < displayYears.length - 1 ? 'border-r border-gray-100' : ''}`}>
                        <span className={`text-[10px] font-semibold ${total > 0 ? 'text-purple-800' : 'text-gray-300'}`}>
                          {total > 0 ? formatAmount(total) : '-'}
                        </span>
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            )}

            {/* Savings Row */}
            <tr className="bg-blue-50/30 hover:bg-blue-50/50">
              <td className="px-3 py-2 border-r border-gray-100">
                <div className="flex items-center gap-1">
                  <PiggyBank className="h-3 w-3 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-800">Savings</span>
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                return (
                  <React.Fragment key={`sav-${year}`}>
                    {members.map((member) => {
                      const inc = getProjectedMemberIncome(member.id, year);
                      const exp = getProjectedMemberExpenses(member.id, year);
                      const goal = getMemberGoalExpenses(member.id, year);
                      const sav = inc - exp - goal;
                      return (
                        <td key={`sav-${year}-${member.id}`} className="px-1 py-2 text-center">
                          <span className={`text-[10px] font-medium ${sav >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                            {formatAmount(sav)}
                          </span>
                        </td>
                      );
                    })}
                    <td className={`px-1 py-2 text-center bg-blue-50/50 ${yearIdx < displayYears.length - 1 ? 'border-r border-gray-100' : ''}`}>
                      {(() => {
                        const total = members.reduce((sum, m) => {
                          const inc = getProjectedMemberIncome(m.id, year);
                          const exp = getProjectedMemberExpenses(m.id, year);
                          const goal = getMemberGoalExpenses(m.id, year);
                          return sum + inc - exp - goal;
                        }, 0);
                        return <span className={`text-[10px] font-bold ${total >= 0 ? 'text-blue-800' : 'text-red-700'}`}>{formatAmount(total)}</span>;
                      })()}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* Investments Row */}
            <tr className="hover:bg-gray-50">
              <td className="px-3 py-2 border-r border-gray-100">
                <div className="flex items-center gap-1">
                  <Landmark className="h-3 w-3 text-indigo-600" />
                  <span className="text-xs font-medium text-gray-800">Investments</span>
                  <Info className="h-3 w-3 text-gray-400" />
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                const total = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, year), 0);
                return (
                  <React.Fragment key={`inv-${year}`}>
                    {members.map((member) => {
                      const breakdown = getMemberInvestmentBreakdown(member.id);
                      const value = getProjectedMemberInvestments(member.id, year);
                      return (
                        <td key={`inv-${year}-${member.id}`} className="px-1 py-2 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-indigo-700 cursor-help">{formatAmount(value)}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[200px]">
                                <div className="space-y-1">
                                  <div className="font-semibold border-b pb-1">{member.name} Investments</div>
                                  {Object.entries(breakdown).map(([cat, amt]) => (
                                    <div key={cat} className="flex justify-between gap-2">
                                      <span className="capitalize">{cat.replace(/_/g, ' ')}:</span>
                                      <span>{formatAmount(amt)}</span>
                                    </div>
                                  ))}
                                  {Object.keys(breakdown).length === 0 && <div className="text-gray-400">No investments</div>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </td>
                      );
                    })}
                    <td className={`px-1 py-2 text-center bg-gray-50 ${yearIdx < displayYears.length - 1 ? 'border-r border-gray-100' : ''}`}>
                      <span className="text-[10px] font-semibold text-indigo-800">{formatAmount(total)}</span>
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* Surplus Row */}
            <tr className="bg-emerald-100">
              <td className="px-3 py-2.5 border-r border-emerald-200">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-800">Surplus</span>
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                return (
                  <React.Fragment key={`sur-${year}`}>
                    {members.map((member) => {
                      const inc = getProjectedMemberIncome(member.id, year);
                      const exp = getProjectedMemberExpenses(member.id, year);
                      const goal = getMemberGoalExpenses(member.id, year);
                      const inv = getProjectedMemberInvestments(member.id, year);
                      const sur = inc - exp - goal - inv;
                      return (
                        <td key={`sur-${year}-${member.id}`} className={`px-1 py-2.5 text-center ${sur >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <span className={`text-[10px] font-bold ${sur >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {formatAmount(sur)}
                          </span>
                        </td>
                      );
                    })}
                    <td className={`px-1 py-2.5 text-center ${yearIdx < displayYears.length - 1 ? 'border-r border-emerald-200' : ''}`}>
                      {(() => {
                        const total = members.reduce((sum, m) => {
                          const inc = getProjectedMemberIncome(m.id, year);
                          const exp = getProjectedMemberExpenses(m.id, year);
                          const goal = getMemberGoalExpenses(m.id, year);
                          const inv = getProjectedMemberInvestments(m.id, year);
                          return sum + inc - exp - goal - inv;
                        }, 0);
                        return (
                          <span className={`text-[10px] font-bold ${total >= 0 ? 'text-emerald-800 bg-emerald-100' : 'text-red-800 bg-red-100'}`}>
                            {formatAmount(total)}
                          </span>
                        );
                      })()}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
        <span>* Primary member | (R) Retirement year | 🎯 Goal year</span>
        <span>Click year dropdown to change</span>
      </div>
    </div>
  );
}
