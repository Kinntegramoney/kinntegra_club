import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Save, Briefcase, Building, Wallet, Landmark, PiggyBank, TrendingUp, 
  DollarSign, Plus, Trash2, ChevronDown, ChevronRight, User, X, Car
} from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Income categories with inline fields
const INCOME_CATEGORIES = [
  { 
    value: "salary", 
    label: "Salary Income", 
    icon: Briefcase,
    color: "blue",
    fields: [
      { key: "net_income_monthly", label: "Net Income (Monthly)", type: "number" },
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number", readOnly: true, calculated: true },
      { key: "increment_month", label: "Increment Month", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
      { key: "avg_growth_rate", label: "Growth Rate %", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" },
      { key: "year_of_retirement", label: "Year of Retirement", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "business", 
    label: "Business Income", 
    icon: Building,
    color: "purple",
    fields: [
      { key: "net_income_yearly", label: "Net Income (Yearly)", type: "number" },
      { key: "avg_growth_rate", label: "Growth Rate %", type: "number" },
      { key: "retirement_age", label: "Retirement Age", type: "number" },
      { key: "year_of_retirement", label: "Year of Retirement", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "rental", 
    label: "Property Details", 
    icon: Building,
    color: "teal",
    fields: [
      { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Land"] },
      { key: "property_details", label: "Property Details", type: "text" },
      { key: "investment_amount", label: "Investment Amount", type: "number" },
      { key: "investment_date", label: "Investment Date", type: "monthyear" },
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "market_value_date", label: "As On Date", type: "monthyear" },
      { key: "xirr_return", label: "XIRR Return %", type: "number", readOnly: true, calculated: true, allowNegative: true },
      { key: "is_on_rent", label: "Is On Rent", type: "select", options: ["Yes", "No"], defaultValue: "No" },
      { key: "rental_details", label: "Rental Details", type: "text", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "rent_per_month", label: "Rent Per Month", type: "number", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "annual_rent", label: "Annual Rent", type: "number", readOnly: true, calculated: true, dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "start_date", label: "Start Date", type: "monthyear", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "end_date", label: "End Date", type: "monthyear", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "maintenance", label: "Maintenance (Yearly)", type: "number", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "property_tax", label: "Property Tax (Yearly)", type: "number", dependsOn: "is_on_rent", showWhen: "Yes" },
      { key: "absolute_return", label: "Absolute Return %", type: "number", readOnly: true, calculated: true, dependsOn: "is_on_rent", showWhen: "Yes", allowNegative: true }
    ]
  },
  { 
    value: "ppf", 
    label: "PPF", 
    icon: PiggyBank,
    color: "green",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "annual_contribution", label: "Annual Contribution", type: "number" },
      { key: "as_on_date", label: "As On Date", type: "monthyear" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "epf", 
    label: "EPF", 
    icon: PiggyBank,
    color: "emerald",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "annual_contribution", label: "Annual Contribution", type: "number" },
      { key: "as_on_date", label: "As On Date", type: "monthyear" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "gratuity", 
    label: "Gratuity", 
    icon: Wallet,
    color: "amber",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "as_on_date", label: "As On Date", type: "monthyear" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "year_to_mature", label: "Years to Mature", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "fd", 
    label: "Fixed Deposit", 
    icon: Landmark,
    color: "indigo",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "investment_value", label: "Investment Value", type: "number" },
      { key: "investment_date", label: "Investment Date", type: "date" },
      { key: "interest_rate", label: "Interest %", type: "number" },
      { key: "payable_cycle", label: "Interest Payout Frequency", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "On Maturity"], defaultValue: "Monthly" },
      { key: "maturity_amount", label: "Maturity Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "gross_xirr", label: "Gross XIRR %", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "rd_pis", 
    label: "RD / PIS", 
    icon: Landmark,
    color: "cyan",
    fields: [
      { key: "investment_value_monthly", label: "Monthly Amt", type: "number" },
      { key: "interest_rate", label: "Stated Interest %", type: "number" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" },
      { key: "num_installments", label: "Installments", type: "number", readOnly: true, calculated: true },
      { key: "investment_value", label: "Total Investment", type: "number", readOnly: true, calculated: true },
      { key: "maturity_value", label: "Maturity Value", type: "number" },
      { key: "gross_xirr", label: "Gross XIRR %", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "pension", 
    label: "Pension", 
    icon: Wallet,
    color: "rose",
    fields: [
      { key: "payable_type", label: "Payout Frequency", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], defaultValue: "Monthly" },
      { key: "description", label: "Description", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "amount_yearly", label: "Yearly Amt", type: "number", readOnly: true, calculated: true },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "upto_life", label: "Upto Life", type: "select", options: ["Yes", "No"] },
      { key: "end_date", label: "End Date", type: "date", dependsOn: "upto_life", showWhen: "No" },
      { key: "payable_to_relation", label: "Payable To", type: "select", options: ["Self", "Spouse"] }
    ]
  },
  { 
    value: "bond", 
    label: "Bond", 
    icon: Landmark,
    color: "violet",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "investment_date", label: "Investment Date", type: "date" },
      { key: "investment_value", label: "Investment Value", type: "number" },
      { key: "payout_frequency", label: "Payout Frequency", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], defaultValue: "Half-Yearly" },
      { key: "payout_amount", label: "Payout Amount", type: "number" },
      { key: "maturity_amount", label: "Maturity Amount", type: "number" },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "gross_xirr", label: "Gross XIRR %", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "insurance_income", 
    label: "Insurance", 
    icon: Landmark,
    color: "pink",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "premium_frequency", label: "Premium Payment Frequency", type: "select", options: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"], defaultValue: "Yearly" },
      { key: "premium_amount", label: "Premium Amount", type: "number" },
      { key: "premium_start_date", label: "Premium Start", type: "monthyear" },
      { key: "premium_end_date", label: "Premium Payable Upto", type: "monthyear" },
      { key: "total_paid", label: "Total Paid Till Date", type: "number", readOnly: true, calculated: true },
      { key: "total_pending", label: "Total Payable Pending", type: "number", readOnly: true, calculated: true },
      { key: "maturity_date", label: "Maturity Date", type: "date" },
      { key: "maturity_amount", label: "Maturity Amount", type: "number" },
      { key: "gross_xirr", label: "Gross XIRR %", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "mutual_fund", 
    label: "Mutual Fund", 
    icon: TrendingUp,
    color: "sky",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "sip_amount", label: "SIP Amount", type: "number" }
    ]
  },
  { 
    value: "cash", 
    label: "Cash In Hand", 
    icon: Wallet,
    color: "slate",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "bank_balance", label: "Bank Balance", type: "number" }
    ]
  },
  { 
    value: "vehicle", 
    label: "Vehicle", 
    icon: Car,
    color: "blue",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "market_value", label: "Current Market Value", type: "number" }
    ]
  },
  { 
    value: "commodities", 
    label: "Commodities", 
    icon: DollarSign,
    color: "yellow",
    fields: [
      { key: "commodity_type", label: "Type", type: "select", options: ["Gold", "Silver"], defaultValue: "Gold" },
      { key: "weight_kg", label: "Weight (Kg)", type: "number" },
      { key: "price_per_kg", label: "Price/Kg", type: "number", readOnly: true, calculated: true },
      { key: "market_value", label: "Market Value", type: "number", readOnly: true, calculated: true }
    ]
  },
  { 
    value: "shares_pms", 
    label: "Shares / PMS", 
    icon: TrendingUp,
    color: "orange",
    fields: [
      { key: "market_value", label: "Market Value", type: "number" },
      { key: "annual_contribution", label: "Annual Contribution", type: "number" }
    ]
  },
  { 
    value: "other", 
    label: "Other", 
    icon: DollarSign,
    color: "gray",
    fields: [
      { key: "description", label: "Description", type: "text" },
      { key: "market_value", label: "Value", type: "number" }
    ]
  }
];

const colorMap = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  teal: "bg-teal-500",
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  sky: "bg-sky-500",
  slate: "bg-slate-500",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  gray: "bg-gray-500"
};

export default function IncomeSection({ family, onUpdate, isReadOnly, onRefresh }) {
  const [savingCategory, setSavingCategory] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [addedCategories, setAddedCategories] = useState([]);
  const [incomeItems, setIncomeItems] = useState({});
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];

  // Helper function to recalculate XIRR for property items
  // Uses REAL RETURN (inflation-adjusted) ONLY when investment = market value (0% nominal return)
  const ANNUAL_INFLATION_RATE = 0.08; // 8% annual inflation
  
  const recalculatePropertyXIRR = (details) => {
    const investmentAmount = parseFloat(details.investment_amount) || 0;
    const marketValue = parseFloat(details.market_value) || 0;
    const investmentDateStr = details.investment_date;
    const marketValueDateStr = details.market_value_date;
    
    if (investmentAmount > 0 && marketValue > 0 && investmentDateStr && marketValueDateStr) {
      // Parse date - supports MM/YY, MM/YYYY formats
      const parseMMYY = (mmyy) => {
        if (!mmyy || typeof mmyy !== 'string') return null;
        
        // Handle MM/YY or MM/YYYY format
        if (mmyy.includes('/')) {
          const parts = mmyy.split('/');
          if (parts.length !== 2) return null;
          const [month, year] = parts;
          let fullYear;
          if (year.length === 4) {
            fullYear = parseInt(year);
          } else {
            fullYear = parseInt(year) >= 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
          }
          return new Date(fullYear, parseInt(month) - 1, 1);
        }
        
        // Try ISO format (YYYY-MM-DD)
        if (mmyy.includes('-') && mmyy.length === 10) {
          const d = new Date(mmyy);
          if (!isNaN(d.getTime())) return d;
        }
        
        return null;
      };
      
      try {
        const investDate = parseMMYY(investmentDateStr);
        const marketDate = parseMMYY(marketValueDateStr);
        
        if (!investDate || !marketDate) {
          console.log('Failed to parse dates:', investmentDateStr, marketValueDateStr);
          return { xirr: details.xirr_return, isInflationAdjusted: false };
        }
        
        const days = Math.max(1, (marketDate - investDate) / (1000 * 60 * 60 * 24));
        const years = days / 365;
        
        if (years > 0) {
          // Calculate nominal XIRR first
          const nominalXirr = (Math.pow(marketValue / investmentAmount, 1 / years) - 1) * 100;
          
          // Check if investment equals market value (within 0.1% tolerance for floating point)
          const isEqualValue = Math.abs(marketValue - investmentAmount) / investmentAmount < 0.001;
          
          if (isEqualValue) {
            // Apply inflation adjustment only when investment = market value
            const inflationAdjustedInvestment = investmentAmount * Math.pow(1 + ANNUAL_INFLATION_RATE, years);
            const realXirr = (Math.pow(marketValue / inflationAdjustedInvestment, 1 / years) - 1) * 100;
            return { xirr: Math.round(realXirr * 100) / 100, isInflationAdjusted: true };
          } else {
            // Use nominal XIRR for all other cases
            return { xirr: Math.round(nominalXirr * 100) / 100, isInflationAdjusted: false };
          }
        }
      } catch (e) {
        console.log('XIRR calculation error:', e);
      }
    }
    return { xirr: details.xirr_return, isInflationAdjusted: details.is_inflation_adjusted || false };
  };

  useEffect(() => {
    const itemsByCategory = {};
    const added = [];
    INCOME_CATEGORIES.forEach(cat => { itemsByCategory[cat.value] = []; });

    existingIncomes.forEach(inc => {
      const category = inc.category;
      if (itemsByCategory[category]) {
        if (!added.includes(category)) added.push(category);
        
        // Recalculate XIRR for property/rental items on load to ensure correct negative values
        let details = inc.details || {};
        if (category === 'rental' && details.investment_amount && details.market_value) {
          const result = recalculatePropertyXIRR(details);
          if (result && result.xirr !== undefined && result.xirr !== details.xirr_return) {
            details = { ...details, xirr_return: result.xirr, is_inflation_adjusted: result.isInflationAdjusted };
            console.log('Recalculated XIRR for property:', details.property_details, 'Old:', inc.details.xirr_return, 'New:', result.xirr, 'Inflation adjusted:', result.isInflationAdjusted);
          }
        }
        
        itemsByCategory[category].push({
          id: inc.id,
          memberId: inc.member_ids?.[0] || "",
          details: details,
          isNew: false,
          isModified: false
        });
      }
    });

    setIncomeItems(itemsByCategory);
    setAddedCategories(added);
    
    if (!initialLoadDone) {
      const expanded = {};
      added.forEach(cat => { expanded[cat] = true; });
      setExpandedCategories(expanded);
      setInitialLoadDone(true);
    }
  }, [family?.id, existingIncomes.length, initialLoadDone]);

  // Commodity prices state with date
  const [commodityPrices, setCommodityPrices] = useState({ Gold: 0, Silver: 0, date: null });
  
  // Fetch commodity prices from goldprice.org API (reliable India INR prices)
  useEffect(() => {
    const fetchCommodityPrices = async () => {
      try {
        const response = await axios.get('https://data-asg.goldprice.org/dbXRates/INR');
        
        if (response.data && response.data.items && response.data.items.length > 0) {
          const data = response.data.items[0];
          const priceDate = response.data.date;
          
          // API returns price per troy ounce in INR
          // 1 troy ounce = 31.1035 grams
          // Convert to per kg: (price per oz / 31.1035) * 1000
          // Add ~8% premium for Indian retail (import duty + GST + making)
          const goldPricePerOz = data.xauPrice || 0;
          const silverPricePerOz = data.xagPrice || 0;
          
          const goldPricePerKg = Math.round(((goldPricePerOz / 31.1035) * 1000) * 1.08);
          const silverPricePerKg = Math.round(((silverPricePerOz / 31.1035) * 1000) * 1.22);
          
          setCommodityPrices({
            Gold: goldPricePerKg,
            Silver: silverPricePerKg,
            date: priceDate
          });
          return;
        }
      } catch (error) {
        console.log('Gold price API unavailable:', error.message);
      }
      
      // Fallback to current market prices if API fails
      setCommodityPrices({ 
        Gold: 15800000,
        Silver: 290000,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      });
    };
    fetchCommodityPrices();
  }, []);
  
  // Update commodity items when prices are fetched
  useEffect(() => {
    if (commodityPrices.Gold > 0 || commodityPrices.Silver > 0) {
      setIncomeItems(prev => ({
        ...prev,
        commodities: (prev.commodities || []).map(item => {
          const commodityType = item.details.commodity_type || "Gold";
          const weightKg = parseFloat(item.details.weight_kg || 0);
          const currentPrice = commodityPrices[commodityType] || 0;
          
          return {
            ...item,
            details: {
              ...item.details,
              price_per_kg: currentPrice > 0 ? currentPrice : "",
              market_value: (currentPrice > 0 && weightKg > 0) ? Math.round(weightKg * currentPrice) : ""
            }
          };
        })
      }));
    }
  }, [commodityPrices]);

  const addCategory = (categoryValue) => {
    if (!addedCategories.includes(categoryValue)) {
      setAddedCategories(prev => [...prev, categoryValue]);
      setExpandedCategories(prev => ({ ...prev, [categoryValue]: true }));
      addIncomeItem(categoryValue);
    }
  };

  const skipCategory = (categoryValue) => {
    setAddedCategories(prev => prev.filter(c => c !== categoryValue));
    setExpandedCategories(prev => ({ ...prev, [categoryValue]: false }));
    setIncomeItems(prev => ({ ...prev, [categoryValue]: [] }));
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const addIncomeItem = (category) => {
    const categoryConfig = INCOME_CATEGORIES.find(c => c.value === category);
    const defaultDetails = {};
    categoryConfig?.fields?.forEach(field => {
      if (field.defaultValue) defaultDetails[field.key] = field.defaultValue;
    });
    
    // For commodities, set initial price from API
    if (category === "commodities") {
      const commodityType = defaultDetails.commodity_type || "Gold";
      const currentPrice = commodityPrices[commodityType] || 0;
      if (currentPrice > 0) {
        defaultDetails.price_per_kg = currentPrice;
      }
    }

    setIncomeItems(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), {
        id: `new_${Date.now()}`,
        memberId: members[0]?.id || "",
        details: defaultDetails,
        isNew: true,
        isModified: false
      }]
    }));
  };

  const removeIncomeItem = async (category, itemId, isNew) => {
    if (!isNew) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`${API}/data-gathering/family/${family.id}/income/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
        toast.success("Deleted");
        onRefresh();
      } catch { toast.error("Failed"); return; }
    }
    const updatedItems = incomeItems[category].filter(item => item.id !== itemId);
    setIncomeItems(prev => ({ ...prev, [category]: updatedItems }));
    if (updatedItems.length === 0) setAddedCategories(prev => prev.filter(c => c !== category));
  };

  const getMemberBirthYear = (memberId) => {
    const member = members.find(m => m.id === memberId);
    return member?.date_of_birth ? new Date(member.date_of_birth).getFullYear() : null;
  };

  const updateIncomeItem = (category, itemId, field, value) => {
    setIncomeItems(prev => ({
      ...prev,
      [category]: prev[category].map(item => {
        if (item.id === itemId) {
          let newDetails = { ...item.details };
          let newMemberId = item.memberId;
          
          if (field === "memberId") {
            newMemberId = value;
            if ((category === "salary" || category === "business") && newDetails.retirement_age) {
              const birthYear = getMemberBirthYear(value);
              if (birthYear) newDetails.year_of_retirement = birthYear + parseInt(newDetails.retirement_age);
            }
          } else {
            newDetails[field] = value;
            
            // Salary calculations
            if (category === "salary") {
              if (field === "net_income_monthly") newDetails.net_income_yearly = parseFloat(value || 0) * 12;
              if (field === "retirement_age") {
                const birthYear = getMemberBirthYear(item.memberId);
                if (birthYear) newDetails.year_of_retirement = birthYear + parseInt(value);
              }
            }
            
            // Business calculations
            if (category === "business" && field === "retirement_age") {
              const birthYear = getMemberBirthYear(item.memberId);
              if (birthYear) newDetails.year_of_retirement = birthYear + parseInt(value);
            }
            
            // Rental calculations
            if (category === "rental") {
              if (field === "rent_per_month") {
                newDetails.annual_rent = Math.round(parseFloat(value || 0) * 12);
              }
              
              // Calculate XIRR Return % when relevant fields change
              // Uses REAL RETURN (inflation-adjusted) ONLY when investment = market value
              if (["investment_amount", "investment_date", "market_value", "market_value_date"].includes(field)) {
                const investmentAmount = field === "investment_amount" ? parseFloat(value || 0) : (parseFloat(newDetails.investment_amount) || 0);
                const marketValue = field === "market_value" ? parseFloat(value || 0) : (parseFloat(newDetails.market_value) || 0);
                const investmentDateStr = field === "investment_date" ? value : newDetails.investment_date;
                const marketValueDateStr = field === "market_value_date" ? value : newDetails.market_value_date;
                
                if (investmentAmount > 0 && marketValue > 0 && investmentDateStr && marketValueDateStr) {
                  // Parse MM/YY or MM/YYYY format to date
                  const parseMMYY = (mmyy) => {
                    const [month, year] = mmyy.split('/');
                    let fullYear;
                    if (year.length === 4) {
                      fullYear = parseInt(year);
                    } else {
                      fullYear = parseInt(year) >= 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
                    }
                    return new Date(fullYear, parseInt(month) - 1, 1);
                  };
                  
                  const investDate = parseMMYY(investmentDateStr);
                  const marketDate = parseMMYY(marketValueDateStr);
                  const days = Math.max(1, (marketDate - investDate) / (1000 * 60 * 60 * 24));
                  const years = days / 365;
                  
                  if (years > 0) {
                    // Calculate nominal XIRR first
                    const nominalXirr = (Math.pow(marketValue / investmentAmount, 1 / years) - 1) * 100;
                    
                    // Check if investment equals market value (within 0.1% tolerance)
                    const isEqualValue = Math.abs(marketValue - investmentAmount) / investmentAmount < 0.001;
                    
                    if (isEqualValue) {
                      // Apply inflation adjustment only when investment = market value
                      const inflationAdjustedInvestment = investmentAmount * Math.pow(1 + ANNUAL_INFLATION_RATE, years);
                      const realXirr = (Math.pow(marketValue / inflationAdjustedInvestment, 1 / years) - 1) * 100;
                      newDetails.xirr_return = Math.round(realXirr * 100) / 100;
                      newDetails.is_inflation_adjusted = true;
                    } else {
                      // Use nominal XIRR for all other cases
                      newDetails.xirr_return = Math.round(nominalXirr * 100) / 100;
                      newDetails.is_inflation_adjusted = false;
                    }
                  } else {
                    newDetails.xirr_return = 0;
                    newDetails.is_inflation_adjusted = false;
                  }
                } else {
                  newDetails.xirr_return = 0;
                  newDetails.is_inflation_adjusted = false;
                }
              }
              
              // Calculate Absolute Return when any relevant field changes
              if (["rent_per_month", "maintenance", "property_tax", "investment_amount"].includes(field)) {
                const annualRent = field === "rent_per_month" 
                  ? Math.round(parseFloat(value || 0) * 12) 
                  : (newDetails.annual_rent || 0);
                const maintenance = field === "maintenance" ? parseFloat(value || 0) : (parseFloat(newDetails.maintenance) || 0);
                const propertyTax = field === "property_tax" ? parseFloat(value || 0) : (parseFloat(newDetails.property_tax) || 0);
                const investmentValue = field === "investment_amount" ? parseFloat(value || 0) : (parseFloat(newDetails.investment_amount) || 0);
                
                if (investmentValue > 0) {
                  const netIncome = annualRent - propertyTax - maintenance;
                  newDetails.absolute_return = Math.round((netIncome / investmentValue) * 100 * 100) / 100; // Round to 2 decimals
                } else {
                  newDetails.absolute_return = 0;
                }
              }
              if (field === "is_on_rent") {
                if (value === "No") {
                  // Clear all rental-related fields when switching to No
                  newDetails.rental_details = "";
                  newDetails.rent_per_month = "";
                  newDetails.annual_rent = 0;
                  newDetails.maintenance = "";
                  newDetails.property_tax = "";
                  newDetails.absolute_return = 0;
                  newDetails.start_date = "";
                  newDetails.end_date = "";
                }
              }
            }
            
            // PPF/EPF/Gratuity calculations
            if (["ppf", "epf", "gratuity"].includes(category)) {
              if (field === "maturity_date") {
                const maturityYear = new Date(value).getFullYear();
                newDetails.year_to_mature = Math.max(0, maturityYear - new Date().getFullYear());
              }
            }
            
            // FD calculations
            if (category === "fd") {
              // Calculate Gross XIRR when relevant fields change
              if (["investment_value", "investment_date", "maturity_amount", "maturity_date", "payable_cycle", "interest_rate"].includes(field)) {
                const investmentVal = field === "investment_value" ? parseFloat(value || 0) : (parseFloat(newDetails.investment_value) || 0);
                const maturityAmt = field === "maturity_amount" ? parseFloat(value || 0) : (parseFloat(newDetails.maturity_amount) || 0);
                const interestRate = field === "interest_rate" ? parseFloat(value || 0) : (parseFloat(newDetails.interest_rate) || 0);
                const investmentDateStr = field === "investment_date" ? value : newDetails.investment_date;
                const maturityDateStr = field === "maturity_date" ? value : newDetails.maturity_date;
                const payoutFrequency = field === "payable_cycle" ? value : (newDetails.payable_cycle || "On Maturity");
                
                if (investmentVal > 0 && investmentDateStr && maturityDateStr) {
                  const investDate = new Date(investmentDateStr);
                  const maturityDate = new Date(maturityDateStr);
                  const totalDays = Math.max(1, (maturityDate - investDate) / (1000 * 60 * 60 * 24));
                  const totalYears = totalDays / 365;
                  
                  // Get frequency multiplier (payments per year)
                  const frequencyMap = {
                    "Monthly": 12,
                    "Quarterly": 4,
                    "Half-Yearly": 2,
                    "Yearly": 1,
                    "On Maturity": 0
                  };
                  const paymentsPerYear = frequencyMap[payoutFrequency] || 0;
                  
                  if (totalYears > 0) {
                    let xirr = 0;
                    
                    if (paymentsPerYear === 0 || payoutFrequency === "On Maturity") {
                      // Simple XIRR for lump sum at maturity
                      const finalAmount = maturityAmt > 0 ? maturityAmt : investmentVal * (1 + (interestRate * totalYears / 100));
                      xirr = (Math.pow(finalAmount / investmentVal, 1 / totalYears) - 1) * 100;
                    } else {
                      // XIRR with periodic interest payouts
                      // Interest per period = Principal × (Rate/100) / PaymentsPerYear
                      const interestPerPeriod = investmentVal * (interestRate / 100) / paymentsPerYear;
                      const totalPeriods = Math.floor(totalYears * paymentsPerYear);
                      
                      // Build cash flows: -investment at start, +interest each period, +principal at end
                      const cashFlows = [-investmentVal];
                      const daysBetweenPayments = 365 / paymentsPerYear;
                      
                      for (let i = 1; i <= totalPeriods; i++) {
                        cashFlows.push(interestPerPeriod);
                      }
                      // Add principal back at maturity
                      cashFlows.push(investmentVal);
                      
                      // Calculate XIRR using Newton-Raphson approximation
                      const calcNPV = (rate) => {
                        let npv = cashFlows[0];
                        for (let i = 1; i < cashFlows.length; i++) {
                          const t = i <= totalPeriods ? (i * daysBetweenPayments / 365) : totalYears;
                          npv += cashFlows[i] / Math.pow(1 + rate, t);
                        }
                        return npv;
                      };
                      
                      // Newton-Raphson iteration to find XIRR
                      let guess = interestRate / 100;
                      for (let iter = 0; iter < 100; iter++) {
                        const npv = calcNPV(guess);
                        const npv2 = calcNPV(guess + 0.0001);
                        const derivative = (npv2 - npv) / 0.0001;
                        if (Math.abs(derivative) < 0.0000001) break;
                        const newGuess = guess - npv / derivative;
                        if (Math.abs(newGuess - guess) < 0.0000001) break;
                        guess = newGuess;
                      }
                      xirr = guess * 100;
                    }
                    
                    newDetails.gross_xirr = Math.round(xirr * 100) / 100; // Round to 2 decimals
                  } else {
                    newDetails.gross_xirr = 0;
                  }
                } else {
                  newDetails.gross_xirr = 0;
                }
              }
            }
            
            // Bond calculations - XIRR based on investment, periodic payouts, and maturity
            if (category === "bond") {
              if (["investment_value", "investment_date", "payout_frequency", "payout_amount", "maturity_amount", "maturity_date"].includes(field)) {
                const investmentVal = field === "investment_value" ? parseFloat(value || 0) : (parseFloat(newDetails.investment_value) || 0);
                const investmentDateStr = field === "investment_date" ? value : newDetails.investment_date;
                const payoutFrequency = field === "payout_frequency" ? value : (newDetails.payout_frequency || "Half-Yearly");
                const payoutAmount = field === "payout_amount" ? parseFloat(value || 0) : (parseFloat(newDetails.payout_amount) || 0);
                const maturityAmount = field === "maturity_amount" ? parseFloat(value || 0) : (parseFloat(newDetails.maturity_amount) || 0);
                const maturityDateStr = field === "maturity_date" ? value : newDetails.maturity_date;
                
                if (investmentVal > 0 && investmentDateStr && maturityDateStr && maturityAmount > 0) {
                  const investDate = new Date(investmentDateStr);
                  const maturityDate = new Date(maturityDateStr);
                  
                  // Get payments per year based on frequency
                  const frequencyMap = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1 };
                  const paymentsPerYear = frequencyMap[payoutFrequency] || 2;
                  
                  // Build cash flows
                  const cashFlows = [-investmentVal];
                  const dates = [investDate];
                  
                  // Add periodic payout cash flows
                  if (payoutAmount > 0) {
                    const monthsBetweenPayouts = 12 / paymentsPerYear;
                    let payoutDate = new Date(investDate);
                    payoutDate.setMonth(payoutDate.getMonth() + monthsBetweenPayouts);
                    
                    while (payoutDate < maturityDate) {
                      cashFlows.push(payoutAmount);
                      dates.push(new Date(payoutDate));
                      payoutDate.setMonth(payoutDate.getMonth() + monthsBetweenPayouts);
                    }
                  }
                  
                  // Add maturity amount (principal + final payout if any)
                  cashFlows.push(maturityAmount);
                  dates.push(maturityDate);
                  
                  // Newton-Raphson XIRR calculation
                  const calcNPV = (rate) => {
                    let npv = 0;
                    const baseDate = dates[0];
                    for (let i = 0; i < cashFlows.length; i++) {
                      const years = (dates[i] - baseDate) / (365 * 24 * 60 * 60 * 1000);
                      npv += cashFlows[i] / Math.pow(1 + rate, years);
                    }
                    return npv;
                  };
                  
                  let guess = 0.1;
                  for (let iter = 0; iter < 100; iter++) {
                    const npv = calcNPV(guess);
                    const npv2 = calcNPV(guess + 0.0001);
                    const derivative = (npv2 - npv) / 0.0001;
                    if (Math.abs(derivative) < 0.0000001) break;
                    const newGuess = guess - npv / derivative;
                    if (Math.abs(newGuess - guess) < 0.0000001) break;
                    guess = newGuess;
                  }
                  newDetails.gross_xirr = Math.round(guess * 100 * 100) / 100;
                } else {
                  newDetails.gross_xirr = 0;
                }
              }
            }
            
            // RD/PIS calculations
            if (category === "rd_pis") {
              // Calculate installments and total investment when dates change
              if (["start_date", "end_date", "investment_value_monthly", "maturity_value"].includes(field)) {
                const startDateStr = field === "start_date" ? value : newDetails.start_date;
                const endDateStr = field === "end_date" ? value : newDetails.end_date;
                const monthlyAmt = field === "investment_value_monthly" ? parseFloat(value || 0) : (parseFloat(newDetails.investment_value_monthly) || 0);
                const maturityVal = field === "maturity_value" ? parseFloat(value || 0) : (parseFloat(newDetails.maturity_value) || 0);
                
                if (startDateStr && endDateStr) {
                  const start = new Date(startDateStr);
                  const end = new Date(endDateStr);
                  const months = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
                  newDetails.num_installments = months;
                  
                  if (monthlyAmt > 0) {
                    newDetails.investment_value = monthlyAmt * months;
                    
                    // Calculate Gross XIRR based on monthly investments and maturity value
                    if (maturityVal > 0 && months > 0) {
                      // Build cash flows: monthly investments (negative) and maturity value (positive)
                      const cashFlows = [];
                      const dates = [];
                      
                      for (let i = 0; i < months; i++) {
                        cashFlows.push(-monthlyAmt);
                        const paymentDate = new Date(start);
                        paymentDate.setMonth(paymentDate.getMonth() + i);
                        dates.push(paymentDate);
                      }
                      cashFlows.push(maturityVal);
                      dates.push(end);
                      
                      // Newton-Raphson XIRR calculation
                      const calcNPV = (rate) => {
                        let npv = 0;
                        const baseDate = dates[0];
                        for (let i = 0; i < cashFlows.length; i++) {
                          const years = (dates[i] - baseDate) / (365 * 24 * 60 * 60 * 1000);
                          npv += cashFlows[i] / Math.pow(1 + rate, years);
                        }
                        return npv;
                      };
                      
                      let guess = 0.1;
                      for (let iter = 0; iter < 100; iter++) {
                        const npv = calcNPV(guess);
                        const npv2 = calcNPV(guess + 0.0001);
                        const derivative = (npv2 - npv) / 0.0001;
                        if (Math.abs(derivative) < 0.0000001) break;
                        const newGuess = guess - npv / derivative;
                        if (Math.abs(newGuess - guess) < 0.0000001) break;
                        guess = newGuess;
                      }
                      newDetails.gross_xirr = Math.round(guess * 100 * 100) / 100;
                    }
                  }
                }
              }
            }
            
            // Pension calculations
            if (category === "pension") {
              if (["amount", "payable_type"].includes(field)) {
                const amount = field === "amount" ? value : newDetails.amount;
                const type = field === "payable_type" ? value : (newDetails.payable_type || "Monthly");
                const multipliers = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1 };
                if (amount) {
                  newDetails.amount_yearly = Math.round(parseFloat(amount) * (multipliers[type] || 12));
                  // Investment Value = Yearly Amount
                  newDetails.investment_value = newDetails.amount_yearly;
                  newDetails.market_value = newDetails.amount_yearly;
                }
              }
              if (field === "upto_life" && value === "Yes") newDetails.end_date = "";
            }
            
            // Insurance calculations
            if (category === "insurance_income") {
              if (["premium_amount", "premium_frequency", "premium_start_date", "premium_end_date", "maturity_amount", "maturity_date"].includes(field)) {
                const premiumAmount = field === "premium_amount" ? parseFloat(value || 0) : (parseFloat(newDetails.premium_amount) || 0);
                const frequency = field === "premium_frequency" ? value : (newDetails.premium_frequency || "Yearly");
                const startDateStr = field === "premium_start_date" ? value : newDetails.premium_start_date;
                const endDateStr = field === "premium_end_date" ? value : newDetails.premium_end_date;
                const maturityAmount = field === "maturity_amount" ? parseFloat(value || 0) : (parseFloat(newDetails.maturity_amount) || 0);
                const maturityDateStr = field === "maturity_date" ? value : newDetails.maturity_date;
                
                // Get payments per year based on frequency
                const frequencyMap = { "Monthly": 12, "Quarterly": 4, "Half-Yearly": 2, "Yearly": 1 };
                const paymentsPerYear = frequencyMap[frequency] || 1;
                
                // Parse MM/YY or MM/YYYY dates
                const parseMMYY = (mmyy) => {
                  if (!mmyy) return null;
                  const [month, year] = mmyy.split('/');
                  let fullYear;
                  if (year.length === 4) {
                    fullYear = parseInt(year);
                  } else {
                    fullYear = parseInt(year) >= 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
                  }
                  return new Date(fullYear, parseInt(month) - 1, 1);
                };
                
                const startDate = parseMMYY(startDateStr);
                const endDate = parseMMYY(endDateStr);
                const today = new Date();
                
                if (startDate && endDate && premiumAmount > 0) {
                  // Calculate total payments from start to end
                  const totalMonths = Math.max(0, (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()));
                  const totalPayments = Math.ceil(totalMonths / (12 / paymentsPerYear));
                  const totalAmount = totalPayments * premiumAmount;
                  
                  // Calculate paid till date
                  const paidMonths = Math.max(0, Math.min(totalMonths, (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth())));
                  const paidPayments = Math.ceil(paidMonths / (12 / paymentsPerYear));
                  newDetails.total_paid = Math.round(paidPayments * premiumAmount);
                  
                  // Calculate pending
                  newDetails.total_pending = Math.round(totalAmount - newDetails.total_paid);
                }
                
                // Calculate Gross XIRR
                if (startDate && maturityDateStr && maturityAmount > 0 && premiumAmount > 0) {
                  const maturityDate = new Date(maturityDateStr);
                  const monthsBetweenPayments = 12 / paymentsPerYear;
                  
                  // Build cash flows
                  const cashFlows = [];
                  const dates = [];
                  
                  // Add premium payments as negative cash flows
                  let paymentDate = new Date(startDate);
                  while (paymentDate <= endDate) {
                    cashFlows.push(-premiumAmount);
                    dates.push(new Date(paymentDate));
                    paymentDate.setMonth(paymentDate.getMonth() + monthsBetweenPayments);
                  }
                  
                  // Add maturity amount as positive cash flow
                  cashFlows.push(maturityAmount);
                  dates.push(maturityDate);
                  
                  // Newton-Raphson XIRR calculation
                  if (cashFlows.length > 1) {
                    const calcNPV = (rate) => {
                      let npv = 0;
                      const baseDate = dates[0];
                      for (let i = 0; i < cashFlows.length; i++) {
                        const years = (dates[i] - baseDate) / (365 * 24 * 60 * 60 * 1000);
                        npv += cashFlows[i] / Math.pow(1 + rate, years);
                      }
                      return npv;
                    };
                    
                    let guess = 0.08;
                    for (let iter = 0; iter < 100; iter++) {
                      const npv = calcNPV(guess);
                      const npv2 = calcNPV(guess + 0.0001);
                      const derivative = (npv2 - npv) / 0.0001;
                      if (Math.abs(derivative) < 0.0000001) break;
                      const newGuess = guess - npv / derivative;
                      if (Math.abs(newGuess - guess) < 0.0000001) break;
                      guess = newGuess;
                    }
                    newDetails.gross_xirr = Math.round(guess * 100 * 100) / 100;
                  }
                }
              }
            }
            
            // Commodities calculations
            if (category === "commodities") {
              if (["commodity_type", "weight_kg"].includes(field)) {
                const commodityType = field === "commodity_type" ? value : (newDetails.commodity_type || "Gold");
                const weightKg = field === "weight_kg" ? parseFloat(value || 0) : (parseFloat(newDetails.weight_kg) || 0);
                
                // Get current price from API (stored in commodityPrices state)
                const currentPrice = commodityPrices[commodityType] || 0;
                
                // Only show values if API returned valid prices
                if (currentPrice > 0) {
                  newDetails.price_per_kg = currentPrice;
                  if (weightKg > 0) {
                    newDetails.market_value = Math.round(weightKg * currentPrice);
                  } else {
                    newDetails.market_value = "";
                  }
                } else {
                  newDetails.price_per_kg = "";
                  newDetails.market_value = "";
                }
              }
            }
          }
          
          return { ...item, memberId: newMemberId, details: newDetails, isModified: !item.isNew };
        }
        return item;
      })
    }));
  };

  const saveCategory = async (category) => {
    const items = incomeItems[category] || [];
    const itemsToSave = items.filter(item => item.isNew || item.isModified);
    if (itemsToSave.length === 0) { toast.info("No changes"); return; }
    for (const item of itemsToSave) {
      if (!item.memberId) { toast.error("Select member"); return; }
    }

    setSavingCategory(category);
    try {
      const token = localStorage.getItem("token");
      for (const item of itemsToSave) {
        const payload = { family_id: family.id, category, member_ids: [item.memberId], details: item.details };
        if (item.isNew) await axios.post(`${API}/data-gathering/family/${family.id}/income`, payload, { headers: { Authorization: `Bearer ${token}` } });
        else await axios.put(`${API}/data-gathering/family/${family.id}/income/${item.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      toast.success("Saved");
      setExpandedCategories(prev => ({ ...prev, [category]: false }));
      onRefresh();
    } catch (error) { toast.error(error.response?.data?.detail || "Failed"); }
    finally { setSavingCategory(null); }
  };

  const shouldShowField = (field, details) => {
    if (!field.dependsOn) return true;
    return details[field.dependsOn] === field.showWhen;
  };

  const formatValue = (value, key) => {
    // For XIRR/return fields, 0 is a valid value - show it, negative values should also be displayed
    if (key.includes('xirr') || key.includes('return')) {
      if (value === null || value === undefined || value === '') return "-";
      const numValue = parseFloat(value);
      // Handle NaN and Infinity cases
      if (isNaN(numValue) || !isFinite(numValue)) return "-";
      return `${numValue.toFixed(2)}%`;
    }
    if (value === null || value === undefined || value === '') return "-";
    if (key.includes("amount") || key.includes("income") || key.includes("payment") || key.includes("value") || key.includes("balance") || key.includes("principal")) {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return "-";
      return `₹${numValue.toLocaleString('en-IN')}`;
    }
    return value;
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <User className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-gray-500 text-sm">Add members in Introduction tab first</p>
      </div>
    );
  }

  const availableCategories = INCOME_CATEGORIES.filter(c => !addedCategories.includes(c.value));
  const activeCategories = INCOME_CATEGORIES.filter(c => addedCategories.includes(c.value));

  return (
    <div className="space-y-4">
      {/* Available Categories */}
      {availableCategories.length > 0 && (
        <div className="bg-gray-50/50 rounded-lg p-4">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-3">Click to add</p>
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map(cat => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.value}
                  onClick={() => addCategory(cat.value)}
                  disabled={isReadOnly}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all duration-150"
                >
                  <Plus className="h-3 w-3" />
                  <Icon className="h-3 w-3" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Categories */}
      <div className="space-y-2">
        {activeCategories.map(category => {
          const Icon = category.icon;
          const items = incomeItems[category.value] || [];
          const isExpanded = expandedCategories[category.value];
          const hasChanges = items.some(item => item.isNew || item.isModified);

          return (
            <Collapsible key={category.value} open={isExpanded} onOpenChange={() => toggleCategory(category.value)}>
              <div className={`bg-white rounded-lg border transition-all duration-150 ${hasChanges ? 'border-amber-300' : 'border-gray-200'}`}>
                {/* Header */}
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1 h-6 rounded-full ${colorMap[category.color]}`} />
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">{category.label}</span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-gray-100">{items.length}</Badge>
                      {hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {hasChanges && (
                        <Button onClick={() => saveCategory(category.value)} disabled={savingCategory === category.value || isReadOnly} size="sm" className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700">
                          <Save className="h-3 w-3 mr-1" />{savingCategory === category.value ? "..." : "Save"}
                        </Button>
                      )}
                      <button onClick={() => skipCategory(category.value)} disabled={isReadOnly} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => addIncomeItem(category.value)} disabled={isReadOnly} className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <div className="p-1.5 text-gray-400">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>

                {/* Content */}
                <CollapsibleContent>
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                    {/* Show current commodity prices for Commodities category */}
                    {category.value === "commodities" && (commodityPrices.Gold > 0 || commodityPrices.Silver > 0) && (
                      <div className="mb-3 p-2 bg-gradient-to-r from-yellow-50 to-gray-50 rounded-lg border border-yellow-200">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-4">
                            <span className="text-gray-500 font-medium">Live Prices (INR/Kg):</span>
                            {commodityPrices.Gold > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                <span className="font-semibold text-yellow-700">Gold: ₹{commodityPrices.Gold.toLocaleString('en-IN')}</span>
                              </span>
                            )}
                            {commodityPrices.Silver > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                <span className="font-semibold text-gray-600">Silver: ₹{commodityPrices.Silver.toLocaleString('en-IN')}</span>
                              </span>
                            )}
                          </div>
                          {commodityPrices.date && (
                            <span className="text-gray-400 text-[10px]">
                              As on: {commodityPrices.date.split(',')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {items.length === 0 ? (
                      <p className="text-center py-4 text-xs text-gray-400">Click + to add entry</p>
                    ) : (
                      <div className="space-y-1">
                        {/* Common Header Row - shown when multiple items */}
                        {items.length > 1 && (
                          <div className="flex flex-wrap gap-3 items-end px-2 py-1 bg-gray-50 rounded-t border-b border-gray-200">
                            <div style={{ minWidth: '150px', maxWidth: '200px', flex: '1.5' }}>
                              <span className="text-[10px] text-gray-500 font-medium">Member</span>
                            </div>
                            {category.fields.filter(f => shouldShowField(f, items[0]?.details || {})).map(field => {
                              const isSmallField = ['growth_rate_percent', 'retirement_age', 'inflation_percent', 'rental_increment_percent', 'interest_rate', 'pay_date', 'auto_renew'].includes(field.key);
                              const isLargeTextField = ['property_details', 'rental_details', 'description'].includes(field.key);
                              const fieldStyle = isSmallField 
                                ? { minWidth: '70px', maxWidth: '100px', flex: '0.5' }
                                : isLargeTextField
                                ? { minWidth: '200px', maxWidth: '300px', flex: '2' }
                                : { minWidth: '100px', maxWidth: '180px', flex: '1' };
                              return (
                                <div key={field.key} style={fieldStyle}>
                                  <span className={`text-[10px] font-medium truncate ${field.calculated ? 'text-blue-500' : 'text-gray-500'}`}>{field.label}</span>
                                </div>
                              );
                            })}
                            <div style={{ width: '40px' }}></div>
                          </div>
                        )}
                        
                        {items.map((item, idx) => {
                          const visibleFields = category.fields.filter(f => shouldShowField(f, item.details));
                          const isRentalWithRent = category.value === 'rental' && item.details.is_on_rent === 'Yes';
                          const showLabels = items.length === 1; // Only show labels if single item
                          
                          // For rental with rent, split into two rows
                          const row1Fields = isRentalWithRent 
                            ? visibleFields.filter(f => ['property_type', 'property_details', 'investment_amount', 'investment_date', 'market_value', 'market_value_date', 'xirr_return', 'is_on_rent'].includes(f.key))
                            : visibleFields;
                          const row2Fields = isRentalWithRent 
                            ? visibleFields.filter(f => ['rental_details', 'rent_per_month', 'annual_rent', 'start_date', 'end_date', 'maintenance', 'property_tax', 'absolute_return'].includes(f.key))
                            : [];
                          
                          const renderField = (field, withLabel = true) => {
                            const isSmallField = ['growth_rate_percent', 'retirement_age', 'inflation_percent', 'rental_increment_percent', 'interest_rate', 'pay_date', 'auto_renew'].includes(field.key);
                            const isLargeTextField = ['property_details', 'rental_details', 'description'].includes(field.key);
                            const fieldStyle = isSmallField 
                              ? { minWidth: '70px', maxWidth: '100px', flex: '0.5' }
                              : isLargeTextField
                              ? { minWidth: '200px', maxWidth: '300px', flex: '2' }
                              : { minWidth: '100px', maxWidth: '180px', flex: '1' };
                            
                            return (
                              <div key={field.key} className="flex flex-col" style={fieldStyle}>
                                {withLabel && <span className={`text-[10px] mb-1 truncate ${field.calculated ? 'text-blue-500' : 'text-gray-400'}`}>{field.label}</span>}
                                {field.type === "select" ? (
                                  <Select value={item.details[field.key] || field.defaultValue || ""} onValueChange={v => updateIncomeItem(category.value, item.id, field.key, v)} disabled={isReadOnly || field.readOnly}>
                                    <SelectTrigger className={`h-8 w-full text-xs ${field.readOnly ? 'bg-gray-100' : 'bg-white'} border-gray-200`}>
                                      <SelectValue placeholder="-" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {field.options.map(opt => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                ) : field.type === "monthyear" ? (
                                  <div className="flex gap-1">
                                    <Select 
                                      value={item.details[field.key]?.split('/')[0] || ""} 
                                      onValueChange={v => {
                                        const year = item.details[field.key]?.split('/')[1] || new Date().getFullYear().toString().slice(-2);
                                        updateIncomeItem(category.value, item.id, field.key, `${v}/${year}`);
                                      }} 
                                      disabled={isReadOnly}
                                    >
                                      <SelectTrigger className="h-8 w-[70px] text-xs bg-white border-gray-200">
                                        <SelectValue placeholder="MM" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                                          <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select 
                                      value={(() => {
                                        const stored = item.details[field.key]?.split('/')[1] || "";
                                        // Handle both 2-digit (YY) and 4-digit (YYYY) stored values
                                        if (stored.length === 4) return stored;
                                        if (stored.length === 2) {
                                          // Convert 2-digit to 4-digit for matching
                                          const num = parseInt(stored);
                                          return num >= 50 ? `19${stored}` : `20${stored}`;
                                        }
                                        return "";
                                      })()} 
                                      onValueChange={v => {
                                        const month = item.details[field.key]?.split('/')[0] || '01';
                                        // Store as 4-digit year
                                        updateIncomeItem(category.value, item.id, field.key, `${month}/${v}`);
                                      }} 
                                      disabled={isReadOnly}
                                    >
                                      <SelectTrigger className="h-8 w-[80px] text-xs bg-white border-gray-200">
                                        <SelectValue placeholder="Year" />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-[300px]">
                                        {/* Years from 1950 to current year + 50 */}
                                        {Array.from({length: new Date().getFullYear() - 1950 + 51}, (_, i) => {
                                          const fullYear = 1950 + i;
                                          return <SelectItem key={fullYear} value={fullYear.toString()} className="text-xs">{fullYear}</SelectItem>;
                                        })}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : field.type === "date" ? (
                                  <Input
                                    type="date"
                                    value={item.details[field.key] || ""}
                                    onChange={e => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                    className={`h-8 w-full text-xs ${field.readOnly ? 'bg-gray-100' : 'bg-white'} border-gray-200`}
                                    disabled={isReadOnly || field.readOnly}
                                  />
                                ) : field.readOnly ? (
                                  <div className="relative group">
                                    <div className={`h-8 px-3 w-full flex items-center text-xs border border-gray-200 rounded-md font-medium ${
                                      ['xirr_return', 'absolute_return', 'gross_xirr'].includes(field.key) 
                                        ? (parseFloat(item.details[field.key]) >= 8 
                                            ? 'bg-green-100 text-green-700 border-green-300' 
                                            : 'bg-red-100 text-red-700 border-red-300')
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      {formatValue(item.details[field.key], field.key)}
                                      {field.key === 'xirr_return' && item.details.is_inflation_adjusted && (
                                        <span className="ml-1 text-amber-600 cursor-help" title="Inflation adjusted">*</span>
                                      )}
                                    </div>
                                    {/* Tooltip for inflation-adjusted XIRR */}
                                    {field.key === 'xirr_return' && item.details.is_inflation_adjusted && (
                                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
                                        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 w-64 shadow-lg">
                                          <p className="font-semibold mb-1">Real Return (Inflation Adjusted)</p>
                                          <p>Since Investment = Market Value, XIRR is calculated assuming 8% annual inflation to show the real loss in purchasing power.</p>
                                        </div>
                                        <div className="absolute top-full left-4 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-900"></div>
                                      </div>
                                    )}
                                  </div>
                                ) : field.type === "text" ? (
                                  <Input
                                    type="text"
                                    value={item.details[field.key] || ""}
                                    onChange={e => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                    placeholder="Enter text"
                                    className="h-8 w-full text-xs bg-white border-gray-200"
                                    disabled={isReadOnly}
                                  />
                                ) : (field.key.includes('percent') || field.key.includes('rate') || field.key === 'interest_rate') ? (
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      value={item.details[field.key] || ""}
                                      onChange={e => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                      placeholder="0"
                                      className="h-8 w-full text-xs bg-white border-gray-200 pr-6"
                                      disabled={isReadOnly}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                                  </div>
                                ) : (field.key.includes('amount') || field.key.includes('income') || field.key.includes('value') || field.key.includes('payment') || field.key.includes('principal') || field.key.includes('balance') || field.key.includes('rent') || field.key.includes('tax') || field.key.includes('maintenance')) ? (
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">₹</span>
                                    <Input
                                      type="text"
                                      value={item.details[field.key] ? parseFloat(item.details[field.key]).toLocaleString('en-IN') : ""}
                                      onChange={e => {
                                        const rawValue = e.target.value.replace(/,/g, '');
                                        if (rawValue === '' || !isNaN(rawValue)) {
                                          updateIncomeItem(category.value, item.id, field.key, rawValue);
                                        }
                                      }}
                                      placeholder="0"
                                      className="h-8 w-full text-xs bg-white border-gray-200 pl-5"
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                ) : (
                                  <Input
                                    type="number"
                                    value={item.details[field.key] || ""}
                                    onChange={e => updateIncomeItem(category.value, item.id, field.key, e.target.value)}
                                    placeholder="0"
                                    className="h-8 w-full text-xs bg-white border-gray-200"
                                    disabled={isReadOnly}
                                  />
                                )}
                              </div>
                            );
                          };
                          
                          return (
                            <div key={item.id} className={`rounded-md p-3 ${item.isNew ? 'bg-green-50/50 border border-green-200' : item.isModified ? 'bg-amber-50/50 border border-amber-200' : 'bg-gray-50/30 border border-gray-100'}`}>
                              {/* Row 1 */}
                              <div className="flex flex-wrap gap-3 items-end">
                                {/* Member */}
                                <div className="flex flex-col" style={{ minWidth: '150px', maxWidth: '200px', flex: '1.5' }}>
                                  {showLabels && <span className="text-[10px] text-gray-400 mb-1">Member</span>}
                                  <Select value={item.memberId || ""} onValueChange={v => updateIncomeItem(category.value, item.id, "memberId", v)} disabled={isReadOnly}>
                                    <SelectTrigger className="h-8 w-full text-xs bg-white border-gray-200">
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {members.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {row1Fields.map(field => renderField(field, showLabels))}
                                
                                {/* Delete button for additional items (idx > 0) */}
                                {idx > 0 && (
                                  <div className="flex flex-col justify-end">
                                    <button 
                                      onClick={() => removeIncomeItem(category.value, item.id, item.isNew)} 
                                      disabled={isReadOnly} 
                                      className="h-8 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex items-center"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              
                              {/* Row 2 - Only for rental with Is On Rent = Yes */}
                              {row2Fields.length > 0 && (
                                <div className="flex flex-wrap gap-3 items-end mt-3 pt-3 border-t border-gray-200">
                                  {row2Fields.map(field => renderField(field, true))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Empty State */}
      {activeCategories.length === 0 && availableCategories.length > 0 && (
        <p className="text-center py-6 text-xs text-gray-400">Select a category above to begin</p>
      )}
    </div>
  );
}
