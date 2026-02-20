import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark, Target, Info, Download, Calculator, AlertTriangle, CheckCircle, Clock, Settings2, X } from "lucide-react";
// recharts removed - using simple text display
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
    const member = members.find(m => m.id === memberId);
    // Match income by member_ids array containing memberId
    const memberIncomes = incomeDetails.filter(inc => {
      const incMemberIds = inc.member_ids || [];
      return incMemberIds.includes(memberId) || incMemberIds.includes(String(memberId));
    });
    
    let salaryGrowth = 0, businessGrowth = 0, retirementAge = 60, retirementYear = null;
    let baseSalary = 0, baseBusiness = 0, baseRental = 0, basePension = 0;
    
    // First priority: Use member's retirement_year if set
    if (member?.retirement_year) {
      retirementYear = parseInt(member.retirement_year);
    }
    
    memberIncomes.forEach(income => {
      const details = income.details || {};
      const category = income.category || '';
      
      switch (category) {
        case 'salary':
          const salaryYearly = parseFloat(details.net_income_yearly) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || 0;
          baseSalary += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          salaryGrowth = Math.max(salaryGrowth, parseFloat(details.avg_growth_rate) || 0);
          break;
        case 'business':
          const businessYearly = parseFloat(details.net_income_yearly) || 0;
          const businessMonthly = parseFloat(details.net_income_monthly) || 0;
          baseBusiness += businessYearly > 0 ? businessYearly : businessMonthly * 12;
          businessGrowth = Math.max(businessGrowth, parseFloat(details.avg_growth_rate) || 0);
          break;
        case 'rental':
          // Include rental income regardless of is_on_rent status for income calculations
          const annualRent = parseFloat(details.annual_rent) || 0;
          const rentPerMonth = parseFloat(details.rent_per_month) || 0;
          if (details.is_on_rent === 'Yes' || annualRent > 0 || rentPerMonth > 0) {
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
    
    // If no retirement year set on member, calculate from age
    const memberAge = calculateAge(member?.date_of_birth);
    if (!retirementYear) {
      retirementYear = currentYear + Math.max(0, retirementAge - memberAge);
    }
    
    let baseMutualFund = 0;
    memberIncomes.forEach(income => {
      if (income.category === "mutual_fund") {
        const details = income.details || {};
        baseMutualFund += parseFloat(details.dividend_income_yearly) || 0;
      }
    });
    return { salaryGrowth, businessGrowth, rentalGrowth: 3, retirementYear, baseSalary, baseBusiness, baseRental, basePension, baseMutualFund };
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

  // Build combined investments list (same logic as InvestmentSection)
  const getCombinedInvestments = () => {
    const allInvestments = [];
    
    // Add dedicated investments from investment_details
    if (investmentDetails && investmentDetails.length > 0) {
      investmentDetails.forEach(inv => {
        allInvestments.push({
          id: inv.id,
          category: inv.category,
          member_id: inv.member_id,
          amount: inv.amount || 0,
          frequency: inv.frequency || "monthly",
          annual_amount: inv.annual_amount || 0,
          upto_year: inv.upto_year || "",
          isFromIncome: false
        });
      });
    }
    
    // Extract investments from Income section (EPF, PPF, MF, Shares)
    if (incomeDetails && incomeDetails.length > 0) {
      incomeDetails.forEach(inc => {
        const memberId = inc.member_ids?.[0] || inc.member_id;
        const details = inc.details || {};
        
        // EPF - Annual Contribution
        if (inc.category === 'epf' && details.annual_contribution > 0) {
          allInvestments.push({
            id: `income_epf_${inc.id}`,
            category: 'epf',
            member_id: memberId,
            annual_amount: parseFloat(details.annual_contribution),
            upto_year: details.upto_year || '',
            isFromIncome: true
          });
        }
        
        // PPF - Annual Contribution
        if (inc.category === 'ppf' && details.annual_contribution > 0) {
          allInvestments.push({
            id: `income_ppf_${inc.id}`,
            category: 'ppf',
            member_id: memberId,
            annual_amount: parseFloat(details.annual_contribution),
            upto_year: details.upto_year || '',
            isFromIncome: true
          });
        }
        
        // Mutual Fund - SIP Amount
        if (inc.category === 'mutual_fund' && (details.sip_amount > 0 || details.annual_amount > 0)) {
          const sipAmount = parseFloat(details.sip_amount || 0);
          const annualAmt = parseFloat(details.annual_amount) || (sipAmount * 12);
          allInvestments.push({
            id: `income_sip_${inc.id}`,
            category: 'mutual_fund_equity',
            member_id: memberId,
            annual_amount: annualAmt,
            upto_year: details.upto_year || '',
            isFromIncome: true
          });
        }
        
        // Shares / PMS - Annual Contribution
        if (inc.category === 'shares_pms' && details.annual_contribution > 0) {
          allInvestments.push({
            id: `income_shares_${inc.id}`,
            category: 'stocks',
            member_id: memberId,
            annual_amount: parseFloat(details.annual_contribution),
            upto_year: details.upto_year || '',
            isFromIncome: true
          });
        }
      });
    }
    
    return allInvestments;
  };
  
  const combinedInvestments = getCombinedInvestments();

  // Get member investments from combined list
  const getMemberBaseInvestments = (memberId) => {
    return combinedInvestments
      .filter(inv => inv.member_id === memberId)
      .reduce((sum, inv) => sum + (parseFloat(inv.annual_amount) || 0), 0);
  };

  // Get member contribution investments considering upto_year
  const getMemberContributionInvestments = (memberId, year) => {
    const targetYear = parseInt(year);
    const memberInfo = getMemberIncomeInfo(memberId);
    const memberRetirementYear = memberInfo.retirementYear;
    
    return combinedInvestments
      .filter(inv => inv.member_id === memberId)
      .reduce((sum, inv) => {
        // Use upto_year if filled, otherwise default to member's retirement year
        const uptoYear = inv.upto_year ? parseInt(inv.upto_year) : memberRetirementYear;
        
        // Only include if year is within upto_year
        if (targetYear <= uptoYear) {
          return sum + (parseFloat(inv.annual_amount) || 0);
        }
        return sum;
      }, 0);
  };

  // Get member investment breakdown by category
  const getMemberInvestmentBreakdown = (memberId, year) => {
    const breakdown = {};
    const targetYear = parseInt(year);
    const memberInfo = getMemberIncomeInfo(memberId);
    const memberRetirementYear = memberInfo.retirementYear;
    
    combinedInvestments
      .filter(inv => inv.member_id === memberId)
      .forEach(inv => {
        // Use upto_year if filled, otherwise default to member's retirement year
        const uptoYear = inv.upto_year ? parseInt(inv.upto_year) : memberRetirementYear;
        
        if (targetYear <= uptoYear) {
          const cat = inv.category || 'Other';
          if (!breakdown[cat]) breakdown[cat] = 0;
          breakdown[cat] += parseFloat(inv.annual_amount) || 0;
        }
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
      return { salary: info.baseSalary, business: info.baseBusiness, rental: info.baseRental, pension: info.basePension, mutualFund: info.baseMutualFund || 0 };
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

  // Get maturities by year from income details (Insurance, FD, PPF, EPF, Bonds, etc.)
  const getMaturitiesByYear = () => {
    const maturities = {};
    // Initialize all years
    for (let y = currentYear; y <= endYear; y++) {
      maturities[y] = { total: 0, details: [] };
    }
    
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      let maturityYear = null;
      let maturityValue = 0;
      let maturityType = '';
      
      // Parse maturity date
      if (details.maturity_date) {
        const dateStr = details.maturity_date;
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          const year = parts[1] || parts[0];
          maturityYear = year.length === 4 ? parseInt(year) : (parseInt(year) >= 50 ? 1900 + parseInt(year) : 2000 + parseInt(year));
        } else if (dateStr.includes('-')) {
          maturityYear = new Date(dateStr).getFullYear();
        }
      } else if (details.maturity_year) {
        maturityYear = parseInt(details.maturity_year);
      }
      
      // Get maturity value - for EPF/PPF/NPS/Gratuity, use market_value as maturity amount
      const isRetirementInstrument = ['epf', 'ppf', 'nps', 'gratuity'].includes(inc.category);
      maturityValue = parseFloat(details.maturity_value) || parseFloat(details.maturity_amount) || 
                     parseFloat(details.expected_maturity) || parseFloat(details.maturity_corpus) ||
                     (isRetirementInstrument ? parseFloat(details.market_value) : 0) || 0;
      
      // Calculate maturity value if not provided
      if (maturityYear && maturityValue === 0) {
        const investmentVal = parseFloat(details.investment_value) || parseFloat(details.investment_amount) || 0;
        const interestRate = parseFloat(details.interest_rate) || parseFloat(details.expected_return) || 0;
        const tenureYears = maturityYear - currentYear;
        if (investmentVal > 0 && tenureYears > 0) {
          maturityValue = investmentVal * Math.pow(1 + interestRate / 100, tenureYears);
        }
      }
      
      // Add to maturities if valid
      if (maturityYear && maturityValue > 0 && maturities[maturityYear]) {
        maturityType = inc.category === 'fd' ? 'FD' : inc.category === 'bond' ? 'Bond' :
                      inc.category === 'ppf' ? 'PPF' : inc.category === 'rd_pis' ? 'RD' :
                      inc.category === 'insurance_income' ? 'Insurance' : inc.category === 'nps' ? 'NPS' :
                      inc.category === 'epf' ? 'EPF' : inc.category === 'gratuity' ? 'Gratuity' :
                      inc.category === 'mutual_fund' ? 'MF' : 'Other';
        
        maturities[maturityYear].total += maturityValue;
        maturities[maturityYear].details.push({ 
          type: maturityType, 
          category: inc.category, 
          value: maturityValue, 
          memberIds: inc.member_ids || [], 
          description: details.description || '' 
        });
      }
    });
    return maturities;
  };

  const maturitiesByYear = getMaturitiesByYear();

  // Calculate projected member income for a year
  const getProjectedMemberIncome = (memberId, year) => {
    const info = getMemberIncomeInfo(memberId);
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) {
      return info.baseSalary + info.baseBusiness + info.baseRental + info.basePension + (info.baseMutualFund || 0);
    }
    
    if (isPostRetirement) {
      const preRetYears = info.retirementYear - currentYear;
      const postRetYears = targetYear - info.retirementYear;
      const rental = info.baseRental * Math.pow(1 + info.rentalGrowth / 100, preRetYears + postRetYears);
      return rental + info.basePension + (info.baseMutualFund || 0);
    }
    
    const salary = info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow);
    const business = info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow);
    const rental = info.baseRental * Math.pow(1 + info.rentalGrowth / 100, yearsFromNow);
    
    return salary + business + rental + info.basePension + (info.baseMutualFund || 0);
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

  // Calculate projected member investments (uses combined investments with upto_year)
  const getProjectedMemberInvestments = (memberId, year) => {
    // Use the contribution investments function which already handles upto_year
    return getMemberContributionInvestments(memberId, year);
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

  // Export to Excel function - Individual sheets for each Data Gathering tab
  const handleExportToExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Helper function to format currency with Indian comma format
    const formatCurrencyINR = (num) => {
      if (num === null || num === undefined || num === '' || isNaN(num)) return '';
      const n = parseFloat(num);
      if (n === 0) return '0';
      return '₹ ' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    };
    
    // Helper function to auto-fit column widths based on content
    const autoFitColumns = (data) => {
      if (!data || data.length === 0) return [];
      const colWidths = [];
      // Find max width for each column
      data.forEach(row => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, colIdx) => {
          const cellValue = cell !== null && cell !== undefined ? String(cell) : '';
          const cellLength = cellValue.length;
          // Add some padding (1.2x) and set minimum width of 8, max of 50
          const width = Math.min(50, Math.max(8, Math.ceil(cellLength * 1.2)));
          if (!colWidths[colIdx] || width > colWidths[colIdx]) {
            colWidths[colIdx] = width;
          }
        });
      });
      return colWidths.map(wch => ({ wch }));
    };
    
    // Helper function to get member names from IDs
    const getMemberNames = (memberIds) => {
      if (!memberIds || memberIds.length === 0) return 'N/A';
      return memberIds.map(mid => {
        const m = members.find(mem => mem.id === mid || String(mem.id) === String(mid));
        return m?.name || '';
      }).filter(n => n).join(', ') || 'N/A';
    };
    
    // Helper function to get category label
    const getCategoryLabel = (category) => {
      const labels = {
        'salary': 'Salary',
        'business': 'Business Income',
        'rental': 'Rental Income',
        'pension': 'Pension',
        'mutual_fund': 'Mutual Fund',
        'ppf': 'PPF',
        'epf': 'EPF',
        'nps': 'NPS',
        'fd': 'Fixed Deposit',
        'rd_pis': 'RD/PIS',
        'bond': 'Bonds',
        'bonds': 'Bonds',
        'insurance_income': 'Insurance',
        'shares_pms': 'Shares/PMS',
        'gratuity': 'Gratuity',
        'commodities': 'Commodities',
        'cash': 'Cash',
        'vehicle': 'Vehicle',
        'other': 'Other'
      };
      return labels[category] || category || 'Other';
    };
    
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
        
        if (details.maturity_date) {
          const dateStr = details.maturity_date;
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            const year = parts[1];
            maturityYear = year.length === 4 ? parseInt(year) : (parseInt(year) >= 50 ? 1900 + parseInt(year) : 2000 + parseInt(year));
          } else {
            maturityYear = new Date(dateStr).getFullYear();
          }
        } else if (details.maturity_year) {
          maturityYear = parseInt(details.maturity_year);
        }
        
        maturityValue = parseFloat(details.maturity_value) || parseFloat(details.maturity_amount) || 
                       parseFloat(details.expected_maturity) || parseFloat(details.maturity_corpus) || 0;
        
        if (maturityYear && maturityValue === 0) {
          const investmentVal = parseFloat(details.investment_value) || parseFloat(details.investment_amount) || 0;
          const interestRate = parseFloat(details.interest_rate) || parseFloat(details.expected_return) || 0;
          const tenureYears = maturityYear - currentYear;
          if (investmentVal > 0 && tenureYears > 0) {
            maturityValue = investmentVal * Math.pow(1 + interestRate / 100, tenureYears);
          }
        }
        
        if (maturityYear && maturityValue > 0 && maturities[maturityYear]) {
          maturityType = inc.category === 'fd' ? 'FD Maturity' : inc.category === 'bond' ? 'Bond Maturity' :
                        inc.category === 'ppf' ? 'PPF Maturity' : inc.category === 'rd_pis' ? 'RD Maturity' :
                        inc.category === 'insurance_income' ? 'Insurance Maturity' : inc.category === 'nps' ? 'NPS Maturity' :
                        inc.category === 'epf' ? 'EPF Maturity' : inc.category === 'gratuity' ? 'Gratuity' :
                        inc.category === 'mutual_fund' ? 'MF Maturity' : 'Other Maturity';
          
          maturities[maturityYear].total += maturityValue;
          maturities[maturityYear].details.push({ type: maturityType, category: inc.category, value: maturityValue, memberIds: inc.member_ids || [], description: details.description || '' });
        }
      });
      return maturities;
    };
    const maturitiesByYear = getMaturitiesByYear();

    // ========== SHEET 1: MEMBERS ==========
    const membersData = [];
    membersData.push(['FAMILY MEMBERS']);
    membersData.push([]);
    membersData.push(['Name', 'Date of Birth', 'Relation', 'Life Expectancy', 'Retirement Year', 'Tax Status', 'Tax Regime', 'Tax Slab', 'Is Primary']);
    members.forEach(m => {
      membersData.push([
        m.name || '', m.date_of_birth || '', m.is_primary ? 'Primary' : (m.relation || ''),
        m.life_expectancy || '', m.retirement_year || '', m.tax_status || '', m.tax_regime || '', m.tax_slab || '', m.is_primary ? 'Yes' : 'No'
      ]);
    });
    membersData.push([]);
    membersData.push(['Family Name:', family?.family_name || '']);
    membersData.push(['Proceed Option:', family?.proceed_option || '']);
    
    const membersSheet = XLSX.utils.aoa_to_sheet(membersData);
    membersSheet['!cols'] = autoFitColumns(membersData);
    membersSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, membersSheet, "1. Members");

    // ========== SHEET 2: INCOME ==========
    const incomeData = [];
    incomeData.push(['INCOME DETAILS - ALL CATEGORIES']);
    incomeData.push([]);
    
    const incomeCategories = {
      salary: { label: 'SALARY INCOME', headers: ['Member', 'Net Income Monthly', 'Net Income Yearly', 'Increment Month', 'Growth Rate %'] },
      business: { label: 'BUSINESS INCOME', headers: ['Member', 'Net Income Yearly', 'Growth Rate %'] },
      rental: { label: 'PROPERTY/RENTAL INCOME', headers: ['Member', 'Property Type', 'Property Details', 'Investment Amount', 'Investment Date', 'Market Value', 'As On Date', 'XIRR %', 'Is On Rent', 'Rent/Month', 'Annual Rent', 'Start Date', 'End Date', 'Maintenance', 'Property Tax'] },
      ppf: { label: 'PPF', headers: ['Member', 'Market Value', 'Annual Contribution', 'Monthly Contribution', 'Up to Year', 'As On Date', 'Maturity Date', 'Years to Mature'] },
      epf: { label: 'EPF', headers: ['Member', 'Market Value', 'Annual Contribution', 'Monthly Contribution', 'Up to Year', 'As On Date', 'Maturity Date', 'Years to Mature'] },
      gratuity: { label: 'GRATUITY', headers: ['Member', 'Market Value', 'As On Date', 'Maturity Date', 'Years to Mature'] },
      fd: { label: 'FIXED DEPOSITS', headers: ['Member', 'Description', 'Investment Value', 'Investment Date', 'Interest Rate %', 'Payout Frequency', 'Maturity Amount', 'Maturity Date', 'Gross XIRR %'] },
      rd_pis: { label: 'RD/PIS', headers: ['Member', 'Monthly Amount', 'Interest Rate %', 'Start Date', 'End Date', 'Installments', 'Total Investment', 'Maturity Value', 'Gross XIRR %'] },
      pension: { label: 'PENSION', headers: ['Member', 'Description', 'Payout Frequency', 'Amount', 'Yearly Amount', 'Start Date', 'Up to Life', 'End Date', 'Payable To'] },
      bond: { label: 'BONDS', headers: ['Member', 'Description', 'Investment Date', 'Investment Value', 'Payout Frequency', 'Payout Amount', 'Maturity Amount', 'Maturity Date', 'Gross XIRR %'] },
      insurance_income: { label: 'INSURANCE (INCOME)', headers: ['Member', 'Description', 'Premium Frequency', 'Premium Amount', 'Premium Start', 'Premium End', 'Total Paid', 'Total Pending', 'Maturity Date', 'Maturity Amount', 'Gross XIRR %'] },
      mutual_fund: { label: 'MUTUAL FUNDS', headers: ['Member', 'Market Value', 'SIP Amount Monthly', 'Annual SIP Amount', 'Up to Year'] },
      cash: { label: 'CASH IN HAND', headers: ['Member', 'Description', 'Bank Balance'] },
      vehicle: { label: 'VEHICLES', headers: ['Member', 'Description', 'Market Value'] },
      commodities: { label: 'COMMODITIES (Gold/Silver)', headers: ['Member', 'Type', 'Weight (Kg)', 'Price/Kg', 'Market Value'] },
      shares_pms: { label: 'SHARES/PMS', headers: ['Member', 'Market Value', 'Annual Contribution', 'Monthly Contribution', 'Up to Year'] },
      nps: { label: 'NPS', headers: ['Member', 'Current Value', 'Monthly Contribution', 'Annual Contribution', 'Up to Year'] },
      other: { label: 'OTHER INCOME', headers: ['Member', 'Description', 'Value'] }
    };
    
    Object.entries(incomeCategories).forEach(([catKey, catConfig]) => {
      const categoryIncomes = incomeDetails.filter(inc => inc.category === catKey);
      if (categoryIncomes.length > 0) {
        incomeData.push([catConfig.label]);
        incomeData.push(catConfig.headers);
        categoryIncomes.forEach(inc => {
          const d = inc.details || {};
          const memberName = getMemberNames(inc.member_ids);
          let row = [memberName];
          
          switch (catKey) {
            case 'salary':
              row.push(formatCurrencyINR(d.net_income_monthly), formatCurrencyINR(d.net_income_yearly), d.increment_month || '', d.avg_growth_rate || '');
              break;
            case 'business':
              row.push(formatCurrencyINR(d.net_income_yearly), d.avg_growth_rate || '');
              break;
            case 'rental':
              row.push(d.property_type || '', d.property_details || '', formatCurrencyINR(d.investment_amount), d.investment_date || '', formatCurrencyINR(d.market_value), d.market_value_date || '', d.xirr_return || '', d.is_on_rent || '', formatCurrencyINR(d.rent_per_month), formatCurrencyINR(d.annual_rent), d.start_date || '', d.end_date || '', formatCurrencyINR(d.maintenance), formatCurrencyINR(d.property_tax));
              break;
            case 'ppf':
            case 'epf':
              row.push(formatCurrencyINR(d.market_value), formatCurrencyINR(d.annual_contribution), formatCurrencyINR(d.monthly_contribution), d.upto_year || '', d.as_on_date || '', d.maturity_date || '', d.year_to_mature || '');
              break;
            case 'gratuity':
              row.push(formatCurrencyINR(d.market_value), d.as_on_date || '', d.maturity_date || '', d.year_to_mature || '');
              break;
            case 'fd':
              row.push(d.description || '', formatCurrencyINR(d.investment_value), d.investment_date || '', d.interest_rate || '', d.payable_cycle || '', formatCurrencyINR(d.maturity_amount), d.maturity_date || '', d.gross_xirr || '');
              break;
            case 'rd_pis':
              row.push(formatCurrencyINR(d.investment_value_monthly), d.interest_rate || '', d.start_date || '', d.end_date || '', d.num_installments || '', formatCurrencyINR(d.investment_value), formatCurrencyINR(d.maturity_value), d.gross_xirr || '');
              break;
            case 'pension':
              row.push(d.description || '', d.payable_type || '', formatCurrencyINR(d.amount), formatCurrencyINR(d.amount_yearly), d.start_date || '', d.upto_life || '', d.end_date || '', d.payable_to_relation || '');
              break;
            case 'bond':
              row.push(d.description || '', d.investment_date || '', formatCurrencyINR(d.investment_value), d.payout_frequency || '', formatCurrencyINR(d.payout_amount), formatCurrencyINR(d.maturity_amount), d.maturity_date || '', d.gross_xirr || '');
              break;
            case 'insurance_income':
              row.push(d.description || '', d.premium_frequency || '', formatCurrencyINR(d.premium_amount), d.premium_start_date || '', d.premium_end_date || '', formatCurrencyINR(d.total_paid), formatCurrencyINR(d.total_pending), d.maturity_date || '', formatCurrencyINR(d.maturity_amount), d.gross_xirr || '');
              break;
            case 'mutual_fund':
              row.push(formatCurrencyINR(d.market_value), formatCurrencyINR(d.sip_amount), formatCurrencyINR(d.annual_sip_amount), d.upto_year || '');
              break;
            case 'cash':
              row.push(d.description || '', formatCurrencyINR(d.bank_balance));
              break;
            case 'vehicle':
              row.push(d.description || '', formatCurrencyINR(d.market_value));
              break;
            case 'commodities':
              row.push(d.commodity_type || '', d.weight_kg || '', formatCurrencyINR(d.price_per_kg), formatCurrencyINR(d.market_value));
              break;
            case 'shares_pms':
              row.push(formatCurrencyINR(d.market_value), formatCurrencyINR(d.annual_contribution), formatCurrencyINR(d.monthly_contribution), d.upto_year || '');
              break;
            case 'nps':
              row.push(formatCurrencyINR(d.current_value), formatCurrencyINR(d.monthly_contribution), formatCurrencyINR(d.annual_contribution), d.upto_year || '');
              break;
            default:
              row.push(d.description || '', formatCurrencyINR(d.market_value || d.value));
          }
          incomeData.push(row);
        });
        incomeData.push([]);
      }
    });
    
    const incomeSheet = XLSX.utils.aoa_to_sheet(incomeData);
    incomeSheet['!cols'] = autoFitColumns(incomeData);
    incomeSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, incomeSheet, "2. Income");

    // ========== SHEET 3: EXPENSES (All expense categories with section headers) ==========
    const expensesData = [];
    expensesData.push(['EXPENSE DETAILS']);
    expensesData.push([]);
    
    // Regular Expenses Section
    const regularExpenses = expenseDetails.filter(e => !['term_life', 'health', 'critical_illness', 'personal_accident', 'motor', 'home_insurance', 'professional', 'home_loan', 'vehicle_loan', 'personal_loan', 'consumer_durable', 'education_loan', 'credit_card', 'other_loan'].includes(e.expense_type));
    if (regularExpenses.length > 0) {
      expensesData.push(['REGULAR EXPENSES']);
      expensesData.push(['Category', 'Member', 'Monthly Amount', 'Annual Amount', 'Inflation %', 'Up to Year', 'Post Retirement', 'Post Ret. %']);
      regularExpenses.forEach(exp => {
        const memberIds = exp.member_ids || [];
        const memberName = memberIds.includes('family') || memberIds.length === 0 ? 'Family' : getMemberNames(memberIds);
        const categoryLabel = (exp.expense_type || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        expensesData.push([categoryLabel, memberName, formatCurrencyINR(exp.monthly_amount), formatCurrencyINR(exp.annual_amount), exp.inflation_percent ?? 5, exp.upto_year || '', exp.consider_post_retirement ? 'Yes' : 'No', exp.post_retirement_percent ?? 100]);
      });
      expensesData.push([]);
    }
    
    // Insurance Premiums Section (within Expenses sheet)
    const insuranceExpensesForSheet = expenseDetails.filter(e => ['term_life', 'health', 'critical_illness', 'personal_accident', 'motor', 'home_insurance', 'professional'].includes(e.expense_type));
    if (insuranceExpensesForSheet.length > 0) {
      expensesData.push(['INSURANCE PREMIUMS']);
      expensesData.push(['Type', 'Member', 'Yearly Premium', 'Up to Year', 'Coverage Amount']);
      insuranceExpensesForSheet.forEach(exp => {
        const memberName = getMemberNames(exp.member_ids);
        const categoryLabel = (exp.expense_type || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        expensesData.push([categoryLabel, memberName, formatCurrencyINR(exp.yearly_premium || exp.annual_amount), exp.upto_year || '', formatCurrencyINR(exp.coverage_amount)]);
      });
      expensesData.push([]);
    }
    
    // Loan EMIs Section (within Expenses sheet)
    const loanExpensesForSheet = expenseDetails.filter(e => ['home_loan', 'vehicle_loan', 'personal_loan', 'consumer_durable', 'education_loan', 'credit_card', 'other_loan'].includes(e.expense_type));
    if (loanExpensesForSheet.length > 0) {
      expensesData.push(['LOAN EMIs / LIABILITIES']);
      expensesData.push(['Loan Type', 'Member', 'Monthly EMI', 'Installments Remaining', 'Outstanding Amount', 'Completion Year']);
      loanExpensesForSheet.forEach(exp => {
        const memberName = getMemberNames(exp.member_ids);
        const categoryLabel = (exp.expense_type || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const outstanding = (parseFloat(exp.monthly_emi || 0) * parseFloat(exp.num_installments || 0));
        const completionYear = currentYear + Math.ceil(parseFloat(exp.num_installments || 0) / 12);
        expensesData.push([categoryLabel, memberName, formatCurrencyINR(exp.monthly_emi), exp.num_installments || '', formatCurrencyINR(outstanding), completionYear || '']);
      });
      expensesData.push([]);
    }
    
    // If no expenses at all
    if (regularExpenses.length === 0 && insuranceExpensesForSheet.length === 0 && loanExpensesForSheet.length === 0) {
      expensesData.push(['No expenses recorded']);
    }
    
    const expensesSheet = XLSX.utils.aoa_to_sheet(expensesData);
    expensesSheet['!cols'] = autoFitColumns(expensesData);
    expensesSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, expensesSheet, "3. Expenses");

    // ========== SHEET 4: GOALS (Year-wise Inflation Adjusted Timeline) ==========
    const goalsData = [];
    goalsData.push(['FINANCIAL GOALS - INFLATION ADJUSTED TIMELINE']);
    goalsData.push([]);
    
    // Find all unique goal years to determine the range
    const allGoalYears = new Set();
    goalDetails.forEach(goal => {
      const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year] : []);
      goalYears.forEach(y => allGoalYears.add(parseInt(y)));
    });
    const sortedGoalYears = [...allGoalYears].sort((a, b) => a - b);
    const goalYearsRange = sortedGoalYears.length > 0 ? sortedGoalYears : [currentYear];
    
    // Create header row with years
    goalsData.push(['Goal Name', 'Category', 'Member', 'Current Value', 'Inflation %', ...goalYearsRange.map(y => y.toString())]);
    
    // Add each goal with its inflation-adjusted value in the target year(s)
    goalDetails.forEach(goal => {
      const memberName = getMemberNames(goal.member_ids);
      const categoryLabel = (goal.category || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const baseAmount = parseFloat(goal.goal_amount) || 0;
      const inflationRate = parseFloat(goal.inflation_percent) || 0;
      const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
      
      const yearValues = goalYearsRange.map(year => {
        if (goalYears.includes(year.toString()) || goalYears.includes(year)) {
          const yearsFromNow = year - currentYear;
          const inflatedAmount = baseAmount * Math.pow(1 + inflationRate / 100, yearsFromNow);
          return formatCurrencyINR(Math.round(inflatedAmount));
        }
        return '';
      });
      
      goalsData.push([
        goal.name || goal.goal_name || '',
        categoryLabel,
        memberName,
        formatCurrencyINR(baseAmount),
        inflationRate || 0,
        ...yearValues
      ]);
    });
    
    // Add total row
    goalsData.push([]);
    const totalRow = ['TOTAL (Inflation Adjusted)', '', '', '', ''];
    goalYearsRange.forEach(year => {
      let yearTotal = 0;
      goalDetails.forEach(goal => {
        const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
        if (goalYears.includes(year.toString()) || goalYears.includes(year)) {
          const baseAmount = parseFloat(goal.goal_amount) || 0;
          const inflationRate = parseFloat(goal.inflation_percent) || 0;
          const yearsFromNow = year - currentYear;
          yearTotal += baseAmount * Math.pow(1 + inflationRate / 100, yearsFromNow);
        }
      });
      totalRow.push(yearTotal > 0 ? formatCurrencyINR(Math.round(yearTotal)) : '');
    });
    goalsData.push(totalRow);
    
    const goalsSheet = XLSX.utils.aoa_to_sheet(goalsData);
    goalsSheet['!cols'] = autoFitColumns(goalsData);
    goalsSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, goalsSheet, "4. Goals");

    // ========== SHEET 5: INVESTMENTS ==========
    const investmentsData = [];
    investmentsData.push(['INVESTMENT SUMMARY']);
    investmentsData.push([]);
    investmentsData.push(['Source', 'Category', 'Member', 'Annual Amount', 'Up to Year']);
    combinedInvestments.forEach(inv => {
      const memberName = members.find(m => m.id === inv.member_id)?.name || '';
      const categoryLabel = getCategoryLabel(inv.category) || inv.category || 'Other';
      const source = inv.isFromIncome ? 'From Income' : 'Direct Investment';
      investmentsData.push([source, categoryLabel, memberName, formatCurrencyINR(inv.annual_amount), inv.upto_year || '']);
    });
    investmentsData.push([]);
    
    investmentsData.push(['INVESTMENT SUMMARY BY CATEGORY']);
    investmentsData.push(['Category', 'Total Annual Amount']);
    const investmentByCategory = {};
    combinedInvestments.forEach(inv => {
      const cat = getCategoryLabel(inv.category) || 'Other';
      if (!investmentByCategory[cat]) investmentByCategory[cat] = 0;
      investmentByCategory[cat] += parseFloat(inv.annual_amount) || 0;
    });
    Object.entries(investmentByCategory).forEach(([cat, total]) => {
      investmentsData.push([cat, formatCurrencyINR(total)]);
    });
    
    const investmentsSheet = XLSX.utils.aoa_to_sheet(investmentsData);
    investmentsSheet['!cols'] = autoFitColumns(investmentsData);
    investmentsSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, investmentsSheet, "5. Investments");

    // ========== SHEET 6: INSURANCE ==========
    const insuranceData = [];
    insuranceData.push(['INSURANCE DETAILS']);
    insuranceData.push([]);
    
    const insuranceExpenses = expenseDetails.filter(e => ['term_life', 'health', 'critical_illness', 'personal_accident', 'motor', 'home_insurance', 'professional'].includes(e.expense_type));
    
    if (insuranceExpenses.length > 0) {
      insuranceData.push(['INSURANCE PREMIUMS']);
      insuranceData.push(['Type', 'Member', 'Yearly Premium', 'Up to Year', 'Coverage Amount']);
      insuranceExpenses.forEach(exp => {
        const memberName = getMemberNames(exp.member_ids);
        const categoryLabel = (exp.expense_type || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        insuranceData.push([categoryLabel, memberName, formatCurrencyINR(exp.yearly_premium || exp.annual_amount), exp.upto_year || '', formatCurrencyINR(exp.coverage_amount)]);
      });
      insuranceData.push([]);
      
      // Summary
      insuranceData.push(['INSURANCE SUMMARY']);
      const insuranceSummary = {};
      insuranceExpenses.forEach(exp => {
        const type = (exp.expense_type || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        if (!insuranceSummary[type]) {
          insuranceSummary[type] = { totalPremium: 0, totalCoverage: 0, count: 0 };
        }
        insuranceSummary[type].totalPremium += parseFloat(exp.yearly_premium || exp.annual_amount) || 0;
        insuranceSummary[type].totalCoverage += parseFloat(exp.coverage_amount) || 0;
        insuranceSummary[type].count += 1;
      });
      insuranceData.push(['Type', 'Count', 'Total Annual Premium', 'Total Coverage']);
      Object.entries(insuranceSummary).forEach(([type, data]) => {
        insuranceData.push([type, data.count, formatCurrencyINR(data.totalPremium), formatCurrencyINR(data.totalCoverage)]);
      });
    } else {
      insuranceData.push(['No insurance records found']);
    }
    
    const insuranceSheet = XLSX.utils.aoa_to_sheet(insuranceData);
    insuranceSheet['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];
    insuranceSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, insuranceSheet, "6. Insurance");

    // ========== SHEET 7: LIABILITIES ==========
    const liabilitiesData = [];
    liabilitiesData.push(['LIABILITIES / LOANS']);
    liabilitiesData.push([]);
    
    const loanExpenses = expenseDetails.filter(e => ['home_loan', 'vehicle_loan', 'personal_loan', 'consumer_durable', 'education_loan', 'credit_card', 'other_loan'].includes(e.expense_type));
    
    if (loanExpenses.length > 0) {
      liabilitiesData.push(['LOAN EMIs']);
      liabilitiesData.push(['Loan Type', 'Member', 'Monthly EMI', 'Installments Remaining', 'Outstanding Amount', 'Completion Year']);
      loanExpenses.forEach(exp => {
        const memberName = getMemberNames(exp.member_ids);
        const categoryLabel = (exp.expense_type || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const outstanding = (parseFloat(exp.monthly_emi || 0) * parseFloat(exp.num_installments || 0));
        const completionYear = currentYear + Math.ceil(parseFloat(exp.num_installments || 0) / 12);
        liabilitiesData.push([categoryLabel, memberName, formatCurrencyINR(exp.monthly_emi), exp.num_installments || '', formatCurrencyINR(outstanding), completionYear || '']);
      });
      liabilitiesData.push([]);
      
      // Summary
      liabilitiesData.push(['LIABILITIES SUMMARY']);
      const totalMonthlyEMI = loanExpenses.reduce((sum, exp) => sum + (parseFloat(exp.monthly_emi) || 0), 0);
      const totalOutstanding = loanExpenses.reduce((sum, exp) => sum + ((parseFloat(exp.monthly_emi || 0) * parseFloat(exp.num_installments || 0))), 0);
      liabilitiesData.push(['Total Monthly EMI', formatCurrencyINR(totalMonthlyEMI)]);
      liabilitiesData.push(['Total Annual EMI', formatCurrencyINR(totalMonthlyEMI * 12)]);
      liabilitiesData.push(['Total Outstanding', formatCurrencyINR(totalOutstanding)]);
    } else {
      liabilitiesData.push(['No liabilities/loans recorded']);
    }
    
    const liabilitiesSheet = XLSX.utils.aoa_to_sheet(liabilitiesData);
    liabilitiesSheet['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 15 }];
    liabilitiesSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, liabilitiesSheet, "7. Liabilities");

    // ========== SHEET 8: ASSETS ==========
    const assetsData = [];
    assetsData.push(['ASSETS SUMMARY']);
    assetsData.push([]);
    
    // Group assets by category from income details
    const assetCategories = ['mutual_fund', 'ppf', 'epf', 'nps', 'fd', 'rd_pis', 'bond', 'shares_pms', 'commodities', 'cash', 'vehicle', 'rental'];
    
    assetCategories.forEach(assetCat => {
      const categoryAssets = incomeDetails.filter(inc => inc.category === assetCat);
      if (categoryAssets.length > 0) {
        const categoryLabel = getCategoryLabel(assetCat).toUpperCase();
        assetsData.push([categoryLabel]);
        
        switch (assetCat) {
          case 'mutual_fund':
          case 'shares_pms':
          case 'nps':
            assetsData.push(['Member', 'Market Value', 'Monthly Contribution', 'Annual Contribution']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), formatCurrencyINR(d.market_value || d.current_value), formatCurrencyINR(d.monthly_contribution || d.sip_amount), formatCurrencyINR(d.annual_contribution || d.annual_sip_amount)]);
            });
            break;
          case 'ppf':
          case 'epf':
            assetsData.push(['Member', 'Market Value', 'Annual Contribution', 'Maturity Date']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), formatCurrencyINR(d.market_value), formatCurrencyINR(d.annual_contribution), d.maturity_date || '']);
            });
            break;
          case 'fd':
          case 'rd_pis':
          case 'bond':
            assetsData.push(['Member', 'Description', 'Investment Value', 'Maturity Amount', 'Maturity Date']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), d.description || '', formatCurrencyINR(d.investment_value), formatCurrencyINR(d.maturity_amount || d.maturity_value), d.maturity_date || '']);
            });
            break;
          case 'commodities':
            assetsData.push(['Member', 'Type', 'Weight (Kg)', 'Market Value']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), d.commodity_type || '', d.weight_kg || '', formatCurrencyINR(d.market_value)]);
            });
            break;
          case 'cash':
            assetsData.push(['Member', 'Description', 'Bank Balance']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), d.description || '', formatCurrencyINR(d.bank_balance)]);
            });
            break;
          case 'vehicle':
            assetsData.push(['Member', 'Description', 'Market Value']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), d.description || '', formatCurrencyINR(d.market_value)]);
            });
            break;
          case 'rental':
            assetsData.push(['Member', 'Property Type', 'Investment Amount', 'Market Value']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), d.property_type || '', formatCurrencyINR(d.investment_amount), formatCurrencyINR(d.market_value)]);
            });
            break;
          default:
            assetsData.push(['Member', 'Value']);
            categoryAssets.forEach(inc => {
              const d = inc.details || {};
              assetsData.push([getMemberNames(inc.member_ids), formatCurrencyINR(d.market_value || d.value)]);
            });
        }
        assetsData.push([]);
      }
    });
    
    // Total Assets Summary
    assetsData.push(['TOTAL ASSETS SUMMARY']);
    assetsData.push(['Category', 'Total Value']);
    let grandTotalAssets = 0;
    assetCategories.forEach(assetCat => {
      const categoryAssets = incomeDetails.filter(inc => inc.category === assetCat);
      if (categoryAssets.length > 0) {
        const totalValue = categoryAssets.reduce((sum, inc) => {
          const d = inc.details || {};
          return sum + (parseFloat(d.market_value) || parseFloat(d.current_value) || parseFloat(d.bank_balance) || parseFloat(d.investment_value) || 0);
        }, 0);
        grandTotalAssets += totalValue;
        assetsData.push([getCategoryLabel(assetCat), formatCurrencyINR(totalValue)]);
      }
    });
    assetsData.push(['GRAND TOTAL', formatCurrencyINR(grandTotalAssets)]);
    
    const assetsSheet = XLSX.utils.aoa_to_sheet(assetsData);
    assetsSheet['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 15 }];
    assetsSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, assetsSheet, "8. Assets");

    // ========== SHEET 9: SURPLUS / CASH FLOW ==========
    const cashFlowData = [];
    const pAge = calculateAge(members.find(m => m.is_primary)?.date_of_birth);
    
    cashFlowData.push(['YEAR-WISE CASH FLOW PROJECTION']);
    cashFlowData.push([]);
    
    cashFlowData.push(['Description', '', ...allYears]);
    cashFlowData.push(['Age', '', ...allYears.map(y => pAge + (y - currentYear))]);
    cashFlowData.push([]);
    
    // INCOME Section
    cashFlowData.push(['=== INCOME ===']);
    members.forEach(m => {
      cashFlowData.push([`${m.name} - Salary/Business`, '', ...allYears.map(y => {
        const info = getMemberIncomeInfo(m.id);
        const targetYear = parseInt(y);
        const yearsFromNow = targetYear - currentYear;
        const isPostRetirement = targetYear >= info.retirementYear;
        if (isPostRetirement) return 0;
        if (yearsFromNow <= 0) return Math.round(info.baseSalary + info.baseBusiness);
        const salary = info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow);
        const business = info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow);
        return Math.round(salary + business);
      })]);
      cashFlowData.push([`${m.name} - Rental`, '', ...allYears.map(y => {
        const info = getMemberIncomeInfo(m.id);
        const yearsFromNow = y - currentYear;
        if (yearsFromNow <= 0) return Math.round(info.baseRental);
        return Math.round(info.baseRental * Math.pow(1 + info.rentalGrowth / 100, yearsFromNow));
      })]);
      cashFlowData.push([`${m.name} - Pension`, '', ...allYears.map(() => {
        const info = getMemberIncomeInfo(m.id);
        return Math.round(info.basePension);
      })]);
    });
    cashFlowData.push(['TOTAL INCOME', '', ...allYears.map(y => {
      return Math.round(members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, y.toString()), 0));
    })]);
    cashFlowData.push([]);
    
    // EXPENSES Section
    cashFlowData.push(['=== EXPENSES (by Category) ===']);
    const uniqueExpenseCategories = [...new Set(expenseDetails.map(e => e.expense_type || 'other'))];
    uniqueExpenseCategories.forEach(expCat => {
      const categoryExpenses = expenseDetails.filter(e => e.expense_type === expCat);
      const categoryLabel = (expCat || 'other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      cashFlowData.push([categoryLabel, '', ...allYears.map(y => {
        const targetYear = parseInt(y);
        const yearsFromNow = targetYear - currentYear;
        let totalForCategory = 0;
        categoryExpenses.forEach(exp => {
          const uptoYear = parseInt(exp.upto_year) || endYear;
          if (targetYear > uptoYear) return;
          const baseAnnual = parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) * 12) || 0;
          const inflationRate = parseFloat(exp.inflation_percent) ?? 5;
          let inflatedAmount = baseAnnual;
          if (yearsFromNow > 0) inflatedAmount = baseAnnual * Math.pow(1 + inflationRate / 100, yearsFromNow);
          const memberIds = exp.member_ids || [];
          const isFamilyExpense = memberIds.includes('family') || memberIds.length === 0;
          if (!isFamilyExpense && exp.consider_post_retirement) {
            const isAnyMemberRetired = memberIds.some(mid => {
              const info = getMemberIncomeInfo(mid);
              return targetYear >= info.retirementYear;
            });
            if (isAnyMemberRetired) inflatedAmount = inflatedAmount * (parseFloat(exp.post_retirement_percent) || 100) / 100;
          }
          totalForCategory += inflatedAmount;
        });
        return Math.round(totalForCategory);
      })]);
    });
    cashFlowData.push(['TOTAL EXPENSES', '', ...allYears.map(y => {
      return Math.round(members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, y.toString()), 0));
    })]);
    cashFlowData.push([]);
    
    // GOALS Section
    cashFlowData.push(['=== GOALS ===']);
    goalDetails.forEach(goal => {
      const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
      cashFlowData.push([goal.name || goal.goal_name || goal.category || 'Goal', '', ...allYears.map(y => {
        if (goalYears.includes(y.toString())) {
          const yearsFromNow = y - currentYear;
          const baseAmount = parseFloat(goal.goal_amount) || 0;
          const inflationRate = parseFloat(goal.inflation_percent) || 0;
          return Math.round(baseAmount * Math.pow(1 + inflationRate / 100, yearsFromNow));
        }
        return 0;
      })]);
    });
    cashFlowData.push(['TOTAL GOALS', '', ...allYears.map(y => {
      return Math.round(members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, y.toString()), 0));
    })]);
    cashFlowData.push([]);
    
    // INVESTMENTS Section
    cashFlowData.push(['=== INVESTMENTS ===']);
    cashFlowData.push(['Total Annual Investments', '', ...allYears.map(y => {
      return Math.round(members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, y.toString()), 0));
    })]);
    cashFlowData.push([]);
    
    // MATURITIES Section
    cashFlowData.push(['=== MATURITIES / CASH INFLOWS ===']);
    const maturityTypes = {};
    Object.values(maturitiesByYear).forEach(yearData => {
      yearData.details.forEach(d => {
        if (!maturityTypes[d.type]) maturityTypes[d.type] = {};
      });
    });
    Object.keys(maturityTypes).forEach(type => {
      cashFlowData.push([type, '', ...allYears.map(y => {
        const yearMaturities = maturitiesByYear[y]?.details || [];
        return Math.round(yearMaturities.filter(d => d.type === type).reduce((sum, d) => sum + d.value, 0));
      })]);
    });
    cashFlowData.push(['TOTAL MATURITIES', '', ...allYears.map(y => Math.round(maturitiesByYear[y]?.total || 0))]);
    cashFlowData.push([]);
    
    // SURPLUS Section
    cashFlowData.push(['=== SURPLUS (Income - Expenses - Goals - Investments) ===']);
    cashFlowData.push(['SURPLUS', '', ...allYears.map(y => {
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, y.toString()), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, y.toString()), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, y.toString()), 0);
      const totalInvestments = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, y.toString()), 0);
      return formatCurrencyINR(totalIncome - totalExpenses - totalGoals - totalInvestments);
    })]);
    
    const cashFlowSheet = XLSX.utils.aoa_to_sheet(cashFlowData);
    cashFlowSheet['!cols'] = [{ wch: 45 }, { wch: 5 }, ...allYears.map(() => ({ wch: 14 }))];
    cashFlowSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, cashFlowSheet, "9. Surplus");

    // Generate and download file
    const familyName = family?.family_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Financial_Plan';
    const fileName = `${familyName}_Financial_Plan.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), fileName);
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
      {/* Cash Flow Header Card */}
      <Card className="border border-gray-200 shadow-sm">
        <CardHeader className="pb-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-gray-100">
          <CardTitle className="text-sm flex items-center gap-2 text-gray-800">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            Year-wise Cash Flow Projection
          </CardTitle>
          <p className="text-[11px] text-gray-500 mt-1">
            Comprehensive cash flow analysis with member-wise breakdown. Growth rates from Income section, inflation rates from Expenses section.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {/* Main Projection Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {/* Year Selection Row */}
                <tr className="bg-gray-50 border-b border-gray-200">
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
                      <div className="h-6 flex items-center justify-center text-[11px] font-semibold text-emerald-700">
                        {year} (Base)
                      </div>
                    ) : (
                      <Select value={year} onValueChange={(v) => handleYearChange(idx, v)}>
                        <SelectTrigger className="h-6 text-[11px] w-full border-0 bg-transparent shadow-none justify-center font-semibold text-emerald-700">
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
            {/* Income Row (includes regular income + maturities) */}
            <tr className="bg-green-50/30 hover:bg-green-50/50">
              <td className="px-3 py-2 border-r border-gray-100">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-xs font-medium text-gray-800">Income</span>
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-gray-400 cursor-help hover:text-blue-500" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-[250px]">
                        <p>Projected income including salary, business, rental, pension & maturity amounts (Insurance, FD, PPF, EPF, Bonds) on their maturity dates.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                const yearInt = parseInt(year);
                const yearMaturities = maturitiesByYear[yearInt] || { total: 0, details: [] };
                const regularTotal = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, year), 0);
                const total = regularTotal + yearMaturities.total;
                return (
                  <React.Fragment key={`income-${year}`}>
                    {members.map((member) => {
                      const breakdown = getMemberIncomeBreakdown(member.id, year);
                      const regularValue = getProjectedMemberIncome(member.id, year);
                      // Calculate member's share of maturities
                      const memberMaturities = yearMaturities.details
                        .filter(d => d.memberIds.includes(member.id) || d.memberIds.length === 0)
                        .reduce((sum, d) => {
                          const share = d.memberIds.length > 0 ? d.value / d.memberIds.length : d.value / members.length;
                          return sum + share;
                        }, 0);
                      const value = regularValue + memberMaturities;
                      return (
                        <td key={`income-${year}-${member.id}`} className="px-1 py-2 text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-green-700 cursor-help">{formatAmount(value)}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-[220px]">
                                <div className="space-y-1">
                                  <div className="font-semibold border-b pb-1">{member.name} - {year}</div>
                                  {breakdown.salary > 0 && <div>Salary: {formatAmount(breakdown.salary)}</div>}
                                  {breakdown.business > 0 && <div>Business: {formatAmount(breakdown.business)}</div>}
                                  {breakdown.rental > 0 && <div>Rental: {formatAmount(breakdown.rental)}</div>}
                                  {breakdown.pension > 0 && <div>Pension: {formatAmount(breakdown.pension)}</div>}
                                  {memberMaturities > 0 && (
                                    <>
                                      <div className="border-t pt-1 mt-1 font-semibold">Maturities:</div>
                                      {yearMaturities.details
                                        .filter(d => d.memberIds.includes(member.id) || d.memberIds.length === 0)
                                        .map((d, i) => (
                                          <div key={i}>{d.type}{d.description ? ` (${d.description})` : ''}: {formatAmount(d.value)}</div>
                                        ))}
                                    </>
                                  )}
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
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-gray-400 cursor-help hover:text-blue-500" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-[220px]">
                        <p>Projected expenses with inflation applied per category from Expenses section.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-gray-400 cursor-help hover:text-blue-500" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-[220px]">
                          <p>Future goals with inflation applied. Amounts shown are inflated values at goal year.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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

            {/* Investments Row */}
            <tr className="hover:bg-gray-50">
              <td className="px-3 py-2 border-r border-gray-100">
                <div className="flex items-center gap-1">
                  <Landmark className="h-3 w-3 text-indigo-600" />
                  <span className="text-xs font-medium text-gray-800">Investments</span>
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-gray-400 cursor-help hover:text-blue-500" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-[220px]">
                        <p>Recurring investments like SIP, PPF, NPS from Investments section.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                const total = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, year), 0);
                return (
                  <React.Fragment key={`inv-${year}`}>
                    {members.map((member) => {
                      const breakdown = getMemberInvestmentBreakdown(member.id, year);
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
                  <TooltipProvider>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-emerald-600 cursor-help hover:text-emerald-800" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-[220px]">
                        <p>Surplus = Income - Expenses - Goals - Investments</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </td>
              {displayYears.map((year, yearIdx) => {
                const yearInt = parseInt(year);
                const yearMaturities = maturitiesByYear[yearInt] || { total: 0, details: [] };
                return (
                  <React.Fragment key={`sur-${year}`}>
                    {members.map((member) => {
                      const inc = getProjectedMemberIncome(member.id, year);
                      const exp = getProjectedMemberExpenses(member.id, year);
                      const goal = getMemberGoalExpenses(member.id, year);
                      const inv = getProjectedMemberInvestments(member.id, year);
                      // Include member's share of maturities in income
                      const memberMaturities = yearMaturities.details
                        .filter(d => d.memberIds.includes(member.id) || d.memberIds.length === 0)
                        .reduce((sum, d) => {
                          const share = d.memberIds.length > 0 ? d.value / d.memberIds.length : d.value / members.length;
                          return sum + share;
                        }, 0);
                      const sur = (inc + memberMaturities) - exp - goal - inv;
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
                        }, 0) + yearMaturities.total;
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
      <div className="flex items-center justify-between text-[10px] text-gray-400 px-4 py-2 bg-gray-50 border-t border-gray-100">
        <span>* Primary member | (R) Retirement year | 🎯 Goal year</span>
        <span>Click year dropdown to change</span>
      </div>
        </CardContent>
      </Card>

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
        expenseDetails={expenseDetails}
        goalDetails={goalDetails}
        investmentDetails={investmentDetails}
        primaryAge={primaryAge}
        lifeExpectancy={lifeExpectancy}
        calculateAge={calculateAge}
        handleExportToExcel={handleExportToExcel}
      />
    </div>
  );
}

// Allocation Simulator Component - Table-based design for Family & Individual calculations
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
  expenseDetails,
  goalDetails,
  investmentDetails,
  primaryAge,
  lifeExpectancy,
  calculateAge,
  handleExportToExcel
}) {
  // State for family-level allocation
  const [familyAllocation, setFamilyAllocation] = useState({
    equity: 80,
    debt: 20,
    equityReturn: 12,
    debtReturn: 7,
    includeAssets: false,
    selectedAssets: {},
    assetStartYears: {},  // Per-asset start year
    assetAmounts: {},     // Custom amounts for assets
    result: null,
    lastCalculated: null
  });

  // State for individual member allocations
  const [memberAllocations, setMemberAllocations] = useState({});
  
  // State for asset selection modal
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [assetModalEntity, setAssetModalEntity] = useState(null); // 'family' or member id

  // Generate year options
  const yearOptions = [];
  for (let y = currentYear; y <= endYear; y++) {
    yearOptions.push(y);
  }

  // Categories with maturity dates are debt instruments - exclude from allocation simulator
  const DEBT_CATEGORIES_WITH_MATURITY = ['fd', 'bonds', 'bond', 'rd_pis', 'insurance_income', 'ppf', 'nps', 'epf', 'gratuity'];

  // Get assets for a specific member or family
  const getAssetsForEntity = (entityId) => {
    const assets = [];
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      const hasMaturityDate = details.maturity_date || details.maturity_year || details.maturity_amount;
      const isDebtCategory = DEBT_CATEGORIES_WITH_MATURITY.includes(inc.category);
      
      if (isDebtCategory && hasMaturityDate) return;
      
      // Check for different value fields based on category
      let mktValue = 0;
      if (inc.category === 'cash') {
        // Cash In Hand uses bank_balance
        mktValue = parseFloat(details.bank_balance) || 0;
      } else {
        mktValue = parseFloat(details.market_value) || parseFloat(details.current_value) || 
                   parseFloat(details.investment_value) || parseFloat(details.balance) || 0;
      }
      
      if (mktValue > 0) {
        const memberIds = inc.member_ids || [];
        // For family, include all assets; for individual, include only their assets
        if (entityId === 'family' || memberIds.includes(entityId)) {
          assets.push({
            id: inc.id,
            category: inc.category,
            label: getCategoryLabel(inc.category),
            memberIds: memberIds,
            value: entityId === 'family' ? mktValue : mktValue / Math.max(1, memberIds.length),
            selected: true
          });
        }
      }
    });
    return assets;
  };

  const getCategoryLabel = (category) => {
    const labels = {
      salary: 'Salary Assets', business: 'Business', rental: 'Real Estate',
      mutual_fund: 'Mutual Funds', shares_pms: 'Stocks/PMS', fd: 'Fixed Deposits',
      bonds: 'Bonds', ppf: 'PPF', epf: 'EPF', nps: 'NPS', rd_pis: 'RD',
      commodities: 'Gold/Commodities', insurance_income: 'Insurance', 
      cash: 'Cash In Hand', vehicle: 'Vehicle'
    };
    return labels[category] || category;
  };

  const formatLargeNumber = (num) => {
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
    return num.toLocaleString('en-IN');
  };

  // Simple Text Result Display Component
  const WealthChart = ({ result, entityName }) => {
    if (!result) {
      return null;
    }

    const { success, finalCorpus, lastYear, yearsShort, entityEndYear, lifeExpectancy } = result;
    
    // Calculate years short of youngest member's life expectancy
    const youngestMemberEndYear = Math.max(...members.map(m => {
      const age = calculateAge(m.date_of_birth);
      const lifeExp = parseInt(m.life_expectancy) || 85;
      return currentYear + (lifeExp - age);
    }));
    
    const yearsFromLifeExpectancy = youngestMemberEndYear - lastYear;
    const meetsLifeExpectancy = lastYear >= youngestMemberEndYear;

    return (
      <div className="mt-2 flex items-center justify-center gap-2">
        {success ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        )}
        <span className={`text-xs font-semibold ${success ? 'text-green-600' : 'text-red-600'}`}>
          {success ? `Lasts till ${lastYear}` : `Exhausts in ${lastYear}`}
        </span>
        {!meetsLifeExpectancy && (
          <span className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded font-semibold">
            {yearsFromLifeExpectancy}y short of life expectancy ({youngestMemberEndYear})
          </span>
        )}
        {meetsLifeExpectancy && success && (
          <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded">
            Covers life expectancy
          </span>
        )}
      </div>
    );
  };

  // Initialize member allocations
  React.useEffect(() => {
    const initial = {};
    members.forEach(m => {
      initial[m.id] = {
        equity: 60,
        debt: 40,
        equityReturn: 12,
        debtReturn: 0,
        includeAssets: false,
        selectedAssets: {},
        assetStartYears: {},  // Per-asset start year
        assetAmounts: {},     // Custom amounts for assets
        result: null,
        lastCalculated: null
      };
    });
    setMemberAllocations(initial);
  }, [members]);

  // Run simulation for an entity (family or individual member)
  const runSimulation = (entityId) => {
    console.log('runSimulation called for:', entityId);
    const isFamily = entityId === 'family';
    const allocation = isFamily ? familyAllocation : memberAllocations[entityId];
    console.log('allocation:', allocation);
    if (!allocation) {
      console.log('No allocation found, returning');
      return;
    }

    const { equity, debt, equityReturn, debtReturn, includeAssets, selectedAssets, assetStartYears, assetAmounts } = allocation;
    const weightedReturn = (equity * equityReturn + debt * debtReturn) / 100;
    
    // Calculate maturities by year inline (Insurance, FD, PPF, EPF, Bonds, etc.)
    const simMaturitiesByYear = {};
    for (let y = currentYear; y <= endYear; y++) {
      simMaturitiesByYear[y] = { total: 0, details: [] };
    }
    
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      let maturityYear = null;
      let maturityValue = 0;
      
      // Parse maturity date
      if (details.maturity_date) {
        const dateStr = details.maturity_date;
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          const year = parts[1] || parts[0];
          maturityYear = year.length === 4 ? parseInt(year) : (parseInt(year) >= 50 ? 1900 + parseInt(year) : 2000 + parseInt(year));
        } else if (dateStr.includes('-')) {
          maturityYear = new Date(dateStr).getFullYear();
        }
      } else if (details.maturity_year) {
        maturityYear = parseInt(details.maturity_year);
      }
      
      // Get maturity value - for EPF/PPF/NPS/Gratuity, use market_value as maturity amount
      const isRetirementInstrument = ['epf', 'ppf', 'nps', 'gratuity'].includes(inc.category);
      maturityValue = parseFloat(details.maturity_value) || parseFloat(details.maturity_amount) || 
                     parseFloat(details.expected_maturity) || parseFloat(details.maturity_corpus) ||
                     (isRetirementInstrument ? parseFloat(details.market_value) : 0) || 0;
      
      // Calculate maturity value if not provided
      if (maturityYear && maturityValue === 0) {
        const investmentVal = parseFloat(details.investment_value) || parseFloat(details.investment_amount) || 0;
        const interestRate = parseFloat(details.interest_rate) || parseFloat(details.expected_return) || 0;
        const tenureYears = maturityYear - currentYear;
        if (investmentVal > 0 && tenureYears > 0) {
          maturityValue = investmentVal * Math.pow(1 + interestRate / 100, tenureYears);
        }
      }
      
      // Add to maturities if valid
      if (maturityYear && maturityValue > 0 && simMaturitiesByYear[maturityYear]) {
        simMaturitiesByYear[maturityYear].total += maturityValue;
      }
    });
    
    // Get assets for this entity
    const entityAssets = getAssetsForEntity(entityId);
    
    let corpus = 0;
    let exhaustYear = null;
    let assetsAdded = {};  // Track which assets have been added
    
    // Determine end year based on entity
    const entityEndYear = isFamily ? endYear : (() => {
      const member = members.find(m => m.id === entityId);
      const age = calculateAge(member?.date_of_birth);
      const memberLifeExp = parseInt(member?.life_expectancy) || 85;
      return currentYear + (memberLifeExp - age);
    })();

    // Get current age for the entity
    const entityAge = isFamily 
      ? calculateAge(members.find(m => m.is_primary)?.date_of_birth)
      : calculateAge(members.find(m => m.id === entityId)?.date_of_birth);
    
    const lifeExpectancy = isFamily 
      ? parseInt(members.find(m => m.is_primary)?.life_expectancy) || 85
      : parseInt(members.find(m => m.id === entityId)?.life_expectancy) || 85;

    // Store yearly data for chart
    const yearlyData = [];

    for (let year = currentYear; year <= entityEndYear; year++) {
      const yearStr = year.toString();
      const age = entityAge + (year - currentYear);
      
      // Add assets that should be included from this year
      if (includeAssets) {
        entityAssets.forEach(asset => {
          if (!assetsAdded[asset.id] && selectedAssets[asset.id] !== false) {
            const startYear = assetStartYears[asset.id] || currentYear;
            if (year >= startYear) {
              // Use custom amount if set, otherwise use original value
              const assetValue = assetAmounts[asset.id] !== undefined ? assetAmounts[asset.id] : asset.value;
              corpus += assetValue;
              assetsAdded[asset.id] = true;
            }
          }
        });
      }
      
      // Calculate income/expenses based on entity
      let totalIncome, totalExpenses, totalGoals;
      if (isFamily) {
        totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
        totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
        totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      } else {
        totalIncome = getProjectedMemberIncome(entityId, yearStr);
        totalExpenses = getProjectedMemberExpenses(entityId, yearStr);
        totalGoals = getMemberGoalExpenses(entityId, yearStr);
      }
      
      // Calculate total investments for this year
      let totalInvestments;
      if (isFamily) {
        totalInvestments = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, yearStr), 0);
      } else {
        totalInvestments = getProjectedMemberInvestments(entityId, yearStr);
      }
      
      // Add maturity amounts for this year (insurance, FD, PPF, EPF, bonds, etc.)
      const yearMaturities = simMaturitiesByYear[year]?.total || 0;
      
      // Surplus = Income - Expenses - Goals - Investments + Maturities
      const yearSurplus = totalIncome - totalExpenses - totalGoals - totalInvestments;
      corpus = corpus * (1 + weightedReturn / 100) + yearSurplus + yearMaturities;
      
      // Store data point for chart (sample every 5 years or key years)
      const yearsFromNow = year - currentYear;
      if (yearsFromNow === 0 || yearsFromNow % 5 === 0 || year === entityEndYear || (corpus <= 0 && !exhaustYear)) {
        yearlyData.push({
          year,
          age,
          corpus: Math.max(0, Math.round(corpus)),
          isExhausted: corpus <= 0,
          isLifeExpectancy: year === entityEndYear
        });
      }
      
      if (corpus <= 0 && !exhaustYear) {
        exhaustYear = year;
      }
    }
    
    // Ensure life expectancy year is always included
    if (!yearlyData.find(d => d.year === entityEndYear)) {
      const finalAge = entityAge + (entityEndYear - currentYear);
      yearlyData.push({
        year: entityEndYear,
        age: finalAge,
        corpus: Math.max(0, Math.round(corpus)),
        isExhausted: exhaustYear !== null,
        isLifeExpectancy: true
      });
    }
    
    const result = exhaustYear ? {
      success: false,
      lastYear: exhaustYear,
      yearsShort: entityEndYear - exhaustYear,
      lifeExpectancy,
      entityEndYear,
      currentAge: entityAge,
      yearlyData,
      finalCorpus: 0,
      message: `The money will last till year ${exhaustYear}. Your money will exhaust ${entityEndYear - exhaustYear} years before your ${isFamily ? 'living' : ''} expectancy.`
    } : {
      success: true,
      lastYear: entityEndYear,
      yearsShort: 0,
      lifeExpectancy,
      entityEndYear,
      currentAge: entityAge,
      yearlyData,
      finalCorpus: corpus,
      message: `Great! Your money will last till ${entityEndYear} with ₹${formatLargeNumber(corpus)} remaining.`
    };

    const now = new Date();
    const timestamp = now.toLocaleDateString('en-IN') + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    console.log('Simulation result:', result);
    console.log('Setting result for:', isFamily ? 'family' : entityId);

    if (isFamily) {
      setFamilyAllocation(prev => ({ ...prev, result, lastCalculated: timestamp }));
    } else {
      setMemberAllocations(prev => ({
        ...prev,
        [entityId]: { ...prev[entityId], result, lastCalculated: timestamp }
      }));
    }
  };

  // Update allocation for entity
  const updateAllocation = (entityId, field, value) => {
    if (entityId === 'family') {
      if (field === 'equity') {
        const equity = Math.min(100, Math.max(0, parseInt(value) || 0));
        setFamilyAllocation(prev => ({ ...prev, equity, debt: 100 - equity }));
      } else {
        setFamilyAllocation(prev => ({ ...prev, [field]: value }));
      }
    } else {
      if (field === 'equity') {
        const equity = Math.min(100, Math.max(0, parseInt(value) || 0));
        setMemberAllocations(prev => ({
          ...prev,
          [entityId]: { ...prev[entityId], equity, debt: 100 - equity }
        }));
      } else {
        setMemberAllocations(prev => ({
          ...prev,
          [entityId]: { ...prev[entityId], [field]: value }
        }));
      }
    }
  };

  // Toggle asset selection
  const toggleAsset = (entityId, assetId) => {
    if (entityId === 'family') {
      setFamilyAllocation(prev => ({
        ...prev,
        selectedAssets: { ...prev.selectedAssets, [assetId]: prev.selectedAssets[assetId] === false ? true : false }
      }));
    } else {
      setMemberAllocations(prev => ({
        ...prev,
        [entityId]: {
          ...prev[entityId],
          selectedAssets: { ...prev[entityId]?.selectedAssets, [assetId]: prev[entityId]?.selectedAssets?.[assetId] === false ? true : false }
        }
      }));
    }
  };

  // Update asset start year
  const updateAssetStartYear = (entityId, assetId, year) => {
    if (entityId === 'family') {
      setFamilyAllocation(prev => ({
        ...prev,
        assetStartYears: { ...prev.assetStartYears, [assetId]: year }
      }));
    } else {
      setMemberAllocations(prev => ({
        ...prev,
        [entityId]: {
          ...prev[entityId],
          assetStartYears: { ...prev[entityId]?.assetStartYears, [assetId]: year }
        }
      }));
    }
  };

  // Update asset custom amount
  const updateAssetAmount = (entityId, assetId, amount) => {
    const parsedAmount = parseFloat(amount) || 0;
    if (entityId === 'family') {
      setFamilyAllocation(prev => ({
        ...prev,
        assetAmounts: { ...prev.assetAmounts, [assetId]: parsedAmount }
      }));
    } else {
      setMemberAllocations(prev => ({
        ...prev,
        [entityId]: {
          ...prev[entityId],
          assetAmounts: { ...prev[entityId]?.assetAmounts, [assetId]: parsedAmount }
        }
      }));
    }
  };

  // Reset asset amount to original
  const resetAssetAmount = (entityId, assetId) => {
    if (entityId === 'family') {
      setFamilyAllocation(prev => {
        const newAmounts = { ...prev.assetAmounts };
        delete newAmounts[assetId];
        return { ...prev, assetAmounts: newAmounts };
      });
    } else {
      setMemberAllocations(prev => {
        const newAmounts = { ...prev[entityId]?.assetAmounts };
        delete newAmounts[assetId];
        return {
          ...prev,
          [entityId]: { ...prev[entityId], assetAmounts: newAmounts }
        };
      });
    }
  };

  // Open asset selection modal
  const openAssetModal = (entityId) => {
    setAssetModalEntity(entityId);
    setAssetModalOpen(true);
  };

  // Get current entity allocation for modal
  const getEntityAllocation = (entityId) => {
    if (entityId === 'family') return familyAllocation;
    return memberAllocations[entityId] || {};
  };

  // Get entity name for display
  const getEntityName = (entityId) => {
    if (entityId === 'family') {
      const primaryMember = members.find(m => m.is_primary);
      return primaryMember ? `${primaryMember.name} & Family` : 'Family';
    }
    const member = members.find(m => m.id === entityId);
    return member?.name || 'Member';
  };

  // Export comprehensive cash flow for specific entity (family or individual)
  const exportEntityCashFlow = (entityId) => {
    const isFamily = entityId === 'family';
    const allocation = isFamily ? familyAllocation : memberAllocations[entityId];
    if (!allocation) return;

    const { equity, debt, equityReturn, debtReturn, includeAssets, selectedAssets, assetStartYears, assetAmounts } = allocation;
    const entityAssets = getAssetsForEntity(entityId);
    
    // Get entity-specific data
    const targetMembers = isFamily ? members : members.filter(m => m.id === entityId);
    const primaryMember = members.find(m => m.is_primary);
    
    // Determine entity name and end year
    let entityName, entityEndYear, entityAge;
    if (isFamily) {
      entityName = primaryMember ? `${primaryMember.name} & Family` : 'Family';
      entityEndYear = endYear;
      entityAge = primaryAge;
    } else {
      const member = members.find(m => m.id === entityId);
      entityName = member?.name || 'Member';
      entityAge = calculateAge(member?.date_of_birth);
      const memberLifeExp = parseInt(member?.life_expectancy) || 85;
      entityEndYear = currentYear + (memberLifeExp - entityAge);
    }

    const wb = XLSX.utils.book_new();
    const allYears = [];
    for (let y = currentYear; y <= entityEndYear; y++) {
      allYears.push(y);
    }

    // Get liabilities and insurance premiums
    const liabilities = family?.liabilities || [];
    const insurancePremiums = family?.insurance_premiums || [];
    const entityLiabilities = isFamily ? liabilities : liabilities.filter(l => l.member_id === entityId || l.member_ids?.includes(entityId));
    const entityPremiums = isFamily ? insurancePremiums : insurancePremiums.filter(p => p.member_id === entityId);
    
    // Get goals and investments
    const entityGoals = goalDetails || [];
    const entityInvestments = investmentDetails || [];

    // ========== SHEET 1: DATA SHEET ==========
    const dataSheetData = [];
    
    // Helper function to add styled header row
    const addSectionHeader = (arr, title) => {
      arr.push([]);
      arr.push([title, '', '', '', '']);
    };

    // Title Section
    dataSheetData.push(['']);
    dataSheetData.push(['', 'COMPREHENSIVE FINANCIAL PLAN']);
    dataSheetData.push(['', entityName.toUpperCase()]);
    dataSheetData.push(['', `Plan Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`]);
    dataSheetData.push(['']);
    dataSheetData.push(['═══════════════════════════════════════════════════════════════════════════════']);
    dataSheetData.push(['']);

    // SECTION 1: MEMBER DETAILS
    dataSheetData.push(['', 'SECTION 1: MEMBER DETAILS']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    dataSheetData.push(['', 'Particulars', ...targetMembers.map((m, i) => `Member ${i + 1}`)]);
    dataSheetData.push(['', 'Name', ...targetMembers.map(m => m.name)]);
    dataSheetData.push(['', 'Relation', ...targetMembers.map(m => m.is_primary ? 'Self (Primary)' : (m.relation || '-'))]);
    dataSheetData.push(['', 'Date of Birth', ...targetMembers.map(m => m.date_of_birth || '-')]);
    dataSheetData.push(['', 'Current Age', ...targetMembers.map(m => {
      if (m.date_of_birth) {
        const dob = new Date(m.date_of_birth);
        return Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));
      }
      return '-';
    })]);
    dataSheetData.push(['', 'Retirement Age', ...targetMembers.map(m => getMemberIncomeInfo(m.id).retirementAge || 60)]);
    dataSheetData.push(['', 'Retirement Year', ...targetMembers.map(m => getMemberIncomeInfo(m.id).retirementYear)]);
    dataSheetData.push(['', 'Life Expectancy', ...targetMembers.map(m => parseInt(m.life_expectancy) || 85)]);
    dataSheetData.push(['']);

    // SECTION 2: INCOME DETAILS
    dataSheetData.push(['', 'SECTION 2: INCOME DETAILS (Annual)']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    dataSheetData.push(['', 'Income Type', ...targetMembers.map(m => m.name), 'Total']);
    
    // Salary Income
    const salaryByMember = targetMembers.map(m => getMemberIncomeInfo(m.id).baseSalary);
    dataSheetData.push(['', 'Salary Income', ...salaryByMember, salaryByMember.reduce((a, b) => a + b, 0)]);
    
    // Business Income
    const businessByMember = targetMembers.map(m => getMemberIncomeInfo(m.id).baseBusiness);
    dataSheetData.push(['', 'Business Income', ...businessByMember, businessByMember.reduce((a, b) => a + b, 0)]);
    
    // Rental Income
    const rentalByMember = targetMembers.map(m => getMemberIncomeInfo(m.id).baseRental);
    dataSheetData.push(['', 'Rental Income', ...rentalByMember, rentalByMember.reduce((a, b) => a + b, 0)]);
    
    // Total Income
    const totalByMember = targetMembers.map(m => {
      const info = getMemberIncomeInfo(m.id);
      return info.baseSalary + info.baseBusiness + info.baseRental;
    });
    dataSheetData.push(['', 'TOTAL INCOME', ...totalByMember, totalByMember.reduce((a, b) => a + b, 0)]);
    dataSheetData.push(['']);
    
    // Growth Rates
    dataSheetData.push(['', 'Growth Rates:']);
    dataSheetData.push(['', '  Salary Growth %', ...targetMembers.map(m => `${getMemberIncomeInfo(m.id).salaryGrowth}%`)]);
    dataSheetData.push(['', '  Business Growth %', ...targetMembers.map(m => `${getMemberIncomeInfo(m.id).businessGrowth}%`)]);
    dataSheetData.push(['']);

    // SECTION 3: EXPENSE DETAILS
    dataSheetData.push(['', 'SECTION 3: EXPENSE DETAILS (Annual)']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    dataSheetData.push(['', 'Expense Category', 'Annual Amount', 'Monthly Amount', 'Inflation %']);
    
    const expenseCategories = [...new Set(expenseDetails.map(e => e.expense_type || 'other'))];
    let totalExpenses = 0;
    expenseCategories.forEach(cat => {
      const categoryExpenses = expenseDetails.filter(e => e.expense_type === cat);
      const totalAmount = categoryExpenses.reduce((sum, e) => sum + (parseFloat(e.annual_amount || e.monthly_amount * 12 || 0) || 0), 0);
      const avgInflation = categoryExpenses.length > 0 
        ? categoryExpenses.reduce((sum, e) => sum + (parseFloat(e.inflation_percent) || 6), 0) / categoryExpenses.length 
        : 6;
      totalExpenses += totalAmount;
      const displayName = cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      dataSheetData.push(['', displayName, totalAmount, Math.round(totalAmount / 12), `${avgInflation.toFixed(1)}%`]);
    });
    dataSheetData.push(['', 'TOTAL EXPENSES', totalExpenses, Math.round(totalExpenses / 12), '']);
    dataSheetData.push(['']);

    // SECTION 4: LIABILITIES
    if (entityLiabilities.length > 0) {
      dataSheetData.push(['', 'SECTION 4: LIABILITIES']);
      dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
      dataSheetData.push(['']);
      dataSheetData.push(['', 'Loan Type', 'Monthly EMI', 'Annual EMI', 'Remaining Months', 'Interest Rate', 'Outstanding']);
      
      let totalEMI = 0;
      entityLiabilities.forEach(l => {
        const emi = parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0;
        const remaining = parseInt(l.remaining_tenure) || parseInt(l.num_installments) || 0;
        const rate = parseFloat(l.interest_rate) || 0;
        const outstanding = emi * remaining;
        totalEMI += emi;
        const loanType = (l.loan_type || 'Loan').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        dataSheetData.push(['', loanType, emi, emi * 12, remaining, `${rate}%`, outstanding]);
      });
      dataSheetData.push(['', 'TOTAL', totalEMI, totalEMI * 12, '', '', '']);
      dataSheetData.push(['']);
    }

    // SECTION 5: FINANCIAL GOALS
    if (goalDetails.length > 0) {
      dataSheetData.push(['', 'SECTION 5: FINANCIAL GOALS']);
      dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
      dataSheetData.push(['']);
      dataSheetData.push(['', 'Goal Name', 'Current Amount', 'Target Year', 'Inflation %', 'Future Value']);
      
      goalDetails.forEach(goal => {
        const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
        const firstYear = goalYears[0] ? parseInt(goalYears[0]) : currentYear + 5;
        const yearsToGoal = firstYear - currentYear;
        const inflation = parseFloat(goal.inflation_percent) || 6;
        const currentAmt = parseFloat(goal.goal_amount) || 0;
        const futureValue = Math.round(currentAmt * Math.pow(1 + inflation / 100, yearsToGoal));
        const goalName = (goal.category || 'Goal').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        dataSheetData.push(['', goalName, currentAmt, goalYears.join(', '), `${inflation}%`, futureValue]);
      });
      dataSheetData.push(['']);
    }

    // SECTION 6: EXISTING ASSETS
    if (includeAssets && entityAssets.length > 0) {
      dataSheetData.push(['', 'SECTION 6: EXISTING ASSETS (Included in Plan)']);
      dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
      dataSheetData.push(['']);
      dataSheetData.push(['', 'Asset Name', 'Current Value', 'Amount Used', 'Include From Year', 'To Equity', 'To Debt']);
      
      let totalAssets = 0;
      entityAssets.forEach(asset => {
        if (selectedAssets[asset.id] !== false) {
          const customAmount = assetAmounts?.[asset.id];
          const usedAmount = customAmount !== undefined ? customAmount : asset.value;
          totalAssets += usedAmount;
          dataSheetData.push([
            '', 
            asset.label,
            asset.value,
            usedAmount,
            assetStartYears[asset.id] || currentYear,
            Math.round(usedAmount * equity / 100),
            Math.round(usedAmount * debt / 100)
          ]);
        }
      });
      dataSheetData.push(['', 'TOTAL ASSETS', '', totalAssets, '', Math.round(totalAssets * equity / 100), Math.round(totalAssets * debt / 100)]);
      dataSheetData.push(['']);
    }

    // SECTION 7: INVESTMENT ASSUMPTIONS
    dataSheetData.push(['', 'SECTION 7: INVESTMENT ASSUMPTIONS']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    dataSheetData.push(['', 'Parameter', 'Value', 'Description']);
    dataSheetData.push(['', 'Equity Allocation', `${equity}%`, 'Portion invested in equity']);
    dataSheetData.push(['', 'Debt Allocation', `${debt}%`, 'Portion invested in debt']);
    dataSheetData.push(['', 'Expected Equity Return', `${equityReturn}%`, 'Annual return on equity']);
    dataSheetData.push(['', 'Expected Debt Return', `${debtReturn}%`, 'Annual return on debt']);
    dataSheetData.push(['', 'Weighted Average Return', `${((equity * equityReturn + debt * debtReturn) / 100).toFixed(2)}%`, 'Blended portfolio return']);
    dataSheetData.push(['']);

    // SECTION 8: SUMMARY
    const totalAnnualIncome = totalByMember.reduce((a, b) => a + b, 0);
    const totalAnnualEMI = entityLiabilities.reduce((sum, l) => sum + ((parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0) * 12), 0);
    const annualSurplus = totalAnnualIncome - totalExpenses - totalAnnualEMI;
    
    dataSheetData.push(['', 'SECTION 8: FINANCIAL SUMMARY']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    dataSheetData.push(['', 'Metric', 'Annual', 'Monthly']);
    dataSheetData.push(['', 'Total Income', totalAnnualIncome, Math.round(totalAnnualIncome / 12)]);
    dataSheetData.push(['', 'Total Expenses', totalExpenses, Math.round(totalExpenses / 12)]);
    dataSheetData.push(['', 'Total EMI Payments', totalAnnualEMI, Math.round(totalAnnualEMI / 12)]);
    dataSheetData.push(['', 'Available for Savings', annualSurplus, Math.round(annualSurplus / 12)]);
    dataSheetData.push(['', 'Savings Rate', `${((annualSurplus / totalAnnualIncome) * 100).toFixed(1)}%`, '']);
    dataSheetData.push(['']);
    dataSheetData.push(['═══════════════════════════════════════════════════════════════════════════════']);

    const dataSheet = XLSX.utils.aoa_to_sheet(dataSheetData);
    
    // Set column widths
    dataSheet['!cols'] = [
      { wch: 3 },   // Margin column
      { wch: 28 },  // Labels
      { wch: 18 },  // Values
      { wch: 18 },  // Values
      { wch: 18 },  // Values
      { wch: 18 },  // Values
      { wch: 18 },  // Values
    ];
    
    XLSX.utils.book_append_sheet(wb, dataSheet, "Data Sheet");

    // ========== SHEET 2: COMPREHENSIVE CASH FLOW & PORTFOLIO ==========
    const cashFlowData = [];
    
    // Currency formatter with ₹ symbol and commas
    const formatCurrency = (num) => {
      if (num === 0 || num === '' || num === null || num === undefined) return '-';
      const rounded = Math.round(num);
      return '₹ ' + rounded.toLocaleString('en-IN');
    };

    // Pre-calculate which assets to add in which year
    const assetsByYear = {};
    if (includeAssets) {
      entityAssets.forEach(asset => {
        if (selectedAssets[asset.id] !== false) {
          const startYear = assetStartYears[asset.id] || currentYear;
          const assetValue = assetAmounts?.[asset.id] !== undefined ? assetAmounts[asset.id] : asset.value;
          if (!assetsByYear[startYear]) assetsByYear[startYear] = 0;
          assetsByYear[startYear] += assetValue;
        }
      });
    }

    // Calculate detailed yearly data including portfolio
    let equityCorpus = 0;
    let debtCorpus = 0;
    
    // Calculate total annual premium from insurance policies
    const totalAnnualPremium = entityPremiums.reduce((sum, p) => sum + (parseFloat(p.amount) || parseFloat(p.premium) || 0), 0);
    
    const yearlyData = allYears.map((y, idx) => {
      const yearStr = y.toString();
      const age = entityAge + (y - currentYear);
      const yearsFromNow = y - currentYear;
      
      // Detailed income breakdown by member
      const memberIncomes = {};
      let totalSalary = 0, totalBusiness = 0, totalRental = 0, totalInvestmentInc = 0;
      
      targetMembers.forEach(m => {
        const info = getMemberIncomeInfo(m.id);
        const isPostRetirement = y >= info.retirementYear;
        
        const salary = isPostRetirement ? 0 : info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow);
        const business = isPostRetirement ? 0 : info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow);
        const rental = info.baseRental * Math.pow(1 + (info.rentalGrowth || 5) / 100, yearsFromNow);
        
        memberIncomes[m.id] = { salary, business, rental, total: salary + business + rental };
        totalSalary += salary;
        totalBusiness += business;
        totalRental += rental;
      });
      
      // Get maturities for this year
      const yearMaturityAmount = maturitiesByYear[y]?.total || 0;
      const yearMaturityDetails = maturitiesByYear[y]?.details || [];
      
      const totalIncome = totalSalary + totalBusiness + totalRental + totalInvestmentInc;

      // Detailed expense breakdown
      const memberExpenses = {};
      let totalLivingExp = 0;
      
      targetMembers.forEach(m => {
        const expenses = getProjectedMemberExpenses(m.id, yearStr);
        memberExpenses[m.id] = expenses;
        totalLivingExp += expenses;
      });

      // Insurance premium details
      const info = getMemberIncomeInfo(targetMembers[0]?.id);
      const insurancePremium = y < (info?.retirementYear || 2050) ? totalAnnualPremium : 0;
      
      // Loan installments by type
      let homeLoanEMI = 0, vehicleLoanEMI = 0, personalLoanEMI = 0;
      entityLiabilities.forEach(l => {
        const loanType = (l.loan_type || l.expense_type || '').toLowerCase();
        const emi = (parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0) * 12;
        const remaining = parseInt(l.remaining_tenure) || parseInt(l.num_installments) || 0;
        const yearsRemaining = Math.ceil(remaining / 12);
        
        if (yearsFromNow < yearsRemaining) {
          if (loanType.includes('home')) homeLoanEMI += emi;
          else if (loanType.includes('vehicle') || loanType.includes('car')) vehicleLoanEMI += emi;
          else personalLoanEMI += emi;
        }
      });
      
      const totalExpense = totalLivingExp + insurancePremium + homeLoanEMI + vehicleLoanEMI + personalLoanEMI;

      // Goal expenses - detailed by goal
      const goalExpenseDetails = {};
      let totalGoalExp = 0;
      
      entityGoals.forEach(goal => {
        const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
        if (goalYears.includes(yearStr)) {
          const amountToday = parseFloat(goal.goal_amount) || 0;
          const inflationRate = parseFloat(goal.inflation_percent) || 0;
          const futureAmount = yearsFromNow > 0 ? amountToday * Math.pow(1 + inflationRate / 100, yearsFromNow) : amountToday;
          const goalName = goal.name || goal.goal_name || goal.category || 'Goal';
          goalExpenseDetails[goalName] = Math.round(futureAmount);
          totalGoalExp += futureAmount;
        }
      });

      // Investment details for this year - convert to annual amounts
      const yearInvestmentDetails = {};
      let totalInvestments = 0;
      
      entityInvestments.forEach(inv => {
        // Get annual amount - multiply by 12 if it's monthly
        const monthlyAmount = parseFloat(inv.monthly_investment) || parseFloat(inv.sip_amount) || parseFloat(inv.amount) || 0;
        const annualAmount = parseFloat(inv.annual_investment) || (monthlyAmount * 12);
        if (annualAmount > 0) {
          const invName = inv.scheme_name || inv.name || 'Investment';
          yearInvestmentDetails[invName] = Math.round(annualAmount);
          totalInvestments += annualAmount;
        }
      });

      // Annual Surplus = Income - Expenses - Goals - Investments + Maturities
      const annualSavings = totalIncome - totalExpense - totalGoalExp - totalInvestments + yearMaturityAmount;
      
      // Savings allocation
      const savingsEquity = annualSavings > 0 ? annualSavings * equity / 100 : 0;
      const savingsDebt = annualSavings > 0 ? annualSavings * debt / 100 : 0;

      // Assets added to opening balance
      const assetAdditionThisYear = assetsByYear[y] || 0;
      const assetEquity = assetAdditionThisYear * equity / 100;
      const assetDebt = assetAdditionThisYear * debt / 100;

      // Opening balance calculation
      const openingEquity = equityCorpus + assetEquity;
      const openingDebt = debtCorpus + assetDebt;

      // Calculate returns
      const equityReturns = openingEquity * equityReturn / 100;
      const debtReturns = openingDebt * debtReturn / 100;

      // Closing balance
      equityCorpus = openingEquity + equityReturns + savingsEquity;
      debtCorpus = openingDebt + debtReturns + savingsDebt;
      
      // Handle withdrawals (when savings is negative)
      let withdrawalAmount = 0;
      if (annualSavings < 0) {
        withdrawalAmount = Math.abs(annualSavings);
        equityCorpus = Math.max(0, equityCorpus - withdrawalAmount * equity / 100);
        debtCorpus = Math.max(0, debtCorpus - withdrawalAmount * debt / 100);
      }

      const closingTotal = equityCorpus + debtCorpus;

      return {
        year: y,
        age,
        // Income details
        memberIncomes,
        totalSalary: Math.round(totalSalary),
        totalBusiness: Math.round(totalBusiness),
        totalRental: Math.round(totalRental),
        totalIncome: Math.round(totalIncome),
        // Maturity details
        maturityAmount: Math.round(yearMaturityAmount),
        maturityDetails: yearMaturityDetails,
        // Expense details
        memberExpenses,
        totalLivingExp: Math.round(totalLivingExp),
        insurancePremium: Math.round(insurancePremium),
        homeLoanEMI: Math.round(homeLoanEMI),
        vehicleLoanEMI: Math.round(vehicleLoanEMI),
        personalLoanEMI: Math.round(personalLoanEMI),
        totalExpense: Math.round(totalExpense),
        // Goal details
        goalExpenseDetails,
        totalGoalExp: Math.round(totalGoalExp),
        // Investment details
        yearInvestmentDetails,
        totalInvestments: Math.round(totalInvestments),
        // Savings
        annualSavings: Math.round(annualSavings),
        savingsEquity: Math.round(savingsEquity),
        savingsDebt: Math.round(savingsDebt),
        // Assets
        assetAddition: Math.round(assetAdditionThisYear),
        assetEquity: Math.round(assetEquity),
        assetDebt: Math.round(assetDebt),
        // Portfolio
        openingEquity: Math.round(openingEquity),
        openingDebt: Math.round(openingDebt),
        equityReturns: Math.round(equityReturns),
        debtReturns: Math.round(debtReturns),
        closingEquity: Math.round(equityCorpus),
        closingDebt: Math.round(debtCorpus),
        closingTotal: Math.round(closingTotal),
        withdrawalAmount: Math.round(withdrawalAmount)
      };
    });

    // Build the comprehensive sheet
    // Header
    cashFlowData.push(['COMPREHENSIVE FINANCIAL PLAN - ' + entityName.toUpperCase()]);
    cashFlowData.push([]);
    cashFlowData.push(['Year', ...yearlyData.map(d => d.year)]);
    cashFlowData.push(['Age', ...yearlyData.map(d => d.age)]);
    cashFlowData.push([]);
    cashFlowData.push(['════════════════════════════════════════════════════════════════════════════════════════════════════════════════════']);

    // ═══════════════ INCOME SECTION ═══════════════
    cashFlowData.push([]);
    cashFlowData.push(['▶ CASH INFLOW (INCOME)']);
    cashFlowData.push([]);
    
    // Individual member income breakdown
    targetMembers.forEach(m => {
      const memberName = m.name.split(' ')[0] + (m.is_primary ? '*' : '');
      cashFlowData.push([`  ${memberName} - Salary`, ...yearlyData.map(d => formatCurrency(d.memberIncomes[m.id]?.salary || 0))]);
      if (yearlyData.some(d => d.memberIncomes[m.id]?.business > 0)) {
        cashFlowData.push([`  ${memberName} - Business`, ...yearlyData.map(d => formatCurrency(d.memberIncomes[m.id]?.business || 0))]);
      }
      if (yearlyData.some(d => d.memberIncomes[m.id]?.rental > 0)) {
        cashFlowData.push([`  ${memberName} - Rental`, ...yearlyData.map(d => formatCurrency(d.memberIncomes[m.id]?.rental || 0))]);
      }
    });
    
    cashFlowData.push([]);
    cashFlowData.push(['  TOTAL INCOME (A)', ...yearlyData.map(d => formatCurrency(d.totalIncome))]);
    cashFlowData.push([]);
    
    // ═══════════════ MATURITIES SECTION ═══════════════
    // Check if there are any maturities
    const hasMaturities = yearlyData.some(d => d.maturityAmount > 0);
    if (hasMaturities) {
      cashFlowData.push(['▶ MATURITIES (Insurance, FD, PPF, EPF, Bonds, etc.)']);
      cashFlowData.push([]);
      
      // Group by maturity type
      const maturityTypes = new Set();
      yearlyData.forEach(d => {
        (d.maturityDetails || []).forEach(md => maturityTypes.add(md.type));
      });
      
      maturityTypes.forEach(type => {
        cashFlowData.push([`  ${type}`, ...yearlyData.map(d => {
          const typeTotal = (d.maturityDetails || [])
            .filter(md => md.type === type)
            .reduce((sum, md) => sum + (md.value || 0), 0);
          return formatCurrency(typeTotal);
        })]);
      });
      
      cashFlowData.push([]);
      cashFlowData.push(['  TOTAL MATURITIES (B)', ...yearlyData.map(d => formatCurrency(d.maturityAmount))]);
      cashFlowData.push([]);
    }
    
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // ═══════════════ EXPENSES SECTION ═══════════════
    cashFlowData.push([]);
    cashFlowData.push(['▶ CASH OUTFLOW (EXPENSES)']);
    cashFlowData.push([]);
    
    // Individual member expenses
    targetMembers.forEach(m => {
      const memberName = m.name.split(' ')[0] + (m.is_primary ? '*' : '');
      cashFlowData.push([`  ${memberName} - Living Expenses`, ...yearlyData.map(d => formatCurrency(d.memberExpenses[m.id] || 0))]);
    });
    
    // Insurance premiums - show individual policies if available
    if (entityPremiums.length > 0) {
      cashFlowData.push([]);
      cashFlowData.push(['  Insurance Premiums:']);
      entityPremiums.forEach(p => {
        const policyName = p.policy_name || p.company || 'Insurance Policy';
        const premiumAmt = parseFloat(p.amount) || parseFloat(p.premium) || 0;
        cashFlowData.push([`    - ${policyName}`, ...yearlyData.map(d => {
          const info = getMemberIncomeInfo(targetMembers[0]?.id);
          return d.year < (info?.retirementYear || 2050) ? formatCurrency(premiumAmt) : '-';
        })]);
      });
    }
    
    // Loan EMIs - show individual loans
    if (entityLiabilities.length > 0) {
      cashFlowData.push([]);
      cashFlowData.push(['  Loan EMI Payments:']);
      entityLiabilities.forEach(l => {
        const loanName = l.loan_name || l.bank_name || l.loan_type || 'Loan';
        const loanType = (l.loan_type || l.expense_type || '').toLowerCase();
        const emi = (parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0) * 12;
        const remaining = parseInt(l.remaining_tenure) || parseInt(l.num_installments) || 0;
        const yearsRemaining = Math.ceil(remaining / 12);
        
        cashFlowData.push([`    - ${loanName} (${l.loan_type || 'Loan'})`, ...yearlyData.map(d => {
          const yearsFromNow = d.year - currentYear;
          return yearsFromNow < yearsRemaining ? formatCurrency(emi) : '-';
        })]);
      });
    }
    
    cashFlowData.push([]);
    cashFlowData.push(['  TOTAL EXPENSES (B)', ...yearlyData.map(d => formatCurrency(d.totalExpense))]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // ═══════════════ GOALS SECTION ═══════════════
    cashFlowData.push([]);
    cashFlowData.push(['▶ FINANCIAL GOALS']);
    cashFlowData.push([]);
    
    // Get all unique goal names
    const allGoalNames = new Set();
    yearlyData.forEach(d => {
      Object.keys(d.goalExpenseDetails).forEach(name => allGoalNames.add(name));
    });
    
    if (allGoalNames.size > 0) {
      allGoalNames.forEach(goalName => {
        cashFlowData.push([`  ${goalName}`, ...yearlyData.map(d => {
          const amt = d.goalExpenseDetails[goalName];
          return amt ? formatCurrency(amt) : '-';
        })]);
      });
    } else {
      cashFlowData.push(['  No goals defined']);
    }
    
    cashFlowData.push([]);
    cashFlowData.push(['  TOTAL GOALS (C)', ...yearlyData.map(d => formatCurrency(d.totalGoalExp))]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // ═══════════════ INVESTMENTS SECTION ═══════════════
    if (entityInvestments.length > 0) {
      cashFlowData.push([]);
      cashFlowData.push(['▶ ONGOING INVESTMENTS (D) - SIP/Recurring - Annual']);
      cashFlowData.push([]);
      
      entityInvestments.forEach(inv => {
        const invName = inv.scheme_name || inv.name || 'Investment';
        // Get annual amount - multiply by 12 if it's monthly
        const monthlyAmount = parseFloat(inv.monthly_investment) || parseFloat(inv.sip_amount) || parseFloat(inv.amount) || 0;
        const annualAmount = parseFloat(inv.annual_investment) || (monthlyAmount * 12);
        if (annualAmount > 0) {
          cashFlowData.push([`  ${invName}`, ...yearlyData.map(() => formatCurrency(annualAmount))]);
        }
      });
      
      cashFlowData.push([]);
      cashFlowData.push(['  TOTAL INVESTMENTS (D)', ...yearlyData.map(d => formatCurrency(d.totalInvestments))]);
      cashFlowData.push([]);
      cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);
    }

    // ═══════════════ SURPLUS SECTION ═══════════════
    cashFlowData.push([]);
    cashFlowData.push(['▶ NET ANNUAL SURPLUS']);
    cashFlowData.push([]);
    cashFlowData.push(['  Surplus = (A) - (B) - (C) - (D)', ...yearlyData.map(d => formatCurrency(d.annualSavings))]);
    cashFlowData.push([`  Allocated to Equity (${equity}%)`, ...yearlyData.map(d => formatCurrency(d.savingsEquity))]);
    cashFlowData.push([`  Allocated to Debt (${debt}%)`, ...yearlyData.map(d => formatCurrency(d.savingsDebt))]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // ═══════════════ PORTFOLIO SECTION ═══════════════
    cashFlowData.push([]);
    cashFlowData.push(['════════════════════════════════════════════════════════════════════════════════════════════════════════════════════']);
    cashFlowData.push([]);
    cashFlowData.push(['▶ ASSET CONSIDER FOR RESTRUCTURING']);
    cashFlowData.push([]);
    
    // Total Assets = Previous year's closing balance
    cashFlowData.push(['  Total Assets Included', ...yearlyData.map((d, idx) => {
      if (idx === 0) return includeAssets ? formatCurrency(d.assetAddition) : '-';
      return formatCurrency(yearlyData[idx - 1].closingTotal);
    })]);
    cashFlowData.push([`  To Equity Portfolio (${equity}%)`, ...yearlyData.map((d, idx) => {
      if (idx === 0) return includeAssets ? formatCurrency(d.assetEquity) : '-';
      return formatCurrency(yearlyData[idx - 1].closingTotal * equity / 100);
    })]);
    cashFlowData.push([`  To Debt Portfolio (${debt}%)`, ...yearlyData.map((d, idx) => {
      if (idx === 0) return includeAssets ? formatCurrency(d.assetDebt) : '-';
      return formatCurrency(yearlyData[idx - 1].closingTotal * debt / 100);
    })]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // EQUITY PORTFOLIO
    cashFlowData.push([]);
    cashFlowData.push([`▶ EQUITY PORTFOLIO (${equity}% Allocation @ ${equityReturn}% Return)`]);
    cashFlowData.push([]);
    cashFlowData.push(['  Opening Balance', ...yearlyData.map((d, idx) => {
      if (idx === 0) return formatCurrency(d.openingEquity);
      return formatCurrency(yearlyData[idx - 1].closingTotal * equity / 100);
    })]);
    cashFlowData.push(['  (+) Savings Added', ...yearlyData.map(d => formatCurrency(d.savingsEquity))]);
    cashFlowData.push([`  (+) Returns @ ${equityReturn}%`, ...yearlyData.map((d, idx) => {
      const opening = idx === 0 ? d.openingEquity : yearlyData[idx - 1].closingTotal * equity / 100;
      return formatCurrency(Math.round(opening * equityReturn / 100));
    })]);
    cashFlowData.push(['  CLOSING BALANCE', ...yearlyData.map(d => formatCurrency(d.closingEquity))]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // DEBT PORTFOLIO
    cashFlowData.push([]);
    cashFlowData.push([`▶ DEBT PORTFOLIO (${debt}% Allocation @ ${debtReturn}% Return)`]);
    cashFlowData.push([]);
    cashFlowData.push(['  Opening Balance', ...yearlyData.map((d, idx) => {
      if (idx === 0) return formatCurrency(d.openingDebt);
      return formatCurrency(yearlyData[idx - 1].closingTotal * debt / 100);
    })]);
    cashFlowData.push(['  (+) Savings Added', ...yearlyData.map(d => formatCurrency(d.savingsDebt))]);
    cashFlowData.push([`  (+) Returns @ ${debtReturn}%`, ...yearlyData.map((d, idx) => {
      const opening = idx === 0 ? d.openingDebt : yearlyData[idx - 1].closingTotal * debt / 100;
      return formatCurrency(Math.round(opening * debtReturn / 100));
    })]);
    cashFlowData.push(['  CLOSING BALANCE', ...yearlyData.map(d => formatCurrency(d.closingDebt))]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // TOTAL PORTFOLIO
    cashFlowData.push([]);
    cashFlowData.push(['▶ TOTAL PORTFOLIO VALUE']);
    cashFlowData.push([]);
    cashFlowData.push(['  Closing Balance (Equity + Debt)', ...yearlyData.map(d => formatCurrency(d.closingTotal))]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // RETIREMENT WITHDRAWALS
    const hasWithdrawals = yearlyData.some(d => d.withdrawalAmount > 0);
    if (hasWithdrawals) {
      cashFlowData.push([]);
      cashFlowData.push(['▶ RETIREMENT WITHDRAWALS (When Expenses > Income)']);
      cashFlowData.push([]);
      cashFlowData.push(['  Yearly Withdrawal Required', ...yearlyData.map(d => d.withdrawalAmount > 0 ? formatCurrency(d.withdrawalAmount) : '-')]);
      cashFlowData.push([`  From Equity (${equity}%)`, ...yearlyData.map(d => d.withdrawalAmount > 0 ? formatCurrency(d.withdrawalAmount * equity / 100) : '-')]);
      cashFlowData.push([`  From Debt (${debt}%)`, ...yearlyData.map(d => d.withdrawalAmount > 0 ? formatCurrency(d.withdrawalAmount * debt / 100) : '-')]);
      
      let cumWithdrawal = 0;
      cashFlowData.push(['  Cumulative Withdrawals', ...yearlyData.map(d => {
        cumWithdrawal += d.withdrawalAmount;
        return cumWithdrawal > 0 ? formatCurrency(cumWithdrawal) : '-';
      })]);
    }
    
    cashFlowData.push([]);
    cashFlowData.push(['════════════════════════════════════════════════════════════════════════════════════════════════════════════════════']);

    // Create sheet with styling
    const cashFlowSheet = XLSX.utils.aoa_to_sheet(cashFlowData);
    
    // Set column widths
    cashFlowSheet['!cols'] = [{ wch: 42 }, ...allYears.map(() => ({ wch: 18 }))];
    
    // Apply styles to cells (xlsx community version has limited styling support)
    // We'll use xlsx-style patterns where possible
    const range = XLSX.utils.decode_range(cashFlowSheet['!ref']);
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!cashFlowSheet[cellAddress]) continue;
        
        const cellValue = cashFlowSheet[cellAddress].v || '';
        
        // Initialize cell style
        if (!cashFlowSheet[cellAddress].s) {
          cashFlowSheet[cellAddress].s = {};
        }
        
        // Style section headers (▶ prefix)
        if (typeof cellValue === 'string' && cellValue.startsWith('▶')) {
          cashFlowSheet[cellAddress].s = {
            font: { bold: true, color: { rgb: "1565C0" } },
            fill: { fgColor: { rgb: "E3F2FD" } }
          };
        }
        
        // Style TOTAL rows
        if (typeof cellValue === 'string' && (cellValue.includes('TOTAL') || cellValue.includes('CLOSING'))) {
          cashFlowSheet[cellAddress].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "FFF8E1" } }
          };
        }
        
        // Style header row
        if (R === 0) {
          cashFlowSheet[cellAddress].s = {
            font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "1565C0" } },
            alignment: { horizontal: 'center' }
          };
        }
        
        // Style separator lines
        if (typeof cellValue === 'string' && (cellValue.startsWith('═') || cellValue.startsWith('─'))) {
          cashFlowSheet[cellAddress].s = {
            font: { color: { rgb: "90A4AE" } }
          };
        }
      }
    }
    
    XLSX.utils.book_append_sheet(wb, cashFlowSheet, "Cash Flow & Portfolio");

    // Download Excel
    XLSX.writeFile(wb, `Financial_Plan_${entityName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  };

  // Get primary member name for family row
  const primaryMember = members.find(m => m.is_primary);
  const familyName = primaryMember ? `${primaryMember.name} & FAMILY` : 'Family';

  return (
    <Card className="mt-6 border border-gray-200 shadow-sm">
      <CardHeader className="pb-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
        <CardTitle className="text-sm flex items-center gap-2 text-gray-800">
          <Calculator className="h-4 w-4 text-blue-600" />
          Allocation Simulator
        </CardTitle>
        <p className="text-[11px] text-gray-500 mt-1">
          This simulator gently adjusts for life changes—like family separation, loss of income, or shifting expenses—to help you understand if your wealth can comfortably support you over time.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {/* Allocation Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-center py-2 px-3 font-semibold text-gray-700 min-w-[280px]">Name</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700 border-l border-gray-200" colSpan={2}>
                  <span className="text-[10px]">Allocation %</span>
                </th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700 border-l border-gray-200" colSpan={2}>
                  <span className="text-[10px]">Returns %</span>
                </th>
                <th className="text-center py-2 px-3 font-semibold text-gray-700 border-l border-gray-200 min-w-[90px]">
                  <span className="text-[10px]">Include Assets</span>
                </th>
                <th className="text-center py-2 px-3 font-semibold text-gray-700 border-l border-gray-200 min-w-[180px]">
                  <span className="text-[10px]">Actions</span>
                </th>
                <th className="text-center py-2 px-3 font-semibold text-gray-700 border-l border-gray-200 min-w-[100px]">
                  <span className="text-[10px]">Download</span>
                </th>
              </tr>
              <tr className="bg-gray-100/50 border-b border-gray-200">
                <th></th>
                <th className="text-center py-1 px-2 text-[9px] font-medium text-gray-500 border-l border-gray-200">Equity</th>
                <th className="text-center py-1 px-2 text-[9px] font-medium text-gray-500 bg-blue-50/50">Debt</th>
                <th className="text-center py-1 px-2 text-[9px] font-medium text-gray-500 border-l border-gray-200">Equity</th>
                <th className="text-center py-1 px-2 text-[9px] font-medium text-gray-500 bg-blue-50/50">Debt</th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Family Row */}
              <tr className="bg-amber-50/40 hover:bg-amber-50/60 transition-colors">
                <td className="py-3 px-3">
                  <div className="font-semibold text-gray-800 text-[11px] text-center">{familyName}</div>
                  {familyAllocation.result && (
                    <WealthChart result={familyAllocation.result} entityName={familyName} />
                  )}
                </td>
                <td className="py-3 px-2 border-l border-gray-100 text-center">
                  <select
                    value={familyAllocation.equity}
                    onChange={(e) => updateAllocation('family', 'equity', e.target.value)}
                    className="w-14 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                  >
                    {[...Array(11)].map((_, i) => (
                      <option key={i * 10} value={i * 10}>{i * 10}</option>
                    ))}
                  </select>
                </td>
                <td className="py-3 px-2 bg-blue-50/30 text-center">
                  <input
                    type="number"
                    value={familyAllocation.debt}
                    readOnly
                    className="w-12 h-7 text-[11px] border border-gray-200 rounded bg-gray-50 text-center text-gray-500"
                  />
                </td>
                <td className="py-3 px-2 border-l border-gray-100 text-center">
                  <input
                    type="number"
                    value={familyAllocation.equityReturn}
                    onChange={(e) => updateAllocation('family', 'equityReturn', parseFloat(e.target.value) || 0)}
                    className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="py-3 px-2 bg-blue-50/30 text-center">
                  <input
                    type="number"
                    value={familyAllocation.debtReturn}
                    onChange={(e) => updateAllocation('family', 'debtReturn', parseFloat(e.target.value) || 0)}
                    className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="py-3 px-3 border-l border-gray-100 text-center">
                  <input
                    type="checkbox"
                    checked={familyAllocation.includeAssets}
                    onChange={(e) => updateAllocation('family', 'includeAssets', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </td>
                <td className="py-3 px-3 border-l border-gray-100 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      onClick={() => openAssetModal('family')}
                      disabled={!familyAllocation.includeAssets}
                      className="px-3 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                    >
                      <Settings2 className="h-3 w-3" />
                      Configure
                    </button>
                    <button 
                      onClick={() => runSimulation('family')}
                      className="px-3 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Calculate
                    </button>
                  </div>
                </td>
                <td className="py-3 px-3 text-center border-l border-gray-200">
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      onClick={handleExportToExcel}
                      disabled={!familyAllocation.result}
                      className="px-3 py-1.5 text-[10px] font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                      title="Download Complete Financial Plan (8 Sheets)"
                    >
                      <Download className="h-3 w-3" />
                      <span>Excel</span>
                    </button>
                  </div>
                </td>
              </tr>

              {/* Individual Member Rows */}
              {members.map((member, idx) => {
                const allocation = memberAllocations[member.id] || { equity: 60, debt: 40, equityReturn: 12, debtReturn: 0 };
                const age = calculateAge(member.date_of_birth);
                const memberLifeExp = parseInt(member.life_expectancy) || 85;
                const memberInfo = getMemberIncomeInfo(member.id);
                
                return (
                  <React.Fragment key={member.id}>
                    <tr className={`hover:bg-gray-50/80 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="py-3 px-3">
                        <div className="font-medium text-gray-800 text-[11px] text-center">
                          {member.name}
                          {member.is_primary && <span className="text-blue-500 ml-0.5 text-[9px]">*</span>}
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5 text-center">
                          {age}y | LE:{memberLifeExp} | R:{memberInfo.retirementYear}
                        </div>
                        {allocation.result && (
                          <WealthChart result={allocation.result} entityName={member.name} />
                        )}
                      </td>
                      <td className="py-3 px-2 border-l border-gray-100 text-center">
                        <select
                          value={allocation.equity}
                          onChange={(e) => updateAllocation(member.id, 'equity', e.target.value)}
                          className="w-14 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                        >
                          {[...Array(11)].map((_, i) => (
                            <option key={i * 10} value={i * 10}>{i * 10}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-2 bg-blue-50/30 text-center">
                        <input
                          type="number"
                          value={allocation.debt}
                          readOnly
                          className="w-12 h-7 text-[11px] border border-gray-200 rounded bg-gray-50 text-center text-gray-500"
                        />
                      </td>
                      <td className="py-3 px-2 border-l border-gray-100 text-center">
                        <input
                          type="number"
                          value={allocation.equityReturn}
                          onChange={(e) => updateAllocation(member.id, 'equityReturn', parseFloat(e.target.value) || 0)}
                          className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="py-3 px-2 bg-blue-50/30 text-center">
                        <input
                          type="number"
                          value={allocation.debtReturn}
                          onChange={(e) => updateAllocation(member.id, 'debtReturn', parseFloat(e.target.value) || 0)}
                          className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="py-3 px-3 border-l border-gray-100 text-center">
                        <input
                          type="checkbox"
                          checked={allocation.includeAssets || false}
                          onChange={(e) => updateAllocation(member.id, 'includeAssets', e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 border-l border-gray-100 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => openAssetModal(member.id)}
                            disabled={!allocation.includeAssets}
                            className="px-3 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                          >
                            <Settings2 className="h-3 w-3" />
                            Configure
                          </button>
                          <button 
                            onClick={() => runSimulation(member.id)}
                            className="px-3 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          >
                            Calculate
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center border-l border-gray-200">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => exportEntityCashFlow(member.id)}
                            disabled={!allocation.result}
                            className="px-3 py-1.5 text-[10px] font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                            title="Download Excel"
                          >
                            <Download className="h-3 w-3" />
                            <span>Excel</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Note */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-[9px] text-gray-400 text-center">
            Debt instruments with maturity dates (FD, Bonds, RD, Insurance) excluded—available only at maturity.
          </p>
        </div>

        {/* Asset Selection Modal */}
        <Dialog open={assetModalOpen} onOpenChange={setAssetModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-blue-600" />
                Configure Assets - {assetModalEntity && getEntityName(assetModalEntity)}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
              {assetModalEntity && getAssetsForEntity(assetModalEntity).map(asset => {
                const allocation = getEntityAllocation(assetModalEntity);
                const isSelected = allocation.selectedAssets?.[asset.id] !== false;
                const startYear = allocation.assetStartYears?.[asset.id] || currentYear;
                const customAmount = allocation.assetAmounts?.[asset.id];
                const displayAmount = customAmount !== undefined ? customAmount : asset.value;
                const isCustom = customAmount !== undefined;
                
                return (
                  <div 
                    key={asset.id} 
                    className={`p-3 rounded-lg border-2 transition-all ${
                      isSelected ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100 bg-gray-50/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAsset(assetModalEntity, asset.id)}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm">{asset.label}</div>
                        <div className="text-[10px] text-gray-400">Original: ₹{formatLargeNumber(asset.value)}</div>
                      </div>
                    </div>
                    
                    {/* Amount and Year Row */}
                    <div className="flex items-center gap-3 mt-3 ml-8">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-500 font-medium block mb-1">Amount to Include</label>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-sm">₹</span>
                          <input
                            type="number"
                            value={displayAmount}
                            onChange={(e) => updateAssetAmount(assetModalEntity, asset.id, e.target.value)}
                            disabled={!isSelected}
                            className={`w-full h-8 text-sm border rounded px-2 text-right disabled:bg-gray-100 disabled:text-gray-400 ${
                              isCustom ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                            }`}
                          />
                          {isCustom && (
                            <button
                              onClick={() => resetAssetAmount(assetModalEntity, asset.id)}
                              className="text-[10px] text-blue-600 hover:text-blue-700 whitespace-nowrap"
                              title="Reset to original"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium block mb-1">Include from Year</label>
                        <select
                          value={startYear}
                          onChange={(e) => updateAssetStartYear(assetModalEntity, asset.id, parseInt(e.target.value))}
                          disabled={!isSelected}
                          className="h-8 text-sm border border-gray-200 rounded px-2 bg-white disabled:bg-gray-100 disabled:text-gray-400 min-w-[90px]"
                        >
                          {yearOptions.map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {assetModalEntity && getAssetsForEntity(assetModalEntity).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No assets available for selection.</p>
                  <p className="text-xs mt-1">Add assets in the Income section to include them here.</p>
                </div>
              )}
            </div>

            <DialogFooter className="border-t pt-4">
              <div className="flex items-center justify-between w-full">
                <div className="text-sm text-gray-600">
                  Total Selected: <span className="font-semibold text-green-600">
                    ₹{assetModalEntity && formatLargeNumber(
                      getAssetsForEntity(assetModalEntity)
                        .filter(a => getEntityAllocation(assetModalEntity).selectedAssets?.[a.id] !== false)
                        .reduce((sum, a) => {
                          const allocation = getEntityAllocation(assetModalEntity);
                          const customAmount = allocation.assetAmounts?.[a.id];
                          return sum + (customAmount !== undefined ? customAmount : a.value);
                        }, 0)
                    )}
                  </span>
                </div>
                <Button onClick={() => setAssetModalOpen(false)}>
                  Done
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Import Clock icon if not already imported
