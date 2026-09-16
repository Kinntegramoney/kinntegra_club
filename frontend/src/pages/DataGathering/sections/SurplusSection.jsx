import React, { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, TrendingUp, TrendingDown, PiggyBank, Landmark, Target, Info, Download, Calculator, AlertTriangle, CheckCircle, Clock, Settings2, X, FileText } from "lucide-react";
// recharts removed - using simple text display
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { generateFinancialPlanPDF } from "@/components/PDFExport/FinancialPlanPDF";

// ========================================
// INCOME CATEGORY CONFIGURATION
// Maps stored category values to Excel display labels
// Source of truth: Matches IncomeSection.jsx INCOME_CATEGORIES
// ========================================
const INCOME_CATEGORY_CONFIG = {
  // Regular Income (recurring)
  salary: { 
    label: "Salary Income", 
    type: "regular",
    fields: ["net_income_monthly", "net_income_yearly", "avg_growth_rate", "increment_month"]
  },
  business: { 
    label: "Business Income", 
    type: "regular",
    fields: ["net_income_yearly", "avg_growth_rate"]
  },
  // Also handle 'business_income' as alias
  business_income: { 
    label: "Business Income", 
    type: "regular",
    fields: ["net_income_yearly", "avg_growth_rate"]
  },
  rental: { 
    label: "Property Details", 
    type: "property",
    fields: ["property_type", "property_details", "investment_amount", "investment_date", "market_value", 
             "market_value_date", "xirr_return", "is_on_rent", "rent_per_month", "annual_rent", 
             "maintenance", "property_tax", "absolute_return"]
  },
  // Also handle 'property_details' as alias
  property_details: { 
    label: "Property Details", 
    type: "property",
    fields: ["property_type", "property_details", "investment_amount", "investment_date", "market_value", 
             "market_value_date", "xirr_return", "is_on_rent", "rent_per_month", "annual_rent", 
             "maintenance", "property_tax", "absolute_return"]
  },
  
  // Retirement Corpus (with maturity)
  ppf: { 
    label: "PPF", 
    type: "retirement",
    fields: ["market_value", "annual_contribution", "growth_rate", "upto_year", "maturity_date", "maturity_value"]
  },
  epf: { 
    label: "EPF", 
    type: "retirement",
    fields: ["market_value", "annual_contribution", "growth_rate", "upto_year", "maturity_date", "maturity_value"]
  },
  gratuity: { 
    label: "Gratuity", 
    type: "retirement",
    fields: ["market_value", "growth_rate", "maturity_date", "maturity_value"]
  },
  pension: { 
    label: "Pension", 
    type: "pension",
    fields: ["payable_type", "description", "amount", "amount_yearly", "start_date", "upto_life", "end_date", "payable_to_relation"]
  },
  
  // Fixed Income / Debt Instruments (with maturity)
  fd: { 
    label: "Fixed Deposit", 
    type: "debt",
    fields: ["description", "investment_value", "investment_date", "interest_rate", "payable_cycle", 
             "maturity_amount", "maturity_date", "gross_xirr"]
  },
  // Also handle 'fixed_deposit' as alias
  fixed_deposit: { 
    label: "Fixed Deposit", 
    type: "debt",
    fields: ["description", "investment_value", "investment_date", "interest_rate", "payable_cycle", 
             "maturity_amount", "maturity_date", "gross_xirr"]
  },
  rd_pis: { 
    label: "RD / PIS", 
    type: "debt",
    fields: ["investment_value_monthly", "interest_rate", "start_date", "end_date", "num_installments", 
             "investment_value", "maturity_value", "gross_xirr"]
  },
  bond: { 
    label: "NCD", 
    type: "debt",
    fields: ["description", "investment_date", "investment_value", "payout_frequency", "payout_amount", 
             "maturity_amount", "maturity_date", "gross_xirr"]
  },
  // Also handle 'ncd' as alias
  ncd: { 
    label: "NCD", 
    type: "debt",
    fields: ["description", "investment_date", "investment_value", "payout_frequency", "payout_amount", 
             "maturity_amount", "maturity_date", "gross_xirr"]
  },
  insurance_income: { 
    label: "Insurance", 
    type: "insurance_investment",
    fields: ["description", "premium_frequency", "premium_amount", "premium_start_date", "premium_end_date", 
             "total_paid", "total_pending", "maturity_date", "maturity_amount", "gross_xirr"]
  },
  // Also handle 'insurance' as alias
  insurance: { 
    label: "Insurance", 
    type: "insurance_investment",
    fields: ["description", "premium_frequency", "premium_amount", "premium_start_date", "premium_end_date", 
             "total_paid", "total_pending", "maturity_date", "maturity_amount", "gross_xirr"]
  },
  
  // Market-Linked Investments
  mutual_fund: { 
    label: "Mutual Fund", 
    type: "equity",
    fields: ["market_value", "sip_amount", "annual_sip_amount", "upto_year"]
  },
  shares_pms: { 
    label: "Shares / PMS", 
    type: "equity",
    fields: ["market_value", "annual_contribution", "upto_year"]
  },
  commodities: { 
    label: "Commodities", 
    type: "commodity",
    fields: ["commodity_type", "weight_kg", "price_per_kg", "market_value"]
  },
  
  // Other Assets
  cash: { 
    label: "Cash In Hand", 
    type: "liquid",
    fields: ["description", "bank_balance"]
  },
  // Also handle 'cash_in_hand' as alias
  cash_in_hand: { 
    label: "Cash In Hand", 
    type: "liquid",
    fields: ["description", "bank_balance"]
  },
  vehicle: { 
    label: "Vehicle", 
    type: "asset",
    fields: ["description", "market_value"]
  },
  other: { 
    label: "Other", 
    type: "other",
    fields: ["description", "market_value"]
  }
};

// Helper function to get the display label for a category
const getIncomeCategoryLabel = (category) => {
  return INCOME_CATEGORY_CONFIG[category]?.label || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Helper function to normalize category (handle aliases)
const normalizeIncomeCategory = (category) => {
  const aliases = {
    'business_income': 'business',
    'property_details': 'rental',
    'fixed_deposit': 'fd',
    'ncd': 'bond',
    'insurance': 'insurance_income',
    'cash_in_hand': 'cash'
  };
  return aliases[category] || category;
};

// ========================================
// EXPENSE CATEGORY CONFIGURATION
// Maps stored category values to Excel display labels
// Source of truth: Matches ExpenseSection.jsx EXPENSE_CATEGORIES
// ========================================
const EXPENSE_CATEGORY_CONFIG = {
  // Regular Expenses
  food_grocery: { label: "Food & Grocery", type: "regular" },
  house_rent: { label: "House Rent / Maintenance / Repair", type: "regular" },
  conveyance: { label: "Conveyance, Fuel & Maintenance", type: "regular" },
  healthcare: { label: "Medicines / Doctor / Healthcare", type: "regular" },
  utilities: { label: "Electricity / Water / Labour / AMC", type: "regular" },
  mobile: { label: "Mobile", type: "regular" },
  gasline_internet: { label: "Gas Line / Telephone / Internet / Cable", type: "regular" },
  clothing: { label: "Clothes and Accessories", type: "regular" },
  shopping: { label: "Shopping, Gifts, White Goods, Gadgets", type: "regular" },
  entertainment: { label: "Dining / Movies / Sports", type: "regular" },
  personal_care: { label: "Personal Care / Others", type: "regular" },
  children_education: { label: "Children's Schooling / College Expenses", type: "regular" },
  family_support: { label: "Contribution To Parents / Siblings", type: "regular" },
  
  // Insurance Premium categories
  term_life: { label: "Term Life Insurance Premium", type: "insurance" },
  health: { label: "Health Insurance Premium", type: "insurance" },
  critical_illness: { label: "Critical Illness Premium", type: "insurance" },
  personal_accident: { label: "Personal Accident Premium", type: "insurance" },
  motor: { label: "Motor Insurance Premium", type: "insurance" },
  home_insurance: { label: "Home Insurance Premium", type: "insurance" },
  professional: { label: "Professional Indemnity Premium", type: "insurance" },
  
  // Loan EMI categories
  home_loan: { label: "Home Loan EMI", type: "loan" },
  vehicle_loan: { label: "Vehicle Loan EMI", type: "loan" },
  personal_loan: { label: "Personal Loan EMI", type: "loan" },
  consumer_durable: { label: "Consumer Durable EMI", type: "loan" },
  education_loan: { label: "Education Loan EMI", type: "loan" },
  credit_card: { label: "Credit Card EMI", type: "loan" },
  other_loan: { label: "Other Loan EMI", type: "loan" }
};

// Helper function to get the display label for an expense category
const getExpenseCategoryLabel = (category) => {
  return EXPENSE_CATEGORY_CONFIG[category]?.label || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Helper function to get expense type (regular, insurance, loan)
const getExpenseType = (category) => {
  return EXPENSE_CATEGORY_CONFIG[category]?.type || 'regular';
};

export default function SurplusSection({ family, isReadOnly }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const expenseDetails = family?.expense_details || [];
  const investmentDetails = family?.investment_details || [];
  const goalDetails = family?.goal_details || [];
  const insurancePremiumsData = family?.insurance_premiums || [];

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
  // Per-member life expectancy - returns actual value or 0 if not set
  const memberLifeExp = (m) => Number(m?.life_expectancy) || 0;
  // Primary member's life expectancy (only default to 85 if primary has no value set)
  const lifeExpectancy = memberLifeExp(primaryMember) || 85;
  
  // Filter members who have a life expectancy value set (non-empty, non-zero)
  // If life expectancy is not set for a member (like kids), they won't be considered for the financial plan end year
  const membersWithLifeExp = members.filter(m => m.life_expectancy && Number(m.life_expectancy) > 0);
  
  // End year = the year when the LONGEST-LIVED member (with life expectancy set) reaches their own life expectancy
  // Only consider members who have life expectancy filled in
  // If no members have life expectancy set, use the primary member with a default of 85
  const membersToConsider = membersWithLifeExp.length > 0 ? membersWithLifeExp : [{ ...primaryMember, life_expectancy: primaryMember?.life_expectancy || 85 }];
  const endYear = membersToConsider.reduce((maxYear, m) => {
    const memberAge = calculateAge(m?.date_of_birth);
    // Members in this list already have life_expectancy > 0 (from filter), so use their actual value
    const memberLE = Number(m?.life_expectancy);
    if (!Number.isFinite(memberAge) || !memberLE) return maxYear;
    const yearReachesLife = currentYear + Math.max(0, memberLE - memberAge);
    return Math.max(maxYear, yearReachesLife);
  }, currentYear);
  
  // Calculate totalAssets at component level (used by both Excel export and Simulator)
  // Exclude EPF and Gratuity (come via maturities at retirement)
  // Exclude debt instruments with maturity dates (come via maturities)
  const totalAssets = (() => {
    const excludedFromAssets = ['epf', 'gratuity'];
    const debtCategoriesWithMaturity = ['fd', 'bonds', 'bond', 'rd_pis', 'insurance_income', 'ppf', 'nps'];
    let total = 0;
    incomeDetails.forEach(inc => {
      if (excludedFromAssets.includes(inc.category)) return;
      const d = inc.details || {};
      const hasMaturityDate = d.maturity_date || d.maturity_year || d.maturity_amount;
      if (debtCategoriesWithMaturity.includes(inc.category) && hasMaturityDate) return;
      let assetValue = 0;
      if (inc.category === 'cash') {
        assetValue = parseFloat(d.bank_balance) || 0;
      } else {
        assetValue = parseFloat(d.market_value) || parseFloat(d.current_value) || 
                    parseFloat(d.investment_value) || parseFloat(d.balance) || 0;
      }
      total += assetValue;
    });
    return total;
  })();

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
    let salaryIncomeTill = null, businessIncomeTill = null;
    let rentalGrowthRate = 0;
    
    // First priority: Use member's retirement_year if set
    if (member?.retirement_year) {
      retirementYear = parseInt(member.retirement_year);
    }
    
    memberIncomes.forEach(income => {
      const details = income.details || {};
      const category = income.category || '';
      
      switch (category) {
        case 'salary':
          const salaryYearly = parseFloat(details.net_income_yearly) || parseFloat(details.annual_amount) || 0;
          const salaryMonthly = parseFloat(details.net_income_monthly) || parseFloat(details.monthly_amount) || 0;
          baseSalary += salaryYearly > 0 ? salaryYearly : salaryMonthly * 12;
          salaryGrowth = Math.max(salaryGrowth, parseFloat(details.avg_growth_rate) || parseFloat(details.growth_rate) || 0);
          // Track income_till for salary
          if (details.income_till) {
            salaryIncomeTill = salaryIncomeTill ? Math.min(salaryIncomeTill, parseInt(details.income_till)) : parseInt(details.income_till);
          }
          break;
        case 'business_income':  // Unified: was 'business' OR 'business_income'
        case 'business':
          const businessYearly = parseFloat(details.net_income_yearly) || parseFloat(details.annual_amount) || 0;
          const businessMonthly = parseFloat(details.net_income_monthly) || parseFloat(details.monthly_amount) || 0;
          baseBusiness += businessYearly > 0 ? businessYearly : businessMonthly * 12;
          businessGrowth = Math.max(businessGrowth, parseFloat(details.avg_growth_rate) || parseFloat(details.growth_rate) || 0);
          // Track income_till for business
          if (details.income_till) {
            businessIncomeTill = businessIncomeTill ? Math.min(businessIncomeTill, parseInt(details.income_till)) : parseInt(details.income_till);
          }
          break;
        case 'property_details':  // Unified: was 'rental' OR 'property_details'
        case 'rental':
          // Include rental income regardless of is_on_rent status for income calculations
          const annualRent = parseFloat(details.annual_rent) || parseFloat(details.annual_amount) || 0;
          const rentPerMonth = parseFloat(details.rent_per_month) || parseFloat(details.monthly_amount) || 0;
          if (details.is_on_rent === 'Yes' || annualRent > 0 || rentPerMonth > 0) {
            baseRental += annualRent > 0 ? annualRent : rentPerMonth * 12;
          }
          // Track rental growth rate from xirr_return, absolute_return, or rental_growth_rate
          const propertyGrowth = parseFloat(details.xirr_return) || parseFloat(details.absolute_return) || parseFloat(details.rental_growth_rate) || parseFloat(details.growth_rate) || 0;
          if (propertyGrowth > 0) {
            rentalGrowthRate = Math.max(rentalGrowthRate, propertyGrowth);
          }
          break;
        case 'pension':
          const pensionYearly = parseFloat(details.amount_yearly) || parseFloat(details.annual_pension) || 0;
          if (pensionYearly > 0) {
            basePension += pensionYearly;
          } else {
            const pensionAmount = parseFloat(details.amount) || parseFloat(details.monthly_pension) || 0;
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
    
    // Use the minimum of member's retirement_year and income_till for salary/business
    const effectiveSalaryEndYear = salaryIncomeTill ? Math.min(retirementYear, salaryIncomeTill) : retirementYear;
    const effectiveBusinessEndYear = businessIncomeTill ? Math.min(retirementYear, businessIncomeTill) : retirementYear;
    
    return { 
      salaryGrowth, businessGrowth, rentalGrowth: rentalGrowthRate || 3, 
      retirementAge,
      retirementYear, 
      salaryEndYear: effectiveSalaryEndYear,
      businessEndYear: effectiveBusinessEndYear,
      baseSalary, baseBusiness, baseRental, basePension, baseMutualFund 
    };
  };

  // Get member expenses with inflation (including family expenses distributed and insurance premiums)
  const getMemberBaseExpenses = (memberId) => {
    const memberExpenses = [];
    
    // Loan expense types that use EMI/installment logic
    const loanTypes = ['home_loan', 'vehicle_loan', 'personal_loan', 'consumer_durable', 'education_loan', 'credit_card', 'other_loan'];
    // Insurance expense types from expense_details (not from insurance_premiums collection)
    const insuranceTypes = ['term_life', 'health', 'critical_illness', 'personal_accident', 'motor', 'home_insurance', 'professional'];
    
    // Regular expenses from expense_details
    expenseDetails.forEach(exp => {
      const expMemberIds = exp.member_ids || [];
      const isFamilyExpense = expMemberIds.includes('family') || expMemberIds.length === 0;
      const isAssignedToMember = expMemberIds.includes(memberId);
      
      if (isAssignedToMember || isFamilyExpense) {
        const expenseType = exp.expense_type || '';
        const isLoan = loanTypes.includes(expenseType);
        const isInsurance = insuranceTypes.includes(expenseType);
        
        // For loans, use monthly_emi * 12; for others use annual_amount or monthly_amount * 12
        let baseAmount;
        if (isLoan) {
          baseAmount = (parseFloat(exp.monthly_emi) || 0) * 12;
        } else {
          baseAmount = parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) || 0) * 12;
        }
        
        // If family expense, divide among all members
        const amount = isFamilyExpense ? baseAmount / members.length : baseAmount;
        
        // Calculate loan completion year based on installments
        let loanCompletionYear = null;
        if (isLoan && exp.num_installments) {
          const numInstallments = parseFloat(exp.num_installments) || 0;
          loanCompletionYear = currentYear + Math.ceil(numInstallments / 12);
        }
        
        memberExpenses.push({
          annualAmount: amount,
          inflationRate: isLoan || isInsurance ? 0 : (parseFloat(exp.inflation_percent) ?? 5), // Loans and insurance don't inflate
          uptoYear: parseInt(exp.upto_year) || endYear,
          considerPostRetirement: exp.consider_post_retirement || false,
          postRetirementPercent: parseFloat(exp.post_retirement_percent) ?? 100,
          expenseType: expenseType,
          isLoan: isLoan,
          isInsurance: isInsurance,
          loanCompletionYear: loanCompletionYear
        });
      }
    });
    
    // Insurance premiums from insurance_premiums collection
    insurancePremiumsData.forEach(ins => {
      const insMemberId = ins.member_id;
      const isFamilyInsurance = !insMemberId;
      const isAssignedToMember = insMemberId === memberId;
      
      if (isAssignedToMember || isFamilyInsurance) {
        const premium = parseFloat(ins.yearly_premium) || parseFloat(ins.annual_premium) || parseFloat(ins.premium_amount) || 0;
        // If family insurance, divide among all members
        const amount = isFamilyInsurance ? premium / members.length : premium;
        // Annual escalation (mostly used by health / critical_illness /
        // personal_accident — others store 0). step_up_amount takes precedence
        // over inflation_percent if both happen to be non-zero.
        const stepUp = parseFloat(ins.step_up_amount) || 0;
        const inflPct = stepUp > 0 ? 0 : (parseFloat(ins.inflation_percent) || 0);
        const proRatedStepUp = isFamilyInsurance ? stepUp / Math.max(1, members.length) : stepUp;
        
        memberExpenses.push({
          annualAmount: amount,
          inflationRate: inflPct,
          stepUpAmount: proRatedStepUp,
          uptoYear: parseInt(ins.upto_year) || parseInt(ins.premium_end_year) || endYear,
          // Insurance premiums typically continue until their upto_year, regardless of retirement
          // So we set considerPostRetirement to true to allow them to continue
          considerPostRetirement: true,
          postRetirementPercent: 100,
          expenseType: 'insurance_premium',
          isLoan: false,
          isInsurance: true,
          loanCompletionYear: null
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
    let total = 0;
    
    // Regular expenses from expense_details
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
        
        // Post-retirement logic:
        // - Checkbox TICKED: Expense continues with percentage, extends to life expectancy
        // - Checkbox NOT TICKED: Expense STOPS at retirement
        if (isPostRetirement) {
          if (!exp.consider_post_retirement) {
            return; // Skip - expense stops at retirement
          }
          // Checkbox ticked - expense continues with percentage
          let projectedAmount = yearsFromNow <= 0 ? amount : amount * Math.pow(1 + inflationRate / 100, yearsFromNow);
          projectedAmount = projectedAmount * ((parseFloat(exp.post_retirement_percent) ?? 100) / 100);
          
          if (!breakdown[category]) breakdown[category] = 0;
          breakdown[category] += projectedAmount;
          total += projectedAmount;
        } else {
          // Before retirement - respect uptoYear
          if (targetYear > uptoYear) return;
          let projectedAmount = yearsFromNow <= 0 ? amount : amount * Math.pow(1 + inflationRate / 100, yearsFromNow);
          
          if (!breakdown[category]) breakdown[category] = 0;
          breakdown[category] += projectedAmount;
          total += projectedAmount;
        }
      }
    });
    
    // Insurance premiums from insurance_premiums collection
    insurancePremiumsData.forEach(ins => {
      const insMemberId = ins.member_id;
      const isFamilyInsurance = !insMemberId;
      const isAssignedToMember = insMemberId === memberId;
      
      if (isAssignedToMember || isFamilyInsurance) {
        const premium = parseFloat(ins.yearly_premium) || parseFloat(ins.annual_premium) || parseFloat(ins.premium_amount) || 0;
        const amount = isFamilyInsurance ? premium / members.length : premium;
        const uptoYear = parseInt(ins.upto_year) || parseInt(ins.premium_end_year) || endYear;
        
        if (targetYear > uptoYear) return;
        
        const insType = ins.insurance_type || ins.category || ins.type || 'insurance';
        const category = `insurance_${insType}`;
        
        if (!breakdown[category]) breakdown[category] = 0;
        breakdown[category] += amount;
        total += amount;
      }
    });
    
    // Add total to breakdown for display
    breakdown._total = total;
    
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
        maturityType = inc.category === 'fd' ? 'FD' : inc.category === 'bond' ? 'NCD' :
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
    
    // Check if salary/business income should continue based on their respective end years
    const isSalaryActive = targetYear < info.salaryEndYear;
    const isBusinessActive = targetYear < info.businessEndYear;
    const isPostRetirement = targetYear >= info.retirementYear;
    
    if (yearsFromNow <= 0) {
      return info.baseSalary + info.baseBusiness + info.baseRental + info.basePension + (info.baseMutualFund || 0);
    }
    
    // Calculate each income type separately based on their end years
    let salary = 0;
    if (isSalaryActive && info.baseSalary > 0) {
      salary = info.baseSalary * Math.pow(1 + info.salaryGrowth / 100, yearsFromNow);
    }
    
    let business = 0;
    if (isBusinessActive && info.baseBusiness > 0) {
      business = info.baseBusiness * Math.pow(1 + info.businessGrowth / 100, yearsFromNow);
    }
    
    // Rental income continues with growth
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
      // Handle loans - check completion year
      if (expense.isLoan) {
        if (expense.loanCompletionYear && targetYear >= expense.loanCompletionYear) {
          return; // Loan completed, skip
        }
        // Loans don't inflate, just add the EMI amount
        total += expense.annualAmount;
        return;
      }
      
      // Handle insurance from expense_details - check uptoYear, apply inflation/step-up if any
      if (expense.isInsurance) {
        if (targetYear > expense.uptoYear) {
          return; // Insurance ended
        }
        // Project the premium forward — step-up is additive (linear), inflation
        // is compounding. Only one of the two should be non-zero in practice.
        const yrs = Math.max(0, yearsFromNow);
        const inflated = expense.inflationRate
          ? expense.annualAmount * Math.pow(1 + expense.inflationRate / 100, yrs)
          : expense.annualAmount;
        const stepUpDelta = (expense.stepUpAmount || 0) * yrs;
        total += inflated + stepUpDelta;
        return;
      }
      
      // Regular expenses with post-retirement logic:
      // - Checkbox TICKED (considerPostRetirement = TRUE): Expense continues with percentage, extends to life expectancy
      // - Checkbox NOT TICKED (considerPostRetirement = FALSE): Expense STOPS at retirement
      
      if (isPostRetirement) {
        // After retirement
        if (!expense.considerPostRetirement) {
          return; // Skip - expense stops at retirement when checkbox is NOT ticked
        }
        // Checkbox is ticked - expense continues to life expectancy with percentage
        let projectedAmount = expense.annualAmount * Math.pow(1 + expense.inflationRate / 100, yearsFromNow);
        projectedAmount = projectedAmount * (expense.postRetirementPercent / 100);
        total += projectedAmount;
      } else {
        // Before retirement - respect uptoYear limit
        if (targetYear > expense.uptoYear) return;
        let projectedAmount = expense.annualAmount * Math.pow(1 + expense.inflationRate / 100, yearsFromNow);
        total += projectedAmount;
      }
    });
    
    return total;
  };

  // Calculate TOTAL FAMILY income for a year - mirrors Excel TOTAL INCOME (A) calculation exactly
  const getTotalFamilyIncome = (year) => {
    const targetYear = parseInt(year);
    
    // Sum income from all members
    let totalIncome = members.reduce((sum, m) => sum + getProjectedMemberIncome(m.id, year), 0);
    
    // Add maturities for this year
    const yearMaturities = maturitiesByYear[targetYear]?.total || 0;
    totalIncome += yearMaturities;
    
    return totalIncome;
  };

  // Calculate TOTAL FAMILY expenses for a year - mirrors Excel TOTAL EXPENSES (B) calculation exactly
  const getTotalFamilyExpenses = (year) => {
    const targetYear = parseInt(year);
    const yearsFromNow = targetYear - currentYear;
    
    // Loan expense types
    const loanTypes = ['home_loan', 'vehicle_loan', 'personal_loan', 'consumer_durable', 'education_loan', 'credit_card', 'other_loan'];
    // Insurance expense types from expense_details
    const insuranceTypes = ['term_life', 'health', 'critical_illness', 'personal_accident', 'motor', 'home_insurance', 'professional'];
    
    let totalYearExp = 0;
    
    // Process all expenses from expense_details (same as Excel TOTAL EXPENSES)
    expenseDetails.forEach(exp => {
      const expenseType = exp.expense_type || '';
      const isLoan = loanTypes.includes(expenseType);
      const isInsurance = insuranceTypes.includes(expenseType);
      
      // Calculate base amount
      let baseAnn;
      if (isLoan) {
        baseAnn = (parseFloat(exp.monthly_emi) || 0) * 12;
      } else {
        baseAnn = parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) || 0) * 12 || (parseFloat(exp.yearly_premium) || 0);
      }
      
      const inflRate = parseFloat(exp.inflation_percent) ?? 5;
      const uptoYr = parseInt(exp.upto_year) || endYear;
      
      // Handle loans - check completion year
      if (isLoan) {
        const numInstallments = parseFloat(exp.num_installments) || 0;
        const completionYear = currentYear + Math.ceil(numInstallments / 12);
        if (targetYear < completionYear) {
          totalYearExp += baseAnn;
        }
        return;
      }
      
      // Handle insurance from expense_details - apply inflation/step-up if any
      if (isInsurance) {
        if (targetYear <= uptoYr) {
          const yrs = Math.max(0, yearsFromNow);
          const stepUp = parseFloat(exp.step_up_amount) || 0;
          const effectiveInfl = stepUp > 0 ? 0 : (parseFloat(exp.inflation_percent) || 0);
          const inflated = effectiveInfl
            ? baseAnn * Math.pow(1 + effectiveInfl / 100, yrs)
            : baseAnn;
          totalYearExp += inflated + stepUp * yrs;
        }
        return;
      }
      
      // Regular expenses - get retirement year based on assigned members
      const memberIds = exp.member_ids || [];
      const isFamilyExpense = memberIds.includes('family') || memberIds.length === 0;
      let retirementYear;
      
      if (isFamilyExpense) {
        const primaryMember = members.find(m => m.is_primary);
        retirementYear = primaryMember?.retirement_year ? parseInt(primaryMember.retirement_year) : endYear;
      } else {
        retirementYear = memberIds.map(mid => {
          const m = members.find(mem => mem.id === mid);
          return m?.retirement_year ? parseInt(m.retirement_year) : endYear;
        }).reduce((min, yr) => Math.min(min, yr), endYear);
      }
      
      const isPostRet = targetYear >= retirementYear;
      
      // Post-retirement logic
      if (isPostRet) {
        if (!exp.consider_post_retirement) {
          return; // Expense stops at retirement
        }
        // Continue with percentage
        let amount = baseAnn * Math.pow(1 + inflRate / 100, yearsFromNow);
        const postRetPct = parseFloat(exp.post_retirement_percent) || 100;
        amount = amount * postRetPct / 100;
        totalYearExp += amount;
      } else {
        // Before retirement - respect uptoYear
        if (targetYear > uptoYr) return;
        let amount = baseAnn * Math.pow(1 + inflRate / 100, yearsFromNow);
        totalYearExp += amount;
      }
    });
    
    // Add Insurance Premiums from insurance_premiums collection
    insurancePremiumsData.forEach(ins => {
      const premium = parseFloat(ins.yearly_premium) || parseFloat(ins.annual_premium) || parseFloat(ins.premium_amount) || 0;
      const uptoYr = parseInt(ins.upto_year) || parseInt(ins.premium_end_year) || endYear;
      if (targetYear <= uptoYr) {
        totalYearExp += premium;
      }
    });
    
    // Add Loan EMIs from liabilities collection
    const liabilitiesData = family?.liabilities || family?.liability_details || family?.loans || [];
    liabilitiesData.forEach(loan => {
      const emi = (parseFloat(loan.monthly_emi) || parseFloat(loan.emi_amount) || parseFloat(loan.emi) || 0) * 12;
      const numInstallments = parseInt(loan.num_installments) || parseInt(loan.remaining_tenure) || parseInt(loan.tenure_months) || 0;
      const completionYear = currentYear + Math.ceil(numInstallments / 12);
      if (targetYear < completionYear && emi > 0) {
        totalYearExp += emi;
      }
    });
    
    return totalYearExp;
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
  // allocationSettings: { equity, debt, equityReturn, debtReturn } - optional, defaults to 80/20, 12%/7%
  const handleExportToExcel = (allocationSettings = null) => {
    // Use provided allocation settings or defaults
    const allocation = allocationSettings || { equity: 80, debt: 20, equityReturn: 12, debtReturn: 7 };
    const wb = XLSX.utils.book_new();
    
    // Helper function to format currency with Indian comma format
    const formatCurrencyINR = (num) => {
      if (num === null || num === undefined || num === '' || isNaN(num)) return '-';
      const n = parseFloat(num);
      if (n === 0) return '-';
      return '₹ ' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    };
    
    // Helper function to auto-fit column widths
    const autoFitColumns = (sheetData) => {
      if (!sheetData || sheetData.length === 0) return [];
      const colWidths = [];
      sheetData.forEach(row => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, colIdx) => {
          const cellValue = cell !== null && cell !== undefined ? String(cell) : '';
          const cellLength = cellValue.length;
          const width = Math.min(25, Math.max(10, Math.ceil(cellLength * 1.1)));
          if (!colWidths[colIdx] || width > colWidths[colIdx]) {
            colWidths[colIdx] = width;
          }
        });
      });
      return colWidths.map(wch => ({ wch }));
    };
    
    // Helper to get member names
    const getMemberNames = (memberIds) => {
      if (!memberIds || memberIds.length === 0) return 'Family';
      return memberIds.map(mid => {
        const m = members.find(mem => mem.id === mid || String(mem.id) === String(mid));
        return m?.name || '';
      }).filter(n => n).join(', ') || 'Family';
    };
    
    // Helper to get category label
    const getCategoryLabel = (category) => {
      const labels = {
        'salary': 'Salary', 'business': 'Business', 'rental': 'Rental', 'pension': 'Pension',
        'mutual_fund': 'Mutual Fund', 'ppf': 'PPF', 'epf': 'EPF', 'nps': 'NPS',
        'fd': 'Fixed Deposit', 'rd_pis': 'RD/PIS', 'bond': 'NCD', 'insurance_income': 'Insurance (Income)',
        'shares_pms': 'Shares/PMS', 'gratuity': 'Gratuity', 'commodities': 'Commodities',
        'cash': 'Cash', 'vehicle': 'Vehicle', 'other': 'Other',
        'living_expenses': 'Living Expenses', 'housing': 'Housing', 'utilities': 'Utilities',
        'food': 'Food', 'transportation': 'Transportation', 'healthcare': 'Healthcare',
        'education': 'Education', 'entertainment': 'Entertainment', 'personal': 'Personal',
        'term_life': 'Term Life', 'health': 'Health Insurance', 'critical_illness': 'Critical Illness',
        'personal_accident': 'Personal Accident', 'motor': 'Motor Insurance', 'home_insurance': 'Home Insurance',
        'home_loan': 'Home Loan', 'vehicle_loan': 'Vehicle Loan', 'personal_loan': 'Personal Loan',
        'education_loan': 'Education Loan', 'credit_card': 'Credit Card'
      };
      return labels[category] || (category || 'Other').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };
    
    // Generate projection years until youngest member reaches 85
    const projectionYears = [];
    for (let y = currentYear; y <= endYear; y++) {
      projectionYears.push(y);
    }
    
    // totalAssets is already calculated at component level
    
    // Line separator for Data Gathering
    const dgSeparator = '────────────────────────────────────────────────────────────────────────';

    // ==================================================================================
    // SHEET 1: DATA GATHERING (Raw data from all tabs)
    // ==================================================================================
    const dgData = [];
    
    // ========== MEMBERS SECTION ==========
    dgData.push([dgSeparator]);
    dgData.push(['MEMBERS']);
    dgData.push([dgSeparator]);
    dgData.push(['Name', 'Date of Birth', 'Relation', 'Current Age', 'Retirement Year', 'Life Expectancy', 'Tax Status', 'Tax Regime']);
    members.forEach(m => {
      dgData.push([
        m.name || '', m.date_of_birth || '', m.is_primary ? 'Self (Primary)' : (m.relation || ''),
        calculateAge(m.date_of_birth) || '', m.retirement_year || '', m.life_expectancy || '',
        m.tax_status || '', m.tax_regime || ''
      ]);
    });
    dgData.push([]);
    
    // ========== INCOME SECTION (ALL CATEGORIES) ==========
    dgData.push([dgSeparator]);
    dgData.push(['INCOME']);
    dgData.push([dgSeparator]);
    
    // Salary
    const salaryIncomes = incomeDetails.filter(inc => inc.category === 'salary');
    if (salaryIncomes.length > 0) {
      dgData.push(['Salary Income']);
      dgData.push(['Member', 'Monthly Income', 'Annual Income', 'Growth Rate %']);
      salaryIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([getMemberNames(inc.member_ids), formatCurrencyINR(d.net_income_monthly || d.monthly_amount), formatCurrencyINR(d.net_income_yearly || d.annual_amount), d.avg_growth_rate || d.growth_rate || '']);
      });
      dgData.push([]);
    }
    
    // Business Income - unified category name
    const businessIncomes = incomeDetails.filter(inc => inc.category === 'business_income' || inc.category === 'business');
    if (businessIncomes.length > 0) {
      dgData.push(['Business Income']);
      dgData.push(['Member', 'Monthly Income', 'Annual Income', 'Growth Rate %']);
      businessIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([getMemberNames(inc.member_ids), formatCurrencyINR(d.net_income_monthly || d.monthly_amount), formatCurrencyINR(d.net_income_yearly || d.annual_amount), d.avg_growth_rate || d.growth_rate || '']);
      });
      dgData.push([]);
    }
    
    // Property/Rental Income - unified category name
    const rentalIncomes = incomeDetails.filter(inc => inc.category === 'property_details' || inc.category === 'rental');
    if (rentalIncomes.length > 0) {
      dgData.push(['Property Details']);
      dgData.push(['Member', 'Property Type', 'Investment Amount', 'Market Value', 'Annual Rent', 'Growth Rate %']);
      rentalIncomes.forEach(inc => {
        const d = inc.details || {};
        // Use xirr_return, absolute_return, rental_growth_rate, or growth_rate - don't default to hardcoded value
        const growthRate = d.xirr_return || d.absolute_return || d.rental_growth_rate || d.growth_rate || '';
        dgData.push([
          getMemberNames(inc.member_ids), 
          d.property_type || '', 
          formatCurrencyINR(d.investment_amount),
          formatCurrencyINR(d.market_value),
          formatCurrencyINR(d.annual_rent || d.annual_amount),
          growthRate
        ]);
      });
      dgData.push([]);
    }
    
    // Pension
    const pensionIncomes = incomeDetails.filter(inc => inc.category === 'pension');
    if (pensionIncomes.length > 0) {
      dgData.push(['Pension']);
      dgData.push(['Member', 'Description', 'Amount (Yearly)', 'Start Date', 'End Date']);
      pensionIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([getMemberNames(inc.member_ids), d.description || '', formatCurrencyINR(d.amount_yearly), d.start_date || '', d.end_date || '']);
      });
      dgData.push([]);
    }
    
    // EPF
    const epfIncomes = incomeDetails.filter(inc => inc.category === 'epf');
    if (epfIncomes.length > 0) {
      dgData.push(['EPF']);
      dgData.push(['Member', 'Market Value', 'Annual Contribution', 'Monthly Contribution', 'Growth Rate', 'Up to Year', 'Maturity Date', 'Years to Mature', 'Maturity Value']);
      epfIncomes.forEach(inc => {
        const d = inc.details || {};
        const annualContrib = parseFloat(d.annual_contribution) || 0;
        const monthlyContrib = parseFloat(d.monthly_contribution) || Math.round(annualContrib / 12);
        const growthRate = parseFloat(d.growth_rate) || 8.25;
        dgData.push([
          getMemberNames(inc.member_ids), 
          formatCurrencyINR(d.market_value), 
          formatCurrencyINR(annualContrib),
          formatCurrencyINR(monthlyContrib),
          `${growthRate}%`,
          d.upto_year || '-',
          d.maturity_date || '-', 
          d.year_to_mature || '-',
          formatCurrencyINR(d.maturity_value)
        ]);
      });
      dgData.push([]);
    }
    
    // PPF
    const ppfIncomes = incomeDetails.filter(inc => inc.category === 'ppf');
    if (ppfIncomes.length > 0) {
      dgData.push(['PPF']);
      dgData.push(['Member', 'Market Value', 'Annual Contribution', 'Monthly Contribution', 'Growth Rate', 'Up to Year', 'Maturity Date', 'Years to Mature', 'Maturity Value']);
      ppfIncomes.forEach(inc => {
        const d = inc.details || {};
        const annualContrib = parseFloat(d.annual_contribution) || 0;
        const monthlyContrib = parseFloat(d.monthly_contribution) || Math.round(annualContrib / 12);
        const growthRate = parseFloat(d.growth_rate) || 7.1;
        dgData.push([
          getMemberNames(inc.member_ids), 
          formatCurrencyINR(d.market_value), 
          formatCurrencyINR(annualContrib),
          formatCurrencyINR(monthlyContrib),
          `${growthRate}%`,
          d.upto_year || '-',
          d.maturity_date || '-', 
          d.year_to_mature || '-',
          formatCurrencyINR(d.maturity_value)
        ]);
      });
      dgData.push([]);
    }
    
    // Fixed Deposits - unified category name
    const fdIncomes = incomeDetails.filter(inc => inc.category === 'fixed_deposit' || inc.category === 'fd');
    if (fdIncomes.length > 0) {
      dgData.push(['Fixed Deposit']);
      dgData.push(['Member', 'Description', 'Investment Value', 'Interest Rate', 'Payout Frequency', 'Annual Interest', 'Maturity Date', 'Maturity Amount']);
      fdIncomes.forEach(inc => {
        const d = inc.details || {};
        const investmentValue = parseFloat(d.investment_value) || parseFloat(d.principal_amount) || 0;
        const interestRate = parseFloat(d.interest_rate) || 0;
        const annualInterest = investmentValue * interestRate / 100;
        dgData.push([getMemberNames(inc.member_ids), d.description || '', formatCurrencyINR(investmentValue), `${interestRate}%`, d.payable_cycle || d.payout_frequency || '', formatCurrencyINR(annualInterest), d.maturity_date || '', formatCurrencyINR(d.maturity_amount)]);
      });
      dgData.push([]);
    }
    
    // Bonds/NCD - unified category name
    const bondIncomes = incomeDetails.filter(inc => inc.category === 'ncd' || inc.category === 'bond');
    if (bondIncomes.length > 0) {
      dgData.push(['NCD']);
      dgData.push(['Member', 'Description', 'Investment Value', 'Payout Frequency', 'Payout Amount', 'Maturity Date', 'Maturity Amount', 'Gross XIRR']);
      bondIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([
          getMemberNames(inc.member_ids), 
          d.description || '-', 
          formatCurrencyINR(d.investment_value), 
          d.payout_frequency || '-',
          formatCurrencyINR(d.payout_amount),
          d.maturity_date || '-', 
          formatCurrencyINR(d.maturity_amount),
          d.gross_xirr ? `${d.gross_xirr}%` : '-'
        ]);
      });
      dgData.push([]);
    }
    
    // Mutual Funds
    const mfIncomes = incomeDetails.filter(inc => inc.category === 'mutual_fund');
    if (mfIncomes.length > 0) {
      dgData.push(['Mutual Fund']);
      dgData.push(['Member', 'Market Value', 'Monthly SIP', 'Annual SIP', 'Up to Year']);
      mfIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([getMemberNames(inc.member_ids), formatCurrencyINR(d.market_value), formatCurrencyINR(d.sip_amount), formatCurrencyINR(d.annual_sip_amount), d.upto_year || '']);
      });
      dgData.push([]);
    }
    
    // NPS
    const npsIncomes = incomeDetails.filter(inc => inc.category === 'nps');
    if (npsIncomes.length > 0) {
      dgData.push(['NPS']);
      dgData.push(['Member', 'Current Value', 'Monthly Contribution', 'Annual Contribution', 'Up to Year']);
      npsIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([getMemberNames(inc.member_ids), formatCurrencyINR(d.current_value), formatCurrencyINR(d.monthly_contribution), formatCurrencyINR(d.annual_contribution), d.upto_year || '']);
      });
      dgData.push([]);
    }
    
    // Shares/PMS
    const sharesIncomes = incomeDetails.filter(inc => inc.category === 'shares_pms');
    if (sharesIncomes.length > 0) {
      dgData.push(['Shares / PMS']);
      dgData.push(['Member', 'Market Value', 'Annual Contribution', 'Monthly Contribution', 'Up to Year']);
      sharesIncomes.forEach(inc => {
        const d = inc.details || {};
        const annualContrib = parseFloat(d.annual_contribution) || 0;
        const monthlyContrib = parseFloat(d.monthly_contribution) || Math.round(annualContrib / 12);
        dgData.push([
          getMemberNames(inc.member_ids), 
          formatCurrencyINR(d.market_value), 
          formatCurrencyINR(annualContrib),
          formatCurrencyINR(monthlyContrib),
          d.upto_year || '-'
        ]);
      });
      dgData.push([]);
    }
    
    // Insurance (Income/Endowment) - unified category name
    const insuranceIncomes = incomeDetails.filter(inc => inc.category === 'insurance' || inc.category === 'insurance_income');
    if (insuranceIncomes.length > 0) {
      dgData.push(['Insurance']);
      dgData.push(['Member', 'Description', 'Premium Frequency', 'Premium Amount', 'Total Paid', 'Total Pending', 'Maturity Date', 'Maturity Amount', 'Gross XIRR']);
      insuranceIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([
          getMemberNames(inc.member_ids), 
          d.description || '-', 
          d.premium_frequency || '-',
          formatCurrencyINR(d.premium_amount),
          formatCurrencyINR(d.total_paid),
          formatCurrencyINR(d.total_pending),
          d.maturity_date || '-', 
          formatCurrencyINR(d.maturity_amount),
          d.gross_xirr ? `${d.gross_xirr}%` : '-'
        ]);
      });
      dgData.push([]);
    }
    
    // Cash/Bank Balance - unified category name
    const cashIncomes = incomeDetails.filter(inc => inc.category === 'cash_in_hand' || inc.category === 'cash');
    if (cashIncomes.length > 0) {
      dgData.push(['Cash In Hand']);
      dgData.push(['Member', 'Description', 'Amount']);
      cashIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([getMemberNames(inc.member_ids), d.description || '', formatCurrencyINR(d.bank_balance || d.amount)]);
      });
      dgData.push([]);
    }
    
    // RD/PIS - unified category name
    const rdIncomes = incomeDetails.filter(inc => inc.category === 'rd_pis' || inc.category === 'rd');
    if (rdIncomes.length > 0) {
      dgData.push(['RD / PIS']);
      dgData.push(['Member', 'Monthly Amt', 'Interest Rate', 'Start Date', 'End Date', 'Maturity Value']);
      rdIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([
          getMemberNames(inc.member_ids), 
          formatCurrencyINR(d.investment_value_monthly), 
          `${d.interest_rate || ''}%`, 
          d.start_date || '-',
          d.end_date || '-',
          formatCurrencyINR(d.maturity_value)
        ]);
      });
      dgData.push([]);
    }
    
    // Vehicle - unified category name
    const vehicleIncomes = incomeDetails.filter(inc => inc.category === 'vehicle');
    if (vehicleIncomes.length > 0) {
      dgData.push(['Vehicle']);
      dgData.push(['Member', 'Description', 'Current Market Value']);
      vehicleIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([
          getMemberNames(inc.member_ids), 
          d.description || '-', 
          formatCurrencyINR(d.market_value)
        ]);
      });
      dgData.push([]);
    }
    
    // Other Income - unified category name
    const otherIncomes = incomeDetails.filter(inc => inc.category === 'other');
    if (otherIncomes.length > 0) {
      dgData.push(['Other']);
      dgData.push(['Member', 'Description', 'Value']);
      otherIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([
          getMemberNames(inc.member_ids), 
          d.description || '-', 
          formatCurrencyINR(d.market_value)
        ]);
      });
      dgData.push([]);
    }
    
    // Commodities (Gold/Silver)
    const commodityIncomes = incomeDetails.filter(inc => inc.category === 'commodities');
    if (commodityIncomes.length > 0) {
      dgData.push(['Commodities']);
      dgData.push(['Member', 'Type', 'Weight (Kg)', 'Price/Kg', 'Market Value']);
      commodityIncomes.forEach(inc => {
        const d = inc.details || {};
        dgData.push([
          getMemberNames(inc.member_ids), 
          d.commodity_type || 'Gold', 
          d.weight_kg || '-',
          formatCurrencyINR(d.price_per_kg),
          formatCurrencyINR(d.market_value)
        ]);
      });
      dgData.push([]);
    }
    
    // Gratuity
    const gratuityIncomes = incomeDetails.filter(inc => inc.category === 'gratuity');
    if (gratuityIncomes.length > 0) {
      dgData.push(['Gratuity']);
      dgData.push(['Member', 'Market Value', 'Growth Rate', 'Maturity Date', 'Years to Mature', 'Maturity Value']);
      gratuityIncomes.forEach(inc => {
        const d = inc.details || {};
        const growthRate = parseFloat(d.growth_rate) || 6;
        dgData.push([
          getMemberNames(inc.member_ids), 
          formatCurrencyINR(d.market_value), 
          `${growthRate}%`,
          d.maturity_date || '-', 
          d.year_to_mature || '-',
          formatCurrencyINR(d.maturity_value)
        ]);
      });
      dgData.push([]);
    }
    
    // ========== EXPENSES SECTION ==========
    dgData.push([dgSeparator]);
    dgData.push(['EXPENSES']);
    dgData.push([dgSeparator]);
    dgData.push(['Category', 'Member', 'Monthly Amount', 'Annual Amount', 'Inflation %', 'Up to Year', 'Post Retirement', 'Post Ret. %']);
    
    expenseDetails.forEach(exp => {
      const annual = parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) * 12) || (parseFloat(exp.monthly_emi) * 12) || (parseFloat(exp.yearly_premium)) || 0;
      const monthly = parseFloat(exp.monthly_amount) || parseFloat(exp.monthly_emi) || Math.round(annual / 12);
      dgData.push([
        getCategoryLabel(exp.expense_type),
        getMemberNames(exp.member_ids),
        formatCurrencyINR(monthly),
        formatCurrencyINR(annual),
        `${exp.inflation_percent ?? 5}%`,
        exp.upto_year || '',
        exp.consider_post_retirement ? 'Yes' : 'No',
        exp.post_retirement_percent ? `${exp.post_retirement_percent}%` : '100%'
      ]);
    });
    
    // Add Insurance Premiums to Expenses section (from insurance_premiums collection)
    if (insurancePremiumsData.length > 0) {
      insurancePremiumsData.forEach(ins => {
        const annual = parseFloat(ins.yearly_premium) || parseFloat(ins.annual_premium) || parseFloat(ins.premium_amount) || 0;
        const monthly = Math.round(annual / 12);
        const memberName = ins.member_id ? (members.find(m => m.id === ins.member_id)?.name || 'Unknown') : 'Family';
        const policyInfo = ins.policy_name || ins.description || '';
        const categoryLabel = getCategoryLabel(ins.insurance_type || ins.category || ins.type || 'insurance');
        dgData.push([
          policyInfo ? `${categoryLabel} - ${policyInfo}` : categoryLabel,
          memberName,
          formatCurrencyINR(monthly),
          formatCurrencyINR(annual),
          '0%', // Insurance premiums typically don't inflate
          ins.upto_year || ins.premium_end_year || '',
          'No',
          '100%'
        ]);
      });
    }
    
    // Add Loan EMIs to Expenses section (from liabilities collection)
    // Support multiple possible field names for liabilities
    const dgLiabilities = family?.liabilities || family?.liability_details || family?.loans || [];
    if (dgLiabilities.length > 0) {
      dgLiabilities.forEach(loan => {
        const loanType = (loan.category || loan.loan_type || loan.type || 'Loan').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const emi = parseFloat(loan.monthly_emi) || parseFloat(loan.emi_amount) || parseFloat(loan.emi) || 0;
        const annual = emi * 12;
        const numInstallments = parseInt(loan.num_installments) || parseInt(loan.remaining_tenure) || parseInt(loan.tenure_months) || 0;
        const yearsRemaining = Math.ceil(numInstallments / 12);
        const uptoYear = currentYear + yearsRemaining;
        if (emi > 0) {  // Only add if there's an actual EMI
          dgData.push([
            `${loanType} EMI`,
            getMemberNames(loan.member_ids),
            formatCurrencyINR(emi),
            formatCurrencyINR(annual),
            '0%', // Loan EMIs don't inflate
            uptoYear,
            'No',
            '100%'
          ]);
        }
      });
    }
    dgData.push([]);
    
    // ========== GOALS SECTION ==========
    dgData.push([dgSeparator]);
    dgData.push(['GOALS']);
    dgData.push([dgSeparator]);
    dgData.push(['Goal Name', 'Category', 'Member', 'Current Amount', 'Target Year', 'Inflation %']);
    
    goalDetails.forEach(goal => {
      const baseAmount = parseFloat(goal.goal_amount) || 0;
      const inflationRate = parseFloat(goal.inflation_percent) || 0;
      const goalYear = goal.goal_years?.[0] || goal.goal_year || currentYear;
      dgData.push([
        goal.name || goal.goal_name || '', getCategoryLabel(goal.category), getMemberNames(goal.member_ids),
        formatCurrencyINR(baseAmount), goalYear, `${inflationRate}%`
      ]);
    });
    dgData.push([]);
    
    // ========== INVESTMENTS SECTION ==========
    dgData.push([dgSeparator]);
    dgData.push(['INVESTMENTS']);
    dgData.push([dgSeparator]);
    dgData.push(['Category', 'Member', 'Annual Amount', 'Up to Year']);
    combinedInvestments.forEach(inv => {
      const memberName = members.find(m => m.id === inv.member_id)?.name || '';
      dgData.push([getCategoryLabel(inv.category), memberName, formatCurrencyINR(inv.annual_amount), inv.upto_year || '']);
    });
    dgData.push([]);
    
    // Create Data Gathering Sheet
    const dgSheet = XLSX.utils.aoa_to_sheet(dgData);
    dgSheet['!cols'] = autoFitColumns(dgData);
    dgSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, dgSheet, "Data Gathering");

    // ==================================================================================
    // SHEET 2: CASHFLOW (Year-wise Projection)
    // ==================================================================================
    const data = [];
    const separator = '═══════════════════════════════════════════════════════════════════════════════';
    const thinSeparator = '───────────────────────────────────────────────────────────────────────────────';
    
    // Header
    data.push([`CASHFLOW PROJECTION - ${family?.family_name || 'Family'}`]);
    data.push([`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`]);
    data.push([separator]);
    data.push([]);
    
    data.push(['YEAR-WISE CASH FLOW PROJECTION']);
    data.push([separator]);
    
    // Year-wise projection header with ages for ALL members (stop at each
    // member's own life_expectancy — was previously hardcoded to 85)
    data.push(['Year', ...projectionYears]);
    members.forEach(m => {
      const memberAge = calculateAge(m.date_of_birth);
      const memberLife = memberLifeExp(m);
      const isPrimary = m.is_primary ? '*' : '';
      data.push([`Age (${m.name}${isPrimary})`, ...projectionYears.map(y => {
        const ageInYear = memberAge + (y - currentYear);
        return ageInYear <= memberLife ? ageInYear : '-';
      })]);
    });
    data.push([thinSeparator]);
    
    // INCOME PROJECTION
    data.push(['▶ CASH INFLOWS (INCOME)']);
    members.forEach(m => {
      const row = [`  ${m.name}${m.is_primary ? '*' : ''}`];
      projectionYears.forEach(year => {
        const yearIncome = getProjectedMemberIncome(m.id, year.toString());
        row.push(yearIncome > 0 ? formatCurrencyINR(Math.round(yearIncome)) : '-');
      });
      data.push(row);
    });
    
    // Maturities rows - show each maturity type separately
    // Get all unique maturity types across all years
    const allMaturityTypes = new Set();
    Object.values(maturitiesByYear).forEach(yearData => {
      yearData.details.forEach(d => allMaturityTypes.add(d.type));
    });
    
    // Create a row for each maturity type
    const maturityTypeOrder = ['PPF', 'EPF', 'Gratuity', 'NPS', 'FD', 'RD', 'NCD', 'Insurance', 'MF', 'Other'];
    const sortedMaturityTypes = [...allMaturityTypes].sort((a, b) => {
      const aIdx = maturityTypeOrder.indexOf(a);
      const bIdx = maturityTypeOrder.indexOf(b);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
    
    sortedMaturityTypes.forEach(matType => {
      const matRow = [`  ${matType} Maturity`];
      projectionYears.forEach(year => {
        const yearMaturities = maturitiesByYear[year]?.details || [];
        const typeTotal = yearMaturities
          .filter(d => d.type === matType)
          .reduce((sum, d) => sum + d.value, 0);
        matRow.push(typeTotal > 0 ? formatCurrencyINR(Math.round(typeTotal)) : '-');
      });
      data.push(matRow);
    });
    
    // Total Income - use getTotalFamilyIncome for consistency with simulation
    const totIncRow = ['TOTAL INCOME (A)'];
    projectionYears.forEach(year => {
      const yrInc = getTotalFamilyIncome(year.toString());
      totIncRow.push(formatCurrencyINR(Math.round(yrInc)));
    });
    data.push(totIncRow);
    data.push([thinSeparator]);
    
    // EXPENSES PROJECTION (includes regular expenses + insurance premiums from insurance_premiums collection)
    data.push(['▶ CASH OUTFLOWS (EXPENSES)']);
    
    // Regular expenses (excluding insurance which comes from insurance_premiums)
    const regularExpTypes = [...new Set(expenseDetails.filter(e => !['term_life', 'health', 'critical_illness', 'personal_accident', 'motor', 'home_insurance', 'professional'].includes(e.expense_type)).map(e => e.expense_type))];
    regularExpTypes.forEach(expType => {
      const catExps = expenseDetails.filter(e => e.expense_type === expType);
      const row = [`  ${getCategoryLabel(expType)}`];
      projectionYears.forEach(year => {
        let yearExp = 0;
        catExps.forEach(exp => {
          const baseAnn = parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) * 12) || (parseFloat(exp.monthly_emi) * 12) || 0;
          const inflRate = parseFloat(exp.inflation_percent) ?? 5;
          const uptoYr = parseInt(exp.upto_year) || endYear;
          
          // Check for loan completion
          if (['home_loan', 'vehicle_loan', 'personal_loan', 'consumer_durable', 'education_loan', 'credit_card', 'other_loan'].includes(exp.expense_type)) {
            const numInstallments = parseFloat(exp.num_installments) || 0;
            const completionYear = currentYear + Math.ceil(numInstallments / 12);
            if (year >= completionYear) {
              return; // Loan completed
            }
            yearExp += baseAnn; // EMIs don't inflate
            return;
          }
          
          // Get retirement year
          const memberIds = exp.member_ids || [];
          const isFamilyExpense = memberIds.includes('family') || memberIds.length === 0;
          let retirementYear;
          
          if (isFamilyExpense) {
            const primaryMember = members.find(m => m.is_primary);
            retirementYear = primaryMember?.retirement_year ? parseInt(primaryMember.retirement_year) : endYear;
          } else {
            retirementYear = memberIds.map(mid => {
              const m = members.find(mem => mem.id === mid);
              return m?.retirement_year ? parseInt(m.retirement_year) : endYear;
            }).reduce((min, yr) => Math.min(min, yr), endYear);
          }
          
          const isPostRet = year >= retirementYear;
          const yearsFromNow = year - currentYear;
          
          // Post-retirement logic:
          // - Checkbox TICKED: Expense continues with percentage (extends to life expectancy)
          // - Checkbox NOT TICKED: Expense STOPS at retirement
          if (isPostRet) {
            if (!exp.consider_post_retirement) {
              return; // Skip - expense stops at retirement
            }
            // Checkbox ticked - continue with percentage
            let amount = baseAnn * Math.pow(1 + inflRate / 100, yearsFromNow);
            const postRetPct = parseFloat(exp.post_retirement_percent) || 100;
            amount = amount * postRetPct / 100;
            yearExp += amount;
          } else {
            // Before retirement - respect uptoYear
            if (year > uptoYr) return;
            let amount = baseAnn * Math.pow(1 + inflRate / 100, yearsFromNow);
            yearExp += amount;
          }
        });
        row.push(yearExp > 0 ? formatCurrencyINR(Math.round(yearExp)) : '-');
      });
      data.push(row);
    });
    
    // Insurance Premiums from insurance_premiums collection (grouped by type)
    const insuranceTypes = [...new Set(insurancePremiumsData.map(ins => ins.insurance_type || ins.category || ins.type || 'Insurance'))];
    insuranceTypes.forEach(insType => {
      const typeIns = insurancePremiumsData.filter(ins => (ins.insurance_type || ins.category || ins.type || 'Insurance') === insType);
      const row = [`  ${getCategoryLabel(insType)} (Insurance)`];
      projectionYears.forEach(year => {
        let yearIns = 0;
        typeIns.forEach(ins => {
          const premium = parseFloat(ins.yearly_premium) || parseFloat(ins.annual_premium) || parseFloat(ins.premium_amount) || 0;
          const uptoYr = parseInt(ins.upto_year) || parseInt(ins.premium_end_year) || endYear;
          if (year <= uptoYr) {
            // Apply per-row inflation / step-up the same way the projection
            // simulator does (step_up_amount additive, inflation_percent
            // compounding; only one is non-zero in practice).
            const yrs = Math.max(0, year - currentYear);
            const stepUp = parseFloat(ins.step_up_amount) || 0;
            const inflPct = stepUp > 0 ? 0 : (parseFloat(ins.inflation_percent) || 0);
            const inflated = inflPct
              ? premium * Math.pow(1 + inflPct / 100, yrs)
              : premium;
            yearIns += inflated + stepUp * yrs;
          }
        });
        row.push(yearIns > 0 ? formatCurrencyINR(Math.round(yearIns)) : '-');
      });
      data.push(row);
    });
    
    // Loan EMI Payments from liabilities collection
    // Support multiple possible field names for liabilities
    const liabilitiesData = family?.liabilities || family?.liability_details || family?.loans || [];
    if (liabilitiesData.length > 0) {
      liabilitiesData.forEach(loan => {
        const loanCategory = loan.category || loan.loan_type || loan.type || 'Loan';
        const loanLabel = loanCategory.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const emi = (parseFloat(loan.monthly_emi) || parseFloat(loan.emi_amount) || parseFloat(loan.emi) || 0) * 12;
        const numInstallments = parseInt(loan.num_installments) || parseInt(loan.remaining_tenure) || parseInt(loan.tenure_months) || 0;
        const completionYear = currentYear + Math.ceil(numInstallments / 12);
        
        if (emi > 0) {  // Only add if there's an actual EMI
          const row = [`  ${loanLabel} EMI`];
          projectionYears.forEach(year => {
            if (year < completionYear) {
              row.push(formatCurrencyINR(Math.round(emi)));
            } else {
              row.push('-');
            }
          });
          data.push(row);
        }
      });
    }
    
    // Total Expenses - use getTotalFamilyExpenses for consistency with simulation
    const totExpRow = ['TOTAL EXPENSES (B)'];
    projectionYears.forEach(year => {
      const totalYearExp = getTotalFamilyExpenses(year.toString());
      totExpRow.push(formatCurrencyINR(Math.round(totalYearExp)));
    });
    data.push(totExpRow);
    data.push([thinSeparator]);
    
    // GOALS PROJECTION
    data.push(['▶ FINANCIAL GOALS']);
    goalDetails.forEach(goal => {
      const row = [`  ${goal.name || goal.goal_name || goal.category}`];
      // Handle various formats of goal years
      let goalYrs = [];
      
      // Check goal_years array first
      if (goal.goal_years && Array.isArray(goal.goal_years) && goal.goal_years.length > 0) {
        goalYrs = goal.goal_years;
      } 
      // Then check goal_year (can be single value or array)
      else if (goal.goal_year) {
        goalYrs = Array.isArray(goal.goal_year) ? goal.goal_year : [goal.goal_year];
      }
      // Also check target_year field
      else if (goal.target_year) {
        goalYrs = Array.isArray(goal.target_year) ? goal.target_year : [goal.target_year];
      }
      
      // Normalize all years to integers for comparison
      const goalYearsNormalized = goalYrs.map(y => parseInt(String(y).trim())).filter(y => !isNaN(y));
      
      const base = parseFloat(goal.goal_amount) || parseFloat(goal.amount) || 0;
      const infl = parseFloat(goal.inflation_percent) || parseFloat(goal.inflation) || 0;
      
      projectionYears.forEach(year => {
        if (goalYearsNormalized.includes(year)) {
          const fv = base * Math.pow(1 + infl / 100, year - currentYear);
          row.push(formatCurrencyINR(Math.round(fv)));
        } else {
          row.push('-');
        }
      });
      data.push(row);
    });
    
    const totGoalRow = ['TOTAL GOALS (C)'];
    projectionYears.forEach(year => {
      const yrGoal = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, year.toString()), 0);
      totGoalRow.push(yrGoal > 0 ? formatCurrencyINR(Math.round(yrGoal)) : '-');
    });
    data.push(totGoalRow);
    data.push([thinSeparator]);
    
    // INVESTMENTS PROJECTION
    data.push(['▶ INVESTMENTS']);
    
    // Get primary member's retirement year for default
    const primaryRetirementYear = parseInt(primaryMember?.retirement_year) || (currentYear + (60 - primaryAge));
    
    // Group investments by category, respecting upto_year or retirement year
    const investmentsByCategory = {};
    combinedInvestments.forEach(inv => {
      const cat = getCategoryLabel(inv.category) || inv.category || 'Other';
      // Use upto_year if filled, otherwise default to retirement year (NOT life expectancy)
      const invUptoYear = inv.upto_year ? parseInt(inv.upto_year) : primaryRetirementYear;
      
      if (!investmentsByCategory[cat]) {
        investmentsByCategory[cat] = { annualAmount: 0, uptoYear: invUptoYear };
      }
      investmentsByCategory[cat].annualAmount += parseFloat(inv.annual_amount) || 0;
      // Use the minimum upto_year among all investments in this category
      if (invUptoYear < investmentsByCategory[cat].uptoYear) {
        investmentsByCategory[cat].uptoYear = invUptoYear;
      }
    });
    
    Object.entries(investmentsByCategory).forEach(([category, catData]) => {
      const row = [`  ${category}`];
      projectionYears.forEach(year => {
        if (year <= catData.uptoYear) {
          row.push(formatCurrencyINR(Math.round(catData.annualAmount)));
        } else {
          row.push('-');
        }
      });
      data.push(row);
    });
    
    const totInvRow = ['TOTAL INVESTMENTS (D)'];
    projectionYears.forEach(year => {
      const yrInv = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, year.toString()), 0);
      totInvRow.push(yrInv > 0 ? formatCurrencyINR(Math.round(yrInv)) : '-');
    });
    data.push(totInvRow);
    data.push([thinSeparator]);
    
    // NET SAVINGS (updated formula: Income - Expenses - Goals - Investments)
    data.push(['▶ NET ANNUAL SAVINGS = (A) - (B) - (C) - (D)']);
    const netSavRow = ['  Net Savings'];
    const netSavingsArray = [];
    projectionYears.forEach(year => {
      // Use the same calculation functions as the simulation for consistency
      const inc = getTotalFamilyIncome(year.toString());
      const exp = getTotalFamilyExpenses(year.toString());
      const goal = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, year.toString()), 0);
      const inv = members.reduce((sum, m) => sum + getProjectedMemberInvestments(m.id, year.toString()), 0);
      const netSav = inc - exp - goal - inv;
      netSavingsArray.push(netSav);
      netSavRow.push(formatCurrencyINR(Math.round(netSav)));
    });
    data.push(netSavRow);
    data.push([thinSeparator]);
    
    // Get allocation settings from passed allocation parameter (user-configurable)
    const equityPct = (allocation.equity || 80) / 100;
    const debtPct = (allocation.debt || 20) / 100;
    const equityReturnRate = (allocation.equityReturn || 12) / 100;
    const debtReturnRate = (allocation.debtReturn || 7) / 100;
    
    // Calculate opening balance - honour the user's per-asset toggles from
    // the "Configure Assets" modal when computing the included portfolio.
    // Falls back to the unfiltered family total when the caller hasn't
    // passed `selectedAssets` (e.g., older code paths) so behaviour stays
    // backward compatible.
    let effectiveAssetTotal = totalAssets;
    if (allocation.selectedAssets && typeof allocation.selectedAssets === 'object') {
      const debtCategoriesWithMaturity = ['fd', 'bonds', 'bond', 'rd_pis', 'insurance_income', 'ppf', 'nps'];
      const excludedFromAssets = ['epf', 'gratuity'];
      const sel = allocation.selectedAssets || {};
      const amounts = allocation.assetAmounts || {};
      effectiveAssetTotal = 0;
      incomeDetails.forEach(inc => {
        if (excludedFromAssets.includes(inc.category)) return;
        const d = inc.details || {};
        const hasMaturityDate = d.maturity_date || d.maturity_year || d.maturity_amount;
        const isDebtWithMaturity = debtCategoriesWithMaturity.includes(inc.category) && hasMaturityDate;
        // Default selection: debt-with-maturity assets are opt-in (selected=false),
        // every other asset is opt-out (selected=true). The toggle's
        // explicit value, when present, wins over both.
        const explicit = sel[inc.id];
        const isSel = explicit !== undefined ? explicit : !isDebtWithMaturity;
        if (!isSel) return;
        let assetValue = 0;
        if (inc.category === 'cash') {
          assetValue = parseFloat(d.bank_balance) || 0;
        } else {
          assetValue = parseFloat(d.market_value) || parseFloat(d.current_value) ||
                      parseFloat(d.investment_value) || parseFloat(d.balance) || 0;
        }
        // Custom amount override from the modal
        if (amounts[inc.id] !== undefined && amounts[inc.id] !== null && amounts[inc.id] !== '') {
          assetValue = parseFloat(amounts[inc.id]) || 0;
        }
        effectiveAssetTotal += assetValue;
      });
    }
    const openingPortfolio = allocation.includeAssets ? effectiveAssetTotal : 0;
    
    // EQUITY PORTFOLIO (User's Allocation)
    data.push([`▶ EQUITY PORTFOLIO (${allocation.equity || 80}% Allocation @ ${allocation.equityReturn || 12}% Return)`]);
    const eqOpeningRow = ['  Opening Balance'];
    const eqSavingsRow = [`  (+/-) Net Savings Allocated (${allocation.equity || 80}%)`];
    const eqBalanceRow = ['  Balance After Savings'];
    const eqReturnsRow = [`  (+) Returns @ ${allocation.equityReturn || 12}%`];
    const eqClosingRow = ['  CLOSING BALANCE'];
    
    let equityBalance = openingPortfolio * equityPct;
    projectionYears.forEach((year, idx) => {
      const netSav = netSavingsArray[idx];
      const eqOpening = equityBalance;
      eqOpeningRow.push(formatCurrencyINR(Math.round(eqOpening)));
      
      // First add/subtract savings allocation
      const eqSavAlloc = netSav * equityPct;
      eqSavingsRow.push(formatCurrencyINR(Math.round(eqSavAlloc)));
      
      // Balance after savings
      const eqBalAfterSav = eqOpening + eqSavAlloc;
      eqBalanceRow.push(formatCurrencyINR(Math.round(eqBalAfterSav)));
      
      // Then calculate returns on balance after savings
      const eqReturn = eqBalAfterSav * equityReturnRate;
      eqReturnsRow.push(formatCurrencyINR(Math.round(eqReturn)));
      
      // Closing = (Opening + Savings) × (1 + Return%) = Balance After Savings + Returns
      equityBalance = eqBalAfterSav + eqReturn;
      eqClosingRow.push(formatCurrencyINR(Math.round(equityBalance)));
    });
    
    data.push(eqOpeningRow);
    data.push(eqSavingsRow);
    data.push(eqBalanceRow);
    data.push(eqReturnsRow);
    data.push(eqClosingRow);
    data.push([thinSeparator]);
    
    // DEBT PORTFOLIO (User's Allocation)
    data.push([`▶ DEBT PORTFOLIO (${allocation.debt || 20}% Allocation @ ${allocation.debtReturn || 7}% Return)`]);
    const dbOpeningRow = ['  Opening Balance'];
    const dbSavingsRow = [`  (+/-) Net Savings Allocated (${allocation.debt || 20}%)`];
    const dbBalanceRow = ['  Balance After Savings'];
    const dbReturnsRow = [`  (+) Returns @ ${allocation.debtReturn || 7}%`];
    const dbClosingRow = ['  CLOSING BALANCE'];
    
    let debtBalance = openingPortfolio * debtPct;
    projectionYears.forEach((year, idx) => {
      const netSav = netSavingsArray[idx];
      const dbOpening = debtBalance;
      dbOpeningRow.push(formatCurrencyINR(Math.round(dbOpening)));
      
      // First add/subtract savings allocation
      const dbSavAlloc = netSav * debtPct;
      dbSavingsRow.push(formatCurrencyINR(Math.round(dbSavAlloc)));
      
      // Balance after savings
      const dbBalAfterSav = dbOpening + dbSavAlloc;
      dbBalanceRow.push(formatCurrencyINR(Math.round(dbBalAfterSav)));
      
      // Then calculate returns on balance after savings
      const dbReturn = dbBalAfterSav * debtReturnRate;
      dbReturnsRow.push(formatCurrencyINR(Math.round(dbReturn)));
      
      // Closing = (Opening + Savings) × (1 + Return%) = Balance After Savings + Returns
      debtBalance = dbBalAfterSav + dbReturn;
      dbClosingRow.push(formatCurrencyINR(Math.round(debtBalance)));
    });
    
    data.push(dbOpeningRow);
    data.push(dbSavingsRow);
    data.push(dbBalanceRow);
    data.push(dbReturnsRow);
    data.push(dbClosingRow);
    data.push([thinSeparator]);
    
    // TOTAL PORTFOLIO VALUE
    data.push(['▶ TOTAL PORTFOLIO VALUE (Equity + Debt)']);
    const totalPortfolioRow = ['  TOTAL PORTFOLIO'];
    
    // Recalculate: (Opening + Savings) × (1 + Return%) - use openingPortfolio for consistency
    let eqBal = openingPortfolio * equityPct;
    let dbBal = openingPortfolio * debtPct;
    projectionYears.forEach((year, idx) => {
      const netSav = netSavingsArray[idx];
      
      // Equity: Balance after savings, then returns
      const eqSavAlloc = netSav * equityPct;
      eqBal = (eqBal + eqSavAlloc) * (1 + equityReturnRate);
      
      // Debt: Balance after savings, then returns
      const dbSavAlloc = netSav * debtPct;
      dbBal = (dbBal + dbSavAlloc) * (1 + debtReturnRate);
      
      totalPortfolioRow.push(formatCurrencyINR(Math.round(eqBal + dbBal)));
    });
    data.push(totalPortfolioRow);
    data.push([separator]);
    
    // Create Financial Plan Sheet
    const fpSheet = XLSX.utils.aoa_to_sheet(data);
    fpSheet['!cols'] = autoFitColumns(data);
    fpSheet['!protect'] = { sheet: true, objects: true, scenarios: true };
    XLSX.utils.book_append_sheet(wb, fpSheet, "Cashflow");

    // Generate and download file
    const familyName = family?.family_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Financial_Plan';
    const fileName = `${familyName}_Financial_Plan.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), fileName);
  };

  // Export to PDF function - Professional client-facing report
  const handleExportToPDF = () => {
    try {
      // Get the family allocation result for simulation data
      const familyAllocation = allocations['family'] || {
        equity: 80,
        debt: 20,
        equityReturn: 12,
        debtReturn: 7,
        includeAssets: false
      };
      
      const simulationResult = simulationResults['family'];
      const yearlyProjection = simulationResult?.yearlyData || [];
      
      generateFinancialPlanPDF({
        family,
        members,
        incomeDetails,
        expenseDetails,
        goalDetails,
        investmentDetails,
        insurancePremiumsData,
        yearlyProjection,
        allocation: familyAllocation,
        simulationResult,
        totalAssets,
        maturitiesByYear
      });
    } catch (error) {
      console.error('PDF Export Error:', error);
      alert('Error generating PDF. Please try again.');
    }
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
                              <TooltipContent side="top" className="text-xs max-w-[220px]">
                                <div className="space-y-1">
                                  <div className="font-semibold border-b pb-1">{member.name} - {year}</div>
                                  {Object.entries(breakdown)
                                    .filter(([cat]) => cat !== '_total')
                                    .map(([cat, amt]) => (
                                    <div key={cat} className="flex justify-between gap-2">
                                      <span className="capitalize">{cat.replace(/insurance_/g, '').replace(/_/g, ' ')}:</span>
                                      <span>{formatAmount(amt)}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between gap-2 font-semibold border-t pt-1 mt-1">
                                    <span>Total:</span>
                                    <span>{formatAmount(breakdown._total || value)}</span>
                                  </div>
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
        getTotalFamilyIncome={getTotalFamilyIncome}
        getTotalFamilyExpenses={getTotalFamilyExpenses}
        incomeDetails={incomeDetails}
        expenseDetails={expenseDetails}
        goalDetails={goalDetails}
        investmentDetails={investmentDetails}
        insurancePremiumsData={insurancePremiumsData}
        primaryAge={primaryAge}
        lifeExpectancy={lifeExpectancy}
        calculateAge={calculateAge}
        handleExportToExcel={handleExportToExcel}
        totalAssets={totalAssets}
        maturitiesByYear={maturitiesByYear}
        generateFinancialPlanPDF={generateFinancialPlanPDF}
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
  getTotalFamilyIncome,
  getTotalFamilyExpenses,
  incomeDetails,
  expenseDetails,
  goalDetails,
  investmentDetails,
  insurancePremiumsData,
  primaryAge,
  lifeExpectancy,
  calculateAge,
  handleExportToExcel,
  totalAssets,
  maturitiesByYear,
  generateFinancialPlanPDF
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
  // Categories always excluded from opening assets (they come via maturities at retirement)
  const ALWAYS_EXCLUDE_FROM_ASSETS = ['epf', 'gratuity'];

  // Get assets for a specific member or family
  const getAssetsForEntity = (entityId) => {
    const assets = [];
    incomeDetails.forEach(inc => {
      const details = inc.details || {};
      
      // Always exclude EPF and Gratuity from assets (they come via maturities)
      if (ALWAYS_EXCLUDE_FROM_ASSETS.includes(inc.category)) return;
      
      const hasMaturityDate = details.maturity_date || details.maturity_year || details.maturity_amount;
      const isDebtCategory = DEBT_CATEGORIES_WITH_MATURITY.includes(inc.category);
      
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
          // Debt instruments with a maturity date are still listed (so the
          // user can see they exist) but default to UNSELECTED + use the
          // maturity year as the include-from-year — preventing the double-
          // counting issue with the maturity inflow row in the projection.
          let defaultIncludeYear = currentYear;
          let defaultSelected = true;
          if (isDebtCategory && hasMaturityDate) {
            const matYear = parseInt(details.maturity_year) ||
              (details.maturity_date ? new Date(details.maturity_date).getFullYear() : null);
            if (matYear && Number.isFinite(matYear)) defaultIncludeYear = matYear;
            defaultSelected = false; // opt-in to avoid double-counting with maturities
          }
          assets.push({
            id: inc.id,
            category: inc.category,
            label: getCategoryLabel(inc.category),
            memberIds: memberIds,
            value: entityId === 'family' ? mktValue : mktValue / Math.max(1, memberIds.length),
            selected: defaultSelected,
            includeFromYear: defaultIncludeYear,
            isDebtWithMaturity: !!(isDebtCategory && hasMaturityDate),
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
      bonds: 'NCD', ppf: 'PPF', epf: 'EPF', nps: 'NPS', rd_pis: 'RD',
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
  const WealthChart = ({ result, entityName, entityId }) => {
    if (!result) {
      return null;
    }

    const { success, finalCorpus, lastYear, yearsShort, entityEndYear, lifeExpectancy } = result;
    
    // Calculate years short of youngest member's life expectancy
    // Only consider members who have life expectancy explicitly set
    const membersWithLE = members.filter(m => m.life_expectancy && Number(m.life_expectancy) > 0);
    const youngestMemberEndYear = membersWithLE.length > 0 
      ? Math.max(...membersWithLE.map(m => {
          const age = calculateAge(m.date_of_birth);
          const lifeExp = parseInt(m.life_expectancy);
          return currentYear + (lifeExp - age);
        }))
      : endYear;  // Use primary's end year if no one has LE set
    
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
        <button 
          onClick={() => exportSimulationToExcel(entityId)}
          className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100"
        >
          Export Debug
        </button>
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
    // Calculate returns separately for equity and debt portions (matching Excel logic)
    const equityPct = equity / 100;
    const debtPct = debt / 100;
    const eqReturnRate = equityReturn / 100;
    const dbReturnRate = debtReturn / 100;
    
    // Calculate maturities inline (same logic as component-level getMaturitiesByYear)
    // Skip instruments whose current value is already included in opening assets
    // to prevent double-counting (e.g., FD included in opening balance + FD maturity in 2028)
    const simMaturitiesByYear = {};
    for (let y = currentYear; y <= endYear; y++) {
      simMaturitiesByYear[y] = { total: 0 };
    }
    const debtCatsWithMat = ['fd', 'bonds', 'bond', 'rd_pis', 'insurance_income', 'ppf', 'nps'];
    const selectedAssetMap = allocation?.selectedAssets || {};
    incomeDetails.forEach(inc => {
      const d = inc.details || {};
      
      // Check if this instrument is explicitly selected in opening assets
      // If so, skip adding its maturity to avoid double-counting
      const hasMat = d.maturity_date || d.maturity_year || d.maturity_amount;
      const isDebtWithMat = debtCatsWithMat.includes(inc.category) && hasMat;
      const explicitSel = selectedAssetMap[inc.id];
      // Default: debt-with-maturity is NOT selected (so maturity IS counted)
      // If explicitly selected (true), skip maturity to avoid double-counting
      if (isDebtWithMat && explicitSel === true) {
        return; // Skip this instrument's maturity since its value is in opening balance
      }
      
      let matYr = null;
      if (d.maturity_date) {
        const ds = d.maturity_date;
        if (ds.includes('/')) {
          const p = ds.split('/');
          const yr = p[1] || p[0];
          matYr = yr.length === 4 ? parseInt(yr) : (parseInt(yr) >= 50 ? 1900 + parseInt(yr) : 2000 + parseInt(yr));
        } else if (ds.includes('-')) {
          matYr = new Date(ds).getFullYear();
        }
      } else if (d.maturity_year) {
        matYr = parseInt(d.maturity_year);
      }
      const isRetInst = ['epf', 'ppf', 'nps', 'gratuity'].includes(inc.category);
      let matVal = parseFloat(d.maturity_value) || parseFloat(d.maturity_amount) || 
                   parseFloat(d.expected_maturity) || parseFloat(d.maturity_corpus) ||
                   (isRetInst ? parseFloat(d.market_value) : 0) || 0;
      if (matYr && matVal === 0) {
        const invVal = parseFloat(d.investment_value) || parseFloat(d.investment_amount) || 0;
        const intRate = parseFloat(d.interest_rate) || parseFloat(d.expected_return) || 0;
        const tenure = matYr - currentYear;
        if (invVal > 0 && tenure > 0) {
          matVal = invVal * Math.pow(1 + intRate / 100, tenure);
        }
      }
      if (matYr && matVal > 0 && simMaturitiesByYear[matYr]) {
        simMaturitiesByYear[matYr].total += matVal;
      }
    });
    
    // Get assets for this entity
    const entityAssets = getAssetsForEntity(entityId);
    
    // Calculate totalAssets inside runSimulation, honouring per-asset
    // toggles from the Configure Assets modal (selectedAssets / assetAmounts)
    // so the in-app projection matches the Excel export.
    const excludedCats = ['epf', 'gratuity'];
    const debtCats = ['fd', 'bonds', 'bond', 'rd_pis', 'insurance_income', 'ppf', 'nps'];
    const sel = allocation?.selectedAssets || {};
    const amountOverrides = allocation?.assetAmounts || {};
    let openingBalance = 0;
    incomeDetails.forEach(inc => {
      if (excludedCats.includes(inc.category)) return;
      const d = inc.details || {};
      const hasMat = d.maturity_date || d.maturity_year || d.maturity_amount;
      const isDebtWithMaturity = debtCats.includes(inc.category) && hasMat;
      // Default selection mirrors Excel: opt-in for debt-with-maturity,
      // opt-out for everything else; explicit toggle wins.
      const explicit = sel[inc.id];
      const isSel = explicit !== undefined ? explicit : !isDebtWithMaturity;
      if (!isSel) return;
      let val = 0;
      if (inc.category === 'cash') {
        val = parseFloat(d.bank_balance) || 0;
      } else {
        val = parseFloat(d.market_value) || parseFloat(d.current_value) || 
              parseFloat(d.investment_value) || parseFloat(d.balance) || 0;
      }
      // Custom amount override from the Configure Assets modal
      if (amountOverrides[inc.id] !== undefined && amountOverrides[inc.id] !== null && amountOverrides[inc.id] !== '') {
        val = parseFloat(amountOverrides[inc.id]) || 0;
      }
      openingBalance += val;
    });
    
    // Initialize corpus with openingBalance (same as Excel's totalAssets)
    let corpus = includeAssets ? openingBalance : 0;
    
    // Track equity and debt balances separately (same as Excel)
    let equityBalance = corpus * equityPct;
    let debtBalance = corpus * debtPct;
    
    let exhaustYear = null;
    
    // Determine end year based on entity
    // For individual members without life expectancy, use the family's endYear
    const entityEndYear = isFamily ? endYear : (() => {
      const member = members.find(m => m.id === entityId);
      const age = calculateAge(member?.date_of_birth);
      const memberLifeExp = parseInt(member?.life_expectancy);
      // If member has no life expectancy set, use family endYear
      if (!memberLifeExp) return endYear;
      return currentYear + (memberLifeExp - age);
    })();

    // Get current age for the entity
    const entityAge = isFamily 
      ? calculateAge(members.find(m => m.is_primary)?.date_of_birth)
      : calculateAge(members.find(m => m.id === entityId)?.date_of_birth);
    
    // Life expectancy - only use 85 default for primary member if not set
    const lifeExpectancy = isFamily 
      ? parseInt(members.find(m => m.is_primary)?.life_expectancy) || 85
      : parseInt(members.find(m => m.id === entityId)?.life_expectancy) || endYear - currentYear + entityAge;

    // Store yearly data for chart
    const yearlyData = [];

    for (let year = currentYear; year <= entityEndYear; year++) {
      const yearStr = year.toString();
      const age = entityAge + (year - currentYear);
      
      // Calculate income/expenses based on entity
      let totalIncome, totalExpenses, totalGoals;
      
      if (isFamily) {
        // Use family-level functions that mirror Excel calculation exactly
        totalIncome = getTotalFamilyIncome(yearStr);
        totalExpenses = getTotalFamilyExpenses(yearStr);
        totalGoals = members.reduce((sum, m) => sum + getMemberGoalExpenses(m.id, yearStr), 0);
      } else {
        // For individual members, use member-specific calculations
        const yearMaturities = simMaturitiesByYear[year]?.total || 0;
        totalIncome = getProjectedMemberIncome(entityId, yearStr) + yearMaturities;
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
      
      // Net Savings = Income (with maturities) - Expenses - Goals - Investments
      const netSavings = totalIncome - totalExpenses - totalGoals - totalInvestments;
      
      // Portfolio calculation - matching Excel formula exactly:
      // Track equity and debt separately (same as Excel)
      
      // Current opening values
      const eqOpening = equityBalance;
      const dbOpening = debtBalance;
      
      // Allocate net savings to equity and debt portions
      const eqSavings = netSavings * equityPct;
      const dbSavings = netSavings * debtPct;
      
      // Apply returns: (Opening + Savings) × (1 + Return%)
      const eqClosing = (eqOpening + eqSavings) * (1 + eqReturnRate);
      const dbClosing = (dbOpening + dbSavings) * (1 + dbReturnRate);
      
      // Store opening balance before updating
      const openingThisYear = equityBalance + debtBalance;
      
      // Update balances for next iteration (same as Excel)
      equityBalance = eqClosing;
      debtBalance = dbClosing;
      
      // New total corpus
      corpus = eqClosing + dbClosing;
      
      // Store ALL yearly data for debugging/export (income now includes maturities)
      yearlyData.push({
        year,
        age,
        openingBalance: Math.round(openingThisYear),
        income: Math.round(totalIncome),  // Now includes maturities
        expenses: Math.round(totalExpenses),
        goals: Math.round(totalGoals),
        investments: Math.round(totalInvestments),
        netSavings: Math.round(netSavings),
        eqOpening: Math.round(eqOpening),
        dbOpening: Math.round(dbOpening),
        eqSavings: Math.round(eqSavings),
        dbSavings: Math.round(dbSavings),
        eqClosing: Math.round(eqClosing),
        dbClosing: Math.round(dbClosing),
        corpus: Math.round(corpus),
        isExhausted: corpus <= 0,
        isLifeExpectancy: year === entityEndYear
      });
      
      if (corpus <= 0 && !exhaustYear) {
        exhaustYear = year;
      }
    }
    
    // Log first year's calculation for debugging
    if (yearlyData.length > 0) {
      console.log('=== SIMULATION DEBUG ===');
      console.log('Opening Balance (Year 1):', openingBalance);
      console.log('First 3 years data:', yearlyData.slice(0, 3));
    }
    
    // Ensure life expectancy year data exists
    const lifeExpYearData = yearlyData.find(d => d.year === entityEndYear);
    if (!lifeExpYearData) {
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

  // Export simulation data to Excel for debugging
  const exportSimulationToExcel = (entityId) => {
    const isFamily = entityId === 'family';
    const allocation = isFamily ? familyAllocation : memberAllocations[entityId];
    
    if (!allocation?.result?.yearlyData) {
      alert('Please run simulation first');
      return;
    }
    
    const yearlyData = allocation.result.yearlyData;
    const wb = XLSX.utils.book_new();
    
    // Create data array for Excel
    const data = [
      ['SIMULATION CASHFLOW DEBUG'],
      [`Entity: ${isFamily ? 'Family' : members.find(m => m.id === entityId)?.name}`],
      [`Generated: ${new Date().toLocaleString()}`],
      ['Note: Income includes Maturities (same as Excel export)'],
      [],
      ['Year', 'Age', 'Opening Balance', 'Income (incl. Maturities)', 'Expenses', 'Goals', 'Investments', 'Net Savings', 'Eq Opening', 'Db Opening', 'Eq Savings', 'Db Savings', 'Eq Closing', 'Db Closing', 'Total Portfolio']
    ];
    
    yearlyData.forEach(d => {
      data.push([
        d.year,
        d.age,
        d.openingBalance,
        d.income,
        d.expenses,
        d.goals,
        d.investments,
        d.netSavings,
        d.eqOpening,
        d.dbOpening,
        d.eqSavings,
        d.dbSavings,
        d.eqClosing,
        d.dbClosing,
        d.corpus
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Simulation Debug');
    XLSX.writeFile(wb, `simulation_debug_${Date.now()}.xlsx`);
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
      const memberLifeExp = parseInt(member?.life_expectancy);
      // If member has no life expectancy, use family's endYear
      entityEndYear = memberLifeExp ? currentYear + (memberLifeExp - entityAge) : endYear;
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
    
    // Filter income and expense details based on family vs individual member
    const entityIncomeDetails = isFamily 
      ? incomeDetails 
      : incomeDetails.filter(inc => {
          const memberIds = inc.member_ids || [];
          return memberIds.includes(entityId) || memberIds.includes(String(entityId));
        });
    
    const entityExpenseDetails = isFamily 
      ? expenseDetails 
      : expenseDetails.filter(exp => {
          const memberIds = exp.member_ids || [];
          // Include family-level expenses (no member_ids or includes 'family') for individual too
          if (memberIds.length === 0 || memberIds.includes('family')) return true;
          return memberIds.includes(entityId) || memberIds.includes(String(entityId));
        });
    
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
    dataSheetData.push(['', 'Life Expectancy', ...targetMembers.map(m => m.life_expectancy ? parseInt(m.life_expectancy) : 'Not set')]);
    dataSheetData.push(['']);

    // SECTION 2: INCOME DETAILS - Comprehensive with all categories
    dataSheetData.push(['', 'SECTION 2: INCOME DETAILS']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    
    // Helper to get income by category for a member - uses filtered entityIncomeDetails
    const getMemberIncomeByCategory = (memberId, category) => {
      return entityIncomeDetails.filter(inc => {
        const incMemberIds = inc.member_ids || [];
        const matchesMember = incMemberIds.includes(memberId) || incMemberIds.includes(String(memberId));
        const normalizedCat = normalizeIncomeCategory(inc.category);
        const normalizedTarget = normalizeIncomeCategory(category);
        return matchesMember && normalizedCat === normalizedTarget;
      });
    };
    
    // ---- REGULAR INCOME (Recurring) ----
    dataSheetData.push(['', '▸ REGULAR INCOME (Annual)']);
    dataSheetData.push(['', 'Income Type', ...targetMembers.map(m => m.name), 'Total', 'Growth %', 'Income Till']);
    
    // Salary Income
    const salaryByMember = targetMembers.map(m => {
      const info = getMemberIncomeInfo(m.id);
      return info.baseSalary;
    });
    const salaryGrowths = targetMembers.map(m => getMemberIncomeInfo(m.id).salaryGrowth);
    const avgSalaryGrowth = salaryGrowths.reduce((a, b) => a + b, 0) / (salaryGrowths.filter(g => g > 0).length || 1);
    const salaryEndYears = targetMembers.map(m => getMemberIncomeInfo(m.id).salaryEndYear);
    dataSheetData.push(['', 'Salary Income', ...salaryByMember, salaryByMember.reduce((a, b) => a + b, 0), 
      salaryGrowths.some(g => g > 0) ? `${avgSalaryGrowth.toFixed(1)}%` : '-',
      salaryEndYears.some(y => y) ? Math.min(...salaryEndYears.filter(y => y)) : '-']);
    
    // Business Income
    const businessByMember = targetMembers.map(m => {
      const info = getMemberIncomeInfo(m.id);
      return info.baseBusiness;
    });
    const businessGrowths = targetMembers.map(m => getMemberIncomeInfo(m.id).businessGrowth);
    const avgBusinessGrowth = businessGrowths.reduce((a, b) => a + b, 0) / (businessGrowths.filter(g => g > 0).length || 1);
    const businessEndYears = targetMembers.map(m => getMemberIncomeInfo(m.id).businessEndYear);
    dataSheetData.push(['', 'Business Income', ...businessByMember, businessByMember.reduce((a, b) => a + b, 0),
      businessGrowths.some(g => g > 0) ? `${avgBusinessGrowth.toFixed(1)}%` : '-',
      businessEndYears.some(y => y) ? Math.min(...businessEndYears.filter(y => y)) : '-']);
    
    // Property Details (Rental Income)
    const propertyByMember = targetMembers.map(m => {
      const properties = getMemberIncomeByCategory(m.id, 'rental');
      return properties.reduce((sum, p) => {
        const d = p.details || {};
        return sum + (parseFloat(d.annual_rent) || (parseFloat(d.rent_per_month) || 0) * 12);
      }, 0);
    });
    const propertyGrowths = targetMembers.map(m => {
      const properties = getMemberIncomeByCategory(m.id, 'rental');
      return properties.reduce((max, p) => {
        const d = p.details || {};
        return Math.max(max, parseFloat(d.absolute_return) || parseFloat(d.xirr_return) || 0);
      }, 0);
    });
    const avgPropertyGrowth = propertyGrowths.reduce((a, b) => a + b, 0) / (propertyGrowths.filter(g => g > 0).length || 1);
    if (propertyByMember.some(v => v > 0)) {
      dataSheetData.push(['', 'Property Details (Rent)', ...propertyByMember, propertyByMember.reduce((a, b) => a + b, 0),
        propertyGrowths.some(g => g > 0) ? `${avgPropertyGrowth.toFixed(1)}%` : '-', '-']);
    }
    
    // Pension
    const pensionByMember = targetMembers.map(m => {
      const pensions = getMemberIncomeByCategory(m.id, 'pension');
      return pensions.reduce((sum, p) => {
        const d = p.details || {};
        return sum + (parseFloat(d.amount_yearly) || (parseFloat(d.amount) || 0) * 12);
      }, 0);
    });
    if (pensionByMember.some(v => v > 0)) {
      dataSheetData.push(['', 'Pension', ...pensionByMember, pensionByMember.reduce((a, b) => a + b, 0), '-', '-']);
    }
    
    // Total Regular Income
    const totalRegularByMember = targetMembers.map((m, i) => 
      salaryByMember[i] + businessByMember[i] + propertyByMember[i] + pensionByMember[i]
    );
    dataSheetData.push(['', 'Total Regular Income', ...totalRegularByMember, totalRegularByMember.reduce((a, b) => a + b, 0), '', '']);
    dataSheetData.push(['']);
    
    // ---- RETIREMENT CORPUS ----
    dataSheetData.push(['', '▸ RETIREMENT CORPUS']);
    dataSheetData.push(['', 'Type', 'Member', 'Current Value', 'Annual Contribution', 'Growth %', 'Maturity Date', 'Years to Mature', 'Maturity Value']);
    
    // Helper function to compute maturity value dynamically
    const computeMaturityValue = (details, category) => {
      const currentValue = parseFloat(details.market_value) || 0;
      const annualContribution = parseFloat(details.annual_contribution) || 0;
      const growthRate = parseFloat(details.growth_rate) || (category === 'ppf' ? 7.1 : category === 'epf' ? 8.25 : 6);
      const maturityDateStr = details.maturity_date;
      const uptoYear = parseInt(details.upto_year || 0);
      
      if (!maturityDateStr || currentValue <= 0) {
        return { yearsToMature: '-', maturityValue: '-' };
      }
      
      const currentYear = new Date().getFullYear();
      const maturityYear = new Date(maturityDateStr).getFullYear();
      const yearsToMaturity = Math.max(0, maturityYear - currentYear);
      
      if (yearsToMaturity <= 0) {
        return { yearsToMature: 0, maturityValue: currentValue };
      }
      
      const contributionEndYear = uptoYear > 0 ? Math.min(uptoYear, maturityYear) : maturityYear;
      const contributionYears = Math.max(0, contributionEndYear - currentYear);
      const r = growthRate / 100;
      
      let maturityValue = currentValue;
      if (r > 0) {
        // Value of current corpus at maturity
        const corpusAtMaturity = currentValue * Math.pow(1 + r, yearsToMaturity);
        
        // Future value of contributions
        let contributionFV = 0;
        if (annualContribution > 0 && contributionYears > 0) {
          const fvAtContributionEnd = annualContribution * ((Math.pow(1 + r, contributionYears) - 1) / r);
          const remainingYears = yearsToMaturity - contributionYears;
          contributionFV = fvAtContributionEnd * Math.pow(1 + r, Math.max(0, remainingYears));
        }
        
        maturityValue = Math.round(corpusAtMaturity + contributionFV);
      } else {
        maturityValue = Math.round(currentValue + (annualContribution * contributionYears));
      }
      
      return { yearsToMature: yearsToMaturity, maturityValue };
    };
    
    ['ppf', 'epf', 'gratuity'].forEach(cat => {
      const label = getIncomeCategoryLabel(cat);
      targetMembers.forEach(m => {
        const items = getMemberIncomeByCategory(m.id, cat);
        items.forEach(item => {
          const d = item.details || {};
          const growthRate = parseFloat(d.growth_rate) || (cat === 'ppf' ? 7.1 : cat === 'epf' ? 8.25 : 6);
          const { yearsToMature, maturityValue } = computeMaturityValue(d, cat);
          dataSheetData.push(['', label, m.name, 
            parseFloat(d.market_value) || 0,
            parseFloat(d.annual_contribution) || 0,
            `${growthRate}%`,
            d.maturity_date || '-',
            yearsToMature,
            maturityValue
          ]);
        });
      });
    });
    dataSheetData.push(['']);
    
    // ---- FIXED INCOME / DEBT INSTRUMENTS ----
    const hasDebtInstruments = entityIncomeDetails.some(inc => 
      ['fd', 'fixed_deposit', 'rd_pis', 'bond', 'ncd', 'insurance_income', 'insurance'].includes(inc.category)
    );
    
    if (hasDebtInstruments) {
      dataSheetData.push(['', '▸ FIXED INCOME / DEBT INSTRUMENTS']);
      dataSheetData.push(['', 'Type', 'Member', 'Description', 'Investment', 'Interest/XIRR', 'Maturity Date', 'Maturity Amount']);
      
      // Helper to get member name from ID - use ALL members for lookup
      const getMemberNameForDebt = (memberIds) => {
        if (!memberIds || memberIds.length === 0) return 'Family';
        const memberId = memberIds[0];
        const member = members.find(m => m.id === memberId || String(m.id) === String(memberId));
        return member?.name || 'Family';
      };
      
      // Fixed Deposit - iterate directly using filtered entityIncomeDetails
      entityIncomeDetails
        .filter(inc => inc.category === 'fd' || inc.category === 'fixed_deposit')
        .forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', 'Fixed Deposit', getMemberNameForDebt(item.member_ids),
            d.description || '-',
            parseFloat(d.investment_value) || 0,
            d.gross_xirr ? `${d.gross_xirr}%` : (d.interest_rate ? `${d.interest_rate}%` : '-'),
            d.maturity_date || '-',
            parseFloat(d.maturity_amount) || 0
          ]);
        });
      
      // RD / PIS
      entityIncomeDetails
        .filter(inc => inc.category === 'rd_pis')
        .forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', 'RD / PIS', getMemberNameForDebt(item.member_ids),
            `Monthly: ₹${parseFloat(d.investment_value_monthly) || 0}`,
            parseFloat(d.investment_value) || 0,
            d.gross_xirr ? `${d.gross_xirr}%` : (d.interest_rate ? `${d.interest_rate}%` : '-'),
            d.end_date || '-',
            parseFloat(d.maturity_value) || 0
          ]);
        });
      
      // NCD / Bonds
      entityIncomeDetails
        .filter(inc => inc.category === 'bond' || inc.category === 'ncd')
        .forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', 'NCD', getMemberNameForDebt(item.member_ids),
            d.description || '-',
            parseFloat(d.investment_value) || 0,
            d.gross_xirr ? `${d.gross_xirr}%` : '-',
            d.maturity_date || '-',
            parseFloat(d.maturity_amount) || 0
          ]);
        });
      
      // Insurance (as investment)
      entityIncomeDetails
        .filter(inc => inc.category === 'insurance_income' || inc.category === 'insurance')
        .forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', 'Insurance', getMemberNameForDebt(item.member_ids),
            d.description || '-',
            parseFloat(d.total_paid) || 0,
            d.gross_xirr ? `${d.gross_xirr}%` : '-',
            d.maturity_date || '-',
            parseFloat(d.maturity_amount) || 0
          ]);
        });
      dataSheetData.push(['']);
    }
    
    // ---- MARKET-LINKED INVESTMENTS ----
    const hasEquityInvestments = entityIncomeDetails.some(inc => 
      ['mutual_fund', 'shares_pms'].includes(inc.category)
    );
    
    if (hasEquityInvestments) {
      dataSheetData.push(['', '▸ MARKET-LINKED INVESTMENTS']);
      
      // Helper to get member name from ID - use ALL members for lookup
      const getMemberNameForInv = (memberIds) => {
        if (!memberIds || memberIds.length === 0) return 'Family';
        const memberId = memberIds[0];
        const member = members.find(m => m.id === memberId || String(m.id) === String(memberId));
        return member?.name || 'Family';
      };
      
      // Mutual Funds
      const mfItems = entityIncomeDetails.filter(inc => inc.category === 'mutual_fund');
      if (mfItems.length > 0) {
        dataSheetData.push(['', 'Mutual Fund', 'Member', 'Market Value', 'SIP Amount', 'Annual SIP', 'Up to Year']);
        mfItems.forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', '', getMemberNameForInv(item.member_ids),
            parseFloat(d.market_value) || 0,
            parseFloat(d.sip_amount) || 0,
            parseFloat(d.annual_sip_amount) || (parseFloat(d.sip_amount) || 0) * 12,
            d.upto_year || '-'
          ]);
        });
        dataSheetData.push(['']);
      }
      
      // Shares / PMS
      const sharesItems = entityIncomeDetails.filter(inc => inc.category === 'shares_pms');
      if (sharesItems.length > 0) {
        dataSheetData.push(['', 'Shares / PMS', 'Member', 'Market Value', 'Annual Contribution', 'Monthly Contribution', 'Up to Year']);
        sharesItems.forEach(item => {
          const d = item.details || {};
          const annualContrib = parseFloat(d.annual_contribution) || 0;
          const monthlyContrib = parseFloat(d.monthly_contribution) || Math.round(annualContrib / 12);
          dataSheetData.push(['', '', getMemberNameForInv(item.member_ids),
            parseFloat(d.market_value) || 0,
            annualContrib,
            monthlyContrib,
            d.upto_year || '-'
          ]);
        });
        dataSheetData.push(['']);
      }
    }
    
    // ---- OTHER ASSETS ----
    const hasOtherAssets = entityIncomeDetails.some(inc => 
      ['commodities', 'cash', 'cash_in_hand', 'vehicle', 'other'].includes(inc.category)
    );
    
    if (hasOtherAssets) {
      dataSheetData.push(['', '▸ OTHER ASSETS']);
      
      // Helper to get member name from ID - use ALL members for lookup
      const getMemberNameForAssets = (memberIds) => {
        if (!memberIds || memberIds.length === 0) return 'Family';
        const memberId = memberIds[0];
        const member = members.find(m => m.id === memberId || String(m.id) === String(memberId));
        return member?.name || 'Family';
      };
      
      // Cash In Hand
      const cashItems = entityIncomeDetails.filter(inc => inc.category === 'cash' || inc.category === 'cash_in_hand');
      if (cashItems.length > 0) {
        dataSheetData.push(['', 'Cash In Hand', 'Member', 'Description', 'Bank Balance']);
        cashItems.forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', '', getMemberNameForAssets(item.member_ids),
            d.description || '-',
            parseFloat(d.bank_balance) || 0
          ]);
        });
        dataSheetData.push(['']);
      }
      
      // Vehicle
      const vehicleItems = entityIncomeDetails.filter(inc => inc.category === 'vehicle');
      if (vehicleItems.length > 0) {
        dataSheetData.push(['', 'Vehicle', 'Member', 'Description', 'Current Market Value']);
        vehicleItems.forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', '', getMemberNameForAssets(item.member_ids),
            d.description || '-',
            parseFloat(d.market_value) || 0
          ]);
        });
        dataSheetData.push(['']);
      }
      
      // Commodities
      const commodityItems = entityIncomeDetails.filter(inc => inc.category === 'commodities');
      if (commodityItems.length > 0) {
        dataSheetData.push(['', 'Commodities', 'Member', 'Type', 'Weight (Kg)', 'Price/Kg', 'Market Value']);
        commodityItems.forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', '', getMemberNameForAssets(item.member_ids),
            d.commodity_type || 'Gold',
            parseFloat(d.weight_kg) || 0,
            parseFloat(d.price_per_kg) || 0,
            parseFloat(d.market_value) || 0
          ]);
        });
        dataSheetData.push(['']);
      }
      
      // Other
      const otherItems = entityIncomeDetails.filter(inc => inc.category === 'other');
      if (otherItems.length > 0) {
        dataSheetData.push(['', 'Other', 'Member', 'Description', 'Value']);
        otherItems.forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', '', getMemberNameForAssets(item.member_ids),
            d.description || '-',
            parseFloat(d.market_value) || parseFloat(d.value) || 0
          ]);
        });
        dataSheetData.push(['']);
      }
    }
    
    // ---- PROPERTY DETAILS (Full) ----
    const hasProperties = entityIncomeDetails.some(inc => 
      ['rental', 'property_details'].includes(inc.category)
    );
    
    if (hasProperties) {
      dataSheetData.push(['', '▸ PROPERTY DETAILS']);
      dataSheetData.push(['', 'Property', 'Member', 'Type', 'Investment', 'Market Value', 'XIRR %', 'On Rent', 'Annual Rent', 'Absolute Return %']);
      
      targetMembers.forEach(m => {
        const items = getMemberIncomeByCategory(m.id, 'rental');
        items.forEach(item => {
          const d = item.details || {};
          dataSheetData.push(['', d.property_details || 'Property', m.name,
            d.property_type || '-',
            parseFloat(d.investment_amount) || 0,
            parseFloat(d.market_value) || 0,
            d.xirr_return ? `${d.xirr_return}%` : '-',
            d.is_on_rent || 'No',
            parseFloat(d.annual_rent) || 0,
            d.absolute_return ? `${d.absolute_return}%` : '-'
          ]);
        });
      });
      dataSheetData.push(['']);
    }
    
    // ---- INCOME SUMMARY ----
    const totalIncomeByMember = targetMembers.map(m => {
      const info = getMemberIncomeInfo(m.id);
      return info.baseSalary + info.baseBusiness + info.baseRental + info.basePension + (info.baseMutualFund || 0);
    });
    dataSheetData.push(['', 'TOTAL ANNUAL INCOME', ...totalIncomeByMember.map(v => v), totalIncomeByMember.reduce((a, b) => a + b, 0)]);
    dataSheetData.push(['']);

    // SECTION 3: EXPENSE DETAILS - Comprehensive with all categories
    dataSheetData.push(['', 'SECTION 3: EXPENSE DETAILS']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    
    // Group expenses by type - using filtered entityExpenseDetails
    const regularExpenses = entityExpenseDetails.filter(e => getExpenseType(e.expense_type) === 'regular');
    const insuranceExpenses = entityExpenseDetails.filter(e => getExpenseType(e.expense_type) === 'insurance');
    const loanExpenses = entityExpenseDetails.filter(e => getExpenseType(e.expense_type) === 'loan');
    
    // ---- REGULAR HOUSEHOLD EXPENSES ----
    if (regularExpenses.length > 0) {
      dataSheetData.push(['', '▸ REGULAR HOUSEHOLD EXPENSES']);
      dataSheetData.push(['', 'Category', 'Monthly', 'Annual', 'Inflation %', 'Post-Retirement %', 'Continues Till']);
      
      let totalRegularMonthly = 0;
      let totalRegularAnnual = 0;
      
      // Group by category
      const regularByCategory = {};
      regularExpenses.forEach(exp => {
        const cat = exp.expense_type || 'other';
        if (!regularByCategory[cat]) regularByCategory[cat] = [];
        regularByCategory[cat].push(exp);
      });
      
      Object.entries(regularByCategory).forEach(([cat, expenses]) => {
        const monthlyTotal = expenses.reduce((sum, e) => sum + (parseFloat(e.monthly_amount) || 0), 0);
        const annualTotal = expenses.reduce((sum, e) => sum + (parseFloat(e.annual_amount) || parseFloat(e.monthly_amount) * 12 || 0), 0);
        const avgInflation = expenses.reduce((sum, e) => sum + (parseFloat(e.inflation_percent) || 6), 0) / expenses.length;
        
        // Post-retirement percentage - check if any expense in category continues post-retirement
        const hasPostRetirement = expenses.some(e => e.consider_post_retirement === true || e.consider_post_retirement === 'true');
        const postRetirementPct = hasPostRetirement 
          ? expenses.reduce((sum, e) => sum + (parseFloat(e.post_retirement_percent) || 100), 0) / expenses.length
          : 0;
        
        // Get the last applicable year (upto_year or retirement)
        const continuesTill = expenses.reduce((maxYear, e) => {
          const yr = parseInt(e.upto_year) || 0;
          return yr > maxYear ? yr : maxYear;
        }, 0);
        
        totalRegularMonthly += monthlyTotal;
        totalRegularAnnual += annualTotal;
        
        dataSheetData.push(['', 
          getExpenseCategoryLabel(cat), 
          monthlyTotal, 
          annualTotal, 
          `${avgInflation.toFixed(1)}%`,
          hasPostRetirement ? `${postRetirementPct.toFixed(0)}%` : 'Stops at Retirement',
          continuesTill > 0 ? continuesTill : '-'
        ]);
      });
      
      dataSheetData.push(['', 'Sub-Total Regular Expenses', totalRegularMonthly, totalRegularAnnual, '', '', '']);
      dataSheetData.push(['']);
    }
    
    // ---- INSURANCE PREMIUMS ----
    if (insuranceExpenses.length > 0 || (family?.insurance_premiums && family.insurance_premiums.length > 0)) {
      dataSheetData.push(['', '▸ INSURANCE PREMIUMS']);
      dataSheetData.push(['', 'Insurance Type', 'Premium Frequency', 'Premium Amount', 'Annual Premium', 'Step-up %', 'Premium Till']);
      
      let totalInsuranceAnnual = 0;
      
      // Insurance from expense_details
      insuranceExpenses.forEach(exp => {
        const premiumFreq = exp.premium_frequency || 'Yearly';
        const premiumAmt = parseFloat(exp.premium_amount) || parseFloat(exp.monthly_amount) || 0;
        let annualPremium = premiumAmt;
        if (premiumFreq === 'Monthly') annualPremium = premiumAmt * 12;
        else if (premiumFreq === 'Quarterly') annualPremium = premiumAmt * 4;
        else if (premiumFreq === 'Half-Yearly') annualPremium = premiumAmt * 2;
        
        const stepUp = parseFloat(exp.step_up_percent) || 0;
        const uptoYear = exp.upto_year || '-';
        
        totalInsuranceAnnual += annualPremium;
        
        dataSheetData.push(['', 
          getExpenseCategoryLabel(exp.expense_type), 
          premiumFreq,
          premiumAmt, 
          annualPremium,
          stepUp > 0 ? `${stepUp}%` : '-',
          uptoYear
        ]);
      });
      
      // Also include from insurance_premiums collection if available
      if (family?.insurance_premiums) {
        family.insurance_premiums.forEach(ins => {
          const premiumFreq = ins.premium_frequency || 'Yearly';
          const premiumAmt = parseFloat(ins.premium_amount) || 0;
          let annualPremium = premiumAmt;
          if (premiumFreq === 'Monthly') annualPremium = premiumAmt * 12;
          else if (premiumFreq === 'Quarterly') annualPremium = premiumAmt * 4;
          else if (premiumFreq === 'Half-Yearly') annualPremium = premiumAmt * 2;
          
          totalInsuranceAnnual += annualPremium;
          
          const insType = ins.insurance_type || ins.category || 'Insurance';
          dataSheetData.push(['', 
            getExpenseCategoryLabel(insType) || insType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            premiumFreq,
            premiumAmt, 
            annualPremium,
            ins.step_up_percent ? `${ins.step_up_percent}%` : '-',
            ins.premium_end_year || ins.upto_year || '-'
          ]);
        });
      }
      
      dataSheetData.push(['', 'Sub-Total Insurance Premiums', '', '', totalInsuranceAnnual, '', '']);
      dataSheetData.push(['']);
    }
    
    // ---- LOAN EMIs ----
    if (loanExpenses.length > 0 || entityLiabilities.length > 0) {
      dataSheetData.push(['', '▸ LOAN EMIs']);
      dataSheetData.push(['', 'Loan Type', 'Monthly EMI', 'Annual EMI', 'Remaining Months', 'Interest Rate %', 'Outstanding', 'Completion Year']);
      
      let totalLoanMonthly = 0;
      let totalLoanAnnual = 0;
      let totalOutstanding = 0;
      
      // Loan EMIs from expense_details
      loanExpenses.forEach(exp => {
        const emi = parseFloat(exp.monthly_amount) || parseFloat(exp.emi_amount) || 0;
        const remaining = parseInt(exp.num_installments) || parseInt(exp.remaining_tenure) || 0;
        const rate = parseFloat(exp.interest_rate) || 0;
        const outstanding = emi * remaining;
        const completionYear = currentYear + Math.ceil(remaining / 12);
        
        totalLoanMonthly += emi;
        totalLoanAnnual += emi * 12;
        totalOutstanding += outstanding;
        
        dataSheetData.push(['', 
          getExpenseCategoryLabel(exp.expense_type), 
          emi, 
          emi * 12, 
          remaining,
          rate > 0 ? `${rate}%` : '-',
          outstanding,
          remaining > 0 ? completionYear : '-'
        ]);
      });
      
      // Also include from liabilities
      entityLiabilities.forEach(l => {
        const emi = parseFloat(l.monthly_emi) || parseFloat(l.emi_amount) || 0;
        const remaining = parseInt(l.num_installments) || parseInt(l.remaining_tenure) || 0;
        const rate = parseFloat(l.interest_rate) || 0;
        const outstanding = emi * remaining;
        const completionYear = currentYear + Math.ceil(remaining / 12);
        
        totalLoanMonthly += emi;
        totalLoanAnnual += emi * 12;
        totalOutstanding += outstanding;
        
        const loanType = l.category || l.loan_type || 'Loan';
        dataSheetData.push(['', 
          getExpenseCategoryLabel(loanType) || loanType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
          emi, 
          emi * 12, 
          remaining,
          rate > 0 ? `${rate}%` : '-',
          outstanding,
          remaining > 0 ? completionYear : '-'
        ]);
      });
      
      dataSheetData.push(['', 'Sub-Total Loan EMIs', totalLoanMonthly, totalLoanAnnual, '', '', totalOutstanding, '']);
      dataSheetData.push(['']);
    }
    
    // ---- EXPENSE SUMMARY ----
    const totalRegularAnnual = regularExpenses.reduce((sum, e) => sum + (parseFloat(e.annual_amount) || parseFloat(e.monthly_amount) * 12 || 0), 0);
    const totalInsuranceAnnual = insuranceExpenses.reduce((sum, e) => {
      const freq = e.premium_frequency || 'Yearly';
      const amt = parseFloat(e.premium_amount) || parseFloat(e.monthly_amount) || 0;
      if (freq === 'Monthly') return sum + amt * 12;
      if (freq === 'Quarterly') return sum + amt * 4;
      if (freq === 'Half-Yearly') return sum + amt * 2;
      return sum + amt;
    }, 0);
    const totalLoanAnnual = loanExpenses.reduce((sum, e) => sum + ((parseFloat(e.monthly_amount) || 0) * 12), 0) +
      entityLiabilities.reduce((sum, l) => sum + ((parseFloat(l.monthly_emi) || parseFloat(l.emi_amount) || 0) * 12), 0);
    
    const grandTotalExpenses = totalRegularAnnual + totalInsuranceAnnual + totalLoanAnnual;
    
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['', 'EXPENSE SUMMARY', 'Monthly', 'Annual']);
    dataSheetData.push(['', 'Regular Household Expenses', Math.round(totalRegularAnnual / 12), totalRegularAnnual]);
    dataSheetData.push(['', 'Insurance Premiums', Math.round(totalInsuranceAnnual / 12), totalInsuranceAnnual]);
    dataSheetData.push(['', 'Loan EMIs', Math.round(totalLoanAnnual / 12), totalLoanAnnual]);
    dataSheetData.push(['', 'TOTAL ANNUAL EXPENSES', Math.round(grandTotalExpenses / 12), grandTotalExpenses]);
    dataSheetData.push(['']);

    // SECTION 4: FINANCIAL GOALS
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
        const isSel = selectedAssets[asset.id] !== undefined
          ? selectedAssets[asset.id]
          : asset.selected !== false;
        if (isSel) {
          const customAmount = assetAmounts?.[asset.id];
          const usedAmount = customAmount !== undefined ? customAmount : asset.value;
          totalAssets += usedAmount;
          dataSheetData.push([
            '', 
            asset.label,
            asset.value,
            usedAmount,
            assetStartYears[asset.id] || asset.includeFromYear || currentYear,
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
    const totalAnnualIncome = totalIncomeByMember.reduce((a, b) => a + b, 0);
    const totalAnnualEMI = entityLiabilities.reduce((sum, l) => sum + ((parseFloat(l.monthly_emi) || parseFloat(l.emi_amount) || 0) * 12), 0);
    const annualSurplus = totalAnnualIncome - grandTotalExpenses - totalAnnualEMI;
    
    dataSheetData.push(['', 'SECTION 8: FINANCIAL SUMMARY']);
    dataSheetData.push(['', '─────────────────────────────────────────────────────────────────────────────']);
    dataSheetData.push(['']);
    dataSheetData.push(['', 'Metric', 'Annual', 'Monthly']);
    dataSheetData.push(['', 'Total Income', totalAnnualIncome, Math.round(totalAnnualIncome / 12)]);
    dataSheetData.push(['', 'Total Expenses', grandTotalExpenses, Math.round(grandTotalExpenses / 12)]);
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
        // Honour per-asset defaults so debt-with-maturity rows stay opt-in
        // unless the user explicitly checks them.
        const isSel = selectedAssets[asset.id] !== undefined
          ? selectedAssets[asset.id]
          : asset.selected !== false;
        if (isSel) {
          const startYear = assetStartYears[asset.id] || asset.includeFromYear || currentYear;
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
    const totalAnnualPremium = entityPremiums.reduce((sum, p) => sum + (parseFloat(p.yearly_premium) || parseFloat(p.annual_premium) || parseFloat(p.amount) || parseFloat(p.premium) || 0), 0);
    
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

      // Detailed expense breakdown (now includes insurance premiums via getProjectedMemberExpenses)
      const memberExpenses = {};
      let totalLivingExp = 0;
      
      targetMembers.forEach(m => {
        const expenses = getProjectedMemberExpenses(m.id, yearStr);
        memberExpenses[m.id] = expenses;
        totalLivingExp += expenses;
      });

      // Note: Insurance premiums are now included in getProjectedMemberExpenses, no separate addition needed
      const info = getMemberIncomeInfo(targetMembers[0]?.id);
      
      // Loan installments by type
      let homeLoanEMI = 0, vehicleLoanEMI = 0, personalLoanEMI = 0;
      entityLiabilities.forEach(l => {
        const loanType = (l.category || l.loan_type || l.expense_type || '').toLowerCase();
        const emi = (parseFloat(l.monthly_emi) || parseFloat(l.emi_amount) || 0) * 12;
        const remaining = parseInt(l.num_installments) || parseInt(l.remaining_tenure) || 0;
        const yearsRemaining = Math.ceil(remaining / 12);
        
        if (yearsFromNow < yearsRemaining) {
          if (loanType.includes('home')) homeLoanEMI += emi;
          else if (loanType.includes('vehicle') || loanType.includes('car')) vehicleLoanEMI += emi;
          else personalLoanEMI += emi;
        }
      });
      
      // Total expense now includes insurance premiums via totalLivingExp (from getProjectedMemberExpenses)
      const totalExpense = totalLivingExp + homeLoanEMI + vehicleLoanEMI + personalLoanEMI;

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
        // Expense details (insurance premiums now included in totalLivingExp)
        memberExpenses,
        totalLivingExp: Math.round(totalLivingExp),
        insurancePremium: 0, // Included in totalLivingExp via getProjectedMemberExpenses
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
        const policyName = p.policy_name || p.company || (p.category ? p.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Insurance Policy');
        const premiumAmt = parseFloat(p.yearly_premium) || parseFloat(p.annual_premium) || parseFloat(p.amount) || parseFloat(p.premium) || 0;
        const uptoYear = parseInt(p.upto_year) || parseInt(p.premium_end_year) || (currentYear + 30);
        cashFlowData.push([`    - ${policyName}`, ...yearlyData.map(d => {
          return d.year <= uptoYear ? formatCurrency(premiumAmt) : '-';
        })]);
      });
    }
    
    // Loan EMIs - show as individual expense entries (no separate header)
    if (entityLiabilities.length > 0) {
      entityLiabilities.forEach(l => {
        const loanName = l.loan_name || l.bank_name || l.category || l.loan_type || 'Loan';
        const emi = (parseFloat(l.monthly_emi) || parseFloat(l.emi_amount) || 0) * 12;
        const remaining = parseInt(l.num_installments) || parseInt(l.remaining_tenure) || 0;
        const yearsRemaining = Math.ceil(remaining / 12);
        const displayName = loanName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' EMI';
        
        cashFlowData.push([`  ${displayName}`, ...yearlyData.map(d => {
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
                    <WealthChart result={familyAllocation.result} entityName={familyName} entityId="family" />
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
                      onClick={() => handleExportToExcel({
                        equity: familyAllocation.equity,
                        debt: familyAllocation.debt,
                        equityReturn: familyAllocation.equityReturn,
                        debtReturn: familyAllocation.debtReturn,
                        includeAssets: familyAllocation.includeAssets,
                        selectedAssets: familyAllocation.selectedAssets || {},
                        assetStartYears: familyAllocation.assetStartYears || {},
                        assetAmounts: familyAllocation.assetAmounts || {},
                      })}
                      disabled={!familyAllocation.result}
                      className="px-2 py-1.5 text-[10px] font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                      title="Download Complete Financial Plan (Excel)"
                    >
                      <Download className="h-3 w-3" />
                      <span>Excel</span>
                    </button>
                    <button 
                      onClick={() => {
                        try {
                          generateFinancialPlanPDF({
                            family,
                            members,
                            incomeDetails,
                            expenseDetails,
                            goalDetails,
                            investmentDetails,
                            insurancePremiumsData,
                            yearlyProjection: familyAllocation.result?.yearlyData || [],
                            allocation: familyAllocation,
                            simulationResult: familyAllocation.result,
                            totalAssets,
                            maturitiesByYear
                          });
                        } catch (error) {
                          console.error('PDF Export Error:', error);
                          alert('Error generating PDF. Please try again.');
                        }
                      }}
                      disabled={!familyAllocation.result}
                      className="px-2 py-1.5 text-[10px] font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                      title="Download Professional PDF Report"
                    >
                      <FileText className="h-3 w-3" />
                      <span>PDF</span>
                    </button>
                  </div>
                </td>
              </tr>

              {/* Individual Member Rows */}
              {members.map((member, idx) => {
                const allocation = memberAllocations[member.id] || { equity: 60, debt: 40, equityReturn: 12, debtReturn: 0 };
                const age = calculateAge(member.date_of_birth);
                // Use actual life expectancy if set, otherwise show as not applicable for end year calc
                const memberLifeExp = parseInt(member.life_expectancy) || 0;
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
                          {age}y | LE:{memberLifeExp || 'N/A'} | R:{memberInfo.retirementYear}
                        </div>
                        {allocation.result && (
                          <WealthChart result={allocation.result} entityName={member.name} entityId={member.id} />
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
            Debt instruments with maturity dates (FD, Bonds, RD, Insurance) appear as "At maturity" — opt-in inside the configure modal; they default to off so they aren't double-counted with the maturities row.
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
                const isSelected = allocation.selectedAssets?.[asset.id] !== undefined
                  ? allocation.selectedAssets[asset.id]
                  : asset.selected !== false; // honour per-asset default (debt-with-maturity → false)
                const startYear = allocation.assetStartYears?.[asset.id]
                  || asset.includeFromYear
                  || currentYear;
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
                        <div className="font-medium text-gray-800 text-sm flex items-center gap-1.5">
                          {asset.label}
                          {asset.isDebtWithMaturity && (
                            <span
                              className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded"
                              title="Debt instrument with a maturity date — defaults to off + maturity-year start to avoid double-counting with the maturities row in the projection."
                            >
                              At maturity
                            </span>
                          )}
                        </div>
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
                        .filter(a => {
                          const allocation = getEntityAllocation(assetModalEntity);
                          const explicit = allocation.selectedAssets?.[a.id];
                          return explicit !== undefined ? explicit : (a.selected !== false);
                        })
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
