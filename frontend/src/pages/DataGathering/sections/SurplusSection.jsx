import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark, Target, Info, Download, Calculator, AlertTriangle, CheckCircle, Clock, Settings2, X } from "lucide-react";
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

    // ========== SHEET 2: ANNUAL SAVINGS ==========
    const annualSavingsData = [];
    
    // Header row: Year
    annualSavingsData.push(['Year', ...allYears]);
    
    // Age row
    annualSavingsData.push(['Age', ...allYears.map(y => primaryAge + (y - currentYear))]);
    
    // Salary Income
    annualSavingsData.push(['Salary Income', ...allYears.map(y => {
      const yearStr = y.toString();
      return Math.round(members.reduce((sum, m) => {
        const info = getMemberIncomeInfo(m.id);
        const isPostRetirement = y >= info.retirementYear;
        if (isPostRetirement) return sum;
        const yearsFromNow = y - currentYear;
        return sum + info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow) + info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow);
      }, 0));
    })]);

    // Rental Income
    annualSavingsData.push(['Rental Income', ...allYears.map(y => {
      const yearStr = y.toString();
      return Math.round(members.reduce((sum, m) => {
        const info = getMemberIncomeInfo(m.id);
        const yearsFromNow = y - currentYear;
        return sum + info.baseRental * Math.pow(1 + info.rentalGrowth / 100, yearsFromNow);
      }, 0));
    })]);

    // Investment Income
    annualSavingsData.push(['Investment Income', ...allYears.map(() => 0)]);
    annualSavingsData.push([]);

    // Total Income
    annualSavingsData.push(['Total Income', ...allYears.map(y => {
      const yearStr = y.toString();
      return Math.round(members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0));
    })]);
    annualSavingsData.push([]);

    // Expenses
    annualSavingsData.push(['Expenses', ...allYears.map(y => {
      const yearStr = y.toString();
      return Math.round(members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0));
    })]);

    // Insurance Premium
    const totalAnnualPremium = insurancePremiums.reduce((sum, p) => sum + (parseFloat(p.amount) || parseFloat(p.premium) || 0), 0);
    annualSavingsData.push(['Insurance Premium', ...allYears.map(y => {
      // Assume premiums stop at retirement
      const beforeRetirement = y < earliestRetirement;
      return beforeRetirement ? totalAnnualPremium : 0;
    })]);

    // Loan Installments
    const homeLoanEMI = liabilities.filter(l => l.loan_type === 'home_loan').reduce((sum, l) => sum + (parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0), 0) * 12;
    const vehicleLoanEMI = liabilities.filter(l => l.loan_type === 'vehicle_loan').reduce((sum, l) => sum + (parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0), 0) * 12;
    const personalLoanEMI = liabilities.filter(l => l.loan_type === 'personal_loan').reduce((sum, l) => sum + (parseFloat(l.emi_amount) || parseFloat(l.monthly_emi) || 0), 0) * 12;

    annualSavingsData.push(['Home Loan Installment', ...allYears.map(() => homeLoanEMI)]);
    annualSavingsData.push(['Vehicle Loan Installment', ...allYears.map(() => vehicleLoanEMI)]);
    annualSavingsData.push(['Personal Loan Installment', ...allYears.map(() => personalLoanEMI)]);
    annualSavingsData.push([]);

    // Total Expense
    annualSavingsData.push(['Total Expense', ...allYears.map(y => {
      const yearStr = y.toString();
      const expenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const beforeRetirement = y < earliestRetirement;
      const premium = beforeRetirement ? totalAnnualPremium : 0;
      return Math.round(expenses + premium + homeLoanEMI + vehicleLoanEMI + personalLoanEMI);
    })]);
    annualSavingsData.push([]);

    // Annual Savings
    annualSavingsData.push(['Annual Savings', ...allYears.map(y => {
      const yearStr = y.toString();
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const beforeRetirement = y < earliestRetirement;
      const premium = beforeRetirement ? totalAnnualPremium : 0;
      const totalExp = totalExpenses + premium + homeLoanEMI + vehicleLoanEMI + personalLoanEMI;
      return Math.round(totalIncome - totalExp);
    })]);

    const annualSavingsSheet = XLSX.utils.aoa_to_sheet(annualSavingsData);
    annualSavingsSheet['!cols'] = [{ wch: 25 }, ...allYears.map(() => ({ wch: 12 }))];
    XLSX.utils.book_append_sheet(wb, annualSavingsSheet, "Annual Savings");

    // ========== SHEET 3: DATA GATHERING (Cash Flow) ==========
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

    // Calculate portfolio values year by year
    let portfolioTotal = 0; // Starting portfolio - would need actual initial value
    const portfolioByYear = allYears.map(y => {
      const yearStr = y.toString();
      const totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
      const totalExpenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
      const totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      const savings = totalIncome - totalExpenses - totalGoals;
      const yearMaturities = maturitiesByYear[y]?.total || 0;
      
      // Calculate inflows/outflows
      const cashInflow = yearMaturities;
      const cashOutflow = totalGoals;
      
      // Weighted return
      const weightedReturn = (equityPct * equityReturn + debtPct * debtReturn) / 100;
      
      portfolioTotal = portfolioTotal * (1 + weightedReturn / 100) + savings + cashInflow - cashOutflow;
      
      return {
        year: y,
        portfolio: Math.round(portfolioTotal),
        equityPortion: Math.round(portfolioTotal * equityPct / 100),
        debtPortion: Math.round(portfolioTotal * debtPct / 100),
        savings: Math.round(savings),
        cashInflow: Math.round(cashInflow),
        cashOutflow: Math.round(cashOutflow)
      };
    });

    // Portfolio - Lumpsum
    cashFlowData.push(['Portfolio - Lumpsum', '', ...portfolioByYear.map(p => p.portfolio)]);
    cashFlowData.push([]);

    // Portfolio Lumpsum - Equity (C)
    cashFlowData.push([`Portfolio Lumpsum - Equity (C)`, `${equityPct}%`, ...portfolioByYear.map(p => p.equityPortion)]);
    cashFlowData.push(['Additions', '', ...portfolioByYear.map(p => Math.round(p.savings * equityPct / 100))]);
    cashFlowData.push(['Total (A+C)', '', ...portfolioByYear.map(p => p.equityPortion)]);
    cashFlowData.push([`Expected Returns`, `${equityReturn}%`, ...portfolioByYear.map(p => Math.round(p.equityPortion * equityReturn / 100))]);
    cashFlowData.push(['Investment + Returns', '', ...portfolioByYear.map(p => Math.round(p.equityPortion * (1 + equityReturn / 100)))]);
    cashFlowData.push([]);

    // Portfolio Lumpsum - Debt (D)
    cashFlowData.push([`Portfolio Lumpsum - Debt (D)`, `${debtPct}%`, ...portfolioByYear.map(p => p.debtPortion)]);
    cashFlowData.push(['Additions', '', ...portfolioByYear.map(p => Math.round(p.savings * debtPct / 100))]);
    cashFlowData.push(['Total (B+D)', '', ...portfolioByYear.map(p => p.debtPortion)]);
    cashFlowData.push([`Expected Returns`, `${debtReturn}%`, ...portfolioByYear.map(p => Math.round(p.debtPortion * debtReturn / 100))]);
    cashFlowData.push(['Investment + Returns', '', ...portfolioByYear.map(p => Math.round(p.debtPortion * (1 + debtReturn / 100)))]);
    cashFlowData.push([]);

    // Total Investment + Returns
    cashFlowData.push(['Total Investment + Returns', '', ...portfolioByYear.map(p => Math.round(p.portfolio * (1 + (equityPct * equityReturn + debtPct * debtReturn) / 10000)))]);
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

    // Cash Outflow (Goals)
    cashFlowData.push(['Cash Outflow']);
    goalDetails.forEach(goal => {
      const goalYears = goal.goal_years || (goal.goal_year ? [goal.goal_year.toString()] : []);
      cashFlowData.push([goal.category || 'Goal', `${goal.inflation_percent || 0}%`, ...allYears.map(y => {
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

    // Net Carried Forward Next Year
    cashFlowData.push(['Net Carried Forward Next Year', '', ...portfolioByYear.map(p => p.portfolio)]);

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
      {/* Header with Info and Download */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Year-wise cash flow with member breakdown. Growth rates from Income section, inflation from Expenses.
        </div>
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

  // Export cash flow for specific entity
  const exportEntityCashFlow = (entityId) => {
    const isFamily = entityId === 'family';
    const allocation = isFamily ? familyAllocation : memberAllocations[entityId];
    if (!allocation) return;

    const { equity, debt, equityReturn, debtReturn, includeAssets, selectedAssets, assetStartYears } = allocation;
    const entityAssets = getAssetsForEntity(entityId);
    
    // Determine entity name and end year
    let entityName, entityEndYear;
    if (isFamily) {
      const primaryMember = members.find(m => m.is_primary);
      entityName = primaryMember ? `${primaryMember.name}_Family` : 'Family';
      entityEndYear = endYear;
    } else {
      const member = members.find(m => m.id === entityId);
      entityName = member?.name || 'Member';
      const age = calculateAge(member?.date_of_birth);
      const memberLifeExp = parseInt(member?.life_expectancy) || 85;
      entityEndYear = currentYear + (memberLifeExp - age);
    }

    const wb = XLSX.utils.book_new();
    const allYears = [];
    for (let y = currentYear; y <= entityEndYear; y++) {
      allYears.push(y);
    }

    // Cash Flow Sheet
    const cashFlowData = [];
    cashFlowData.push(['Cash Flow Projection - ' + entityName]);
    cashFlowData.push([]);
    cashFlowData.push(['Asset Allocation', `Equity: ${equity}%`, `Debt: ${debt}%`]);
    cashFlowData.push(['Expected Returns', `Equity: ${equityReturn}%`, `Debt: ${debtReturn}%`]);
    cashFlowData.push([]);

    // Headers
    cashFlowData.push(['Year', ...allYears]);
    
    // Age row
    if (isFamily) {
      cashFlowData.push(['Primary Age', ...allYears.map(y => primaryAge + (y - currentYear))]);
    } else {
      const member = members.find(m => m.id === entityId);
      const age = calculateAge(member?.date_of_birth);
      cashFlowData.push(['Age', ...allYears.map(y => age + (y - currentYear))]);
    }

    // Income
    cashFlowData.push(['Income', ...allYears.map(y => {
      const yearStr = y.toString();
      if (isFamily) {
        return Math.round(members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0));
      } else {
        return Math.round(getProjectedMemberIncome(entityId, yearStr));
      }
    })]);

    // Expenses
    cashFlowData.push(['Expenses', ...allYears.map(y => {
      const yearStr = y.toString();
      if (isFamily) {
        return Math.round(members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0));
      } else {
        return Math.round(getProjectedMemberExpenses(entityId, yearStr));
      }
    })]);

    // Goals
    cashFlowData.push(['Goals', ...allYears.map(y => {
      const yearStr = y.toString();
      if (isFamily) {
        return Math.round(members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0));
      } else {
        return Math.round(getMemberGoalExpenses(entityId, yearStr));
      }
    })]);

    // Annual Surplus
    cashFlowData.push(['Annual Surplus', ...allYears.map(y => {
      const yearStr = y.toString();
      let income, expenses, goals;
      if (isFamily) {
        income = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
        expenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
        goals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      } else {
        income = getProjectedMemberIncome(entityId, yearStr);
        expenses = getProjectedMemberExpenses(entityId, yearStr);
        goals = getMemberGoalExpenses(entityId, yearStr);
      }
      return Math.round(income - expenses - goals);
    })]);

    cashFlowData.push([]);

    // Assets added (if included)
    if (includeAssets) {
      cashFlowData.push(['Assets Added']);
      entityAssets.forEach(asset => {
        if (selectedAssets[asset.id] !== false) {
          const startYear = assetStartYears[asset.id] || currentYear;
          cashFlowData.push([asset.label, ...allYears.map(y => y === startYear ? Math.round(asset.value) : '')]);
        }
      });
      cashFlowData.push([]);
    }

    // Corpus projection
    const weightedReturn = (equity * equityReturn + debt * debtReturn) / 100;
    let corpus = 0;
    let assetsAdded = {};
    const corpusValues = allYears.map(y => {
      const yearStr = y.toString();
      
      // Add assets
      if (includeAssets) {
        entityAssets.forEach(asset => {
          if (!assetsAdded[asset.id] && selectedAssets[asset.id] !== false) {
            const startYear = assetStartYears[asset.id] || currentYear;
            if (y >= startYear) {
              corpus += asset.value;
              assetsAdded[asset.id] = true;
            }
          }
        });
      }
      
      let income, expenses, goals;
      if (isFamily) {
        income = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, yearStr), 0);
        expenses = members.reduce((sum, m) => sum + getProjectedMemberExpenses(m.id, yearStr), 0);
        goals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      } else {
        income = getProjectedMemberIncome(entityId, yearStr);
        expenses = getProjectedMemberExpenses(entityId, yearStr);
        goals = getMemberGoalExpenses(entityId, yearStr);
      }
      
      const surplus = income - expenses - goals;
      corpus = corpus * (1 + weightedReturn / 100) + surplus;
      return Math.round(corpus);
    });

    cashFlowData.push(['Corpus', ...corpusValues]);

    const cashFlowSheet = XLSX.utils.aoa_to_sheet(cashFlowData);
    cashFlowSheet['!cols'] = [{ wch: 20 }, ...allYears.map(() => ({ wch: 12 }))];
    XLSX.utils.book_append_sheet(wb, cashFlowSheet, "Cash Flow");

    XLSX.writeFile(wb, `CashFlow_${entityName.replace(/\s+/g, '_')}.xlsx`);
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
                <th className="text-center py-2 px-3 font-semibold text-gray-700 min-w-[140px]">Name</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700 border-l border-gray-200" colSpan={2}>
                  <span className="text-[10px]">Asset Allocation (%)</span>
                </th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700 border-l border-gray-200" colSpan={2}>
                  <span className="text-[10px]">Expected Returns (%)</span>
                </th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700 border-l border-gray-200 min-w-[60px]">
                  <span className="text-[10px]">Include<br/>Assets</span>
                </th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700 border-l border-gray-200 min-w-[220px]">
                  <span className="text-[10px]">Actions</span>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Family Row */}
              <tr className="bg-amber-50/40 hover:bg-amber-50/60 transition-colors">
                <td className="py-2.5 px-3 text-center">
                  <div className="font-semibold text-gray-800 text-[11px]">{familyName}</div>
                  {familyAllocation.lastCalculated && (
                    <div className="text-[9px] text-gray-400 flex items-center justify-center gap-0.5 mt-0.5">
                      <Clock className="h-2 w-2" />
                      {familyAllocation.lastCalculated}
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-1 border-l border-gray-100 text-center">
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
                <td className="py-2.5 px-1 bg-blue-50/30 text-center">
                  <input
                    type="number"
                    value={familyAllocation.debt}
                    readOnly
                    className="w-12 h-7 text-[11px] border border-gray-200 rounded bg-gray-50 text-center text-gray-500"
                  />
                </td>
                <td className="py-2.5 px-1 border-l border-gray-100 text-center">
                  <input
                    type="number"
                    value={familyAllocation.equityReturn}
                    onChange={(e) => updateAllocation('family', 'equityReturn', parseFloat(e.target.value) || 0)}
                    className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="py-2.5 px-1 bg-blue-50/30 text-center">
                  <input
                    type="number"
                    value={familyAllocation.debtReturn}
                    onChange={(e) => updateAllocation('family', 'debtReturn', parseFloat(e.target.value) || 0)}
                    className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                <td className="py-2.5 px-2 border-l border-gray-100 text-center">
                  <input
                    type="checkbox"
                    checked={familyAllocation.includeAssets}
                    onChange={(e) => updateAllocation('family', 'includeAssets', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </td>
                <td className="py-2.5 px-2 border-l border-gray-100 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button 
                      onClick={() => openAssetModal('family')}
                      disabled={!familyAllocation.includeAssets}
                      className="px-2 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                    >
                      <Settings2 className="h-3 w-3" />
                      Configure
                    </button>
                    <button 
                      onClick={() => runSimulation('family')}
                      className="px-2 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Calculate
                    </button>
                    <button 
                      onClick={() => exportEntityCashFlow('family')}
                      disabled={!familyAllocation.result}
                      className="px-2 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                      title="Download Excel"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>

              {/* Family Result Row */}
              {familyAllocation.result && (
                <tr className={`${familyAllocation.result.success ? 'bg-green-50/50' : 'bg-red-50/50'}`}>
                  <td colSpan={7} className="py-2 px-4">
                    <div className={`text-[11px] flex items-center gap-2 justify-center ${familyAllocation.result.success ? 'text-green-700' : ''}`}>
                      {familyAllocation.result.success ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                      )}
                      {!familyAllocation.result.success ? (
                        <>
                          Money lasts till {familyAllocation.result.lastYear}. {' '}
                          <span className="text-red-600 font-medium">
                            Exhausts {familyAllocation.result.yearsShort} years before life expectancy.
                          </span>
                        </>
                      ) : (
                        familyAllocation.result.message
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {/* Individual Member Rows */}
              {members.map((member, idx) => {
                const allocation = memberAllocations[member.id] || { equity: 60, debt: 40, equityReturn: 12, debtReturn: 0 };
                const age = calculateAge(member.date_of_birth);
                const memberLifeExp = parseInt(member.life_expectancy) || 85;
                const memberInfo = getMemberIncomeInfo(member.id);
                
                return (
                  <React.Fragment key={member.id}>
                    <tr className={`hover:bg-gray-50/80 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="py-2.5 px-3 text-center">
                        <div className="font-medium text-gray-800 text-[11px]">
                          {member.name}
                          {member.is_primary && <span className="text-blue-500 ml-0.5 text-[9px]">*</span>}
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">
                          {age}y | LE:{memberLifeExp} | R:{memberInfo.retirementYear}
                        </div>
                        {allocation.lastCalculated && (
                          <div className="text-[9px] text-gray-400 flex items-center justify-center gap-0.5 mt-0.5">
                            <Clock className="h-2 w-2" />
                            {allocation.lastCalculated}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-1 border-l border-gray-100 text-center">
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
                      <td className="py-2.5 px-1 bg-blue-50/30 text-center">
                        <input
                          type="number"
                          value={allocation.debt}
                          readOnly
                          className="w-12 h-7 text-[11px] border border-gray-200 rounded bg-gray-50 text-center text-gray-500"
                        />
                      </td>
                      <td className="py-2.5 px-1 border-l border-gray-100 text-center">
                        <input
                          type="number"
                          value={allocation.equityReturn}
                          onChange={(e) => updateAllocation(member.id, 'equityReturn', parseFloat(e.target.value) || 0)}
                          className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="py-2.5 px-1 bg-blue-50/30 text-center">
                        <input
                          type="number"
                          value={allocation.debtReturn}
                          onChange={(e) => updateAllocation(member.id, 'debtReturn', parseFloat(e.target.value) || 0)}
                          className="w-12 h-7 text-[11px] border border-gray-200 rounded text-center bg-white focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="py-2.5 px-2 border-l border-gray-100 text-center">
                        <input
                          type="checkbox"
                          checked={allocation.includeAssets || false}
                          onChange={(e) => updateAllocation(member.id, 'includeAssets', e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-2 border-l border-gray-100 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => openAssetModal(member.id)}
                            disabled={!allocation.includeAssets}
                            className="px-2 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                          >
                            <Settings2 className="h-3 w-3" />
                            Configure
                          </button>
                          <button 
                            onClick={() => runSimulation(member.id)}
                            className="px-2 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          >
                            Calculate
                          </button>
                          <button 
                            onClick={() => exportEntityCashFlow(member.id)}
                            disabled={!allocation.result}
                            className="px-2 py-1.5 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                            title="Download Excel"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Member Result Row */}
                    {allocation.result && (
                      <tr className={`${allocation.result.success ? 'bg-green-50/50' : 'bg-red-50/50'}`}>
                        <td colSpan={7} className="py-2 px-4">
                          <div className={`text-[11px] flex items-center gap-2 justify-center ${allocation.result.success ? 'text-green-700' : ''}`}>
                            {allocation.result.success ? (
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                            )}
                            {!allocation.result.success ? (
                              <>
                                Money lasts till {allocation.result.lastYear}. {' '}
                                <span className="text-red-600 font-medium">
                                  Exhausts {allocation.result.yearsShort} years before expectancy.
                                </span>
                              </>
                            ) : (
                              allocation.result.message
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
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
                
                return (
                  <div 
                    key={asset.id} 
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                      isSelected ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100 bg-gray-50/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAsset(assetModalEntity, asset.id)}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm">{asset.label}</div>
                      <div className="text-xs text-gray-500">Market Value</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-green-600">₹{formatLargeNumber(asset.value)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] text-gray-500 font-medium">Include from</span>
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
                        .reduce((sum, a) => sum + a.value, 0)
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
