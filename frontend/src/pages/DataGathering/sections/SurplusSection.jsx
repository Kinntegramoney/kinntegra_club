import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark, Target, Info, Download, Calculator, AlertTriangle, CheckCircle, Clock, Settings2, X, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import { applyPlugin } from "jspdf-autotable";

// Apply the autoTable plugin to jsPDF (required for jsPDF 4.x)
applyPlugin(jsPDF);

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

  // Export to Excel function - Matching reference format with 3 sheets
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

    // ========== SHEET 1: DATA SHEET ==========
    // Contains: Profile, Income, Other Income, Fixed Assets, Insurance, Assets, Expenses, Liabilities, Goals, Investments
    const dataSheetData = [];

    // --- MEMBER INFORMATION ---
    dataSheetData.push(['Member Name', ...members.map(m => m.name)]);
    dataSheetData.push(['Relation', ...members.map(m => m.is_primary ? 'Primary' : m.relation || '')]);
    dataSheetData.push(['Date Of Birth', ...members.map(m => m.date_of_birth || '')]);
    dataSheetData.push([]);

    // --- INCOME ---
    dataSheetData.push(['Income', ...members.map(m => m.name)]);
    dataSheetData.push(['Retirement Age', ...members.map(m => {
      const info = getMemberIncomeInfo(m.id);
      return info.retirementYear - currentYear + primaryAge;
    })]);
    dataSheetData.push(['Life Expectancy', ...members.map(m => parseInt(m.life_expectancy) || 85)]);
    dataSheetData.push(['Salary/Business Income', ...members.map(m => {
      const info = getMemberIncomeInfo(m.id);
      return info.baseSalary + info.baseBusiness;
    })]);
    dataSheetData.push(['Salary Expected Growth', ...members.map(m => {
      const info = getMemberIncomeInfo(m.id);
      return `${info.salaryGrowth}%`;
    })]);
    dataSheetData.push([]);

    // --- OTHER INCOME (Maturities) ---
    dataSheetData.push(['Other Income']);
    dataSheetData.push(['Profile Name', 'Category', 'From', 'To', 'As On', 'Amount', 'Description']);
    Object.entries(maturitiesByYear).forEach(([year, data]) => {
      data.details.forEach(detail => {
        const memberNames = detail.memberIds.map(mid => members.find(m => m.id === mid)?.name || '').join(', ');
        dataSheetData.push([memberNames, detail.type, '', '', year, Math.round(detail.value), '']);
      });
    });
    dataSheetData.push([]);

    // --- FIXED ASSETS ---
    dataSheetData.push(['Fixed Assets']);
    dataSheetData.push(['Profile Name', 'Category', 'Investment Value', 'Est Market Value', 'Purchase Year', 'ROI', 'Rental Income', 'Property Expense', 'Upto Date', 'Growth', 'Yield', 'Description']);
    incomeDetails.filter(inc => ['rental', 'real_estate'].includes(inc.category)).forEach(asset => {
      const details = asset.details || {};
      const memberNames = (asset.member_ids || []).map(mid => members.find(m => m.id === mid)?.name || '').join(', ');
      dataSheetData.push([
        memberNames,
        details.property_type || 'Residential',
        details.purchase_value || details.investment_value || 0,
        details.market_value || 0,
        details.purchase_year || '',
        details.roi || 0,
        details.rental_income || 0,
        details.property_expense || 0,
        '',
        details.growth_rate || 0,
        details.yield || 0,
        details.description || ''
      ]);
    });
    dataSheetData.push([]);

    // --- INSURANCE ---
    dataSheetData.push(['Insurance']);
    dataSheetData.push(['Profile Name', 'Category', 'Amount', 'Description']);
    insurancePremiums.forEach(prem => {
      const member = members.find(m => m.id === prem.member_id);
      dataSheetData.push([
        member?.name || '',
        prem.type || 'Insurance',
        prem.amount || prem.premium || 0,
        prem.description || ''
      ]);
    });
    dataSheetData.push([]);

    // --- ASSETS (Categories) ---
    dataSheetData.push(['Assets']);
    const assetCategoryList = [
      'Residential Property', 'Jewellery', 'Vehicle', 'Inheritance or Wealth Expected', 'Real Estate Investments',
      'Others', 'Unit-Linked Insurance Policies SV', 'PPF (Public Provident Fund)', 'EPF/Superannuation/Gratuity',
      'NSC/POMIS/KVP/RD ect', 'Traditional Insurance Policies SV', 'Bonus/Debentures/CD', 'Direct Equity',
      'Equity Mutual Fund', 'Fixed Deposits', 'Debt Mutual Funds', 'Savings/Cash In Hand', 'Gold/Silver (ETF/Bar/Coin)'
    ];
    assetCategoryList.forEach(cat => {
      dataSheetData.push([cat]);
    });
    dataSheetData.push([]);

    // --- EXPENSES ---
    dataSheetData.push(['Expenses', 'Till Retirement', 'After Retirement']);
    const expenseCategories = [...new Set(expenseDetails.map(e => e.expense_type || 'other'))];
    expenseCategories.forEach(cat => {
      const categoryExpenses = expenseDetails.filter(e => e.expense_type === cat);
      const totalAmount = categoryExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      dataSheetData.push([cat.replace(/_/g, ' '), totalAmount, '']);
    });
    dataSheetData.push([]);

    // --- LIABILITIES ---
    dataSheetData.push(['Liabilities', 'Home Loan', 'Vehicle Loan', 'Personal Loan']);
    dataSheetData.push(['Emi', ...liabilities.map(l => l.emi_amount || l.monthly_emi || '')]);
    dataSheetData.push(['Remaining Terms', ...liabilities.map(l => l.remaining_tenure || l.num_installments || '')]);
    dataSheetData.push(['Interest Rate', ...liabilities.map(l => l.interest_rate || '')]);
    dataSheetData.push([]);

    // --- GOALS ---
    dataSheetData.push(['Goals', 'Amount', 'Inflation', 'Year']);
    goalDetails.forEach(goal => {
      const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
      dataSheetData.push([
        goal.category || 'Goal',
        goal.goal_amount || 0,
        `${goal.inflation_percent || 0}%`,
        goalYears.join(',')
      ]);
    });
    dataSheetData.push([]);

    // --- INVESTMENTS ---
    dataSheetData.push(['Investments']);
    const investmentCategories = ['PPF', 'RD', 'MF', 'Equity', 'Gold', 'Other'];
    investmentCategories.forEach(cat => {
      const catInvestments = investmentDetails.filter(inv => inv.category?.toLowerCase().includes(cat.toLowerCase()));
      const total = catInvestments.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      dataSheetData.push([cat, total > 0 ? total : '']);
    });

    const dataSheet = XLSX.utils.aoa_to_sheet(dataSheetData);
    dataSheet['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, dataSheet, "Data Sheet");

    // ========== SHEET 2: DATA GATHERING (Cash Flow) ==========
    const cashFlowData = [];
    
    // Allocation settings (from simulator if available)
    const equityPct = 90;
    const debtPct = 10;
    const equityReturn = 12;
    const debtReturn = 7;

    // Header row: Year
    cashFlowData.push(['Year', '', ...allYears]);
    
    // Age row
    cashFlowData.push(['Age', '', ...allYears.map(y => primaryAge + (y - currentYear))]);

    // Annual Savings (from previous calculation)
    cashFlowData.push(['Annual Savings ', '', ...allYears.map(y => {
      const yearStr = y.toString();
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      return Math.round(Math.max(0, totalIncome - totalExpenses - totalGoals));
    })]);
    cashFlowData.push([]);

    // Annual Savings Invested In
    cashFlowData.push(['Annual Savings Invested In']);
    cashFlowData.push([`Equity (A)`, `${equityPct}%`, ...allYears.map(y => {
      const yearStr = y.toString();
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const savings = Math.max(0, totalIncome - totalExpenses - totalGoals);
      return Math.round(savings * equityPct / 100);
    })]);
    cashFlowData.push([`Debt (B)`, `${debtPct}%`, ...allYears.map(y => {
      const yearStr = y.toString();
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const savings = Math.max(0, totalIncome - totalExpenses - totalGoals);
      return Math.round(savings * debtPct / 100);
    })]);
    cashFlowData.push([]);

    // Calculate portfolio values year by year with proper Opening/Closing balance logic
    // Opening Balance = Previous Year's Closing Balance (Total Investment + Returns)
    let previousClosingBalance = 0; // Starting portfolio
    const portfolioByYear = allYears.map((y, index) => {
      const yearStr = y.toString();
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const savings = totalIncome - totalExpenses - totalGoals;
      const yearMaturities = maturitiesByYear[y]?.total || 0;
      
      // Opening Balance = Previous year's closing (Total Investment + Returns)
      const openingBalance = previousClosingBalance;
      
      // Additions = Savings + Cash Inflows
      const additions = savings + yearMaturities;
      
      // Calculate returns on opening balance
      const weightedReturnRate = (equityPct * equityReturn + debtPct * debtReturn) / 100;
      const returns = openingBalance * (weightedReturnRate / 100);
      
      // Cash outflow (goals)
      const cashOutflow = totalGoals;
      
      // Closing Balance = Opening + Additions + Returns - Outflows
      const closingBalance = openingBalance + additions + returns - cashOutflow;
      
      // Store closing balance for next year's opening
      previousClosingBalance = closingBalance;
      
      return {
        year: y,
        openingBalance: Math.round(openingBalance),
        additions: Math.round(additions),
        returns: Math.round(returns),
        cashInflow: Math.round(yearMaturities),
        cashOutflow: Math.round(cashOutflow),
        closingBalance: Math.round(closingBalance),
        portfolio: Math.round(closingBalance), // For backward compatibility
        equityPortion: Math.round(closingBalance * equityPct / 100),
        debtPortion: Math.round(closingBalance * debtPct / 100),
        savings: Math.round(savings)
      };
    });

    // Portfolio Summary with Opening/Closing Balance
    cashFlowData.push(['PORTFOLIO SUMMARY']);
    cashFlowData.push(['Opening Balance', '', ...portfolioByYear.map(p => p.openingBalance)]);
    cashFlowData.push(['Additions (Savings + Inflows)', '', ...portfolioByYear.map(p => p.additions)]);
    cashFlowData.push(['Expected Returns', '', ...portfolioByYear.map(p => p.returns)]);
    cashFlowData.push(['Less: Cash Outflow (Goals)', '', ...portfolioByYear.map(p => -p.cashOutflow)]);
    cashFlowData.push(['Closing Balance', '', ...portfolioByYear.map(p => p.closingBalance)]);
    cashFlowData.push([]);

    // Portfolio Lumpsum - Equity (C)
    cashFlowData.push([`Portfolio Lumpsum - Equity (C)`, `${equityPct}%`, ...portfolioByYear.map(p => Math.round(p.openingBalance * equityPct / 100))]);
    cashFlowData.push(['Additions', '', ...portfolioByYear.map(p => Math.round(p.additions * equityPct / 100))]);
    cashFlowData.push(['Total Equity', '', ...portfolioByYear.map(p => Math.round((p.openingBalance + p.additions) * equityPct / 100))]);
    cashFlowData.push([`Expected Returns`, `${equityReturn}%`, ...portfolioByYear.map(p => Math.round(p.openingBalance * equityPct / 100 * equityReturn / 100))]);
    cashFlowData.push(['Investment + Returns', '', ...portfolioByYear.map(p => Math.round(p.equityPortion * (1 + equityReturn / 100)))]);
    cashFlowData.push([]);

    // Portfolio Lumpsum - Debt (D)
    cashFlowData.push([`Portfolio Lumpsum - Debt (D)`, `${debtPct}%`, ...portfolioByYear.map(p => Math.round(p.openingBalance * debtPct / 100))]);
    cashFlowData.push(['Additions', '', ...portfolioByYear.map(p => Math.round(p.additions * debtPct / 100))]);
    cashFlowData.push(['Total Debt', '', ...portfolioByYear.map(p => Math.round((p.openingBalance + p.additions) * debtPct / 100))]);
    cashFlowData.push([`Expected Returns`, `${debtReturn}%`, ...portfolioByYear.map(p => Math.round(p.openingBalance * debtPct / 100 * debtReturn / 100))]);
    cashFlowData.push(['Investment + Returns', '', ...portfolioByYear.map(p => Math.round(p.debtPortion * (1 + debtReturn / 100)))]);
    cashFlowData.push([]);

    // Total Investment + Returns (This becomes next year's Opening Balance)
    cashFlowData.push(['Total Investment + Returns (Next Year Opening)', '', ...portfolioByYear.map(p => p.closingBalance)]);
    cashFlowData.push([]);

    // Cash Inflow
    cashFlowData.push(['Cash Inflow']);
    // Group maturities by type
    const maturityTypes = {};
    Object.values(maturitiesByYear).forEach(yearData => {
      yearData.details.forEach(d => {
        if (!maturityTypes[d.type]) maturityTypes[d.type] = {};
      });
    });
    Object.keys(maturityTypes).forEach(type => {
      cashFlowData.push([type, '', ...allYears.map(y => {
        const yearData = maturitiesByYear[y];
        if (!yearData) return 0;
        return Math.round(yearData.details.filter(d => d.type === type).reduce((sum, d) => sum + d.value, 0));
      })]);
    });
    cashFlowData.push(['Total', '', ...allYears.map(y => maturitiesByYear[y]?.total || 0)]);
    cashFlowData.push([]);

    // Cash Outflow (Goals) - List each goal by name
    cashFlowData.push(['CASH OUTFLOW (Goals)']);
    goalDetails.forEach(goal => {
      const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
      // Use goal name if available, otherwise use category, otherwise 'Goal'
      const goalName = goal.name || goal.goal_name || goal.category || 'Goal';
      cashFlowData.push([goalName, `${goal.inflation_percent || 0}%`, ...allYears.map(y => {
        if (!goalYears.includes(y.toString())) return 0;
        const amountToday = parseFloat(goal.goal_amount) || 0;
        const inflationRate = parseFloat(goal.inflation_percent) || 0;
        const yearsFromNow = y - currentYear;
        return Math.round(yearsFromNow > 0 ? amountToday * Math.pow(1 + inflationRate / 100, yearsFromNow) : amountToday);
      })]);
    });

    // Retirement Withdrawal (Negative savings when expenses > income)
    cashFlowData.push(['Retirement Withdrawal', '0%', ...allYears.map(y => {
      const yearStr = y.toString();
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const deficit = totalExpenses - totalIncome;
      return Math.round(Math.max(0, deficit));
    })]);

    // Total Outflow
    cashFlowData.push(['Total', '', ...allYears.map(y => {
      const yearStr = y.toString();
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const deficit = Math.max(0, totalExpenses - totalIncome);
      return Math.round(totalGoals + deficit);
    })]);
    cashFlowData.push([]);

    // Opening Balance for Next Year (This is the Closing Balance which becomes next year's opening)
    cashFlowData.push(['Opening Balance for Next Year', '', ...portfolioByYear.map(p => p.closingBalance)]);

    const cashFlowSheet = XLSX.utils.aoa_to_sheet(cashFlowData);
    cashFlowSheet['!cols'] = [{ wch: 30 }, { wch: 10 }, ...allYears.map(() => ({ wch: 12 }))];
    XLSX.utils.book_append_sheet(wb, cashFlowSheet, "Data Gathering");

    // Download the workbook
    const familyName = family?.family_name || 'Family';
    XLSX.writeFile(wb, `Comprehensive_Plan_${familyName.replace(/\s+/g, '_')}.xlsx`);
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
            {/* Income Row */}
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
                      <TooltipContent side="right" className="text-xs max-w-[220px]">
                        <p>Projected income including salary, business, rental & pension. Growth rates applied from Income section.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
  calculateAge
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
  const DEBT_CATEGORIES_WITH_MATURITY = ['fd', 'bonds', 'bond', 'rd_pis', 'insurance_income', 'ppf', 'nps'];

  // Get assets for a specific member or family
  const getAssetsForEntity = (entityId) => {
    const assets = [];
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      const hasMaturityDate = details.maturity_date || details.maturity_year || details.maturity_amount;
      const isDebtCategory = DEBT_CATEGORIES_WITH_MATURITY.includes(inc.category);
      
      if (isDebtCategory && hasMaturityDate) return;
      
      const mktValue = parseFloat(details.market_value) || parseFloat(details.current_value) || 
                       parseFloat(details.investment_value) || 0;
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
      commodities: 'Gold/Commodities', insurance_income: 'Insurance', cash: 'Cash', vehicle: 'Vehicle'
    };
    return labels[category] || category;
  };

  const formatLargeNumber = (num) => {
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
    return num.toLocaleString('en-IN');
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
    const isFamily = entityId === 'family';
    const allocation = isFamily ? familyAllocation : memberAllocations[entityId];
    if (!allocation) return;

    const { equity, debt, equityReturn, debtReturn, includeAssets, selectedAssets, assetStartYears, assetAmounts } = allocation;
    const weightedReturn = (equity * equityReturn + debt * debtReturn) / 100;
    
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

    for (let year = currentYear; year <= entityEndYear; year++) {
      const yearStr = year.toString();
      
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
      
      const yearSurplus = totalIncome - totalExpenses - totalGoals;
      corpus = corpus * (1 + weightedReturn / 100) + yearSurplus;
      
      if (corpus <= 0 && !exhaustYear) {
        exhaustYear = year;
      }
    }
    
    const result = exhaustYear ? {
      success: false,
      lastYear: exhaustYear,
      yearsShort: entityEndYear - exhaustYear,
      message: `The money will last till year ${exhaustYear}. Your money will exhaust ${entityEndYear - exhaustYear} years before your ${isFamily ? 'living' : ''} expectancy.`
    } : {
      success: true,
      lastYear: entityEndYear,
      yearsShort: 0,
      finalCorpus: corpus,
      message: `Great! Your money will last till ${entityEndYear} with ₹${formatLargeNumber(corpus)} remaining.`
    };

    const now = new Date();
    const timestamp = now.toLocaleDateString('en-IN') + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

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
      const totalAmount = categoryExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
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

      // Annual savings (Income - Expenses - Goals)
      const annualSavings = totalIncome - totalExpense - totalGoalExp;
      
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

    // ═══════════════ SAVINGS SECTION ═══════════════
    cashFlowData.push([]);
    cashFlowData.push(['▶ NET ANNUAL SAVINGS']);
    cashFlowData.push([]);
    cashFlowData.push(['  Net Savings = (A) - (B) - (C)', ...yearlyData.map(d => formatCurrency(d.annualSavings))]);
    cashFlowData.push([`  Allocated to Equity (${equity}%)`, ...yearlyData.map(d => formatCurrency(d.savingsEquity))]);
    cashFlowData.push([`  Allocated to Debt (${debt}%)`, ...yearlyData.map(d => formatCurrency(d.savingsDebt))]);
    cashFlowData.push([]);
    cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);

    // ═══════════════ INVESTMENTS SECTION ═══════════════
    if (entityInvestments.length > 0) {
      cashFlowData.push([]);
      cashFlowData.push(['▶ ONGOING INVESTMENTS (SIP/Recurring) - Annual']);
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
      cashFlowData.push(['  TOTAL ANNUAL INVESTMENTS', ...yearlyData.map(d => formatCurrency(d.totalInvestments))]);
      cashFlowData.push([]);
      cashFlowData.push(['────────────────────────────────────────────────────────────────────────────────────────────────────────────────────']);
    }

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

  // ========== PDF EXPORT FUNCTION (COMPREHENSIVE) ==========
  const exportEntityPDF = (entityId, isFamily, allocation) => {
    const { equity, debt, equityReturn, debtReturn, includeAssets, selectedAssets, assetStartYears, assetAmounts } = allocation;
    
    // Get entity details
    let entityName, entityAge, entityEndYear;
    const targetMembers = isFamily ? members : members.filter(m => m.id === entityId);
    if (isFamily) {
      const primary = members.find(m => m.is_primary);
      entityName = primary ? `${primary.name} & Family` : 'Family';
      entityAge = calculateAge(primary?.date_of_birth);
      entityEndYear = endYear;
    } else {
      const member = members.find(m => m.id === entityId);
      entityName = member?.name || 'Member';
      entityAge = calculateAge(member?.date_of_birth);
      const memberLifeExp = parseInt(member?.life_expectancy) || 85;
      entityEndYear = currentYear + (memberLifeExp - entityAge);
    }

    // Get entity data
    const entityAssets = getAssetsForEntity(entityId);
    const liabilities = family?.liabilities || [];
    const insurancePremiums = family?.insurance_premiums || [];
    const entityLiabilities = isFamily ? liabilities : liabilities.filter(l => l.member_id === entityId || l.member_ids?.includes(entityId));
    const entityPremiums = isFamily ? insurancePremiums : insurancePremiums.filter(p => p.member_id === entityId);
    const entityGoals = goalDetails || [];
    const entityInvestments = investmentDetails || [];
    
    const totalAnnualPremium = entityPremiums.reduce((sum, p) => sum + (parseFloat(p.amount) || parseFloat(p.premium) || 0), 0);

    // Generate all years from current to end year
    const allYears = [];
    for (let y = currentYear; y <= entityEndYear; y++) {
      allYears.push(y);
    }

    // Pre-calculate assets by year
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

    // Calculate detailed yearly data (same logic as Excel export)
    let equityCorpus = 0;
    let debtCorpus = 0;
    
    const yearlyData = allYears.map((y, idx) => {
      const yearStr = y.toString();
      const age = entityAge + (y - currentYear);
      const yearsFromNow = y - currentYear;
      
      // Detailed income breakdown by member
      const memberIncomes = {};
      let totalSalary = 0, totalBusiness = 0, totalRental = 0;
      
      targetMembers.forEach(m => {
        const info = getMemberIncomeInfo(m.id);
        const isPostRetirement = y >= info.retirementYear;
        
        const salary = isPostRetirement ? 0 : info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow);
        const business = isPostRetirement ? 0 : info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow);
        const rental = info.baseRental * Math.pow(1 + (info.rentalGrowth || 5) / 100, yearsFromNow);
        
        memberIncomes[m.id] = { name: m.name, salary, business, rental, total: salary + business + rental };
        totalSalary += salary;
        totalBusiness += business;
        totalRental += rental;
      });
      
      const totalIncome = totalSalary + totalBusiness + totalRental;

      // Detailed expense breakdown
      const memberExpenses = {};
      let totalLivingExp = 0;
      
      targetMembers.forEach(m => {
        const expenses = getProjectedMemberExpenses(m.id, yearStr);
        memberExpenses[m.id] = { name: m.name, amount: expenses };
        totalLivingExp += expenses;
      });

      // Insurance premium
      const info = getMemberIncomeInfo(targetMembers[0]?.id);
      const insurancePremium = y < (info?.retirementYear || 2050) ? totalAnnualPremium : 0;
      
      // Loan EMIs
      let totalLoanEMI = 0;
      entityLiabilities.forEach(l => {
        const emi = (parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0) * 12;
        const remaining = parseInt(l.remaining_tenure) || parseInt(l.num_installments) || 0;
        const yearsRemaining = Math.ceil(remaining / 12);
        if (yearsFromNow < yearsRemaining) {
          totalLoanEMI += emi;
        }
      });
      
      const totalExpense = totalLivingExp + insurancePremium + totalLoanEMI;

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

      // Investment details
      let totalInvestments = 0;
      entityInvestments.forEach(inv => {
        const monthlyAmount = parseFloat(inv.monthly_investment) || parseFloat(inv.sip_amount) || parseFloat(inv.amount) || 0;
        const annualAmount = parseFloat(inv.annual_investment) || (monthlyAmount * 12);
        totalInvestments += annualAmount;
      });

      // Annual savings
      const annualSavings = totalIncome - totalExpense - totalGoalExp;
      
      // Savings allocation
      const savingsEquity = annualSavings > 0 ? annualSavings * equity / 100 : 0;
      const savingsDebt = annualSavings > 0 ? annualSavings * debt / 100 : 0;

      // Assets added
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
        memberIncomes,
        totalSalary: Math.round(totalSalary),
        totalBusiness: Math.round(totalBusiness),
        totalRental: Math.round(totalRental),
        totalIncome: Math.round(totalIncome),
        memberExpenses,
        totalLivingExp: Math.round(totalLivingExp),
        insurancePremium: Math.round(insurancePremium),
        totalLoanEMI: Math.round(totalLoanEMI),
        totalExpense: Math.round(totalExpense),
        goalExpenseDetails,
        totalGoalExp: Math.round(totalGoalExp),
        totalInvestments: Math.round(totalInvestments),
        annualSavings: Math.round(annualSavings),
        savingsEquity: Math.round(savingsEquity),
        savingsDebt: Math.round(savingsDebt),
        assetAddition: Math.round(assetAdditionThisYear),
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

    // Format currency for PDF
    const formatPDFCurrency = (num) => {
      if (num === 0 || num === null || num === undefined) return '-';
      const rounded = Math.round(num);
      if (Math.abs(rounded) >= 10000000) return `₹ ${(rounded / 10000000).toFixed(2)} Cr`;
      if (Math.abs(rounded) >= 100000) return `₹ ${(rounded / 100000).toFixed(2)} L`;
      return '₹ ' + rounded.toLocaleString('en-IN');
    };

    // Create PDF
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors
    const primaryColor = [21, 101, 192]; // Blue
    const secondaryColor = [245, 245, 245]; // Light gray
    const greenColor = [46, 125, 50]; // Green for income
    const redColor = [198, 40, 40]; // Red for expenses
    const amberColor = [255, 160, 0]; // Amber for goals
    
    // Helper to add page header
    const addPageHeader = (title) => {
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 18, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, 10, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(entityName.toUpperCase(), pageWidth / 2, 15, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      return 25;
    };
    
    // Helper to add page footer
    const addPageFooter = (pageNum, totalPages) => {
      doc.setFillColor(...primaryColor);
      doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')} | Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 3, { align: 'center' });
    };

    // ============== PAGE 1: SUMMARY ==============
    let yPos = addPageHeader('COMPREHENSIVE FINANCIAL PLAN');
    
    // Summary Stats Box
    doc.setFillColor(...secondaryColor);
    doc.roundedRect(10, yPos, pageWidth - 20, 22, 3, 3, 'F');
    
    const lastYear = yearlyData[yearlyData.length - 1];
    const firstYear = yearlyData[0];
    
    const metrics = [
      { label: 'Current Age', value: `${entityAge} years` },
      { label: 'Life Expectancy', value: `${entityAge + allYears.length - 1} years` },
      { label: 'Current Income', value: formatPDFCurrency(firstYear.totalIncome) },
      { label: 'Final Portfolio', value: formatPDFCurrency(lastYear.closingTotal) },
      { label: 'Allocation', value: `${equity}% Equity / ${debt}% Debt` }
    ];
    
    const colWidth = (pageWidth - 20) / metrics.length;
    metrics.forEach((m, i) => {
      const xPos = 10 + colWidth * i + colWidth / 2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(m.label, xPos, yPos + 8, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(m.value, xPos, yPos + 16, { align: 'center' });
    });
    
    yPos += 30;
    
    // Cash Flow Summary Table (First 15 years)
    const displayYears = yearlyData.slice(0, 15);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.text('YEARLY CASH FLOW SUMMARY', 10, yPos);
    yPos += 3;
    
    doc.autoTable({
      startY: yPos,
      head: [['Year', 'Age', 'Total Income', 'Total Expenses', 'Goals', 'Net Savings', 'Portfolio Value']],
      body: displayYears.map(d => [
        d.year,
        d.age,
        formatPDFCurrency(d.totalIncome),
        formatPDFCurrency(d.totalExpense),
        formatPDFCurrency(d.totalGoalExp),
        formatPDFCurrency(d.annualSavings),
        formatPDFCurrency(d.closingTotal)
      ]),
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      bodyStyles: { halign: 'center', fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 250, 255] },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 12 }, 6: { fontStyle: 'bold' } },
      margin: { left: 10, right: 10 }
    });
    
    yPos = doc.lastAutoTable.finalY + 8;
    
    // Portfolio Summary Boxes
    const boxWidth = (pageWidth - 40) / 3;
    
    // Equity Box
    doc.setFillColor(227, 242, 253);
    doc.roundedRect(10, yPos, boxWidth, 35, 3, 3, 'F');
    doc.setTextColor(...primaryColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('EQUITY PORTFOLIO', 10 + boxWidth / 2, yPos + 8, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Allocation: ${equity}%`, 10 + boxWidth / 2, yPos + 16, { align: 'center' });
    doc.text(`Return: ${equityReturn}% p.a.`, 10 + boxWidth / 2, yPos + 22, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`Final: ${formatPDFCurrency(lastYear.closingEquity)}`, 10 + boxWidth / 2, yPos + 30, { align: 'center' });
    
    // Debt Box
    doc.setFillColor(255, 243, 224);
    doc.roundedRect(15 + boxWidth, yPos, boxWidth, 35, 3, 3, 'F');
    doc.setTextColor(230, 126, 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('DEBT PORTFOLIO', 15 + boxWidth + boxWidth / 2, yPos + 8, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Allocation: ${debt}%`, 15 + boxWidth + boxWidth / 2, yPos + 16, { align: 'center' });
    doc.text(`Return: ${debtReturn}% p.a.`, 15 + boxWidth + boxWidth / 2, yPos + 22, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`Final: ${formatPDFCurrency(lastYear.closingDebt)}`, 15 + boxWidth + boxWidth / 2, yPos + 30, { align: 'center' });
    
    // Total Box
    doc.setFillColor(232, 245, 233);
    doc.roundedRect(20 + boxWidth * 2, yPos, boxWidth, 35, 3, 3, 'F');
    doc.setTextColor(...greenColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TOTAL PORTFOLIO', 20 + boxWidth * 2 + boxWidth / 2, yPos + 8, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Starting: ${formatPDFCurrency(firstYear.closingTotal)}`, 20 + boxWidth * 2 + boxWidth / 2, yPos + 16, { align: 'center' });
    doc.text(`Growth: ${((lastYear.closingTotal / (firstYear.closingTotal || 1) - 1) * 100).toFixed(1)}%`, 20 + boxWidth * 2 + boxWidth / 2, yPos + 22, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Final: ${formatPDFCurrency(lastYear.closingTotal)}`, 20 + boxWidth * 2 + boxWidth / 2, yPos + 30, { align: 'center' });
    
    // ============== PAGE 2: INCOME DETAILS ==============
    doc.addPage();
    yPos = addPageHeader('INCOME BREAKDOWN');
    
    // Member Income Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...greenColor);
    doc.text('MEMBER-WISE INCOME (Annual)', 10, yPos);
    yPos += 3;
    
    const incomeHeaders = ['Year', ...targetMembers.map(m => m.name.split(' ')[0]), 'Total Income'];
    const incomeBody = displayYears.map(d => [
      d.year,
      ...targetMembers.map(m => formatPDFCurrency(d.memberIncomes[m.id]?.total || 0)),
      formatPDFCurrency(d.totalIncome)
    ]);
    
    doc.autoTable({
      startY: yPos,
      head: [incomeHeaders],
      body: incomeBody,
      theme: 'striped',
      headStyles: { fillColor: greenColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      bodyStyles: { halign: 'center', fontSize: 7 },
      margin: { left: 10, right: 10 }
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    // Income Type Breakdown
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...greenColor);
    doc.text('INCOME BY TYPE', 10, yPos);
    yPos += 3;
    
    doc.autoTable({
      startY: yPos,
      head: [['Year', 'Salary', 'Business', 'Rental', 'Total']],
      body: displayYears.map(d => [
        d.year,
        formatPDFCurrency(d.totalSalary),
        formatPDFCurrency(d.totalBusiness),
        formatPDFCurrency(d.totalRental),
        formatPDFCurrency(d.totalIncome)
      ]),
      theme: 'striped',
      headStyles: { fillColor: greenColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      bodyStyles: { halign: 'center', fontSize: 7 },
      margin: { left: 10, right: 10 }
    });
    
    // ============== PAGE 3: EXPENSES & GOALS ==============
    doc.addPage();
    yPos = addPageHeader('EXPENSES & GOALS');
    
    // Expense Breakdown
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...redColor);
    doc.text('EXPENSE BREAKDOWN (Annual)', 10, yPos);
    yPos += 3;
    
    doc.autoTable({
      startY: yPos,
      head: [['Year', 'Living Expenses', 'Insurance', 'Loan EMIs', 'Total Expenses']],
      body: displayYears.map(d => [
        d.year,
        formatPDFCurrency(d.totalLivingExp),
        formatPDFCurrency(d.insurancePremium),
        formatPDFCurrency(d.totalLoanEMI),
        formatPDFCurrency(d.totalExpense)
      ]),
      theme: 'striped',
      headStyles: { fillColor: redColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      bodyStyles: { halign: 'center', fontSize: 7 },
      margin: { left: 10, right: 10 }
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    // Goals Table
    const allGoalNames = new Set();
    yearlyData.forEach(d => Object.keys(d.goalExpenseDetails).forEach(name => allGoalNames.add(name)));
    
    if (allGoalNames.size > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...amberColor);
      doc.text('FINANCIAL GOALS', 10, yPos);
      yPos += 3;
      
      const goalHeaders = ['Year', ...Array.from(allGoalNames), 'Total Goals'];
      const goalBody = displayYears.map(d => [
        d.year,
        ...Array.from(allGoalNames).map(name => d.goalExpenseDetails[name] ? formatPDFCurrency(d.goalExpenseDetails[name]) : '-'),
        formatPDFCurrency(d.totalGoalExp)
      ]);
      
      doc.autoTable({
        startY: yPos,
        head: [goalHeaders],
        body: goalBody,
        theme: 'striped',
        headStyles: { fillColor: amberColor, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', fontSize: 7 },
        bodyStyles: { halign: 'center', fontSize: 7 },
        margin: { left: 10, right: 10 }
      });
    }
    
    // ============== PAGE 4: PORTFOLIO DETAILS ==============
    doc.addPage();
    yPos = addPageHeader('PORTFOLIO GROWTH');
    
    // Portfolio Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.text('EQUITY PORTFOLIO', 10, yPos);
    yPos += 3;
    
    doc.autoTable({
      startY: yPos,
      head: [['Year', 'Opening', 'Savings Added', `Returns @${equityReturn}%`, 'Closing']],
      body: displayYears.map((d, idx) => [
        d.year,
        formatPDFCurrency(d.openingEquity),
        formatPDFCurrency(d.savingsEquity),
        formatPDFCurrency(d.equityReturns),
        formatPDFCurrency(d.closingEquity)
      ]),
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      bodyStyles: { halign: 'center', fontSize: 7 },
      columnStyles: { 4: { fontStyle: 'bold' } },
      margin: { left: 10, right: 10 }
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(230, 126, 34);
    doc.text('DEBT PORTFOLIO', 10, yPos);
    yPos += 3;
    
    doc.autoTable({
      startY: yPos,
      head: [['Year', 'Opening', 'Savings Added', `Returns @${debtReturn}%`, 'Closing']],
      body: displayYears.map((d, idx) => [
        d.year,
        formatPDFCurrency(d.openingDebt),
        formatPDFCurrency(d.savingsDebt),
        formatPDFCurrency(d.debtReturns),
        formatPDFCurrency(d.closingDebt)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [230, 126, 34], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      bodyStyles: { halign: 'center', fontSize: 7 },
      columnStyles: { 4: { fontStyle: 'bold' } },
      margin: { left: 10, right: 10 }
    });
    
    // Check for retirement withdrawals
    const hasWithdrawals = yearlyData.some(d => d.withdrawalAmount > 0);
    if (hasWithdrawals) {
      yPos = doc.lastAutoTable.finalY + 10;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...redColor);
      doc.text('RETIREMENT WITHDRAWALS (When Expenses > Income)', 10, yPos);
      yPos += 3;
      
      const withdrawalYears = yearlyData.filter(d => d.withdrawalAmount > 0);
      doc.autoTable({
        startY: yPos,
        head: [['Year', 'Age', 'Withdrawal Required', 'From Equity', 'From Debt', 'Remaining Portfolio']],
        body: withdrawalYears.slice(0, 15).map(d => [
          d.year,
          d.age,
          formatPDFCurrency(d.withdrawalAmount),
          formatPDFCurrency(d.withdrawalAmount * equity / 100),
          formatPDFCurrency(d.withdrawalAmount * debt / 100),
          formatPDFCurrency(d.closingTotal)
        ]),
        theme: 'striped',
        headStyles: { fillColor: redColor, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
        bodyStyles: { halign: 'center', fontSize: 7 },
        margin: { left: 10, right: 10 }
      });
    }
    
    // Add page numbers
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addPageFooter(i, totalPages);
    }
    
    // Save PDF
    doc.save(`Financial_Plan_${entityName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
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
                <th className="text-center py-2 px-3 font-semibold text-gray-700 min-w-[180px]">Name</th>
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
                <td className="py-3 px-3 text-center">
                  <div className="font-semibold text-gray-800 text-[11px]">{familyName}</div>
                  {familyAllocation.result && (
                    <div className={`mt-1 text-[10px] flex items-center justify-center gap-1 ${familyAllocation.result.success ? 'text-green-600' : 'text-red-600'}`}>
                      {familyAllocation.result.success ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      <span>
                        {familyAllocation.result.success 
                          ? `Lasts till ${familyAllocation.result.lastYear}` 
                          : `Exhausts in ${familyAllocation.result.lastYear} (${familyAllocation.result.yearsShort}y short)`
                        }
                      </span>
                    </div>
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
                      onClick={() => exportEntityCashFlow('family')}
                      disabled={!familyAllocation.result}
                      className="px-3 py-1.5 text-[10px] font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                      title="Download Excel"
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
                      <td className="py-3 px-3 text-center">
                        <div className="font-medium text-gray-800 text-[11px]">
                          {member.name}
                          {member.is_primary && <span className="text-blue-500 ml-0.5 text-[9px]">*</span>}
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">
                          {age}y | LE:{memberLifeExp} | R:{memberInfo.retirementYear}
                        </div>
                        {allocation.result && (
                          <div className={`mt-1 text-[10px] flex items-center justify-center gap-1 ${allocation.result.success ? 'text-green-600' : 'text-red-600'}`}>
                            {allocation.result.success ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <AlertTriangle className="h-3 w-3" />
                            )}
                            <span>
                              {allocation.result.success 
                                ? `Lasts till ${allocation.result.lastYear}` 
                                : `Exhausts in ${allocation.result.lastYear} (${allocation.result.yearsShort}y short)`
                              }
                            </span>
                          </div>
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
