import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Opportunities from "@/pages/Opportunities";
import AdminBonds from "@/pages/AdminBonds";
import AdminSubBrokers from "@/pages/AdminSubBrokers";
import AdminClients from "@/pages/AdminClients";
import TradeVerification from "@/pages/TradeVerification";
import Holdings from "@/pages/Holdings";
import ReinvestmentTagging from "@/pages/ReinvestmentTagging";
import SubBrokerOpportunities from "@/pages/SubBrokerOpportunities";
import CreateBond from "@/pages/CreateBond";
import BondDetails from "@/pages/BondDetails";
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
    } else {
      return <Navigate to="/sub-broker/opportunities" replace />;
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
            path="/broker/reinvestment" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <ReinvestmentTagging />
              </ProtectedRoute>
            } 
          />
          
          {/* Sub-Broker Routes */}
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
            path="/sub-broker/reinvestment" 
            element={
              <ProtectedRoute allowedRoles={["sub_broker"]}>
                <ReinvestmentTagging />
              </ProtectedRoute>
            } 
          />
          
          {/* Shared Routes */}
          <Route 
            path="/bonds/create" 
            element={
              <ProtectedRoute allowedRoles={["broker"]}>
                <CreateBond />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/bonds/:id" 
            element={
              <ProtectedRoute allowedRoles={["broker", "sub_broker"]}>
                <BondDetails />
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