import React from "react";
import { User, TrendingUp, TrendingDown, Minus, PieChart } from "lucide-react";

export default function NetworthSection({ family }) {
  const members = family?.members || [];
  const incomeDetails = family?.income_details || [];
  const liabilities = family?.liabilities || [];

  // Calculate total assets for a member
  const getMemberAssets = (memberId) => {
    const memberIncomes = incomeDetails.filter(
      income => income.member_ids?.includes(memberId)
    );
    
    let totalAssets = 0;
    memberIncomes.forEach(income => {
      const details = income.details || {};
      
      // Get market value or equivalent based on category
      switch (income.category) {
        case 'rental':
          totalAssets += parseFloat(details.market_value) || 0;
          break;
        case 'ppf':
        case 'epf':
        case 'gratuity':
        case 'shares_pms':
          totalAssets += parseFloat(details.market_value) || 0;
          break;
        case 'fd':
          totalAssets += parseFloat(details.maturity_amount) || parseFloat(details.investment_value) || 0;
          break;
        case 'rd_pis':
          totalAssets += parseFloat(details.maturity_value) || parseFloat(details.investment_value) || 0;
          break;
        case 'bond':
          totalAssets += parseFloat(details.maturity_amount) || parseFloat(details.investment_value) || 0;
          break;
        case 'insurance_income':
          totalAssets += parseFloat(details.maturity_amount) || 0;
          break;
        case 'commodities':
          totalAssets += parseFloat(details.market_value) || parseFloat(details.current_value) || 0;
          break;
        case 'cash':
          totalAssets += parseFloat(details.bank_balance) || 0;
          break;
        case 'vehicle':
          totalAssets += parseFloat(details.market_value) || 0;
          break;
        case 'other':
          totalAssets += parseFloat(details.value) || 0;
          break;
        default:
          break;
      }
    });
    
    return totalAssets;
  };

  // Calculate total liabilities for a member
  const getMemberLiabilities = (memberId) => {
    const memberLiabilities = liabilities.filter(
      liability => liability.member_ids?.includes(memberId)
    );
    
    return memberLiabilities.reduce((sum, liability) => {
      return sum + (parseFloat(liability.outstanding_amount) || parseFloat(liability.amount) || 0);
    }, 0);
  };

  // Calculate networth (Assets - Liabilities)
  const getMemberNetworth = (memberId) => {
    return getMemberAssets(memberId) - getMemberLiabilities(memberId);
  };

  // Calculate family totals
  const getTotals = () => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    
    members.forEach(member => {
      totalAssets += getMemberAssets(member.id);
      totalLiabilities += getMemberLiabilities(member.id);
    });
    
    return {
      assets: totalAssets,
      liabilities: totalLiabilities,
      networth: totalAssets - totalLiabilities
    };
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === 0) return '₹0';
    const absValue = Math.abs(value);
    if (absValue >= 10000000) return `${value < 0 ? '-' : ''}₹${(absValue / 10000000).toFixed(2)} Cr`;
    if (absValue >= 100000) return `${value < 0 ? '-' : ''}₹${(absValue / 100000).toFixed(2)} L`;
    return `${value < 0 ? '-' : ''}₹${absValue.toLocaleString('en-IN')}`;
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-purple-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const totals = getTotals();

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PieChart className="h-8 w-8 text-purple-600" />
            <div>
              <h3 className="text-lg font-semibold text-purple-800">Family Networth</h3>
              <p className="text-xs text-purple-600">Total Assets - Total Liabilities</p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${totals.networth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totals.networth)}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs">
              <span className="text-gray-500">
                Assets: <span className="text-green-600 font-medium">{formatCurrency(totals.assets)}</span>
              </span>
              <span className="text-gray-500">
                Liabilities: <span className="text-red-600 font-medium">{formatCurrency(totals.liabilities)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Networth Table by Member */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-purple-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-700 px-4 py-3">
                Family Member
              </th>
              <th className="text-right text-xs font-semibold text-green-700 px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Total Assets
                </div>
              </th>
              <th className="text-right text-xs font-semibold text-red-700 px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <TrendingDown className="h-3 w-3" />
                  Total Liabilities
                </div>
              </th>
              <th className="text-right text-xs font-semibold text-purple-700 px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Minus className="h-3 w-3" />
                  Networth
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map(member => {
              const assets = getMemberAssets(member.id);
              const liabilities = getMemberLiabilities(member.id);
              const networth = assets - liabilities;
              
              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium text-gray-800">
                        {member.name}
                        {member.is_primary && <span className="text-purple-500 ml-1">*</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${assets > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {formatCurrency(assets)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${liabilities > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {formatCurrency(liabilities)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-bold ${networth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(networth)}
                    </span>
                  </td>
                </tr>
              );
            })}
            
            {/* Total Row */}
            <tr className="bg-purple-100 font-semibold">
              <td className="px-4 py-3 text-sm text-purple-800">
                Family Total
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm text-green-700 font-bold">
                  {formatCurrency(totals.assets)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm text-red-700 font-bold">
                  {formatCurrency(totals.liabilities)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`text-lg font-bold ${totals.networth >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(totals.networth)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
        <span>* Primary member</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500"></span> Positive Networth
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500"></span> Negative Networth
        </span>
      </div>
    </div>
  );
}
