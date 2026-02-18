import React from "react";

/**
 * Horizontal Payment Timeline Component
 * Displays payment milestones as a subtle horizontal timeline with alternating nodes
 */

// Color palette for timeline segments (muted, subtle colors)
const COLORS = [
  { bg: 'bg-amber-300/70', border: 'border-amber-400', text: 'text-amber-700', fill: '#fbbf24' },
  { bg: 'bg-orange-300/70', border: 'border-orange-400', text: 'text-orange-700', fill: '#f97316' },
  { bg: 'bg-rose-300/70', border: 'border-rose-400', text: 'text-rose-700', fill: '#fb7185' },
  { bg: 'bg-pink-300/70', border: 'border-pink-400', text: 'text-pink-700', fill: '#f472b6' },
  { bg: 'bg-purple-300/70', border: 'border-purple-400', text: 'text-purple-700', fill: '#a78bfa' },
  { bg: 'bg-indigo-300/70', border: 'border-indigo-400', text: 'text-indigo-700', fill: '#818cf8' },
  { bg: 'bg-teal-300/70', border: 'border-teal-400', text: 'text-teal-700', fill: '#5eead4' },
];

// Paid color (subtle green)
const PAID_COLOR = { bg: 'bg-emerald-300/70', border: 'border-emerald-400', text: 'text-emerald-700', fill: '#6ee7b7' };

// Currency symbols
const CURRENCY_SYMBOLS = {
  AED: 'AED',
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SGD: 'S$'
};

/**
 * HorizontalPaymentTimeline
 * @param {Array} milestones - Array of { date, description, percentage, amount, isPaid }
 * @param {number} totalAmount - Total investment amount (for calculating share values)
 * @param {boolean} compact - Show compact version for opportunity cards
 * @param {boolean} showShareValues - Show share values based on sharePercent
 * @param {number} sharePercent - Share percentage (25, 50, 75, 100) default 25%
 * @param {string} currency - Currency code to display amounts in (default: AED)
 * @param {number} conversionRate - Conversion rate from AED to selected currency
 * @param {boolean} showConsolidated - Show consolidated view with grouped payments
 */
export default function HorizontalPaymentTimeline({ 
  milestones = [], 
  totalAmount = 0, 
  compact = false,
  showShareValues = false,
  sharePercent = 25,
  currency = "AED",
  conversionRate = 1,
  className = "",
  showConsolidated = false
}) {
  if (!milestones || milestones.length === 0) return null;
  
  // Sort milestones by date
  const sortedMilestones = [...milestones].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Get currency symbol
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;
  
  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`;
  };
  
  // Format amount with commas (absolute values)
  const formatAmount = (amount, showSymbol = true, abbreviated = false) => {
    const convertedAmount = amount * conversionRate;
    let formatted;
    
    if (abbreviated) {
      // Abbreviated format for very compact display
      if (convertedAmount >= 10000000) {
        formatted = `${(convertedAmount / 10000000).toFixed(2)}Cr`;
      } else if (convertedAmount >= 100000) {
        formatted = `${(convertedAmount / 100000).toFixed(2)}L`;
      } else if (convertedAmount >= 1000) {
        formatted = `${(convertedAmount / 1000).toFixed(1)}K`;
      } else {
        formatted = Math.round(convertedAmount).toLocaleString('en-IN');
      }
    } else {
      // Full format with commas
      formatted = Math.round(convertedAmount).toLocaleString('en-IN');
    }
    
    return showSymbol ? `${currencySymbol} ${formatted}` : formatted;
  };
  
  // Calculate share value based on share percentage
  const getShareValue = (percentage) => {
    if (!totalAmount) return null;
    const fullAmount = (percentage / 100) * totalAmount;
    const shareAmount = fullAmount * (sharePercent / 100);
    return shareAmount;
  };
  
  if (compact) {
    // Compact version for opportunity cards - subtle horizontal bar with visible dates
    return (
      <div className={`w-full ${className}`}>
        {/* Date labels row - above timeline */}
        <div className="flex mb-1">
          {sortedMilestones.map((milestone, idx) => (
            <div 
              key={idx} 
              className="flex-1 text-center"
              style={{ width: `${100 / sortedMilestones.length}%` }}
            >
              <p className={`text-[8px] ${milestone.isPaid ? 'text-emerald-600' : 'text-gray-400'}`}>
                {formatDate(milestone.date)}
              </p>
            </div>
          ))}
        </div>
        
        <div className="flex items-center h-6">
          {/* Timeline bar */}
          <div className="flex-1 flex items-center h-1.5 relative rounded-full bg-gray-100">
            {sortedMilestones.map((milestone, idx) => {
              const color = milestone.isPaid ? PAID_COLOR : COLORS[idx % COLORS.length];
              const isFirst = idx === 0;
              const isLast = idx === sortedMilestones.length - 1;
              const width = `${100 / sortedMilestones.length}%`;
              
              return (
                <div 
                  key={idx} 
                  className="relative flex items-center"
                  style={{ width }}
                >
                  {/* Segment */}
                  <div 
                    className={`h-1.5 w-full ${color.bg} ${isFirst ? 'rounded-l-full' : ''} ${isLast ? 'rounded-r-full' : ''}`}
                  />
                  
                  {/* Node marker - smaller and subtler */}
                  <div 
                    className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border ${color.border} bg-white shadow-sm z-10`}
                  >
                    {milestone.isPaid && (
                      <div className="w-full h-full rounded-full bg-emerald-400/50"></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Percentage and amount labels row - below timeline */}
        <div className="flex mt-0.5">
          {sortedMilestones.map((milestone, idx) => (
            <div 
              key={idx} 
              className="flex-1 text-center"
              style={{ width: `${100 / sortedMilestones.length}%` }}
            >
              <p className={`text-[9px] font-medium ${milestone.isPaid ? 'text-emerald-600' : COLORS[idx % COLORS.length].text}`}>
                {milestone.percentage}%
              </p>
              {showShareValues && totalAmount > 0 && (
                <p className="text-[8px] text-gray-500 truncate" title={formatAmount(getShareValue(milestone.percentage), true)}>
                  {formatAmount(getShareValue(milestone.percentage), false, true)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // Full version with alternating nodes above/below
  return (
    <div className={`w-full py-4 ${className}`}>
      <div className="relative">
        {/* Top row info (odd indexes) */}
        <div className="flex mb-8">
          {sortedMilestones.map((milestone, idx) => {
            if (idx % 2 !== 0) return <div key={idx} style={{ width: `${100 / sortedMilestones.length}%` }} />;
            
            const color = milestone.isPaid ? PAID_COLOR : COLORS[idx % COLORS.length];
            const hasPartialPayment = showConsolidated && milestone.paidAmount > 0 && milestone.unpaidAmount > 0;
            
            return (
              <div key={idx} className="flex flex-col items-center" style={{ width: `${100 / sortedMilestones.length}%` }}>
                {/* Circle with date */}
                <div className={`w-14 h-14 rounded-full border-2 ${color.border} bg-white flex items-center justify-center shadow-sm relative`}>
                  <span className={`text-xs font-bold ${color.text}`}>
                    {formatDate(milestone.date)}
                  </span>
                  {/* Badge for payment count in consolidated view */}
                  {showConsolidated && milestone.paymentCount > 1 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-700 text-white text-[9px] font-bold flex items-center justify-center">
                      {milestone.paymentCount}
                    </span>
                  )}
                </div>
                
                {/* Title and description */}
                <div className="mt-2 text-center max-w-[100px]">
                  {showConsolidated ? (
                    <>
                      <p className={`text-xs font-semibold ${color.text}`}>
                        AED {new Intl.NumberFormat('en-AE').format(Math.round(milestone.amount))}
                      </p>
                      {milestone.properties && milestone.properties.length > 0 && (
                        <p className="text-[9px] text-gray-500 truncate" title={milestone.properties.join(', ')}>
                          {milestone.properties.length === 1 
                            ? milestone.properties[0].split(' ').slice(0, 2).join(' ')
                            : `${milestone.properties.length} properties`}
                        </p>
                      )}
                      {hasPartialPayment && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] rounded font-medium">
                          Partial
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <p className={`text-xs font-semibold ${color.text}`}>
                        {milestone.description || `${milestone.percentage}%`}
                      </p>
                      {showShareValues && totalAmount > 0 && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {formatAmount(getShareValue(milestone.percentage))}
                        </p>
                      )}
                    </>
                  )}
                  {milestone.isPaid && !hasPartialPayment && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-medium">
                      Paid
                    </span>
                  )}
                </div>
                
                {/* Connector line */}
                <div className={`w-0.5 h-4 ${color.bg} mt-2`}></div>
              </div>
            );
          })}
        </div>
        
        {/* Main timeline bar */}
        <div className="flex items-center h-3 relative">
          {sortedMilestones.map((milestone, idx) => {
            const color = milestone.isPaid ? PAID_COLOR : COLORS[idx % COLORS.length];
            const isFirst = idx === 0;
            const isLast = idx === sortedMilestones.length - 1;
            
            return (
              <div 
                key={idx} 
                className="flex-1 relative h-full"
              >
                {/* Colored segment with arrow shape */}
                <div 
                  className={`h-full ${color.bg}`}
                  style={{
                    clipPath: isFirst 
                      ? 'polygon(0 50%, 10px 0, 100% 0, calc(100% - 6px) 50%, 100% 100%, 10px 100%)'
                      : isLast 
                        ? 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 6px 50%)'
                        : 'polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%, 6px 50%)'
                  }}
                />
                
                {/* Node marker on the bar */}
                <div 
                  className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${milestone.isPaid ? 'bg-white' : 'bg-white border border-gray-300'}`}
                />
              </div>
            );
          })}
        </div>
        
        {/* Bottom row info (even indexes) */}
        <div className="flex mt-8">
          {sortedMilestones.map((milestone, idx) => {
            if (idx % 2 === 0) return <div key={idx} style={{ width: `${100 / sortedMilestones.length}%` }} />;
            
            const color = milestone.isPaid ? PAID_COLOR : COLORS[idx % COLORS.length];
            const hasPartialPayment = showConsolidated && milestone.paidAmount > 0 && milestone.unpaidAmount > 0;
            
            return (
              <div key={idx} className="flex flex-col items-center" style={{ width: `${100 / sortedMilestones.length}%` }}>
                {/* Connector line */}
                <div className={`w-0.5 h-4 ${color.bg}`}></div>
                
                {/* Title and description */}
                <div className="mt-2 text-center max-w-[100px]">
                  {showConsolidated ? (
                    <>
                      <p className={`text-xs font-semibold ${color.text}`}>
                        AED {new Intl.NumberFormat('en-AE').format(Math.round(milestone.amount))}
                      </p>
                      {milestone.properties && milestone.properties.length > 0 && (
                        <p className="text-[9px] text-gray-500 truncate" title={milestone.properties.join(', ')}>
                          {milestone.properties.length === 1 
                            ? milestone.properties[0].split(' ').slice(0, 2).join(' ')
                            : `${milestone.properties.length} properties`}
                        </p>
                      )}
                      {hasPartialPayment && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] rounded font-medium">
                          Partial
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <p className={`text-xs font-semibold ${color.text}`}>
                        {milestone.description || `${milestone.percentage}%`}
                      </p>
                      {showShareValues && totalAmount > 0 && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {formatAmount(getShareValue(milestone.percentage))}
                        </p>
                      )}
                    </>
                  )}
                  {milestone.isPaid && !hasPartialPayment && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-medium">
                      Paid
                    </span>
                  )}
                </div>
                
                {/* Circle with date */}
                <div className={`w-14 h-14 rounded-full border-2 ${color.border} bg-white flex items-center justify-center shadow-sm mt-2 relative`}>
                  <span className={`text-xs font-bold ${color.text}`}>
                    {formatDate(milestone.date)}
                  </span>
                  {/* Badge for payment count in consolidated view */}
                  {showConsolidated && milestone.paymentCount > 1 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-700 text-white text-[9px] font-bold flex items-center justify-center">
                      {milestone.paymentCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Mini version for very compact display (single line with dots)
 */
export function MiniPaymentTimeline({ 
  milestones = [], 
  paymentsCompleted = 0,
  className = "" 
}) {
  if (!milestones || milestones.length === 0) return null;
  
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {milestones.map((milestone, idx) => {
        const isPaid = idx < paymentsCompleted;
        const color = isPaid ? PAID_COLOR : COLORS[idx % COLORS.length];
        
        return (
          <div key={idx} className="flex items-center">
            <div 
              className={`w-2.5 h-2.5 rounded-full ${color.bg} ${isPaid ? '' : 'opacity-60'}`}
              title={`${milestone.percentage}% - ${milestone.description || ''} ${isPaid ? '(Paid)' : ''}`}
            />
            {idx < milestones.length - 1 && (
              <div className={`w-2 h-0.5 ${isPaid ? 'bg-emerald-400' : 'bg-gray-300'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
