import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import LandingPage from "@/pages/LandingPage";
import CustomerSignup from "@/pages/CustomerSignup";
import ForgotPassword from "@/pages/ForgotPassword";
import Dashboard from "@/pages/Dashboard";
import Opportunities from "@/pages/Opportunities";
import AdminBonds from "@/pages/AdminBonds";
import AdminSubBrokers from "@/pages/AdminSubBrokers";
import AdminClients from "@/pages/AdminClients";
import AdminRealEstate from "@/pages/AdminRealEstate";
import TradeVerification from "@/pages/TradeVerification";
import Holdings from "@/pages/Holdings";
import SubBrokerOpportunities from "@/pages/SubBrokerOpportunities";
import SubBrokerProfile from "@/pages/SubBrokerProfile";
import SubBrokerDashboard from "@/pages/SubBrokerDashboard";
import SubBrokerClients from "@/pages/SubBrokerClients";
import SubBrokerReinvestment from "@/pages/SubBrokerReinvestment";
import SubBrokerAnalysis from "@/pages/SubBrokerAnalysis";
import CreateBondNew from "@/pages/CreateBondNew";
import BondDetails from "@/pages/BondDetails";
import RealEstateDetails from "@/pages/RealEstateDetails";
import ClientOpportunities from "@/pages/ClientOpportunities";
import ClientHoldings from "@/pages/ClientHoldings";
import ClientTradeVerification from "@/pages/ClientTradeVerification";
import ClientProfile from "@/pages/ClientProfile";
import ClientRealEstateInvestments from "@/pages/ClientRealEstateInvestments";
import ClientReinvestmentApprovals from "@/pages/ClientReinvestmentApprovals";
import ClientApprovals from "@/pages/ClientApprovals";
import ClientLogs from "@/pages/ClientLogs";
import BulkUpload from "@/pages/BulkUpload";
import Analysis from "@/pages/Analysis";
import AnalysisDashboard from "@/pages/AnalysisDashboard";
import AdminSchemeMaster from "@/pages/AdminSchemeMaster";
import ReinvestmentTagging from "@/pages/ReinvestmentTagging";
import ApprovalLogs from "@/pages/ApprovalLogs";
import ApprovalCenter from "@/pages/ApprovalCenter";
import PendingApprovals from "@/pages/PendingApprovals";
import SubBrokerClientDetails from "@/pages/SubBrokerClientDetails";
import BrokerSettings from "@/pages/BrokerSettings";
import BrokerProfile from "@/pages/BrokerProfile";
import LeadManagement from "@/pages/LeadManagement";
import ApprovalsPage from "@/pages/ApprovalsPage";
import TradeLogs from "@/pages/TradeLogs";
import UntaggedTrades from "@/pages/UntaggedTrades";
import EmailEngagementDashboard from "@/pages/EmailEngagementDashboard";
import DataGathering from "@/pages/DataGathering";
import { Toaster } from "@/components/ui/sonner";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import InstallPWA from "@/components/InstallPWA";
import SyncStatus from "@/components/SyncStatus";

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  
  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }
  
  const parsedUser = JSON.parse(user);
  if (allowedRoles && !allowedRoles.includes(parsedUser.role)) {
    // Redirect to appropriate page based on role (opportunities as default since dashboard may be disabled)
    if (parsedUser.role === "broker") {
      return <Navigate to="/broker/opportunities" replace />;
    } else if (parsedUser.role === "client") {
      return <Navigate to="/client/opportunities" replace />;
    } else {
      return <Navigate to="/sub-broker/opportunities" replace />;
    }
  }
  
  return children;
};

function App() {
  return (
    <div className="App">
      <PermissionsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<CustomerSignup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            
            {/* Broker Routes */}
            <Route 
              path="/broker/dashboard" 
              element={
                <ProtectedRoute allowedRoles={["broker"]}>
                  <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/opportunities" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <Opportunities />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/admin/bonds" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <AdminBonds />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/admin/sub-brokers" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <AdminSubBrokers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/admin/clients" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <AdminClients />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/admin/real-estate" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <AdminRealEstate />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/admin/scheme-master" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <AdminSchemeMaster />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/trades" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <TradeVerification />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/holdings" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <Holdings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/real-estate/:id" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <RealEstateDetails />
              </ProtectedRoute>
            } 
          />
          {/* Redirect old approval routes to Lead Management */}
          <Route 
            path="/broker/pending-approvals" 
            element={<Navigate to="/broker/leads" replace />}
          />
          <Route 
            path="/broker/approval-logs" 
            element={<Navigate to="/broker/leads" replace />}
          />
          
          {/* Sub-Broker Routes */}
          <Route 
            path="/sub-broker/dashboard" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/sub-broker/opportunities" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <Opportunities />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/sub-broker/holdings" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <Holdings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/sub-broker/real-estate/:id" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <RealEstateDetails />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/bulk-upload" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <BulkUpload />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/settings" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <BrokerSettings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/profile" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <BrokerProfile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/data-gathering" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <DataGathering />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/data-gathering/:familyId" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <DataGathering />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/leads" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <LeadManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/approvals" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <ApprovalsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/logs" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <TradeLogs />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/email-engagement" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <EmailEngagementDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/broker/trade-tagging" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <UntaggedTrades />
              </ProtectedRoute>
            } 
          />
          
          {/* Shared Routes */}
          <Route 
            path="/bonds/create" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <CreateBondNew />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/bonds/:id" 
            element={
              <ProtectedRoute allowedRoles={["broker", "sub_broker", "client"]}>
                <BondDetails />
              </ProtectedRoute>
            } 
          />
          
          {/* Client Routes */}
          <Route 
            path="/client/opportunities" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <Opportunities />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/holdings" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ClientHoldings />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/approvals" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ClientApprovals />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/logs" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ClientLogs />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/trades" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ClientTradeVerification />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/profile" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ClientProfile />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/real-estate" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ClientRealEstateInvestments />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/real-estate/:id" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <RealEstateDetails />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/client/reinvestment-approvals" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ClientReinvestmentApprovals />
              </ProtectedRoute>
            } 
          />
          
          {/* Analysis Route - All Users */}
          <Route 
            path="/analysis" 
            element={
              <ProtectedRoute allowedRoles={["broker", "sub_broker", "client"]}>
                <Analysis />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker specific Analysis Route */}
          <Route 
            path="/sub-broker/analysis" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerAnalysis />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Clients Route */}
          <Route 
            path="/sub-broker/clients" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerClients />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Client Details Route */}
          <Route 
            path="/sub-broker/clients/:clientId" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerClientDetails />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Reinvestment Route */}
          <Route 
            path="/sub-broker/reinvestment" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerReinvestment />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Lead Management Route */}
          <Route 
            path="/sub-broker/leads" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <LeadManagement />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Logs Route */}
          <Route 
            path="/sub-broker/logs" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <TradeLogs />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Trade Tagging Route */}
          <Route 
            path="/sub-broker/trade-tagging" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <UntaggedTrades />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Approval Logs Route */}
          <Route 
            path="/sub-broker/approval-logs" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <ApprovalLogs />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Profile Route */}
          <Route 
            path="/sub-broker/profile" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerProfile />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Data Gathering Routes */}
          <Route 
            path="/sub-broker/data-gathering" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <DataGathering />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/sub-broker/data-gathering/:familyId" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <DataGathering />
              </ProtectedRoute>
            } 
          />
          
          {/* Client Trade Approvals Route */}
          <Route 
            path="/client/trade-approvals" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <UntaggedTrades />
              </ProtectedRoute>
            } 
          />
          
          {/* Client Approval Logs Route */}
          <Route 
            path="/client/approval-logs" 
            element={
              <ProtectedRoute allowedRoles={["client"]}>
                <ApprovalLogs />
              </ProtectedRoute>
            } 
          />
          
          {/* Analysis Dashboard - Opens in new tab */}
          <Route 
            path="/analysis/dashboard/:analysisId" 
            element={
              <ProtectedRoute allowedRoles={["broker", "sub_broker", "client"]}>
                <AnalysisDashboard />
              </ProtectedRoute>
            } 
          />
          
          {/* Reinvestment Tagging Route - Broker Only */}
          <Route 
            path="/broker/reinvestment" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <ReinvestmentTagging />
              </ProtectedRoute>
            } 
          />
          </Routes>
        </BrowserRouter>
      </PermissionsProvider>
      <Toaster />
      <InstallPWA />
      <SyncStatus />
    </div>
  );
}

export default App;