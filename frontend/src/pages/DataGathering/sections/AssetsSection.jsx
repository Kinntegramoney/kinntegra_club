import React from "react";
import { User, Landmark, Home, Car, Gem, Wallet, TrendingUp, Building, PiggyBank, Coins } from "lucide-react";

// Asset categories mapped to income section categories
// Note: Pension is excluded - it's an income source, not an asset
const ASSET_CATEGORIES = [
  { value: "rental", label: "Rental Property", icon: Home, investmentKey: "investment_amount", marketKey: "market_value" },
  { value: "ppf", label: "PPF", icon: PiggyBank, investmentKey: null, marketKey: "market_value" },
  { value: "epf", label: "EPF", icon: PiggyBank, investmentKey: null, marketKey: "market_value" },
  { value: "gratuity", label: "Gratuity", icon: Wallet, investmentKey: null, marketKey: "market_value" },
  { value: "fd", label: "Fixed Deposits", icon: Landmark, investmentKey: "investment_value", marketKey: "maturity_amount" },
  { value: "rd_pis", label: "RD / PIS", icon: Landmark, investmentKey: "investment_value", marketKey: "maturity_value" },
  { value: "bond", label: "Bonds", icon: Landmark, investmentKey: "investment_value", marketKey: "maturity_amount" },
  { value: "insurance_income", label: "Insurance", icon: Building, investmentKey: "total_paid", marketKey: "maturity_amount" },
  { value: "commodities", label: "Commodities", icon: Gem, investmentKey: null, marketKey: ["market_value", "current_value"] },
  { value: "shares_pms", label: "Shares / PMS", icon: TrendingUp, investmentKey: null, marketKey: "market_value" },
  { value: "cash", label: "Cash in Hand", icon: Coins, investmentKey: null, marketKey: "bank_balance" },
  { value: "vehicle", label: "Vehicles", icon: Car, investmentKey: null, marketKey: "market_value" },
  { value: "other", label: "Other Assets", icon: Wallet, investmentKey: null, marketKey: "value" }
];

export default function AssetsSection({ family }) {
  const members = family?.members || [];
  const existingIncomes = family?.income_details || [];

  // Get asset value for a specific member and category
  const getAssetValue = (memberId, categoryValue, valueType) => {
    const category = ASSET_CATEGORIES.find(c => c.value === categoryValue);
    if (!category) return 0;
    
    const incomes = existingIncomes.filter(
      income => income.category === categoryValue && income.member_ids?.includes(memberId)
    );
    
    return incomes.reduce((sum, income) => {
      const details = income.details || {};
      
      if (valueType === 'investment') {
        // Use the specific investment key for this category
        if (category.investmentKey) {
          return sum + (parseFloat(details[category.investmentKey]) || 0);
        }
        return sum; // No investment value for this category
      } else {
        // Use the specific market/maturity key for this category
        if (category.marketKey) {
          // Handle array of keys (try each until one has a value)
          if (Array.isArray(category.marketKey)) {
            for (const key of category.marketKey) {
              const val = parseFloat(details[key]);
              if (val && val > 0) {
                return sum + val;
              }
            }
            return sum;
          }
          return sum + (parseFloat(details[category.marketKey]) || 0);
        }
        return sum;
      }
    }, 0);
  };

  // Check if category has investment value configured
  const hasInvestmentValue = (categoryValue) => {
    const category = ASSET_CATEGORIES.find(c => c.value === categoryValue);
    return category?.investmentKey !== null;
  };

  // Calculate totals for a member
  const getMemberTotal = (memberId, valueType) => {
    return ASSET_CATEGORIES.reduce((sum, cat) => {
      return sum + getAssetValue(memberId, cat.value, valueType);
    }, 0);
  };

  // Calculate grand totals
  const getGrandTotal = (valueType) => {
    return members.reduce((sum, member) => {
      return sum + getMemberTotal(member.id, valueType);
    }, 0);
  };

  // Format currency
  const formatCurrency = (value, showDash = false) => {
    if (value === 0 || value === null || value === undefined) {
      return showDash ? '-' : '-';
    }
    return `₹${value.toLocaleString('en-IN')}`;
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-green-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const grandTotalMarket = getGrandTotal('market');
  const grandTotalInvestment = getGrandTotal('investment');

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      {grandTotalMarket > 0 && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-green-600" />
            <div>
              <span className="text-sm text-green-600 font-medium">Total Assets Value</span>
              <p className="text-xs text-green-500">Investment Value: ₹{grandTotalInvestment > 0 ? grandTotalInvestment.toLocaleString('en-IN') : '0'}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-green-700">₹{grandTotalMarket.toLocaleString('en-IN')}</div>
            <p className="text-[10px] text-green-500">Market/Maturity Value</p>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 px-1">
        Summary of asset values from Income section by family member.
      </div>

      {/* Assets Summary Table with Member Columns */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            {/* Member Names Row */}
            <tr className="bg-green-50 border-b border-gray-200">
              <th rowSpan={2} className="text-left text-xs font-semibold text-gray-700 px-4 py-2 border-r border-gray-200 min-w-[180px]">
                Particulars
              </th>
              {members.map((member, idx) => (
                <th 
                  key={member.id} 
                  colSpan={2} 
                  className={`text-center text-xs font-semibold text-green-700 px-2 py-2 ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <User className="h-3 w-3" />
                    {member.name}
                    {member.is_primary && <span className="text-green-500">*</span>}
                  </div>
                </th>
              ))}
              <th colSpan={2} className="text-center text-xs font-semibold text-green-800 px-2 py-2 bg-green-100 border-l border-gray-200">
                Total
              </th>
            </tr>
            {/* Sub-headers Row */}
            <tr className="bg-gray-50 border-b border-gray-200">
              {members.map((member, idx) => (
                <React.Fragment key={`sub-${member.id}`}>
                  <th className="text-right text-[10px] font-medium text-gray-500 px-2 py-1.5 w-24">
                    Inv. Value
                  </th>
                  <th className={`text-right text-[10px] font-medium text-gray-500 px-2 py-1.5 w-24 ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}>
                    Mkt/Mat Value
                  </th>
                </React.Fragment>
              ))}
              <th className="text-right text-[10px] font-medium text-green-600 px-2 py-1.5 w-24 bg-green-50 border-l border-gray-200">
                Inv. Value
              </th>
              <th className="text-right text-[10px] font-medium text-green-600 px-2 py-1.5 w-24 bg-green-50">
                Mkt/Mat Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ASSET_CATEGORIES.map(category => {
              const Icon = category.icon;
              const hasInvKey = category.investmentKey !== null;
              
              // Calculate row totals
              const rowTotalInvestment = members.reduce((sum, m) => sum + getAssetValue(m.id, category.value, 'investment'), 0);
              const rowTotalMarket = members.reduce((sum, m) => sum + getAssetValue(m.id, category.value, 'market'), 0);
              const hasValues = rowTotalInvestment > 0 || rowTotalMarket > 0;
              
              return (
                <tr key={category.value} className={`hover:bg-gray-50 ${hasValues ? '' : 'text-gray-400'}`}>
                  <td className="px-4 py-2.5 border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${hasValues ? 'text-green-600' : 'text-gray-300'}`} />
                      <span className={`text-sm ${hasValues ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
                        {category.label}
                      </span>
                    </div>
                  </td>
                  {members.map((member, idx) => {
                    const invValue = getAssetValue(member.id, category.value, 'investment');
                    const mktValue = getAssetValue(member.id, category.value, 'market');
                    return (
                      <React.Fragment key={`${category.value}-${member.id}`}>
                        <td className="px-2 py-2.5 text-right">
                          <span className={`text-xs ${!hasInvKey ? 'text-gray-300' : invValue > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                            {!hasInvKey ? '-' : formatCurrency(invValue)}
                          </span>
                        </td>
                        <td className={`px-2 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                          <span className={`text-xs ${mktValue > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                            {formatCurrency(mktValue)}
                          </span>
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {/* Row Totals */}
                  <td className="px-2 py-2.5 text-right bg-green-50/50 border-l border-gray-100">
                    <span className={`text-xs font-medium ${!hasInvKey ? 'text-gray-300' : rowTotalInvestment > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                      {!hasInvKey ? '-' : formatCurrency(rowTotalInvestment)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right bg-green-50/50">
                    <span className={`text-xs font-medium ${rowTotalMarket > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                      {formatCurrency(rowTotalMarket)}
                    </span>
                  </td>
                </tr>
              );
            })}
            
            {/* Grand Total Row - Only Market Value */}
            <tr className="bg-green-100 font-semibold">
              <td className="px-4 py-3 text-sm text-green-800 border-r border-green-200">
                Grand Total
              </td>
              {members.map((member, idx) => {
                const memberMktTotal = getMemberTotal(member.id, 'market');
                return (
                  <React.Fragment key={`total-${member.id}`}>
                    <td className="px-2 py-3 text-right">
                      <span className="text-xs text-gray-300">-</span>
                    </td>
                    <td className={`px-2 py-3 text-right ${idx < members.length - 1 ? 'border-r border-green-200' : ''}`}>
                      <span className="text-xs text-green-700">
                        {formatCurrency(memberMktTotal)}
                      </span>
                    </td>
                  </React.Fragment>
                );
              })}
              <td className="px-2 py-3 text-right bg-green-200/50 border-l border-green-200">
                <span className="text-xs text-gray-300">-</span>
              </td>
              <td className="px-2 py-3 text-right bg-green-200/50">
                <span className="text-sm text-green-800">
                  {formatCurrency(grandTotalMarket)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
