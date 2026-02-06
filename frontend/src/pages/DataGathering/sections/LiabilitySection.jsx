import React from "react";
import { User, Home, Car, CreditCard, GraduationCap, Building, Coins } from "lucide-react";

// Liability categories for display
const LIABILITY_CATEGORIES = [
  { value: "home_loan", label: "Home Loan", icon: Home },
  { value: "vehicle_loan", label: "Vehicle Loan", icon: Car },
  { value: "personal_loan", label: "Personal Loan", icon: CreditCard },
  { value: "consumer_durable", label: "Consumer Durable", icon: Building },
  { value: "education_loan", label: "Education Loan", icon: GraduationCap },
  { value: "credit_card", label: "Credit Card", icon: CreditCard },
  { value: "other_loan", label: "Other Loan", icon: Coins }
];

export default function LiabilitySection({ family }) {
  const members = family?.members || [];
  const existingLiabilities = family?.liability_details || [];

  // Get outstanding amount for a specific member and category
  const getOutstandingAmount = (memberId, categoryValue) => {
    const liabilities = existingLiabilities.filter(
      lib => lib.category === categoryValue && lib.member_ids?.includes(memberId)
    );
    
    return liabilities.reduce((sum, lib) => {
      // Calculate from EMI × Installments if available, otherwise use amount_today
      const emi = parseFloat(lib.monthly_emi) || 0;
      const installments = parseFloat(lib.num_installments) || 0;
      const calculated = emi * installments;
      
      if (calculated > 0) {
        return sum + calculated;
      }
      // Fallback to amount_today for backward compatibility
      return sum + (parseFloat(lib.amount_today) || 0);
    }, 0);
  };

  // Calculate total for a member
  const getMemberTotal = (memberId) => {
    return LIABILITY_CATEGORIES.reduce((sum, cat) => {
      return sum + getOutstandingAmount(memberId, cat.value);
    }, 0);
  };

  // Calculate grand total
  const getGrandTotal = () => {
    return members.reduce((sum, member) => {
      return sum + getMemberTotal(member.id);
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
        <User className="h-10 w-10 text-red-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const grandTotal = getGrandTotal();

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      {grandTotal > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <span className="text-sm text-red-600 font-medium">Total Outstanding Liabilities</span>
          <div className="font-semibold text-red-700">{formatCurrency(grandTotal)}</div>
        </div>
      )}

      <div className="text-xs text-gray-500 px-1">
        Summary of outstanding loan amounts by family member.
      </div>

      {/* Liabilities Summary Table with Member Columns */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            {/* Member Names Row */}
            <tr className="bg-red-50 border-b border-gray-200">
              <th rowSpan={2} className="text-left text-xs font-semibold text-gray-700 px-4 py-2 border-r border-gray-200 min-w-[180px]">
                Particulars
              </th>
              {members.map((member, idx) => (
                <th 
                  key={member.id} 
                  className={`text-center text-xs font-semibold text-red-700 px-4 py-2 ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <User className="h-3 w-3" />
                    {member.name}
                    {member.is_primary && <span className="text-red-500">*</span>}
                  </div>
                </th>
              ))}
              <th className="text-center text-xs font-semibold text-red-800 px-4 py-2 bg-red-100 border-l border-gray-200">
                Total
              </th>
            </tr>
            {/* Sub-headers Row */}
            <tr className="bg-gray-50 border-b border-gray-200">
              {members.map((member, idx) => (
                <th 
                  key={`sub-${member.id}`} 
                  className={`text-right text-[10px] font-medium text-gray-500 px-4 py-1.5 ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}
                >
                  Outstanding
                </th>
              ))}
              <th className="text-right text-[10px] font-medium text-red-600 px-4 py-1.5 bg-red-50 border-l border-gray-200">
                Outstanding
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {LIABILITY_CATEGORIES.map(category => {
              const Icon = category.icon;
              
              // Calculate row total
              const rowTotal = members.reduce((sum, m) => sum + getOutstandingAmount(m.id, category.value), 0);
              const hasValues = rowTotal > 0;
              
              return (
                <tr key={category.value} className={`hover:bg-gray-50 ${hasValues ? '' : 'text-gray-400'}`}>
                  <td className="px-4 py-2.5 border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${hasValues ? 'text-red-600' : 'text-gray-300'}`} />
                      <span className={`text-sm ${hasValues ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
                        {category.label}
                      </span>
                    </div>
                  </td>
                  {members.map((member, idx) => {
                    const outstanding = getOutstandingAmount(member.id, category.value);
                    return (
                      <td 
                        key={`${category.value}-${member.id}`} 
                        className={`px-4 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}
                      >
                        <span className={`text-xs ${outstanding > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                          {formatCurrency(outstanding)}
                        </span>
                      </td>
                    );
                  })}
                  {/* Row Total */}
                  <td className="px-4 py-2.5 text-right bg-red-50/50 border-l border-gray-100">
                    <span className={`text-xs font-medium ${rowTotal > 0 ? 'text-red-700' : 'text-gray-300'}`}>
                      {formatCurrency(rowTotal)}
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
                const memberTotal = getMemberTotal(member.id);
                return (
                  <td 
                    key={`total-${member.id}`} 
                    className={`px-4 py-3 text-right ${idx < members.length - 1 ? 'border-r border-red-200' : ''}`}
                  >
                    <span className="text-xs text-red-700">
                      {formatCurrency(memberTotal)}
                    </span>
                  </td>
                );
              })}
              <td className="px-4 py-3 text-right bg-red-200/50 border-l border-red-200">
                <span className="text-sm text-red-800">
                  {formatCurrency(grandTotal)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
