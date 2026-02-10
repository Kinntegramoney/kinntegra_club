import React from "react";
import { User, Home, Car, CreditCard, GraduationCap, Building, Coins, AlertCircle } from "lucide-react";

// Liability categories
const LIABILITY_CATEGORIES = {
  home_loan: { label: "Home Loan", icon: Home },
  vehicle_loan: { label: "Vehicle Loan", icon: Car },
  personal_loan: { label: "Personal Loan", icon: CreditCard },
  consumer_durable: { label: "Consumer Durable", icon: Building },
  education_loan: { label: "Education Loan", icon: GraduationCap },
  credit_card: { label: "Credit Card", icon: CreditCard },
  other_loan: { label: "Other Loan", icon: Coins }
};

export default function LiabilitySection({ family, isReadOnly }) {
  const members = family?.members || [];
  const expenseDetails = family?.expense_details || [];
  
  // Extract loan EMI entries from expenses
  const liabilities = expenseDetails.filter(exp => exp.expense_type?.includes('loan') || exp.expense_type?.includes('emi'));
  
  // Also check the dedicated liabilities array
  const dedicatedLiabilities = family?.liabilities || family?.liability_details || [];

  // Combine both sources
  const allLiabilities = [
    ...liabilities.map(lib => ({
      id: lib.id,
      category: lib.expense_type,
      member_ids: lib.member_ids || [],
      monthly_emi: parseFloat(lib.details?.monthly_emi) || parseFloat(lib.monthly_emi) || 0,
      num_installments: parseInt(lib.details?.num_installments) || parseInt(lib.num_installments) || 0,
      outstanding: parseFloat(lib.details?.outstanding) || parseFloat(lib.amount_today) || 
                   (parseFloat(lib.details?.monthly_emi) || 0) * (parseInt(lib.details?.num_installments) || 0),
      annual_amount: parseFloat(lib.annual_amount) || (parseFloat(lib.details?.monthly_emi) || 0) * 12
    })),
    ...dedicatedLiabilities.map(lib => ({
      id: lib.id,
      category: lib.category,
      member_ids: lib.member_ids || [],
      monthly_emi: parseFloat(lib.monthly_emi) || parseFloat(lib.emi_amount) || 0,
      num_installments: parseInt(lib.num_installments) || parseInt(lib.remaining_installments) || 0,
      outstanding: parseFloat(lib.amount_today) || parseFloat(lib.outstanding_amount) || 0,
      annual_amount: (parseFloat(lib.monthly_emi) || parseFloat(lib.emi_amount) || 0) * 12
    }))
  ];

  const formatCurrency = (value) => {
    if (!value || value === 0) return "₹0";
    const absValue = Math.abs(value);
    if (absValue >= 10000000) return `₹${(absValue / 10000000).toFixed(2)} Cr`;
    if (absValue >= 100000) return `₹${(absValue / 100000).toFixed(2)} L`;
    return `₹${absValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const getMemberName = (memberIds) => {
    if (!memberIds || memberIds.length === 0) return 'Family';
    if (memberIds.includes('family')) return 'Family';
    return memberIds.map(id => members.find(m => m.id === id)?.name || '').filter(Boolean).join(', ') || 'Family';
  };

  const getCategoryLabel = (category) => {
    return LIABILITY_CATEGORIES[category]?.label || category?.replace(/_/g, ' ') || 'Loan';
  };

  const getCategoryIcon = (category) => {
    return LIABILITY_CATEGORIES[category]?.icon || CreditCard;
  };

  // Calculate totals
  const totalOutstanding = allLiabilities.reduce((sum, lib) => sum + (lib.outstanding || 0), 0);
  const totalMonthlyEMI = allLiabilities.reduce((sum, lib) => sum + (lib.monthly_emi || 0), 0);
  const totalAnnualEMI = allLiabilities.reduce((sum, lib) => sum + (lib.annual_amount || 0), 0);

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-red-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Members tab first.</p>
      </div>
    );
  }

  if (allLiabilities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <CreditCard className="h-10 w-10 text-gray-300 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Liabilities</h3>
        <p className="text-gray-500 text-sm">Add loan EMI entries in the Expenses tab to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <div>
            <h3 className="font-medium text-red-800">Total Outstanding Liabilities</h3>
            <p className="text-xs text-red-600">
              Monthly EMI: {formatCurrency(totalMonthlyEMI)} | Annual: {formatCurrency(totalAnnualEMI)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-red-700">{formatCurrency(totalOutstanding)}</div>
        </div>
      </div>

      {/* Info Note */}
      <div className="text-xs text-gray-500 px-1">
        This section displays loan EMIs entered in the Expenses tab. To add or modify liabilities, go to the Expenses tab.
      </div>

      {/* Liability Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left text-xs font-medium text-gray-600 px-4 py-2">Loan Type</th>
              <th className="text-left text-xs font-medium text-gray-600 px-4 py-2">Member</th>
              <th className="text-right text-xs font-medium text-gray-600 px-4 py-2">Monthly EMI</th>
              <th className="text-right text-xs font-medium text-gray-600 px-4 py-2">Remaining</th>
              <th className="text-right text-xs font-medium text-gray-600 px-4 py-2">Outstanding</th>
              <th className="text-right text-xs font-medium text-gray-600 px-4 py-2">Annual EMI</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {allLiabilities.map((lib) => {
              const Icon = getCategoryIcon(lib.category);
              return (
                <tr key={lib.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-gray-800">{getCategoryLabel(lib.category)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-600">{getMemberName(lib.member_ids)}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm text-gray-700">{formatCurrency(lib.monthly_emi)}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm text-gray-600">{lib.num_installments || '-'} months</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm font-medium text-red-600">{formatCurrency(lib.outstanding)}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm text-gray-700">{formatCurrency(lib.annual_amount)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-red-50 font-semibold">
              <td className="px-4 py-2 text-sm text-red-800" colSpan={2}>Total</td>
              <td className="px-4 py-2 text-right text-sm text-red-700">{formatCurrency(totalMonthlyEMI)}</td>
              <td className="px-4 py-2 text-right text-sm text-red-600">-</td>
              <td className="px-4 py-2 text-right text-sm text-red-700">{formatCurrency(totalOutstanding)}</td>
              <td className="px-4 py-2 text-right text-sm text-red-700">{formatCurrency(totalAnnualEMI)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Category Summary */}
      {allLiabilities.length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Summary by Loan Type</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(
              allLiabilities.reduce((acc, lib) => {
                const cat = lib.category || 'other_loan';
                if (!acc[cat]) acc[cat] = { outstanding: 0, emi: 0 };
                acc[cat].outstanding += lib.outstanding || 0;
                acc[cat].emi += lib.monthly_emi || 0;
                return acc;
              }, {})
            ).map(([cat, totals]) => {
              const Icon = getCategoryIcon(cat);
              return (
                <div key={cat} className="bg-red-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-red-500" />
                    <span className="text-xs font-medium text-gray-600">{getCategoryLabel(cat)}</span>
                  </div>
                  <div className="text-sm font-semibold text-red-700">{formatCurrency(totals.outstanding)}</div>
                  <div className="text-[10px] text-red-500">EMI: {formatCurrency(totals.emi)}/month</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
