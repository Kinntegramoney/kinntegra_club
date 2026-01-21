import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
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
import BulkUpload from "@/pages/BulkUpload";
import Analysis from "@/pages/Analysis";
import AnalysisDashboard from "@/pages/AnalysisDashboard";
import AdminSchemeMaster from "@/pages/AdminSchemeMaster";
import ReinvestmentTagging from "@/pages/ReinvestmentTagging";
import ApprovalLogs from "@/pages/ApprovalLogs";
import PendingApprovals from "@/pages/PendingApprovals";
import { Toaster } from "@/components/ui/sonner";

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  
  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }
  
  const parsedUser = JSON.parse(user);
  if (allowedRoles && !allowedRoles.includes(parsedUser.role)) {
    // Redirect to appropriate dashboard based on role
    if (parsedUser.role === "broker") {
      return <Navigate to="/broker/dashboard" replace />;
    } else if (parsedUser.role === "client") {
      return <Navigate to="/client/opportunities" replace />;
    } else {
      return <Navigate to="/sub-broker/dashboard" replace />;
    }
  }
  
  return children;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<CustomerSignup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          
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
                <SubBrokerOpportunities />
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
                <ClientOpportunities />
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
          
          {/* Sub-Broker Reinvestment Route */}
          <Route 
            path="/sub-broker/reinvestment" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <SubBrokerReinvestment />
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
      <Toaster />
    </div>
  );
}

export default App;