import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Premium Financial Plan PDF Generator - Matching Login Page Colors
export const generateFinancialPlanPDF = ({
  family,
  members,
  incomeDetails,
  expenseDetails,
  goalDetails,
  investmentDetails,
  insurancePremiumsData,
  yearlyProjection,
  allocation,
  simulationResult,
  totalAssets,
  maturitiesByYear
}) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  
  // Color scheme - Matching Login Page
  const colors = {
    primary: [91, 55, 60],       // #5B373C - Brownish burgundy
    primaryDark: [61, 37, 42],   // #3D252A - Darker burgundy
    primaryDeep: [31, 31, 31],   // #1F1F1F - Deep dark
    gold: [201, 162, 39],        // #C9A227 - Gold
    goldLight: [212, 168, 83],   // #D4A853 - Light gold
    goldDark: [166, 133, 33],    // #A68521 - Dark gold
    cream: [248, 245, 240],      // #F8F5F0 - Cream
    white: [255, 255, 255],
    text: [55, 65, 81],          // #374151 - Dark gray
    textLight: [107, 114, 128],  // #6B7280 - Medium gray
    textMuted: [156, 163, 175],  // #9CA3AF - Light gray
    success: [34, 197, 94],      // Green
    danger: [239, 68, 68],       // Red
    chart1: [91, 55, 60],        // Burgundy
    chart2: [201, 162, 39],      // Gold
    chart3: [34, 197, 94],       // Green
    chart4: [59, 130, 246]       // Blue
  };
  
  // Helper functions
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0';
    const num = parseFloat(amount);
    if (isNaN(num)) return '₹0';
    
    const absNum = Math.abs(num);
    let formatted;
    
    if (absNum >= 10000000) {
      formatted = (num / 10000000).toFixed(2) + ' Cr';
    } else if (absNum >= 100000) {
      formatted = (num / 100000).toFixed(2) + ' L';
    } else if (absNum >= 1000) {
      formatted = (num / 1000).toFixed(1) + ' K';
    } else {
      formatted = num.toFixed(0);
    }
    
    return '₹' + formatted;
  };
  
  const formatNumber = (num) => {
    if (!num && num !== 0) return '-';
    return new Intl.NumberFormat('en-IN').format(Math.round(num));
  };
  
  const calculateAge = (dob) => {
    if (!dob) return '-';
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  
  let currentY = margin;
  let pageNum = 1;
  
  // Add header to each page
  const addHeader = (pageTitle) => {
    // Header background with gradient effect
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, pageWidth, 32, 'F');
    
    // Gold accent line
    doc.setFillColor(...colors.gold);
    doc.rect(0, 32, pageWidth, 1.5, 'F');
    
    // Company name
    doc.setTextColor(...colors.white);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('KINNTEGRAA', margin, 15);
    
    // Tagline
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Wealth Management & Financial Planning', margin, 21);
    
    // Page title on right
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(pageTitle, pageWidth - margin, 18, { align: 'right' });
    
    currentY = 42;
  };
  
  // Add footer
  const addFooter = () => {
    doc.setFillColor(...colors.primaryDark);
    doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
    
    doc.setTextColor(...colors.white);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`Confidential - ${family?.family_name || 'Financial Plan'}`, margin, pageHeight - 5);
    doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  };
  
  // Section title with gold accent
  const addSectionTitle = (title) => {
    if (currentY > pageHeight - 50) {
      addFooter();
      doc.addPage();
      pageNum++;
      currentY = margin;
    }
    
    // Gold bar
    doc.setFillColor(...colors.gold);
    doc.rect(margin, currentY, 4, 8, 'F');
    
    // Title
    doc.setFillColor(...colors.cream);
    doc.rect(margin + 4, currentY, contentWidth - 4, 8, 'F');
    
    doc.setTextColor(...colors.primary);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 8, currentY + 5.5);
    
    currentY += 12;
  };
  
  // Draw pie chart
  const drawPieChart = (centerX, centerY, radius, data, showLabels = true) => {
    let startAngle = -Math.PI / 2;
    const chartColors = [colors.chart1, colors.chart2, colors.chart3, colors.chart4];
    
    data.forEach((item, index) => {
      const sliceAngle = (item.value / 100) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      
      // Draw slice
      doc.setFillColor(...chartColors[index % chartColors.length]);
      
      // Create pie slice path
      const steps = 50;
      const points = [];
      points.push([centerX, centerY]);
      
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (sliceAngle * i / steps);
        points.push([
          centerX + radius * Math.cos(angle),
          centerY + radius * Math.sin(angle)
        ]);
      }
      
      // Draw filled polygon
      doc.setFillColor(...chartColors[index % chartColors.length]);
      const path = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ') + ' Z';
      
      // Simple arc approximation
      doc.setFillColor(...chartColors[index % chartColors.length]);
      doc.triangle(
        centerX, centerY,
        centerX + radius * Math.cos(startAngle), centerY + radius * Math.sin(startAngle),
        centerX + radius * Math.cos(endAngle), centerY + radius * Math.sin(endAngle),
        'F'
      );
      
      // Draw arc segments
      for (let i = 0; i < steps; i++) {
        const a1 = startAngle + (sliceAngle * i / steps);
        const a2 = startAngle + (sliceAngle * (i + 1) / steps);
        doc.triangle(
          centerX, centerY,
          centerX + radius * Math.cos(a1), centerY + radius * Math.sin(a1),
          centerX + radius * Math.cos(a2), centerY + radius * Math.sin(a2),
          'F'
        );
      }
      
      startAngle = endAngle;
    });
    
    // Draw center circle for donut effect
    doc.setFillColor(...colors.white);
    doc.circle(centerX, centerY, radius * 0.5, 'F');
  };
  
  // Draw line chart
  const drawLineChart = (x, y, width, height, data, title) => {
    if (!data || data.length === 0) return;
    
    // Background
    doc.setFillColor(...colors.cream);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    
    // Border
    doc.setDrawColor(...colors.textMuted);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, width, height, 3, 3, 'S');
    
    const chartPadding = 10;
    const chartX = x + chartPadding + 15;
    const chartY = y + chartPadding + 5;
    const chartWidth = width - chartPadding * 2 - 15;
    const chartHeight = height - chartPadding * 2 - 15;
    
    // Title
    doc.setTextColor(...colors.primary);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(title, x + chartPadding, y + chartPadding);
    
    // Find min/max values
    const values = data.map(d => d.value);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values, 0);
    const range = maxVal - minVal || 1;
    
    // Draw grid lines
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    for (let i = 0; i <= 4; i++) {
      const gridY = chartY + (chartHeight * i / 4);
      doc.line(chartX, gridY, chartX + chartWidth, gridY);
      
      // Y-axis labels
      const labelValue = maxVal - (range * i / 4);
      doc.setTextColor(...colors.textMuted);
      doc.setFontSize(6);
      doc.text(formatCurrency(labelValue), chartX - 2, gridY + 1, { align: 'right' });
    }
    
    // Draw zero line if applicable
    if (minVal < 0 && maxVal > 0) {
      const zeroY = chartY + chartHeight - ((0 - minVal) / range * chartHeight);
      doc.setDrawColor(...colors.danger);
      doc.setLineWidth(0.3);
      doc.line(chartX, zeroY, chartX + chartWidth, zeroY);
    }
    
    // Draw data line
    doc.setDrawColor(...colors.gold);
    doc.setLineWidth(1.5);
    
    const stepX = chartWidth / (data.length - 1 || 1);
    
    for (let i = 1; i < data.length; i++) {
      const x1 = chartX + stepX * (i - 1);
      const y1 = chartY + chartHeight - ((data[i - 1].value - minVal) / range * chartHeight);
      const x2 = chartX + stepX * i;
      const y2 = chartY + chartHeight - ((data[i].value - minVal) / range * chartHeight);
      
      // Color based on value
      if (data[i].value < 0) {
        doc.setDrawColor(...colors.danger);
      } else {
        doc.setDrawColor(...colors.gold);
      }
      
      doc.line(x1, y1, x2, y2);
    }
    
    // Draw data points
    data.forEach((d, i) => {
      const px = chartX + stepX * i;
      const py = chartY + chartHeight - ((d.value - minVal) / range * chartHeight);
      
      if (d.value < 0) {
        doc.setFillColor(...colors.danger);
      } else {
        doc.setFillColor(...colors.gold);
      }
      doc.circle(px, py, 1.5, 'F');
    });
    
    // X-axis labels (first, middle, last)
    doc.setTextColor(...colors.textMuted);
    doc.setFontSize(6);
    if (data.length > 0) {
      doc.text(String(data[0].year), chartX, chartY + chartHeight + 6);
      if (data.length > 2) {
        const midIdx = Math.floor(data.length / 2);
        doc.text(String(data[midIdx].year), chartX + chartWidth / 2, chartY + chartHeight + 6, { align: 'center' });
      }
      doc.text(String(data[data.length - 1].year), chartX + chartWidth, chartY + chartHeight + 6, { align: 'right' });
    }
  };
  
  // Draw bar chart
  const drawBarChart = (x, y, width, height, data, title) => {
    if (!data || data.length === 0) return;
    
    // Background
    doc.setFillColor(...colors.cream);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    
    const chartPadding = 10;
    const chartX = x + chartPadding + 20;
    const chartY = y + chartPadding + 8;
    const chartWidth = width - chartPadding * 2 - 25;
    const chartHeight = height - chartPadding * 2 - 20;
    
    // Title
    doc.setTextColor(...colors.primary);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(title, x + chartPadding, y + chartPadding);
    
    const maxVal = Math.max(...data.map(d => Math.abs(d.value)));
    const barHeight = (chartHeight - (data.length - 1) * 2) / data.length;
    const chartColors = [colors.primary, colors.gold, colors.chart3, colors.chart4];
    
    data.forEach((item, i) => {
      const barY = chartY + i * (barHeight + 2);
      const barWidth = (item.value / maxVal) * chartWidth;
      
      // Bar
      doc.setFillColor(...chartColors[i % chartColors.length]);
      doc.roundedRect(chartX, barY, Math.max(barWidth, 2), barHeight - 1, 1, 1, 'F');
      
      // Label
      doc.setTextColor(...colors.text);
      doc.setFontSize(7);
      doc.text(item.label.substring(0, 12), chartX - 2, barY + barHeight / 2 + 1, { align: 'right' });
      
      // Value
      doc.setTextColor(...colors.white);
      doc.setFontSize(6);
      if (barWidth > 20) {
        doc.text(formatCurrency(item.value), chartX + barWidth - 2, barY + barHeight / 2 + 1, { align: 'right' });
      }
    });
  };

  // ==================== PAGE 1: COVER PAGE ====================
  const addCoverPage = () => {
    // Full page gradient background
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Darker bottom section
    doc.setFillColor(...colors.primaryDark);
    doc.rect(0, pageHeight * 0.6, pageWidth, pageHeight * 0.4, 'F');
    
    // Gold decorative lines
    doc.setFillColor(...colors.gold);
    doc.rect(0, pageHeight * 0.38, pageWidth, 2, 'F');
    doc.rect(0, pageHeight * 0.6, pageWidth, 2, 'F');
    
    // Company logo circle
    doc.setFillColor(...colors.gold);
    doc.circle(pageWidth/2, 50, 18, 'F');
    doc.setTextColor(...colors.primary);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('K', pageWidth/2, 55, { align: 'center' });
    
    // Company name
    doc.setTextColor(...colors.white);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('KINNTEGRAA', pageWidth/2, 78, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Wealth Management & Financial Planning', pageWidth/2, 86, { align: 'center' });
    
    // Main title
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('FINANCIAL', pageWidth/2, pageHeight * 0.44, { align: 'center' });
    doc.setTextColor(...colors.gold);
    doc.text('PLAN', pageWidth/2, pageHeight * 0.52, { align: 'center' });
    
    // Family name
    doc.setTextColor(...colors.white);
    doc.setFontSize(16);
    doc.text(family?.family_name?.toUpperCase() || 'CLIENT NAME', pageWidth/2, pageHeight * 0.68, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Comprehensive Wealth Management Report', pageWidth/2, pageHeight * 0.74, { align: 'center' });
    
    // Date
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Prepared on ${dateStr}`, pageWidth/2, pageHeight * 0.82, { align: 'center' });
    
    // Confidential badge
    doc.setFillColor(...colors.gold);
    doc.roundedRect(pageWidth/2 - 45, pageHeight - 35, 90, 14, 2, 2, 'F');
    doc.setTextColor(...colors.primary);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CONFIDENTIAL', pageWidth/2, pageHeight - 26, { align: 'center' });
  };
  
  // ==================== PAGE 2: EXECUTIVE SUMMARY ====================
  const addExecutiveSummary = () => {
    doc.addPage();
    pageNum++;
    addHeader('EXECUTIVE SUMMARY');
    
    // Key metrics boxes
    const boxWidth = (contentWidth - 8) / 3;
    const boxHeight = 28;
    
    const metrics = [
      { label: 'TOTAL PORTFOLIO', value: formatCurrency(totalAssets), color: colors.primary },
      { label: 'PORTFOLIO STATUS', value: simulationResult?.exhaustYear ? `Exhausts ${simulationResult.exhaustYear}` : 'Sustainable', color: simulationResult?.exhaustYear ? colors.danger : colors.success },
      { label: 'ALLOCATION', value: `${allocation?.equity || 80}% / ${allocation?.debt || 20}%`, color: colors.gold }
    ];
    
    metrics.forEach((metric, idx) => {
      const x = margin + idx * (boxWidth + 4);
      
      // Box background
      doc.setFillColor(...colors.cream);
      doc.roundedRect(x, currentY, boxWidth, boxHeight, 2, 2, 'F');
      
      // Gold top border
      doc.setFillColor(...colors.gold);
      doc.rect(x, currentY, boxWidth, 2, 'F');
      
      // Label
      doc.setTextColor(...colors.textMuted);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(metric.label, x + boxWidth/2, currentY + 10, { align: 'center' });
      
      // Value
      doc.setTextColor(...metric.color);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(metric.value, x + boxWidth/2, currentY + 20, { align: 'center' });
    });
    
    currentY += boxHeight + 12;
    
    // Family Overview Table
    addSectionTitle('FAMILY MEMBERS');
    
    const familyData = members.map(m => [
      m.name || '-',
      m.relation || '-',
      calculateAge(m.date_of_birth) + ' yrs',
      m.retirement_year || '-',
      m.life_expectancy || '85'
    ]);
    
    autoTable(doc, {
      startY: currentY,
      head: [['Name', 'Relation', 'Age', 'Retirement', 'Life Exp.']],
      body: familyData,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: colors.primary,
        textColor: colors.white,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3
      },
      bodyStyles: {
        fontSize: 8,
        textColor: colors.text,
        cellPadding: 3
      },
      alternateRowStyles: {
        fillColor: colors.cream
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 30, halign: 'center' },
        4: { cellWidth: 25, halign: 'center' }
      }
    });
    
    currentY = doc.lastAutoTable.finalY + 12;
    
    // Financial Summary
    addSectionTitle('FINANCIAL SNAPSHOT');
    
    const totalIncome = incomeDetails.reduce((sum, inc) => {
      const d = inc.details || {};
      return sum + (parseFloat(d.annual_income) || parseFloat(d.annual_salary) || 0);
    }, 0);
    
    const totalExpenses = expenseDetails.reduce((sum, exp) => {
      return sum + (parseFloat(exp.annual_amount) || (parseFloat(exp.monthly_amount) || 0) * 12 || 0);
    }, 0);
    
    const totalGoals = goalDetails.reduce((sum, g) => sum + (parseFloat(g.target_amount) || 0), 0);
    
    const summaryData = [
      ['Annual Income', formatCurrency(totalIncome)],
      ['Annual Expenses', formatCurrency(totalExpenses)],
      ['Annual Surplus', formatCurrency(totalIncome - totalExpenses)],
      ['Total Goals', formatCurrency(totalGoals)],
      ['Current Portfolio', formatCurrency(totalAssets)]
    ];
    
    autoTable(doc, {
      startY: currentY,
      body: summaryData,
      margin: { left: margin, right: margin },
      theme: 'plain',
      bodyStyles: {
        fontSize: 9,
        textColor: colors.text,
        cellPadding: 4
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold' },
        1: { cellWidth: 50, halign: 'right', textColor: colors.primary }
      },
      didDrawCell: (data) => {
        if (data.row.index < summaryData.length - 1) {
          doc.setDrawColor(...colors.cream);
          doc.setLineWidth(0.5);
          doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      }
    });
    
    addFooter();
  };
  
  // ==================== PAGE 3: ALLOCATION & CHARTS ====================
  const addChartsPage = () => {
    doc.addPage();
    pageNum++;
    addHeader('PORTFOLIO ANALYSIS');
    
    // Allocation visualization
    addSectionTitle('ASSET ALLOCATION');
    
    const equityPct = allocation?.equity || 80;
    const debtPct = allocation?.debt || 20;
    
    // Allocation boxes
    const boxWidth = (contentWidth - 10) / 2;
    
    // Equity box
    doc.setFillColor(...colors.primary);
    doc.roundedRect(margin, currentY, boxWidth, 35, 3, 3, 'F');
    doc.setTextColor(...colors.white);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(`${equityPct}%`, margin + boxWidth/2, currentY + 18, { align: 'center' });
    doc.setFontSize(9);
    doc.text('EQUITY', margin + boxWidth/2, currentY + 28, { align: 'center' });
    doc.setFontSize(7);
    doc.text(`@ ${allocation?.equityReturn || 12}% return`, margin + boxWidth/2, currentY + 33, { align: 'center' });
    
    // Debt box
    doc.setFillColor(...colors.gold);
    doc.roundedRect(margin + boxWidth + 10, currentY, boxWidth, 35, 3, 3, 'F');
    doc.setTextColor(...colors.primary);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(`${debtPct}%`, margin + boxWidth + 10 + boxWidth/2, currentY + 18, { align: 'center' });
    doc.setFontSize(9);
    doc.text('DEBT', margin + boxWidth + 10 + boxWidth/2, currentY + 28, { align: 'center' });
    doc.setFontSize(7);
    doc.text(`@ ${allocation?.debtReturn || 7}% return`, margin + boxWidth + 10 + boxWidth/2, currentY + 33, { align: 'center' });
    
    currentY += 45;
    
    // Portfolio Growth Chart
    if (yearlyProjection && yearlyProjection.length > 0) {
      addSectionTitle('PORTFOLIO GROWTH PROJECTION');
      
      const chartData = yearlyProjection.map(y => ({
        year: y.year,
        value: y.corpus
      }));
      
      drawLineChart(margin, currentY, contentWidth, 60, chartData, 'Total Portfolio Value Over Time');
      currentY += 70;
    }
    
    // Income vs Expenses comparison
    addSectionTitle('INCOME VS EXPENSES (First 5 Years)');
    
    if (yearlyProjection && yearlyProjection.length > 0) {
      const first5Years = yearlyProjection.slice(0, 5);
      
      const comparisonData = [
        ['Year', 'Income', 'Expenses', 'Net Savings', 'Portfolio']
      ];
      
      first5Years.forEach(y => {
        comparisonData.push([
          y.year.toString(),
          formatCurrency(y.income),
          formatCurrency(y.expenses),
          formatCurrency(y.netSavings),
          formatCurrency(y.corpus)
        ]);
      });
      
      autoTable(doc, {
        startY: currentY,
        head: [comparisonData[0]],
        body: comparisonData.slice(1),
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: colors.primary,
          textColor: colors.white,
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.text,
          halign: 'right'
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 40 }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        }
      });
    }
    
    addFooter();
  };
  
  // ==================== PAGE 4: INCOME DETAILS ====================
  const addIncomePage = () => {
    doc.addPage();
    pageNum++;
    addHeader('INCOME DETAILS');
    
    addSectionTitle('INCOME SOURCES');
    
    const getCategoryLabel = (cat) => {
      const labels = {
        salary: 'Salary',
        business: 'Business',
        rental: 'Rental',
        pension: 'Pension',
        dividend: 'Dividends',
        interest: 'Interest'
      };
      return labels[cat] || cat?.replace(/_/g, ' ') || '-';
    };
    
    const incomeData = incomeDetails
      .filter(inc => ['salary', 'business', 'rental', 'pension', 'dividend', 'interest'].includes(inc.category))
      .map(inc => {
        const d = inc.details || {};
        const memberName = members.find(m => inc.member_ids?.includes(m.id))?.name || 'Family';
        const amount = d.annual_income || d.annual_salary || d.rental_income || 0;
        return [
          getCategoryLabel(inc.category),
          memberName.substring(0, 15),
          formatCurrency(amount),
          `${d.growth_rate || d.increment_percent || 0}%`,
          d.upto_year || inc.upto_year || '-'
        ];
      });
    
    if (incomeData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Type', 'Member', 'Annual Amount', 'Growth', 'Until']],
        body: incomeData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: colors.primary,
          textColor: colors.white,
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.text
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 40 },
          2: { cellWidth: 40, halign: 'right' },
          3: { cellWidth: 25, halign: 'center' },
          4: { cellWidth: 25, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        }
      });
      currentY = doc.lastAutoTable.finalY + 12;
    } else {
      doc.setTextColor(...colors.textMuted);
      doc.setFontSize(9);
      doc.text('No income sources recorded', margin, currentY);
      currentY += 15;
    }
    
    // Assets Summary
    addSectionTitle('INVESTMENT ASSETS');
    
    const assetData = incomeDetails
      .filter(inc => ['equity', 'mutual_fund', 'fd', 'ppf', 'nps', 'epf', 'gratuity', 'bonds', 'cash'].includes(inc.category))
      .map(inc => {
        const d = inc.details || {};
        const value = d.market_value || d.current_value || d.investment_value || d.bank_balance || 0;
        return [
          getCategoryLabel(inc.category),
          formatCurrency(value),
          d.maturity_year || '-'
        ];
      });
    
    if (assetData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Asset Type', 'Current Value', 'Maturity']],
        body: assetData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: colors.gold,
          textColor: colors.primary,
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.text
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 50, halign: 'right' },
          2: { cellWidth: 35, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        }
      });
    }
    
    addFooter();
  };
  
  // ==================== PAGE 5: EXPENSES ====================
  const addExpensesPage = () => {
    doc.addPage();
    pageNum++;
    addHeader('EXPENSES');
    
    addSectionTitle('REGULAR EXPENSES');
    
    const expenseData = expenseDetails.slice(0, 12).map(exp => {
      const amount = exp.annual_amount || (parseFloat(exp.monthly_amount) || 0) * 12;
      return [
        (exp.expense_type || 'Other').replace(/_/g, ' ').substring(0, 18),
        formatCurrency(amount),
        `${exp.inflation_percent || 5}%`,
        exp.consider_post_retirement ? 'Yes' : 'No'
      ];
    });
    
    if (expenseData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Expense Type', 'Annual Amount', 'Inflation', 'Post-Ret']],
        body: expenseData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: colors.primary,
          textColor: colors.white,
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.text
        },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 40, halign: 'right' },
          2: { cellWidth: 30, halign: 'center' },
          3: { cellWidth: 25, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        }
      });
      currentY = doc.lastAutoTable.finalY + 12;
    }
    
    // Insurance
    if (insurancePremiumsData && insurancePremiumsData.length > 0) {
      addSectionTitle('INSURANCE PREMIUMS');
      
      const insuranceData = insurancePremiumsData.slice(0, 8).map(ins => [
        (ins.policy_name || ins.insurance_type || 'Insurance').substring(0, 25),
        formatCurrency(ins.yearly_premium || ins.annual_premium || ins.premium_amount),
        ins.upto_year || '-'
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [['Policy', 'Annual Premium', 'Until']],
        body: insuranceData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: colors.gold,
          textColor: colors.primary,
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.text
        },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 45, halign: 'right' },
          2: { cellWidth: 30, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        }
      });
    }
    
    addFooter();
  };
  
  // ==================== PAGE 6: GOALS ====================
  const addGoalsPage = () => {
    doc.addPage();
    pageNum++;
    addHeader('FINANCIAL GOALS');
    
    addSectionTitle('LIFE GOALS & MILESTONES');
    
    const goalData = goalDetails.map(goal => [
      (goal.name || goal.goal_name || goal.category || '-').substring(0, 25),
      goal.target_year || '-',
      formatCurrency(goal.target_amount),
      `${goal.inflation_percent || 5}%`
    ]);
    
    if (goalData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Goal', 'Target Year', 'Amount', 'Inflation']],
        body: goalData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: colors.primary,
          textColor: colors.white,
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 8,
          textColor: colors.text
        },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 40, halign: 'right' },
          3: { cellWidth: 30, halign: 'center' }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        }
      });
      currentY = doc.lastAutoTable.finalY + 15;
    }
    
    // Goals Timeline
    if (goalDetails.length > 0) {
      addSectionTitle('GOALS TIMELINE');
      
      const sortedGoals = [...goalDetails].sort((a, b) => (a.target_year || 0) - (b.target_year || 0)).slice(0, 6);
      
      const timelineY = currentY + 15;
      const lineStartX = margin + 15;
      const lineEndX = pageWidth - margin - 15;
      
      // Timeline line
      doc.setDrawColor(...colors.gold);
      doc.setLineWidth(2);
      doc.line(lineStartX, timelineY, lineEndX, timelineY);
      
      // Goals on timeline
      const spacing = (lineEndX - lineStartX) / (sortedGoals.length + 1);
      
      sortedGoals.forEach((goal, idx) => {
        const x = lineStartX + spacing * (idx + 1);
        
        // Circle
        doc.setFillColor(...colors.primary);
        doc.circle(x, timelineY, 5, 'F');
        doc.setFillColor(...colors.gold);
        doc.circle(x, timelineY, 3, 'F');
        
        // Year
        doc.setTextColor(...colors.primary);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(String(goal.target_year || '-'), x, timelineY - 10, { align: 'center' });
        
        // Goal name
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text((goal.name || '').substring(0, 12), x, timelineY + 10, { align: 'center' });
        
        // Amount
        doc.setTextColor(...colors.textMuted);
        doc.text(formatCurrency(goal.target_amount), x, timelineY + 16, { align: 'center' });
      });
    }
    
    addFooter();
  };
  
  // ==================== PAGE 7: CASH FLOW PROJECTION ====================
  const addCashFlowPage = () => {
    doc.addPage();
    pageNum++;
    addHeader('CASH FLOW PROJECTION');
    
    addSectionTitle('YEAR-WISE PROJECTION');
    
    if (yearlyProjection && yearlyProjection.length > 0) {
      const projectionData = yearlyProjection.slice(0, 20).map(yr => [
        yr.year.toString(),
        yr.age.toString(),
        formatCurrency(yr.income),
        formatCurrency(yr.expenses),
        formatCurrency(yr.netSavings),
        formatCurrency(yr.corpus)
      ]);
      
      autoTable(doc, {
        startY: currentY,
        head: [['Year', 'Age', 'Income', 'Expenses', 'Net Savings', 'Portfolio']],
        body: projectionData,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: colors.primary,
          textColor: colors.white,
          fontStyle: 'bold',
          fontSize: 7,
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 7,
          textColor: colors.text
        },
        columnStyles: {
          0: { cellWidth: 22, halign: 'center' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 32, halign: 'right' },
          3: { cellWidth: 32, halign: 'right' },
          4: { cellWidth: 32, halign: 'right' },
          5: { cellWidth: 35, halign: 'right' }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        },
        didParseCell: (data) => {
          // Highlight negative values
          if (data.column.index >= 4 && data.section === 'body') {
            const cellText = data.cell.raw;
            if (cellText && cellText.includes('-')) {
              data.cell.styles.textColor = colors.danger;
            }
          }
        }
      });
      
      currentY = doc.lastAutoTable.finalY + 8;
      
      if (yearlyProjection.length > 20) {
        doc.setTextColor(...colors.textMuted);
        doc.setFontSize(7);
        doc.text(`* Showing first 20 years. Full projection extends to ${yearlyProjection[yearlyProjection.length-1].year}`, margin, currentY);
      }
    }
    
    addFooter();
  };
  
  // ==================== PAGE 8: WEALTH SUMMARY ====================
  const addWealthSummaryPage = () => {
    doc.addPage();
    pageNum++;
    addHeader('WEALTH SUMMARY');
    
    if (yearlyProjection && yearlyProjection.length > 0) {
      // Portfolio chart
      addSectionTitle('PORTFOLIO TRAJECTORY');
      
      const chartData = yearlyProjection.map(y => ({ year: y.year, value: y.corpus }));
      drawLineChart(margin, currentY, contentWidth, 65, chartData, 'Portfolio Value Over Time (₹)');
      currentY += 75;
      
      // Key milestones
      addSectionTitle('KEY MILESTONES');
      
      const peakYear = yearlyProjection.reduce((max, y) => y.corpus > max.corpus ? y : max, yearlyProjection[0]);
      const exhaustYear = simulationResult?.exhaustYear;
      
      const milestones = [
        ['Starting Portfolio (Year ' + yearlyProjection[0].year + ')', formatCurrency(yearlyProjection[0].corpus)],
        ['Peak Portfolio Value (Year ' + peakYear.year + ')', formatCurrency(peakYear.corpus)],
        exhaustYear 
          ? ['Portfolio Exhaustion (Year ' + exhaustYear + ')', '₹0']
          : ['Final Portfolio (Year ' + yearlyProjection[yearlyProjection.length-1].year + ')', formatCurrency(yearlyProjection[yearlyProjection.length-1].corpus)]
      ];
      
      autoTable(doc, {
        startY: currentY,
        body: milestones,
        margin: { left: margin, right: margin },
        theme: 'plain',
        bodyStyles: {
          fontSize: 10,
          textColor: colors.text,
          cellPadding: 5
        },
        columnStyles: {
          0: { cellWidth: 100, fontStyle: 'bold' },
          1: { cellWidth: 60, halign: 'right', textColor: colors.primary, fontStyle: 'bold' }
        },
        alternateRowStyles: {
          fillColor: colors.cream
        }
      });
      
      currentY = doc.lastAutoTable.finalY + 15;
      
      // Recommendation box
      doc.setFillColor(...colors.cream);
      doc.roundedRect(margin, currentY, contentWidth, 30, 3, 3, 'F');
      doc.setFillColor(...colors.gold);
      doc.rect(margin, currentY, 4, 30, 'F');
      
      doc.setTextColor(...colors.primary);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Portfolio Assessment', margin + 10, currentY + 10);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...colors.text);
      
      const assessment = exhaustYear 
        ? `Based on current projections, your portfolio is expected to deplete by ${exhaustYear}. Consider increasing savings or adjusting allocation.`
        : `Your portfolio appears sustainable through the projection period. Continue monitoring and rebalancing as needed.`;
      
      const splitText = doc.splitTextToSize(assessment, contentWidth - 20);
      doc.text(splitText, margin + 10, currentY + 18);
    }
    
    addFooter();
  };
  
  // ==================== GENERATE PDF ====================
  addCoverPage();
  addExecutiveSummary();
  addChartsPage();
  addIncomePage();
  addExpensesPage();
  addGoalsPage();
  addCashFlowPage();
  addWealthSummaryPage();
  
  // Save PDF
  const familyName = family?.family_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Financial_Plan';
  doc.save(`${familyName}_Financial_Plan.pdf`);
  
  return true;
};

export default generateFinancialPlanPDF;
