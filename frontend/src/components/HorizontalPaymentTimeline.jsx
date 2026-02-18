import React from "react";

/**
 * Horizontal Payment Timeline Component
 * Displays payment milestones as a horizontal timeline with alternating nodes above/below
 * Similar to the design: colored segments with circular nodes showing dates/amounts
 */

// Color palette for timeline segments (warm to cool progression)
const COLORS = [
  { bg: 'bg-amber-400', border: 'border-amber-500', text: 'text-amber-600', fill: '#fbbf24' },
  { bg: 'bg-orange-500', border: 'border-orange-600', text: 'text-orange-600', fill: '#f97316' },
  { bg: 'bg-red-500', border: 'border-red-600', text: 'text-red-600', fill: '#ef4444' },
  { bg: 'bg-pink-500', border: 'border-pink-600', text: 'text-pink-600', fill: '#ec4899' },
  { bg: 'bg-purple-500', border: 'border-purple-600', text: 'text-purple-600', fill: '#a855f7' },
  { bg: 'bg-indigo-600', border: 'border-indigo-700', text: 'text-indigo-600', fill: '#4f46e5' },
  { bg: 'bg-teal-600', border: 'border-teal-700', text: 'text-teal-600', fill: '#0d9488' },
];

// Paid color (green)
const PAID_COLOR = { bg: 'bg-emerald-500', border: 'border-emerald-600', text: 'text-emerald-600', fill: '#10b981' };

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
 * @param {number} totalAmount - Total investment amount (for calculating 25% values)
 * @param {boolean} compact - Show compact version for opportunity cards
 * @param {boolean} show25Percent - Show 25% values instead of actual amounts
 * @param {string} currency - Currency code to display amounts in (default: AED)
 * @param {number} conversionRate - Conversion rate from AED to selected currency
 */
export default function HorizontalPaymentTimeline({ 
  milestones = [], 
  totalAmount = 0, 
  compact = false,
  show25Percent = false,
  currency = "AED",
  conversionRate = 1,
  className = ""
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
  
  // Format amount with currency conversion
  const formatAmount = (amount, showSymbol = true) => {
    const convertedAmount = amount * conversionRate;
    let formatted;
    if (convertedAmount >= 1000000) {
      formatted = `${(convertedAmount / 1000000).toFixed(2)}M`;
    } else if (convertedAmount >= 1000) {
      formatted = `${(convertedAmount / 1000).toFixed(0)}K`;
    } else {
      formatted = convertedAmount.toFixed(0);
    }
    return showSymbol ? `${currencySymbol} ${formatted}` : formatted;
  };
  
  // Calculate 25% value
  const get25PercentValue = (percentage) => {
    if (!show25Percent || !totalAmount) return null;
    const fullAmount = (percentage / 100) * totalAmount;
    const quarterAmount = fullAmount * 0.25; // 25% of total for one investor share
    return quarterAmount;
  };
  
  if (compact) {
    // Compact version for opportunity cards - simple horizontal bar
    return (
      <div className={`w-full ${className}`}>
        <div className="flex items-center h-8">
          {/* Timeline bar */}
          <div className="flex-1 flex items-center h-2.5 relative">
            {sortedMilestones.map((milestone, idx) => {
              const color = milestone.isPaid ? PAID_COLOR : COLORS[idx % COLORS.length];
              const isFirst = idx === 0;
              const isLast = idx === sortedMilestones.length - 1;
              const width = `${100 / sortedMilestones.length}%`;
              
              return (
                <div 
                  key={idx} 
                  className="relative flex items-center group"
                  style={{ width }}
                >
                  {/* Segment */}
                  <div 
                    className={`h-2.5 w-full ${color.bg} ${isFirst ? 'rounded-l-full' : ''} ${isLast ? 'rounded-r-full' : ''}`}
                    style={{
                      clipPath: isFirst 
                        ? 'polygon(0 50%, 8px 0, 100% 0, calc(100% - 4px) 50%, 100% 100%, 8px 100%)'
                        : isLast 
                          ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 4px 50%)'
                          : 'polygon(0 0, calc(100% - 4px) 0, 100% 50%, calc(100% - 4px) 100%, 0 100%, 4px 50%)'
                    }}
                  />
                  
                  {/* Node marker */}
                  <div 
                    className={`absolute -top-0.5 left-1/2 transform -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 ${color.border} bg-white flex items-center justify-center z-10`}
                  >
                    {milestone.isPaid && (
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    )}
                  </div>
                  
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                    <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                      <div className="font-medium">{milestone.description || `${milestone.percentage}%`}</div>
                      <div className="text-gray-300">{formatDate(milestone.date)}</div>
                      {show25Percent && totalAmount > 0 && (
                        <div className="text-emerald-300">{formatAmount(get25PercentValue(milestone.percentage))}</div>
                      )}
                      {milestone.isPaid && <span className="text-emerald-400 text-[10px]">Paid</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Labels row */}
        <div className="flex mt-1">
          {sortedMilestones.map((milestone, idx) => (
            <div 
              key={idx} 
              className="flex-1 text-center"
              style={{ width: `${100 / sortedMilestones.length}%` }}
            >
              <p className={`text-[9px] font-medium ${milestone.isPaid ? 'text-emerald-600' : COLORS[idx % COLORS.length].text}`}>
                {milestone.percentage}%
              </p>
              {show25Percent && totalAmount > 0 && (
                <p className="text-[8px] text-gray-500">
                  {formatAmount(get25PercentValue(milestone.percentage), false)}
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
            return (
              <div key={idx} className="flex flex-col items-center" style={{ width: `${100 / sortedMilestones.length}%` }}>
                {/* Circle with date */}
                <div className={`w-14 h-14 rounded-full border-2 ${color.border} bg-white flex items-center justify-center shadow-sm`}>
                  <span className={`text-xs font-bold ${color.text}`}>
                    {formatDate(milestone.date)}
                  </span>
                </div>
                
                {/* Title and description */}
                <div className="mt-2 text-center">
                  <p className={`text-xs font-semibold ${color.text}`}>
                    {milestone.description || `${milestone.percentage}%`}
                  </p>
                  {show25Percent && totalAmount > 0 && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      {formatAmount(get25PercentValue(milestone.percentage))}
                    </p>
                  )}
                  {milestone.isPaid && (
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
            return (
              <div key={idx} className="flex flex-col items-center" style={{ width: `${100 / sortedMilestones.length}%` }}>
                {/* Connector line */}
                <div className={`w-0.5 h-4 ${color.bg}`}></div>
                
                {/* Title and description */}
                <div className="mt-2 text-center">
                  <p className={`text-xs font-semibold ${color.text}`}>
                    {milestone.description || `${milestone.percentage}%`}
                  </p>
                  {show25Percent && totalAmount > 0 && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      {formatAmount(get25PercentValue(milestone.percentage))}
                    </p>
                  )}
                  {milestone.isPaid && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-medium">
                      Paid
                    </span>
                  )}
                </div>
                
                {/* Circle with date */}
                <div className={`w-14 h-14 rounded-full border-2 ${color.border} bg-white flex items-center justify-center shadow-sm mt-2`}>
                  <span className={`text-xs font-bold ${color.text}`}>
                    {formatDate(milestone.date)}
                  </span>
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
