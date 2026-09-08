import React, { useEffect, useState } from 'react';
import { Download, Users, Database, Building2, TrendingUp, FileSpreadsheet, Mail, FileText, Receipt, CreditCard } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import Sidebar from '../components/Sidebar';

const API = process.env.REACT_APP_BACKEND_URL;

export default function Downloads() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleDownload = async (endpoint, filename, extension = 'xlsx') => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/export/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Export failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}_${new Date().toISOString().slice(0,10)}.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Export downloaded successfully');
    } catch (error) {
      toast.error(error.message || 'Export failed');
    }
  };

  const downloadItems = [
    {
      id: 'mfd-ria',
      title: 'MFD/RIA Partners',
      dbName: 'Mfd_Ria_Partner',
      description: 'Export all your MFD/RIA partner data including contact details, ARN, SEBI registration, and status.',
      icon: Users,
      color: 'amber',
      endpoint: 'mfd-ria-partners',
      filename: 'MFD_RIA_PARTNER_Export',
      enabled: true
    },
    {
      id: 'private-investor-indian',
      title: 'Private Investors — Indian Passport',
      dbName: 'Private_Investor_Indian_Passport',
      description: 'Export Indian-passport investors uploaded via the Indian template (bonds, real estate).',
      icon: Users,
      color: 'purple',
      endpoint: 'private-investor-indian',
      filename: 'PRIVATE_INVESTOR_INDIAN_PASSPORT_Export',
      enabled: true
    },
    {
      id: 'private-investor-foreign',
      title: 'Private Investors — Foreign Passport',
      dbName: 'Private_Investor_Foreign_Passport',
      description: 'Export Foreign-passport investors uploaded via the Foreign template (real estate).',
      icon: Users,
      color: 'blue',
      endpoint: 'private-investor-foreign',
      filename: 'PRIVATE_INVESTOR_FOREIGN_PASSPORT_Export',
      enabled: true
    },
    {
      id: 're-brokers',
      title: 'Real Estate Partners',
      dbName: 'Real_Estate_Partner',
      description: 'Export all Real Estate Partner data.',
      icon: Building2,
      color: 'teal',
      endpoint: 're-brokers',
      filename: 'REAL_ESTATE_PARTNER_Export',
      enabled: true
    },
    {
      id: 'ncd',
      title: 'NCD Master',
      dbName: 'Ncd_Master',
      description: 'Export NCD master (bond catalog) data.',
      icon: TrendingUp,
      color: 'green',
      endpoint: 'ncd-master',
      filename: 'NCD_Master_Export',
      enabled: true
    },
    {
      id: 'ncd-repayments',
      title: 'NCD Repayments',
      dbName: 'Ncd_Repayments',
      description: 'Repayment rows auto-synced from "altGraaf | Returns Initiated" emails twice daily (10:00 & 18:00 IST). Use this to spot gaps between emails received and bonds in NCD_Master.',
      icon: Mail,
      color: 'rose',
      endpoint: 'ncd-repayments',
      filename: 'NCD_Repayments_Export',
      enabled: true
    },
    {
      id: 'real-estate',
      title: 'Real Estate Master',
      dbName: 'Real_Estate_Master',
      description: 'Export all real estate opportunities in the 5-sheet template format.',
      icon: Building2,
      color: 'blue',
      endpoint: 'real-estate',
      filename: 'REAL_ESTATE_OPPORTUNITY_Export',
      enabled: true
    },
    {
      id: 'real-estate-investors',
      title: 'Real Estate Investors',
      dbName: 'Real_Estate_Investor',
      description: 'Export every investor allocation across all real-estate opportunities — client, share %, amount, building & unit.',
      icon: Users,
      color: 'teal',
      endpoint: 'real-estate-investors',
      filename: 'REAL_ESTATE_INVESTOR_Export',
      enabled: true
    },
    {
      id: 'real-estate-invoices',
      title: 'Real Estate Invoices',
      dbName: 'real_estate_invoices',
      description: 'Export every developer invoice uploaded per investor and payment-schedule milestone — invoice #, dates, amount due and notes.',
      icon: FileText,
      color: 'orange',
      endpoint: 'real-estate-invoices',
      filename: 'REAL_ESTATE_INVOICES_Export',
      enabled: true
    },
    {
      id: 'investor-payment-details',
      title: 'Investor Payment Details',
      dbName: 'investor_payment_details',
      description: 'Export each recorded investor transfer — transfer date, currency, home-currency & AED amount and SWIFT attachment metadata.',
      icon: CreditCard,
      color: 'blue',
      endpoint: 'investor-payment-details',
      filename: 'INVESTOR_PAYMENT_DETAILS_Export',
      enabled: true
    },
    {
      id: 'investor-payment-receipts',
      title: 'Investor Payment Receipts',
      dbName: 'investor_payment_receipts',
      description: 'Export every developer-issued receipt confirming an investor payment — receipt #, receipt date, payment amount and paid-on date.',
      icon: Receipt,
      color: 'green',
      endpoint: 'investor-payment-receipts',
      filename: 'INVESTOR_PAYMENT_RECEIPTS_Export',
      enabled: true
    },
    {
      id: 'ncd-presentations',
      title: 'NCD Presentations',
      dbName: 'NCD_Presentations',
      description: 'Download every uploaded NCD presentation bundled into a single ZIP. Files inside are named by the bond\'s Deal ID so recipients can tell which NCD each deck belongs to.',
      icon: FileText,
      color: 'amber',
      endpoint: 'ncd-presentations',
      filename: 'NCD_Presentations',
      extension: 'zip',
      buttonLabel: 'Download ZIP',
      enabled: true
    },
    {
      id: 'login-credentials',
      title: 'Login Credentials',
      dbName: 'Login_Credentials',
      description: 'Download the live registry of login IDs, default passwords and PINs for every Private Investor, MFD/RIA Partner and Real Estate Partner. Values update automatically whenever a user resets or changes them.',
      icon: FileText,
      color: 'teal',
      endpoint: 'login-credentials',
      filename: 'Login_Credentials',
      enabled: true
    },
    {
      id: 'ncd-expected-repayments',
      title: 'NCD Expected Repayments',
      dbName: 'Ncd_Expected_Repayments',
      description: 'Download every scheduled NCD repayment that has not yet been confirmed in Historical Repayments. Auto-rebuilt after each email sync — anything matched against an actual receipt is removed from this list.',
      icon: FileText,
      color: 'amber',
      endpoint: 'ncd-expected-repayments',
      filename: 'NCD_Expected_Repayments',
      enabled: true
    }
  ];

  const getColorClasses = (color, enabled) => {
    if (!enabled) {
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        iconBg: 'bg-gray-100',
        iconText: 'text-gray-400',
        dbText: 'text-gray-400',
        titleText: 'text-gray-500',
        descText: 'text-gray-400'
      };
    }
    
    const colors = {
      amber: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        iconBg: 'bg-amber-100',
        iconText: 'text-amber-700',
        dbText: 'text-amber-700',
        titleText: 'text-gray-800',
        descText: 'text-gray-600',
        btnBg: 'bg-amber-600 hover:bg-amber-700'
      },
      purple: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        iconBg: 'bg-purple-100',
        iconText: 'text-purple-700',
        dbText: 'text-purple-700',
        titleText: 'text-gray-800',
        descText: 'text-gray-600',
        btnBg: 'bg-purple-600 hover:bg-purple-700'
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        iconBg: 'bg-blue-100',
        iconText: 'text-blue-700',
        dbText: 'text-blue-700',
        titleText: 'text-gray-800',
        descText: 'text-gray-600',
        btnBg: 'bg-blue-600 hover:bg-blue-700'
      },
      teal: {
        bg: 'bg-teal-50',
        border: 'border-teal-200',
        iconBg: 'bg-teal-100',
        iconText: 'text-teal-700',
        dbText: 'text-teal-700',
        titleText: 'text-gray-800',
        descText: 'text-gray-600',
        btnBg: 'bg-teal-600 hover:bg-teal-700'
      },
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        iconBg: 'bg-green-100',
        iconText: 'text-green-700',
        dbText: 'text-green-700',
        titleText: 'text-gray-800',
        descText: 'text-gray-600',
        btnBg: 'bg-green-600 hover:bg-green-700'
      },
      rose: {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        iconBg: 'bg-rose-100',
        iconText: 'text-rose-700',
        dbText: 'text-rose-700',
        titleText: 'text-gray-800',
        descText: 'text-gray-600',
        btnBg: 'bg-rose-600 hover:bg-rose-700'
      },
      orange: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        iconBg: 'bg-orange-100',
        iconText: 'text-orange-700',
        dbText: 'text-orange-700',
        titleText: 'text-gray-800',
        descText: 'text-gray-600',
        btnBg: 'bg-orange-600 hover:bg-orange-700'
      }
    };
    
    return colors[color] || colors.amber;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Download className="h-6 w-6 text-amber-700" />
              </div>
              <h1 className="text-2xl font-bold text-gray-800">Downloads</h1>
            </div>
            <p className="text-gray-600">Export your data as Excel files</p>
          </div>

      {/* Download Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
        {downloadItems.map((item) => {
          const Icon = item.icon;
          const colors = getColorClasses(item.color, item.enabled);
          
          return (
            <div 
              key={item.id}
              className={`${colors.bg} rounded-xl border ${colors.border} p-5 ${item.enabled ? 'hover:shadow-lg' : 'opacity-60'} transition-all flex flex-col h-full`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2.5 ${colors.iconBg} rounded-lg`}>
                  <Icon className={`h-5 w-5 ${colors.iconText}`} />
                </div>
                <div>
                  <h3 className={`font-semibold ${colors.titleText}`}>{item.title}</h3>
                  <p className={`text-xs font-mono font-semibold ${colors.dbText}`}>{item.dbName}</p>
                </div>
              </div>
              
              <p className={`text-sm ${colors.descText} mb-5 flex-1`}>
                {item.description}
              </p>
              
              {item.enabled ? (
                <Button
                  onClick={() => handleDownload(item.endpoint, item.filename, item.extension)}
                  className={`w-full ${colors.btnBg} text-white mt-auto`}
                  data-testid={`download-${item.id}-btn`}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  {item.buttonLabel || 'Download Excel'}
                </Button>
              ) : (
                <Button disabled className="w-full mt-auto" variant="outline">
                  Coming Soon
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-gray-600" />
          Export Information
        </h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• All exports are in Excel format (.xlsx)</li>
          <li>• Data is filtered to show only your records</li>
          <li>• Exports include all columns with proper formatting</li>
          <li>• Large datasets may take a moment to generate</li>
        </ul>
      </div>
        </div>
      </div>
    </div>
  );
}
