import React from "react";
import { User, Shield, Heart, Umbrella, Car, Home, Briefcase } from "lucide-react";

// Insurance categories for display
const INSURANCE_CATEGORIES = [
  { value: "term_life", label: "Term Life Insurance", icon: Shield },
  { value: "health", label: "Health Insurance", icon: Heart },
  { value: "critical_illness", label: "Critical Illness", icon: Heart },
  { value: "personal_accident", label: "Personal Accident", icon: Umbrella },
  { value: "motor", label: "Motor Insurance", icon: Car },
  { value: "home_insurance", label: "Home Insurance", icon: Home },
  { value: "professional", label: "Professional Indemnity", icon: Briefcase }
];

export default function InsuranceSection({ family }) {
  const members = family?.members || [];
  const existingInsurance = family?.insurance_details || [];
  const insurancePremiums = family?.insurance_premiums || [];
  const incomeDetails = family?.income_details || [];

  // Get annual income for a member from income_details
  const getMemberAnnualIncome = (memberId) => {
    // Sum up annual income from salary and other income sources
    const memberIncomes = incomeDetails.filter(
      income => income.member_ids?.includes(memberId)
    );
    
    let totalAnnual = 0;
    memberIncomes.forEach(income => {
      const details = income.details || {};
      
      // Salary income (net_income_yearly)
      if (income.category === 'salary') {
        totalAnnual += parseFloat(details.net_income_yearly) || (parseFloat(details.net_income_monthly) * 12) || 0;
      }
      // Business income (net_income_yearly)
      else if (income.category === 'business') {
        totalAnnual += parseFloat(details.net_income_yearly) || 0;
      }
      // Rental income
      else if (income.category === 'rental' && details.is_on_rent === 'Yes') {
        totalAnnual += parseFloat(details.annual_rent) || 0;
      }
      // Pension income
      else if (income.category === 'pension') {
        totalAnnual += parseFloat(details.amount_yearly) || 0;
      }
    });
    
    return totalAnnual;
  };

  // Get actual cover for a specific member and category
  const getActualCover = (memberId, categoryValue) => {
    const policies = existingInsurance.filter(
      ins => ins.category === categoryValue && ins.member_ids?.includes(memberId)
    );
    
    return policies.reduce((sum, ins) => {
      return sum + (parseFloat(ins.coverage_amount) || parseFloat(ins.sum_assured) || 0);
    }, 0);
  };

  // Get suggested cover for a member and category based on new rules
  const getSuggestedCover = (member, categoryValue, termLifeCover = 0) => {
    const annualIncome = getMemberAnnualIncome(member.id);
    
    switch (categoryValue) {
      case 'term_life':
        // Term Life - 20x annual income
        return annualIncome * 20;
      
      case 'health':
        // Health Insurance - 3x annual income
        return annualIncome * 3;
      
      case 'critical_illness':
        // Critical Illness - 3x annual income
        return annualIncome * 3;
      
      case 'personal_accident':
        // Personal Accident - 20% of Term Life cover
        const termCover = termLifeCover || (annualIncome * 20);
        return termCover * 0.2;
      
      case 'professional':
        // Professional Indemnity - 10x annual income
        return annualIncome * 10;
      
      case 'motor':
        // Motor Insurance - Market value of vehicles
        const vehicleIncomes = incomeDetails.filter(
          income => income.category === 'vehicle' && income.member_ids?.includes(member.id)
        );
        return vehicleIncomes.reduce((sum, income) => {
          return sum + (parseFloat(income.details?.market_value) || 0);
        }, 0);
      
      case 'home_insurance':
        // Home Insurance - Market value of rental properties
        const propertyIncomes = incomeDetails.filter(
          income => income.category === 'rental' && income.member_ids?.includes(member.id)
        );
        return propertyIncomes.reduce((sum, income) => {
          return sum + (parseFloat(income.details?.market_value) || 0);
        }, 0);
      
      default:
        return 0;
    }
  };

  // Calculate totals for a member
  const getMemberTotals = (memberId) => {
    const member = members.find(m => m.id === memberId);
    let suggestedTotal = 0;
    let actualTotal = 0;
    
    // First calculate term life for personal accident calculation
    const termLifeSuggested = getSuggestedCover(member, 'term_life');
    
    INSURANCE_CATEGORIES.forEach(cat => {
      suggestedTotal += getSuggestedCover(member, cat.value, termLifeSuggested);
      actualTotal += getActualCover(memberId, cat.value);
    });
    
    return { suggested: suggestedTotal, actual: actualTotal };
  };

  // Calculate grand totals
  const getGrandTotals = () => {
    let suggestedTotal = 0;
    let actualTotal = 0;
    
    members.forEach(member => {
      const totals = getMemberTotals(member.id);
      suggestedTotal += totals.suggested;
      actualTotal += totals.actual;
    });
    
    return { suggested: suggestedTotal, actual: actualTotal };
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === 0) return '-';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)} L`;
    return `₹${value.toLocaleString('en-IN')}`;
  };

  // Get coverage status
  const getCoverageStatus = (suggested, actual) => {
    if (suggested === 0) return 'neutral';
    if (actual >= suggested) return 'adequate';
    if (actual >= suggested * 0.5) return 'partial';
    return 'insufficient';
  };

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <User className="h-10 w-10 text-teal-500 mb-3" />
        <h3 className="text-base font-medium text-gray-700 mb-1">No Family Members</h3>
        <p className="text-gray-500 text-sm">Add members in Introduction tab first.</p>
      </div>
    );
  }

  const grandTotals = getGrandTotals();

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
        <span className="text-sm text-teal-600 font-medium">Insurance Coverage Summary</span>
        <span className="text-xs text-gray-500">Compare suggested vs actual coverage per member</span>
      </div>

      {/* Rules Info */}
      <div className="text-xs text-gray-500 px-1 space-y-1">
        <p>Suggested cover based on annual income & assets:</p>
        <p className="text-[10px] text-gray-400">
          Term Life: 20× income | Health: 3× income | Critical Illness: 3× income | Personal Accident: 20% of Term Life | Professional: 10× income | Motor: Vehicle value | Home: Property value
        </p>
      </div>

      {/* Insurance Coverage Table with Member Columns */}
      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            {/* Member Names Row */}
            <tr className="bg-teal-50 border-b border-gray-200">
              <th rowSpan={2} className="text-left text-xs font-semibold text-gray-700 px-4 py-2 border-r border-gray-200 min-w-[180px]">
                Insurance Type
              </th>
              {members.map((member, idx) => (
                <th 
                  key={member.id} 
                  colSpan={2} 
                  className={`text-center text-xs font-semibold text-teal-700 px-3 py-2 ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {member.name}
                      {member.is_primary && <span className="text-teal-500">*</span>}
                    </div>
                    <span className="text-[9px] text-gray-400 font-normal">
                      Income: {formatCurrency(getMemberAnnualIncome(member.id))}/yr
                    </span>
                  </div>
                </th>
              ))}
            </tr>
            {/* Sub-headers Row */}
            <tr className="bg-gray-50 border-b border-gray-200">
              {members.map((member, idx) => (
                <React.Fragment key={`sub-${member.id}`}>
                  <th className="text-right text-[10px] font-medium text-gray-500 px-3 py-1.5 min-w-[100px]">
                    Suggested
                  </th>
                  <th className={`text-right text-[10px] font-medium text-gray-500 px-3 py-1.5 min-w-[100px] ${idx < members.length - 1 ? 'border-r border-gray-200' : ''}`}>
                    Actual
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {INSURANCE_CATEGORIES.map(category => {
              const Icon = category.icon;
              
              // Check if any member has values for this category
              let hasValues = false;
              members.forEach(m => {
                const termLifeSuggested = getSuggestedCover(m, 'term_life');
                const suggested = getSuggestedCover(m, category.value, termLifeSuggested);
                const actual = getActualCover(m.id, category.value);
                if (suggested > 0 || actual > 0) hasValues = true;
              });
              
              return (
                <tr key={category.value} className={`hover:bg-gray-50 ${hasValues ? '' : 'text-gray-400'}`}>
                  <td className="px-4 py-2.5 border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${hasValues ? 'text-teal-600' : 'text-gray-300'}`} />
                      <span className={`text-sm ${hasValues ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
                        {category.label}
                      </span>
                    </div>
                  </td>
                  {members.map((member, idx) => {
                    const termLifeSuggested = getSuggestedCover(member, 'term_life');
                    const suggested = getSuggestedCover(member, category.value, termLifeSuggested);
                    const actual = getActualCover(member.id, category.value);
                    const cellStatus = getCoverageStatus(suggested, actual);
                    
                    return (
                      <React.Fragment key={`${category.value}-${member.id}`}>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-xs font-mono ${suggested > 0 ? 'text-gray-500' : 'text-gray-300'}`}>
                            {formatCurrency(suggested)}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right ${idx < members.length - 1 ? 'border-r border-gray-100' : ''}`}>
                          <span className={`text-xs font-mono font-medium ${
                            cellStatus === 'adequate' ? 'text-green-600' :
                            cellStatus === 'partial' ? 'text-amber-600' :
                            cellStatus === 'insufficient' ? 'text-red-500' :
                            'text-gray-300'
                          }`}>
                            {formatCurrency(actual)}
                          </span>
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Coverage Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500"></span> Adequate
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span> Partial
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500"></span> Insufficient
        </span>
      </div>
    </div>
  );
}
