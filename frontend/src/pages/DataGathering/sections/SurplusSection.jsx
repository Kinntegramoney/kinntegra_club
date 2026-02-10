import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark, Target, Info, Download, Calculator, AlertTriangle, CheckCircle } from "lucide-react";
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

  // Allocation Simulator State
  const [allocations, setAllocations] = useState({});
  const [simulationResults, setSimulationResults] = useState({});
  const [calculating, setCalculating] = useState({});

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

    // Get maturities by year from income details
    const getMaturitiesByYear = () => {
      const maturities = {};
      allYears.forEach(y => { maturities[y] = { total: 0, details: [] }; });
      
      incomeDetails.forEach(inc => {
        const details = inc.details || {};
        let maturityYear = null;
        let maturityValue = 0;
        let maturityType = '';
        
        // Check for maturity dates/years in different income types
        if (details.maturity_date) {
          maturityYear = new Date(details.maturity_date).getFullYear();
        } else if (details.maturity_year) {
          maturityYear = parseInt(details.maturity_year);
        }
        
        maturityValue = parseFloat(details.maturity_value) || parseFloat(details.maturity_amount) || 0;
        
        if (maturityYear && maturityValue > 0 && maturities[maturityYear]) {
          maturityType = inc.category === 'fd' ? 'FD Maturity' :
                        inc.category === 'bonds' ? 'Bond Maturity' :
                        inc.category === 'ppf' ? 'PPF Maturity' :
                        inc.category === 'rd_pis' ? 'RD Maturity' :
                        inc.category === 'insurance_income' ? 'Insurance Maturity' :
                        inc.category === 'nps' ? 'NPS Maturity' :
                        'Other Maturity';
          
          maturities[maturityYear].total += maturityValue;
          maturities[maturityYear].details.push({
            type: maturityType,
            category: inc.category,
            value: maturityValue,
            memberIds: inc.member_ids || []
          });
        }
      });
      
      return maturities;
    };

    const maturitiesByYear = getMaturitiesByYear();

    // Sheet 1: Summary
    const summaryData = [
      ["FAMILY CASH FLOW PROJECTION"],
      [],
      ["Family Name:", family?.family_name || "Family"],
      ["Generated On:", new Date().toLocaleDateString()],
      ["Base Year:", currentYear],
      ["Life Expectancy:", lifeExpectancy],
      ["Earliest Retirement Year:", earliestRetirement],
      [],
      ["FAMILY MEMBERS"],
      ["Name", "Relation", "Retirement Year", "Salary Growth %", "Business Growth %"],
      ...members.map(m => {
        const info = getMemberIncomeInfo(m.id);
        return [
          m.name + (m.is_primary ? ' (Primary)' : ''),
          m.relation || '',
          info.retirementYear,
          info.salaryGrowth,
          info.businessGrowth
        ];
      }),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Sheet 2: Year-wise Cash Flow (Comprehensive)
    const cashFlowHeaders1 = [
      "", "",
      ...members.flatMap(m => [m.name, "", "", "", "", ""]),
      "FAMILY TOTAL", "", "", "", "", ""
    ];
    
    const cashFlowHeaders2 = [
      "Year", "Age",
      ...members.flatMap(() => ["Income", "Expenses", "Goals", "Invest", "Maturity", "Surplus"]),
      "Income", "Expenses", "Goals", "Invest", "Maturity", "Surplus"
    ];

    const cashFlowData = allYears.map(year => {
      const yearStr = year.toString();
      const age = primaryAge + (year - currentYear);
      const yearMaturities = maturitiesByYear[year] || { total: 0, details: [] };
      
      const memberValues = members.flatMap(m => {
        const inc = getProjectedMemberIncome(m.id, yearStr);
        const exp = getProjectedMemberExpenses(m.id, yearStr);
        const goal = getMemberGoalExpenses(m.id, yearStr);
        const inv = getProjectedMemberInvestments(m.id, yearStr);
        
        // Get member's share of maturities
        const memberMaturity = yearMaturities.details
          .filter(d => d.memberIds.includes(m.id))
          .reduce((sum, d) => sum + d.value / d.memberIds.length, 0);
        
        const surplus = inc - exp - goal - inv + memberMaturity;
        return [Math.round(inc), Math.round(exp), Math.round(goal), Math.round(inv), Math.round(memberMaturity), Math.round(surplus)];
      });

      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const totalInvestments = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, yearStr), 0);
      const totalMaturity = yearMaturities.total;
      const totalSurplus = totalIncome - totalExpenses - totalGoals - totalInvestments + totalMaturity;

      return [
        year,
        age,
        ...memberValues,
        Math.round(totalIncome),
        Math.round(totalExpenses),
        Math.round(totalGoals),
        Math.round(totalInvestments),
        Math.round(totalMaturity),
        Math.round(totalSurplus)
      ];
    });

    const cashFlowSheet = XLSX.utils.aoa_to_sheet([cashFlowHeaders1, cashFlowHeaders2, ...cashFlowData]);
    
    // Merge cells for member headers
    cashFlowSheet['!merges'] = [
      ...members.map((_, i) => ({ s: { r: 0, c: 2 + i * 6 }, e: { r: 0, c: 7 + i * 6 } })),
      { s: { r: 0, c: 2 + members.length * 6 }, e: { r: 0, c: 7 + members.length * 6 } }
    ];
    
    cashFlowSheet['!cols'] = [
      { wch: 6 }, { wch: 5 },
      ...members.flatMap(() => [{ wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }]),
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }
    ];
    
    XLSX.utils.book_append_sheet(wb, cashFlowSheet, "Cash Flow");

    // Sheet 3: Income Breakdown by Member
    const incomeSheetData = [
      ["INCOME BREAKDOWN BY MEMBER"],
      [],
    ];
    
    members.forEach((member, mIdx) => {
      incomeSheetData.push([`${member.name}${member.is_primary ? ' (Primary)' : ''}`]);
      incomeSheetData.push(["Year", "Salary", "Business", "Rental", "Pension", "Total"]);
      
      allYears.forEach(year => {
        const yearStr = year.toString();
        const breakdown = getMemberIncomeBreakdown(member.id, yearStr);
        const total = breakdown.salary + breakdown.business + breakdown.rental + breakdown.pension;
        incomeSheetData.push([
          year,
          Math.round(breakdown.salary),
          Math.round(breakdown.business),
          Math.round(breakdown.rental),
          Math.round(breakdown.pension),
          Math.round(total)
        ]);
      });
      
      incomeSheetData.push([]); // Empty row between members
    });

    const incomeSheet = XLSX.utils.aoa_to_sheet(incomeSheetData);
    XLSX.utils.book_append_sheet(wb, incomeSheet, "Income by Member");

    // Sheet 4: Expense Breakdown by Member
    const expenseCategories = [...new Set(expenseDetails.map(e => e.expense_type || 'other'))];
    const expenseSheetData = [
      ["EXPENSE BREAKDOWN BY MEMBER"],
      [],
    ];
    
    members.forEach((member, mIdx) => {
      expenseSheetData.push([`${member.name}${member.is_primary ? ' (Primary)' : ''}`]);
      expenseSheetData.push(["Year", ...expenseCategories.map(c => c.replace(/_/g, ' ')), "Total"]);
      
      allYears.forEach(year => {
        const yearStr = year.toString();
        const breakdown = getMemberExpenseBreakdown(member.id, yearStr);
        const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
        expenseSheetData.push([
          year,
          ...expenseCategories.map(cat => Math.round(breakdown[cat] || 0)),
          Math.round(total)
        ]);
      });
      
      expenseSheetData.push([]);
    });

    const expenseSheet = XLSX.utils.aoa_to_sheet(expenseSheetData);
    XLSX.utils.book_append_sheet(wb, expenseSheet, "Expenses by Member");

    // Sheet 5: Goals with Inflation
    if (goalDetails.length > 0) {
      const goalsSheetData = [
        ["GOALS - YEAR WISE (Inflated Values)"],
        [],
        ["Year", ...goalDetails.map(g => g.category || 'Goal'), "Total Goals"],
      ];
      
      allYears.forEach(year => {
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
        if (total > 0) {
          goalsSheetData.push([year, ...goalAmounts.map(a => Math.round(a)), Math.round(total)]);
        }
      });

      const goalsSheet = XLSX.utils.aoa_to_sheet(goalsSheetData);
      XLSX.utils.book_append_sheet(wb, goalsSheet, "Goals");
    }

    // Sheet 6: Maturities
    const maturitySheetData = [
      ["MATURITY INFLOWS"],
      [],
      ["Year", "Type", "Category", "Amount", "Members"],
    ];
    
    allYears.forEach(year => {
      const yearMaturities = maturitiesByYear[year];
      if (yearMaturities && yearMaturities.total > 0) {
        yearMaturities.details.forEach(d => {
          const memberNames = d.memberIds.map(mid => members.find(m => m.id === mid)?.name || '').join(', ');
          maturitySheetData.push([year, d.type, d.category, Math.round(d.value), memberNames]);
        });
      }
    });
    
    if (maturitySheetData.length > 3) {
      const maturitySheet = XLSX.utils.aoa_to_sheet(maturitySheetData);
      maturitySheet['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, maturitySheet, "Maturities");
    }

    // Sheet 7: Investments by Member
    if (investmentDetails.length > 0) {
      const investmentSheetData = [
        ["INVESTMENTS BY MEMBER"],
        [],
      ];
      
      members.forEach(member => {
        const memberInvestments = investmentDetails.filter(inv => inv.member_id === member.id);
        if (memberInvestments.length > 0) {
          investmentSheetData.push([`${member.name}${member.is_primary ? ' (Primary)' : ''}`]);
          investmentSheetData.push(["Category", "Amount", "Frequency", "Annual Amount"]);
          
          memberInvestments.forEach(inv => {
            investmentSheetData.push([
              (inv.category || 'other').replace(/_/g, ' '),
              inv.amount || 0,
              inv.frequency || 'monthly',
              inv.annual_amount || 0
            ]);
          });
          
          const totalAnnual = memberInvestments.reduce((sum, inv) => sum + (parseFloat(inv.annual_amount) || 0), 0);
          investmentSheetData.push(["TOTAL", "", "", Math.round(totalAnnual)]);
          investmentSheetData.push([]);
        }
      });

      const investmentSheet = XLSX.utils.aoa_to_sheet(investmentSheetData);
      XLSX.utils.book_append_sheet(wb, investmentSheet, "Investments");
    }

    // Sheet 8: Assets by Member
    const assetCategories = [
      { key: 'salary', label: 'Salary/Business Assets' },
      { key: 'rental', label: 'Real Estate' },
      { key: 'mutual_fund', label: 'Mutual Funds' },
      { key: 'shares_pms', label: 'Stocks/PMS' },
      { key: 'fd', label: 'Fixed Deposits' },
      { key: 'bonds', label: 'Bonds' },
      { key: 'ppf', label: 'PPF' },
      { key: 'epf', label: 'EPF' },
      { key: 'nps', label: 'NPS' },
      { key: 'rd_pis', label: 'Recurring Deposits' },
      { key: 'commodities', label: 'Gold/Commodities' },
      { key: 'insurance_income', label: 'Insurance' },
      { key: 'cash', label: 'Cash' },
      { key: 'vehicle', label: 'Vehicle' }
    ];

    const assetsSheetData = [
      ["ASSETS BY MEMBER"],
      [],
    ];

    members.forEach(member => {
      assetsSheetData.push([`${member.name}${member.is_primary ? ' (Primary)' : ''}`]);
      assetsSheetData.push(["Category", "Investment Value", "Market Value"]);
      
      let memberInvTotal = 0, memberMktTotal = 0;
      
      assetCategories.forEach(cat => {
        const memberAssets = incomeDetails.filter(inc => inc.category === cat.key && inc.member_ids?.includes(member.id));
        let invValue = 0, mktValue = 0;
        
        memberAssets.forEach(asset => {
          const details = asset.details || {};
          const inv = parseFloat(details.investment_value) || parseFloat(details.total_investment) || parseFloat(details.purchase_value) || 0;
          const mkt = parseFloat(details.market_value) || parseFloat(details.maturity_value) || parseFloat(details.current_value) || inv;
          invValue += inv;
          mktValue += mkt;
        });
        
        if (invValue > 0 || mktValue > 0) {
          assetsSheetData.push([cat.label, Math.round(invValue), Math.round(mktValue)]);
          memberInvTotal += invValue;
          memberMktTotal += mktValue;
        }
      });
      
      assetsSheetData.push(["TOTAL", Math.round(memberInvTotal), Math.round(memberMktTotal)]);
      assetsSheetData.push([]);
    });

    const assetsSheet = XLSX.utils.aoa_to_sheet(assetsSheetData);
    assetsSheet['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, assetsSheet, "Assets");

    // Sheet 9: Liabilities by Member
    if (liabilities.length > 0) {
      const liabilitiesSheetData = [
        ["LIABILITIES BY MEMBER"],
        [],
      ];
      
      members.forEach(member => {
        const memberLiabilities = liabilities.filter(l => l.member_id === member.id || l.member_ids?.includes(member.id));
        if (memberLiabilities.length > 0) {
          liabilitiesSheetData.push([`${member.name}${member.is_primary ? ' (Primary)' : ''}`]);
          liabilitiesSheetData.push(["Loan Type", "Principal", "EMI", "Interest %", "Tenure", "Outstanding"]);
          
          memberLiabilities.forEach(l => {
            liabilitiesSheetData.push([
              l.loan_type || l.type || 'Loan',
              l.principal_amount || l.loan_amount || 0,
              l.emi_amount || l.emi || 0,
              l.interest_rate || 0,
              l.remaining_tenure || l.tenure || 0,
              l.outstanding_amount || l.principal_amount || 0
            ]);
          });
          
          const totalOutstanding = memberLiabilities.reduce((sum, l) => sum + (parseFloat(l.outstanding_amount) || parseFloat(l.principal_amount) || 0), 0);
          liabilitiesSheetData.push(["TOTAL", "", "", "", "", Math.round(totalOutstanding)]);
          liabilitiesSheetData.push([]);
        }
      });

      // Family total
      const totalFamilyLiabilities = liabilities.reduce((sum, l) => sum + (parseFloat(l.outstanding_amount) || parseFloat(l.principal_amount) || 0), 0);
      liabilitiesSheetData.push(["FAMILY TOTAL LIABILITIES", "", "", "", "", Math.round(totalFamilyLiabilities)]);

      const liabilitiesSheet = XLSX.utils.aoa_to_sheet(liabilitiesSheetData);
      liabilitiesSheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, liabilitiesSheet, "Liabilities");
    }

    // Sheet 10: Insurance by Member
    const insuranceFromIncome = incomeDetails.filter(inc => inc.category === 'insurance_income');
    if (insuranceFromIncome.length > 0 || insurancePremiums.length > 0) {
      const insuranceSheetData = [
        ["INSURANCE BY MEMBER"],
        [],
      ];
      
      members.forEach(member => {
        const memberInsurance = insuranceFromIncome.filter(ins => ins.member_ids?.includes(member.id));
        const memberPremiums = insurancePremiums.filter(p => p.member_id === member.id);
        
        if (memberInsurance.length > 0 || memberPremiums.length > 0) {
          insuranceSheetData.push([`${member.name}${member.is_primary ? ' (Primary)' : ''}`]);
          insuranceSheetData.push(["Policy Type", "Sum Assured", "Premium", "Frequency", "Maturity Year", "Maturity Value"]);
          
          memberInsurance.forEach(ins => {
            const details = ins.details || {};
            insuranceSheetData.push([
              details.policy_type || 'Life Insurance',
              details.sum_assured || 0,
              details.premium_amount || 0,
              details.premium_frequency || 'Yearly',
              details.maturity_year || '',
              details.maturity_value || 0
            ]);
          });
          
          memberPremiums.forEach(prem => {
            insuranceSheetData.push([
              prem.policy_type || prem.type || 'Insurance',
              prem.sum_assured || 0,
              prem.premium || prem.amount || 0,
              prem.frequency || 'Yearly',
              prem.maturity_year || '',
              prem.maturity_value || 0
            ]);
          });
          
          insuranceSheetData.push([]);
        }
      });

      const insuranceSheet = XLSX.utils.aoa_to_sheet(insuranceSheetData);
      insuranceSheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, insuranceSheet, "Insurance");
    }

    // Sheet 11: Net Worth Projection
    const networthHeaders = ["Year", "Age", "Total Assets", "Maturities", "Total Liabilities", "Net Worth", "Cumulative Surplus"];
    
    let cumulativeSurplus = 0;
    const networthData = allYears.map(year => {
      const yearStr = year.toString();
      const age = primaryAge + (year - currentYear);
      const yearsFromNow = year - currentYear;
      const yearMaturities = maturitiesByYear[year] || { total: 0 };
      
      // Calculate projected assets
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

      // Calculate year's surplus
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const totalInvestments = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, yearStr), 0);
      const yearSurplus = totalIncome - totalExpenses - totalGoals - totalInvestments + yearMaturities.total;
      cumulativeSurplus += yearSurplus;

      const netWorth = totalAssets + cumulativeSurplus - totalLiabilities;

      return [
        year,
        age,
        Math.round(totalAssets),
        Math.round(yearMaturities.total),
        Math.round(totalLiabilities),
        Math.round(netWorth),
        Math.round(cumulativeSurplus)
      ];
    });

    const networthSheetData = [
      ["NET WORTH PROJECTION"],
      [],
      networthHeaders,
      ...networthData
    ];
    
    const networthSheet = XLSX.utils.aoa_to_sheet(networthSheetData);
    networthSheet['!cols'] = [{ wch: 8 }, { wch: 6 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, networthSheet, "Net Worth");

    // Generate and save file
    const fileName = `financial_plan_${(family?.family_name || 'family').toLowerCase().replace(/\s+/g, '_')}_${currentYear}.xlsx`;
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

      {/* Allocation Simulator */}
      <AllocationSimulator 
        members={members}
        family={family}
        currentYear={currentYear}
        endYear={endYear}
        retirementYear={earliestRetirement}
        getProjectedMemberIncome={getProjectedMemberIncome}
        getProjectedMemberExpenses={getProjectedMemberExpenses}
        getMemberGoalExpenses={getMemberGoalExpenses}
        getProjectedMemberInvestments={getProjectedMemberInvestments}
        getMemberIncomeInfo={getMemberIncomeInfo}
        incomeDetails={incomeDetails}
        primaryAge={primaryAge}
        lifeExpectancy={lifeExpectancy}
        calculateAge={calculateAge}
      />
    </div>
  );
}

// Allocation Simulator Component
function AllocationSimulator({ 
  members, 
  family,
  currentYear, 
  endYear, 
  retirementYear, 
  getProjectedMemberIncome, 
  getProjectedMemberExpenses, 
  getMemberGoalExpenses,
  getProjectedMemberInvestments,
  getMemberIncomeInfo,
  incomeDetails,
  primaryAge,
  lifeExpectancy,
  calculateAge
}) {
  const [allocations, setAllocations] = useState({
    equity: 60,
    debt: 40
  });
  const [returns, setReturns] = useState({
    equity: 12,
    debt: 7
  });
  const [includeAssets, setIncludeAssets] = useState(false);
  const [assetSelectionMode, setAssetSelectionMode] = useState('all'); // 'all', 'select', 'from_year'
  const [selectedAssets, setSelectedAssets] = useState({});
  const [assetStartYear, setAssetStartYear] = useState(currentYear);
  const [simulationResult, setSimulationResult] = useState(null);
  const [yearlyBreakdown, setYearlyBreakdown] = useState([]);

  // Categories with maturity dates are debt instruments - exclude from allocation simulator
  // They will be considered only when they mature (handled in cash flow separately)
  const DEBT_CATEGORIES_WITH_MATURITY = ['fd', 'bonds', 'bond', 'rd_pis', 'insurance_income', 'ppf', 'nps'];

  // Get all assets with details (excluding debt instruments with maturity dates)
  const getAssetsList = () => {
    const assets = [];
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      
      // Check if this is a debt instrument with a maturity date
      const hasMaturityDate = details.maturity_date || details.maturity_year || details.maturity_amount;
      const isDebtCategory = DEBT_CATEGORIES_WITH_MATURITY.includes(inc.category);
      
      // Skip assets with maturity dates (they're debt portfolio until maturity)
      if (isDebtCategory && hasMaturityDate) {
        return;
      }
      
      const mktValue = parseFloat(details.market_value) || parseFloat(details.current_value) || 
                       parseFloat(details.investment_value) || 0;
      if (mktValue > 0) {
        const memberNames = (inc.member_ids || [])
          .map(mid => members.find(m => m.id === mid)?.name || '')
          .filter(Boolean)
          .join(', ') || 'Family';
        
        assets.push({
          id: inc.id,
          category: inc.category,
          label: getCategoryLabel(inc.category),
          member: memberNames,
          value: mktValue,
          selected: true
        });
      }
    });
    return assets;
  };

  const getCategoryLabel = (category) => {
    const labels = {
      salary: 'Salary Assets',
      business: 'Business',
      rental: 'Real Estate',
      mutual_fund: 'Mutual Funds',
      shares_pms: 'Stocks/PMS',
      fd: 'Fixed Deposits',
      bonds: 'Bonds',
      ppf: 'PPF',
      epf: 'EPF',
      nps: 'NPS',
      rd_pis: 'Recurring Deposits',
      commodities: 'Gold/Commodities',
      insurance_income: 'Insurance',
      cash: 'Cash',
      vehicle: 'Vehicle'
    };
    return labels[category] || category;
  };

  const assetsList = getAssetsList();

  // Initialize selected assets
  React.useEffect(() => {
    const initial = {};
    assetsList.forEach(asset => {
      initial[asset.id] = true;
    });
    setSelectedAssets(initial);
  }, [incomeDetails]);

  // Calculate current total assets based on selection
  const getCurrentAssets = () => {
    if (!includeAssets) return 0;
    
    let totalAssets = 0;
    assetsList.forEach(asset => {
      if (assetSelectionMode === 'all' || selectedAssets[asset.id]) {
        totalAssets += asset.value;
      }
    });
    return totalAssets;
  };

  const runSimulation = () => {
    const startingAssets = assetSelectionMode === 'from_year' ? 0 : getCurrentAssets();
    const weightedReturn = (allocations.equity * returns.equity + allocations.debt * returns.debt) / 100;
    
    let corpus = startingAssets;
    let breakdown = [];
    let exhaustYear = null;
    
    for (let year = currentYear; year <= endYear; year++) {
      const yearStr = year.toString();
      const age = primaryAge + (year - currentYear);
      
      // Add assets starting from selected year if 'from_year' mode
      if (assetSelectionMode === 'from_year' && year === assetStartYear && includeAssets) {
        corpus += getCurrentAssetsForFromYear();
      }
      
      // Calculate total income for this year
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      
      // Calculate total outflows
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const totalInvestments = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, yearStr), 0);
      
      // Surplus for this year
      const yearSurplus = totalIncome - totalExpenses - totalGoals;
      
      // Apply returns and add/withdraw surplus
      corpus = corpus * (1 + weightedReturn / 100) + yearSurplus;
      
      breakdown.push({
        year,
        age,
        income: totalIncome,
        expenses: totalExpenses,
        goals: totalGoals,
        surplus: yearSurplus,
        corpus: corpus,
        status: corpus > 0 ? 'ok' : 'exhausted'
      });
      
      if (corpus <= 0 && !exhaustYear) {
        exhaustYear = year;
      }
    }
    
    setYearlyBreakdown(breakdown);
    
    if (exhaustYear) {
      const yearsShort = endYear - exhaustYear;
      setSimulationResult({
        success: false,
        exhaustYear,
        yearsShort,
        finalCorpus: 0,
        message: `The money will last till year ${exhaustYear}. Your money will exhaust ${yearsShort} years before your life expectancy.`
      });
    } else {
      const finalCorpus = breakdown[breakdown.length - 1]?.corpus || 0;
      setSimulationResult({
        success: true,
        exhaustYear: null,
        yearsShort: 0,
        finalCorpus,
        message: `Great! Your money will last till life expectancy (${endYear}) with ₹${formatLargeNumber(finalCorpus)} remaining.`
      });
    }
  };

  const getCurrentAssetsForFromYear = () => {
    let totalAssets = 0;
    assetsList.forEach(asset => {
      if (selectedAssets[asset.id]) {
        totalAssets += asset.value;
      }
    });
    return totalAssets;
  };

  const formatLargeNumber = (num) => {
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
    return num.toLocaleString('en-IN');
  };

  const handleEquityChange = (value) => {
    const equity = Math.min(100, Math.max(0, parseInt(value) || 0));
    setAllocations({ equity, debt: 100 - equity });
  };

  const handleDebtChange = (value) => {
    const debt = Math.min(100, Math.max(0, parseInt(value) || 0));
    setAllocations({ equity: 100 - debt, debt });
  };

  const toggleAssetSelection = (assetId) => {
    setSelectedAssets(prev => ({ ...prev, [assetId]: !prev[assetId] }));
  };

  const selectAllAssets = () => {
    const all = {};
    assetsList.forEach(asset => { all[asset.id] = true; });
    setSelectedAssets(all);
  };

  const deselectAllAssets = () => {
    const none = {};
    assetsList.forEach(asset => { none[asset.id] = false; });
    setSelectedAssets(none);
  };

  const yearOptions = [];
  for (let y = currentYear; y <= endYear; y++) {
    yearOptions.push(y);
  }

  return (
    <Card className="mt-6 border-2 border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-5 w-5 text-blue-600" />
          Allocation Simulator
        </CardTitle>
        <p className="text-xs text-gray-500">
          Check if your invested surplus will last until life expectancy based on asset allocation.
          <span className="block mt-0.5 text-gray-400">Note: Debt instruments with maturity dates (FD, Bonds, RD, Insurance, etc.) are excluded as they will be available only at maturity.</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Member Life Expectancy Info */}
        <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
          <h4 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <User className="h-3 w-3" />
            Member Life Expectancy & Retirement
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {members.map(member => {
              const age = calculateAge(member.date_of_birth);
              const memberLifeExp = parseInt(member.life_expectancy) || 85;
              const memberInfo = getMemberIncomeInfo(member.id);
              const yearsToRetirement = memberInfo.retirementYear - currentYear;
              const yearsToLifeExp = memberLifeExp - age;
              
              return (
                <div key={member.id} className="bg-white rounded-md p-2 border border-blue-200/50">
                  <div className="flex items-center gap-1 mb-1">
                    <User className="h-3 w-3 text-blue-600" />
                    <span className="text-xs font-medium text-gray-800 truncate">
                      {member.name}
                      {member.is_primary && <span className="text-blue-500 ml-0.5">*</span>}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Current Age:</span>
                      <span className="font-medium text-gray-700">{age} yrs</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Life Expectancy:</span>
                      <span className="font-medium text-blue-700">{memberLifeExp} yrs</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Retirement Year:</span>
                      <span className="font-medium text-amber-700">{memberInfo.retirementYear}</span>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1 border-t border-gray-100 mt-1">
                      <span className="text-gray-500">Years Left:</span>
                      <span className="font-semibold text-green-700">{yearsToLifeExp} yrs</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Asset Inclusion Toggle */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="includeAssets"
              checked={includeAssets}
              onChange={(e) => setIncludeAssets(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="includeAssets" className="text-sm font-medium text-gray-700">
              Include existing assets in calculation
            </label>
          </div>

          {includeAssets && (
            <div className="ml-7 space-y-3">
              {/* Asset Selection Mode */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="assetMode"
                    value="all"
                    checked={assetSelectionMode === 'all'}
                    onChange={() => setAssetSelectionMode('all')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">Include all assets</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="assetMode"
                    value="select"
                    checked={assetSelectionMode === 'select'}
                    onChange={() => setAssetSelectionMode('select')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">Select specific assets</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="assetMode"
                    value="from_year"
                    checked={assetSelectionMode === 'from_year'}
                    onChange={() => setAssetSelectionMode('from_year')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-600">Include from specific year</span>
                </label>
              </div>

              {/* Asset Selection List */}
              {assetSelectionMode === 'select' && (
                <div className="border rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600">Select assets to include:</span>
                    <div className="flex gap-2">
                      <button onClick={selectAllAssets} className="text-xs text-blue-600 hover:underline">Select All</button>
                      <button onClick={deselectAllAssets} className="text-xs text-red-600 hover:underline">Deselect All</button>
                    </div>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {assetsList.map(asset => (
                      <label key={asset.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAssets[asset.id] || false}
                          onChange={() => toggleAssetSelection(asset.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-700 flex-1">{asset.label}</span>
                        <span className="text-xs text-gray-500">{asset.member}</span>
                        <span className="text-sm font-medium text-green-600">₹{formatLargeNumber(asset.value)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t flex justify-between">
                    <span className="text-xs text-gray-500">Selected Assets:</span>
                    <span className="text-sm font-semibold text-green-700">
                      ₹{formatLargeNumber(Object.entries(selectedAssets)
                        .filter(([_, selected]) => selected)
                        .reduce((sum, [id]) => sum + (assetsList.find(a => a.id === id)?.value || 0), 0)
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Year Selection */}
              {assetSelectionMode === 'from_year' && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">Include assets from year:</span>
                  <Select value={assetStartYear.toString()} onValueChange={(v) => setAssetStartYear(parseInt(v))}>
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map(y => (
                        <SelectItem key={y} value={y.toString()}>
                          {y} {y === retirementYear && '(R)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-gray-500">(Assets will be added to corpus in this year)</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Allocation Inputs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Equity Allocation %</label>
            <Input
              type="number"
              value={allocations.equity}
              onChange={(e) => handleEquityChange(e.target.value)}
              className="h-9"
              min="0"
              max="100"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Debt Allocation %</label>
            <Input
              type="number"
              value={allocations.debt}
              onChange={(e) => handleDebtChange(e.target.value)}
              className="h-9"
              min="0"
              max="100"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Equity Return %</label>
            <Input
              type="number"
              value={returns.equity}
              onChange={(e) => setReturns(prev => ({ ...prev, equity: parseFloat(e.target.value) || 0 }))}
              className="h-9"
              step="0.5"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Debt Return %</label>
            <Input
              type="number"
              value={returns.debt}
              onChange={(e) => setReturns(prev => ({ ...prev, debt: parseFloat(e.target.value) || 0 }))}
              className="h-9"
              step="0.5"
            />
          </div>
        </div>

        {/* Weighted Return Display */}
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-600">
            Weighted Average Return: <strong className="text-blue-700">
              {((allocations.equity * returns.equity + allocations.debt * returns.debt) / 100).toFixed(2)}%
            </strong>
          </span>
          <span className="text-sm text-gray-600">
            Starting Corpus: <strong className="text-green-700">
              ₹{formatLargeNumber(assetSelectionMode === 'from_year' ? 0 : getCurrentAssets())}
            </strong>
            {assetSelectionMode === 'from_year' && includeAssets && (
              <span className="text-xs text-gray-500 ml-1">(+₹{formatLargeNumber(getCurrentAssetsForFromYear())} in {assetStartYear})</span>
            )}
          </span>
        </div>

        {/* Simulate Button */}
        <Button onClick={runSimulation} className="w-full gap-2">
          <Calculator className="h-4 w-4" />
          Run Simulation
        </Button>

        {/* Simulation Result */}
        {simulationResult && (
          <div className={`rounded-lg p-4 ${simulationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-start gap-3">
              {simulationResult.success ? (
                <CheckCircle className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${simulationResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {simulationResult.message}
                </p>
                {!simulationResult.success && (
                  <p className="text-sm text-red-600 mt-1">
                    Consider increasing your savings rate, adjusting asset allocation, or reviewing your expenses.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Yearly Breakdown Table */}
        {yearlyBreakdown.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Year-wise Corpus Projection</h4>
            <div className="border rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Year</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Age</th>
                    <th className="text-right py-2 px-3 font-medium text-green-600">Income</th>
                    <th className="text-right py-2 px-3 font-medium text-orange-600">Expenses</th>
                    <th className="text-right py-2 px-3 font-medium text-purple-600">Goals</th>
                    <th className="text-right py-2 px-3 font-medium text-blue-600">Surplus</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-700">Corpus</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyBreakdown.filter((_, i) => i % 1 === 0).map((row, idx) => (
                    <tr key={row.year} className={`border-t ${row.status === 'exhausted' ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="py-1.5 px-3 font-medium">
                        {row.year}
                        {row.year === retirementYear && <span className="text-amber-600 ml-1">(R)</span>}
                        {assetSelectionMode === 'from_year' && row.year === assetStartYear && <span className="text-green-600 ml-1">(A)</span>}
                      </td>
                      <td className="py-1.5 px-3">{row.age}</td>
                      <td className="py-1.5 px-3 text-right text-green-600">₹{formatLargeNumber(row.income)}</td>
                      <td className="py-1.5 px-3 text-right text-orange-600">₹{formatLargeNumber(row.expenses)}</td>
                      <td className="py-1.5 px-3 text-right text-purple-600">{row.goals > 0 ? `₹${formatLargeNumber(row.goals)}` : '-'}</td>
                      <td className={`py-1.5 px-3 text-right ${row.surplus >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {row.surplus >= 0 ? '' : '-'}₹{formatLargeNumber(Math.abs(row.surplus))}
                      </td>
                      <td className={`py-1.5 px-3 text-right font-medium ${row.corpus > 0 ? 'text-gray-800' : 'text-red-700'}`}>
                        {row.corpus > 0 ? `₹${formatLargeNumber(row.corpus)}` : 'Exhausted'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              (R) = Retirement Year {assetSelectionMode === 'from_year' && '| (A) = Asset Addition Year'}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
