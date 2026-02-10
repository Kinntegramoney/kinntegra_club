import React from "react";
import { User, Home, Car, CreditCard, GraduationCap, Building, Coins, AlertCircle } from "lucide-react";

// Liability categories with icons
const LIABILITY_CATEGORIES = [
  { value: "home_loan", label: "Home Loan", icon: Home },
  { value: "vehicle_loan", label: "Vehicle Loan", icon: Car },
  { value: "personal_loan", label: "Personal Loan", icon: CreditCard },
  { value: "consumer_durable", label: "Consumer Durable", icon: Building },
  { value: "education_loan", label: "Education Loan", icon: GraduationCap },
  { value: "credit_card", label: "Credit Card", icon: CreditCard },
  { value: "other_loan", label: "Other Loan", icon: Coins }
];

export default function LiabilitySection({ family, isReadOnly }) {
  const members = family?.members || [];
  const expenseDetails = family?.expense_details || [];
  const dedicatedLiabilities = family?.liabilities || family?.liability_details || [];

  // Extract loan EMI entries from expenses and combine with dedicated liabilities
  const getAllLiabilities = () => {
    const liabilitiesMap = {};
    
    // Initialize categories
    LIABILITY_CATEGORIES.forEach(cat => {
      liabilitiesMap[cat.value] = {};
      members.forEach(m => {
        liabilitiesMap[cat.value][m.id] = { monthly_emi: 0, remaining: 0, outstanding: 0 };
      });
    });

    // Process expense details (loan EMIs)
    expenseDetails.forEach(exp => {
      if (exp.expense_type?.includes('loan') || exp.expense_type?.includes('emi')) {
        const category = exp.expense_type || 'other_loan';
        const memberIds = exp.member_ids || [];
        const isFamilyExpense = memberIds.includes('family') || memberIds.length === 0;
        
        const emi = parseFloat(exp.details?.monthly_emi) || parseFloat(exp.monthly_emi) || 0;
        const remaining = parseInt(exp.details?.num_installments) || parseInt(exp.num_installments) || 0;
        const outstanding = parseFloat(exp.details?.outstanding) || parseFloat(exp.amount_today) || emi * remaining;
        
        if (isFamilyExpense) {
          // Distribute family expense among all members
          members.forEach(m => {
            if (liabilitiesMap[category]?.[m.id]) {
              liabilitiesMap[category][m.id].monthly_emi += emi / members.length;
              liabilitiesMap[category][m.id].remaining = Math.max(liabilitiesMap[category][m.id].remaining, remaining);
              liabilitiesMap[category][m.id].outstanding += outstanding / members.length;
            }
          });
        } else {
          memberIds.forEach(mid => {
            if (liabilitiesMap[category]?.[mid]) {
              liabilitiesMap[category][mid].monthly_emi += emi;
              liabilitiesMap[category][mid].remaining = Math.max(liabilitiesMap[category][mid].remaining, remaining);
              liabilitiesMap[category][mid].outstanding += outstanding;
            }
          });
        }
      }
    });

    // Process dedicated liabilities
    dedicatedLiabilities.forEach(lib => {
      const category = lib.category || 'other_loan';
      const memberIds = lib.member_ids || [];
      
      const emi = parseFloat(lib.monthly_emi) || parseFloat(lib.emi_amount) || 0;
      const remaining = parseInt(lib.num_installments) || parseInt(lib.remaining_installments) || 0;
      const outstanding = parseFloat(lib.amount_today) || parseFloat(lib.outstanding_amount) || emi * remaining;
      
      memberIds.forEach(mid => {
        if (liabilitiesMap[category]?.[mid]) {
          liabilitiesMap[category][mid].monthly_emi += emi;
          liabilitiesMap[category][mid].remaining = Math.max(liabilitiesMap[category][mid].remaining, remaining);
          liabilitiesMap[category][mid].outstanding += outstanding;
        }
      });
    });

    return liabilitiesMap;
  };

  const liabilitiesMap = getAllLiabilities();

  const formatCurrency = (value) => {
    if (!value || value === 0) return "-";
    const absValue = Math.abs(value);
    if (absValue >= 10000000) return `${(absValue / 10000000).toFixed(2)} Cr`;
    if (absValue >= 100000) return `${(absValue / 100000).toFixed(2)} L`;
    return absValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  // Calculate totals
  const getMemberTotal = (memberId, field) => {
    return LIABILITY_CATEGORIES.reduce((sum, cat) => {
      return sum + (liabilitiesMap[cat.value]?.[memberId]?.[field] || 0);
    }, 0);
  };

  const getGrandTotal = (field) => {
    return members.reduce((sum, m) => sum + getMemberTotal(m.id, field), 0);
  };

  const getCategoryTotal = (category, field) => {
    return members.reduce((sum, m) => sum + (liabilitiesMap[category]?.[m.id]?.[field] || 0), 0);
  };

  const grandTotalOutstanding = getGrandTotal('outstanding');
  const grandTotalEMI = getGrandTotal('monthly_emi');

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-red-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Members tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      {grandTotalOutstanding > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <div>
              <span className="text-sm text-red-600 font-medium">Total Outstanding Liabilities</span>
              <p className="text-xs text-red-500">Monthly EMI: ₹{formatCurrency(grandTotalEMI)}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-red-700">₹{formatCurrency(grandTotalOutstanding)}</div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 px-1">
        Summary of loan liabilities from Expenses section by family member. To add/modify, go to Expenses tab.
      </div>

      {/* Liabilities Table - Matching Assets Style */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            {/* Member Names Row */}
            <tr className="bg-red-50 border-b border-gray-200">
              <th rowSpan={2} className="text-left text-xs font-semibold text-gray-700 px-4 py-2 border-r border-gray-200 min-w-[180px]">
                Loan Type
              </th>
              {members.map((member, idx) => (
                <th 
                  key={member.id} 
                  colSpan={2} 
                  className={`text-center text-xs font-semibold text-red-700 px-2 py-2 ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <User className="h-3 w-3" />
                    {member.name}
                    {member.is_primary && <span className="text-red-500">*</span>}
                  </div>
                </th>
              ))}
              <th colSpan={2} className="text-center text-xs font-semibold text-red-800 px-2 py-2 bg-red-100 border-l border-gray-200">
                Total
              </th>
            </tr>
            {/* Sub-headers Row */}
            <tr className="bg-gray-50 border-b border-gray-200">
              {members.map((member, idx) => (
                <React.Fragment key={`sub-${member.id}`}>
                  <th className="text-right text-[10px] font-medium text-gray-500 px-2 py-1.5 w-24">
                    EMI/Month
                  </th>
                  <th className={`text-right text-[10px] font-medium text-gray-500 px-2 py-1.5 w-24 ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}>
                    Outstanding
                  </th>
                </React.Fragment>
              ))}
              <th className="text-right text-[10px] font-medium text-red-600 px-2 py-1.5 w-24 bg-red-50 border-l border-gray-200">
                EMI/Month
              </th>
              <th className="text-right text-[10px] font-medium text-red-600 px-2 py-1.5 w-24 bg-red-50">
                Outstanding
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {LIABILITY_CATEGORIES.map(category => {
              const Icon = category.icon;
              const rowTotalEMI = getCategoryTotal(category.value, 'monthly_emi');
              const rowTotalOutstanding = getCategoryTotal(category.value, 'outstanding');
              const hasValues = rowTotalEMI > 0 || rowTotalOutstanding > 0;
              
              if (!hasValues) return null; // Hide empty rows
              
              return (
                <tr key={category.value} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-gray-800">
                        {category.label}
                      </span>
                    </div>
                  </td>
                  {members.map((member, idx) => {
                    const emi = liabilitiesMap[category.value]?.[member.id]?.monthly_emi || 0;
                    const outstanding = liabilitiesMap[category.value]?.[member.id]?.outstanding || 0;
                    return (
                      <React.Fragment key={`${category.value}-${member.id}`}>
                        <td className="px-2 py-2.5 text-right">
                          <span className="text-xs text-gray-700">
                            {emi > 0 ? formatCurrency(emi) : '-'}
                          </span>
                        </td>
                        <td className={`px-2 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                          <span className="text-xs text-red-600">
                            {outstanding > 0 ? formatCurrency(outstanding) : '-'}
                          </span>
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="px-2 py-2.5 text-right bg-red-50/50 border-l border-gray-200">
                    <span className="text-xs font-medium text-red-700">
                      {rowTotalEMI > 0 ? formatCurrency(rowTotalEMI) : '-'}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right bg-red-50/50">
                    <span className="text-xs font-semibold text-red-700">
                      {rowTotalOutstanding > 0 ? formatCurrency(rowTotalOutstanding) : '-'}
                    </span>
                  </td>
                </tr>
              );
            })}
            
            {/* Grand Total Row */}
            <tr className="bg-red-100 font-semibold">
              <td className="px-4 py-3 text-sm text-red-800 border-r border-red-200">
                Grand Total
              </td>
              {members.map((member, idx) => {
                const memberEMI = getMemberTotal(member.id, 'monthly_emi');
                const memberOutstanding = getMemberTotal(member.id, 'outstanding');
                return (
                  <React.Fragment key={`total-${member.id}`}>
                    <td className="px-2 py-3 text-right">
                      <span className="text-xs text-red-700">
                        {memberEMI > 0 ? formatCurrency(memberEMI) : '-'}
                      </span>
                    </td>
                    <td className={`px-2 py-3 text-right ${idx < members.length - 1 ? 'border-r border-red-200' : ''}`}>
                      <span className="text-xs text-red-700">
                        {memberOutstanding > 0 ? formatCurrency(memberOutstanding) : '-'}
                      </span>
                    </td>
                  </React.Fragment>
                );
              })}
              <td className="px-2 py-3 text-right bg-red-200/50 border-l border-red-200">
                <span className="text-sm text-red-800">
                  {formatCurrency(grandTotalEMI)}
                </span>
              </td>
              <td className="px-2 py-3 text-right bg-red-200/50">
                <span className="text-sm text-red-800">
                  {formatCurrency(grandTotalOutstanding)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {grandTotalOutstanding === 0 && (
        <div className="text-center py-8 text-gray-500">
          <CreditCard className="h-10 w-10 mx-auto text-gray-300 mb-2" />
          <p>No liabilities recorded</p>
          <p className="text-xs mt-1">Add loan EMI entries in the Expenses tab to see them here.</p>
        </div>
      )}

      {/* Legend */}
      <div className="text-xs text-gray-500 px-1">
        * Primary member
      </div>
    </div>
  );
}
