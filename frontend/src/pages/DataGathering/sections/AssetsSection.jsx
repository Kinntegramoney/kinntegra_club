import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { User, Landmark, Home, Car, Gem, Wallet, TrendingUp, Building, PiggyBank, Coins } from "lucide-react";

// Asset categories for display
const ASSET_CATEGORIES = [
  { value: "ppf", label: "PPF", icon: PiggyBank, hasMaturity: true },
  { value: "epf", label: "EPF", icon: PiggyBank, hasMaturity: true },
  { value: "gratuity", label: "Gratuity", icon: Wallet, hasMaturity: true },
  { value: "fd", label: "Fixed Deposits", icon: Landmark, hasMaturity: true },
  { value: "rd_pis", label: "RD / PIS", icon: Landmark, hasMaturity: true },
  { value: "bond", label: "Bonds", icon: Landmark, hasMaturity: true },
  { value: "insurance_corpus", label: "Insurance", icon: Building, hasMaturity: true },
  { value: "mutual_fund", label: "Mutual Fund", icon: TrendingUp, hasMaturity: false },
  { value: "shares_pms", label: "Shares / PMS", icon: TrendingUp, hasMaturity: false },
  { value: "gold", label: "Gold", icon: Gem, hasMaturity: false },
  { value: "cash", label: "Cash in Hand", icon: Coins, hasMaturity: false },
  { value: "real_estate", label: "Real Estate", icon: Home, hasMaturity: false },
  { value: "vehicle", label: "Vehicles", icon: Car, hasMaturity: false },
  { value: "other", label: "Other Assets", icon: Wallet, hasMaturity: false }
];

export default function AssetsSection({ family }) {
  const members = family?.members || [];
  const existingAssets = family?.asset_details || [];

  // Get asset value for a specific member and category
  const getAssetValue = (memberId, categoryValue, valueType) => {
    const assets = existingAssets.filter(
      asset => asset.category === categoryValue && asset.member_ids?.includes(memberId)
    );
    
    return assets.reduce((sum, asset) => {
      const details = asset.details || {};
      if (valueType === 'investment') {
        return sum + (parseFloat(details.principal_amount) || parseFloat(details.current_value) || 
                     parseFloat(details.amount) || parseFloat(details.sum_assured) || 
                     parseFloat(details.expected_amount) || parseFloat(details.purchase_value) || 
                     parseFloat(details.value) || 0);
      } else {
        return sum + (parseFloat(details.market_value) || parseFloat(details.current_value) || 
                     parseFloat(details.amount) || parseFloat(details.principal_amount) || 
                     parseFloat(details.value) || 0);
      }
    }, 0);
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
  const formatCurrency = (value) => {
    if (value === 0) return '-';
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

  const grandTotalInvestment = getGrandTotal('investment');
  const grandTotalMarket = getGrandTotal('market');

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      {(grandTotalInvestment > 0 || grandTotalMarket > 0) && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <span className="text-sm text-green-600 font-medium">Total Assets Value</span>
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-[10px] text-green-500">Investment</div>
              <div className="font-semibold text-green-700">{formatCurrency(grandTotalInvestment)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-green-500">Market</div>
              <div className="font-semibold text-green-700">{formatCurrency(grandTotalMarket)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 px-1">
        Summary of face values. Items with maturity will also reflect in Income.
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
                    Mkt. Value
                  </th>
                </React.Fragment>
              ))}
              <th className="text-right text-[10px] font-medium text-green-600 px-2 py-1.5 w-24 bg-green-50 border-l border-gray-200">
                Inv. Value
              </th>
              <th className="text-right text-[10px] font-medium text-green-600 px-2 py-1.5 w-24 bg-green-50">
                Mkt. Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ASSET_CATEGORIES.map(category => {
              const Icon = category.icon;
              
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
                      {category.hasMaturity && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 text-blue-500 border-blue-200">
                          → Income
                        </Badge>
                      )}
                    </div>
                  </td>
                  {members.map((member, idx) => {
                    const invValue = getAssetValue(member.id, category.value, 'investment');
                    const mktValue = getAssetValue(member.id, category.value, 'market');
                    return (
                      <React.Fragment key={`${category.value}-${member.id}`}>
                        <td className="px-2 py-2.5 text-right">
                          <span className={`text-xs ${invValue > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                            {formatCurrency(invValue)}
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
                    <span className={`text-xs font-medium ${rowTotalInvestment > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                      {formatCurrency(rowTotalInvestment)}
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
            
            {/* Grand Total Row */}
            <tr className="bg-green-100 font-semibold">
              <td className="px-4 py-3 text-sm text-green-800 border-r border-green-200">
                Grand Total
              </td>
              {members.map((member, idx) => {
                const memberInvTotal = getMemberTotal(member.id, 'investment');
                const memberMktTotal = getMemberTotal(member.id, 'market');
                return (
                  <React.Fragment key={`total-${member.id}`}>
                    <td className="px-2 py-3 text-right">
                      <span className="text-xs text-green-700">
                        {formatCurrency(memberInvTotal)}
                      </span>
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
                <span className="text-sm text-green-800">
                  {formatCurrency(grandTotalInvestment)}
                </span>
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
