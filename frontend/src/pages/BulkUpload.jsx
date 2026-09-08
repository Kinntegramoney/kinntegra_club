import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import RealEstateUploadPanel from "@/components/RealEstateUploadPanel";
import RealEstateInvestorBulkUpload from "@/components/RealEstateInvestorBulkUpload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, Download, FileSpreadsheet, Users, Building2, 
  TrendingUp, CheckCircle2, XCircle, AlertCircle, ArrowLeft, History,
  Database, ExternalLink, RefreshCw, Calendar, FileText, Loader2, Mail, Link2,
  Image as ImageIcon, ChevronDown, ChevronRight, FileCheck, Receipt
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function BulkUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || "sub-brokers";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  // Real Estate Step 3 / Step 4 state — image + presentation upload per property
  const [reSelectedPropId, setReSelectedPropId] = useState("");
  const [reImageUploadingId, setReImageUploadingId] = useState("");
  const [rePresUploadingId, setRePresUploadingId] = useState("");
  const [reUploadedCounts, setReUploadedCounts] = useState({}); // { [propId]: { images: n, presentations: n } }
  const [reExpandedBuildings, setReExpandedBuildings] = useState({}); // { [building_name]: true }

  const toggleReBuilding = (bn) => {
    setReExpandedBuildings(prev => ({ ...prev, [bn]: !prev[bn] }));
  };

  const handleReImageUpload = async (propId, files) => {
    if (!propId || !files || files.length === 0) return;
    setReImageUploadingId(propId);
    try {
      const token = localStorage.getItem("token");
      const form = new FormData();
      Array.from(files).forEach(f => form.append("files", f));
      const resp = await axios.post(
        `${API}/real-estate-opportunities/${propId}/images`,
        form,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } }
      );
      const uploaded = resp.data?.uploaded ?? resp.data?.image_ids?.length ?? 0;
      const skipped = resp.data?.skipped ?? 0;
      setReUploadedCounts(prev => ({
        ...prev,
        [propId]: { ...(prev[propId] || {}), images: (prev[propId]?.images || 0) + uploaded }
      }));
      if (uploaded > 0 && skipped > 0) {
        toast.success(`Uploaded ${uploaded} image(s) • ${skipped} duplicate(s) skipped`);
      } else if (uploaded > 0) {
        toast.success(`Uploaded ${uploaded} image(s)`);
      } else if (skipped > 0) {
        toast.info(`All ${skipped} image(s) already exist on this property`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to upload images");
    } finally {
      setReImageUploadingId("");
    }
  };

  const handleRePresentationUpload = async (propId, files) => {
    if (!propId || !files || files.length === 0) return;
    setRePresUploadingId(propId);
    try {
      const token = localStorage.getItem("token");
      const form = new FormData();
      Array.from(files).forEach(f => form.append("files", f));
      const resp = await axios.post(
        `${API}/real-estate-opportunities/${propId}/presentations`,
        form,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } }
      );
      const uploaded = resp.data?.uploaded ?? resp.data?.presentation_ids?.length ?? 0;
      const skipped = resp.data?.skipped ?? 0;
      setReUploadedCounts(prev => ({
        ...prev,
        [propId]: { ...(prev[propId] || {}), presentations: (prev[propId]?.presentations || 0) + uploaded }
      }));
      if (uploaded > 0 && skipped > 0) {
        toast.success(`Uploaded ${uploaded} presentation(s) • ${skipped} duplicate(s) skipped`);
      } else if (uploaded > 0) {
        toast.success(`Uploaded ${uploaded} presentation(s)`);
      } else if (skipped > 0) {
        toast.info(`All ${skipped} presentation(s) already exist on this property`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to upload presentations");
    } finally {
      setRePresUploadingId("");
    }
  };

  // Batch: apply the same image set to every unit in a building.
  const handleReImageBatchUpload = async (propIds, files, groupKey) => {
    if (!propIds?.length || !files?.length) return;
    setReImageUploadingId(groupKey);
    try {
      const token = localStorage.getItem("token");
      let totalUploaded = 0;
      let totalSkipped = 0;
      for (const propId of propIds) {
        const form = new FormData();
        Array.from(files).forEach(f => form.append("files", f));
        const resp = await axios.post(
          `${API}/real-estate-opportunities/${propId}/images`,
          form,
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } }
        );
        const uploaded = resp.data?.uploaded ?? resp.data?.image_ids?.length ?? 0;
        const skipped = resp.data?.skipped ?? 0;
        totalUploaded += uploaded;
        totalSkipped += skipped;
        setReUploadedCounts(prev => ({
          ...prev,
          [propId]: { ...(prev[propId] || {}), images: (prev[propId]?.images || 0) + uploaded }
        }));
      }
      toast.success(
        `Applied images to ${propIds.length} unit(s): ${totalUploaded} uploaded` +
        (totalSkipped ? ` • ${totalSkipped} duplicate(s) skipped` : "")
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to upload images");
    } finally {
      setReImageUploadingId("");
    }
  };

  // Batch: apply the same presentation set to every unit in a building.
  const handleRePresentationBatchUpload = async (propIds, files, groupKey) => {
    if (!propIds?.length || !files?.length) return;
    setRePresUploadingId(groupKey);
    try {
      const token = localStorage.getItem("token");
      let totalUploaded = 0;
      let totalSkipped = 0;
      for (const propId of propIds) {
        const form = new FormData();
        Array.from(files).forEach(f => form.append("files", f));
        const resp = await axios.post(
          `${API}/real-estate-opportunities/${propId}/presentations`,
          form,
          { headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } }
        );
        const uploaded = resp.data?.uploaded ?? resp.data?.presentation_ids?.length ?? 0;
        const skipped = resp.data?.skipped ?? 0;
        totalUploaded += uploaded;
        totalSkipped += skipped;
        setReUploadedCounts(prev => ({
          ...prev,
          [propId]: { ...(prev[propId] || {}), presentations: (prev[propId]?.presentations || 0) + uploaded }
        }));
      }
      toast.success(
        `Applied presentations to ${propIds.length} unit(s): ${totalUploaded} uploaded` +
        (totalSkipped ? ` • ${totalSkipped} duplicate(s) skipped` : "")
      );
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to upload presentations");
    } finally {
      setRePresUploadingId("");
    }
  };
  const [user, setUser] = useState(null);
  
  // Email Sync state (for historical trades)
  const [syncingEmails, setSyncingEmails] = useState(false);
  const [emailSyncResults, setEmailSyncResults] = useState(null);
  
  // Scheme Master state
  const [schemeMasterStatus, setSchemeMasterStatus] = useState(null);
  const [schemeMasterFile, setSchemeMasterFile] = useState(null);
  const [schemeUploading, setSchemeUploading] = useState(false);
  const [schemeProcessingStatus, setSchemeProcessingStatus] = useState('');
  const [schemeProcessingProgress, setSchemeProcessingProgress] = useState(0);
  const [loadingSchemeMaster, setLoadingSchemeMaster] = useState(false);
  
  // Benchmark Data state
  const [benchmarkStatus, setBenchmarkStatus] = useState(null);
  const [loadingBenchmark, setLoadingBenchmark] = useState(false);
  
  // Stockwise Holding state
  const [stockwiseStatus, setStockwiseStatus] = useState(null);
  const [loadingStockwise, setLoadingStockwise] = useState(false);
  
  // Scheme-Benchmark Mapping state
  const [schemeBenchmarkStatus, setSchemeBenchmarkStatus] = useState(null);
  const [loadingSchemeBenchmark, setLoadingSchemeBenchmark] = useState(false);
  
  // AMFI Scheme Data state
  const [amfiSchemeStatus, setAmfiSchemeStatus] = useState(null);
  const [loadingAmfiScheme, setLoadingAmfiScheme] = useState(false);
  const [amfiJobId, setAmfiJobId] = useState(null);
  const [amfiJobStatus, setAmfiJobStatus] = useState(null);
  
  // Benchmark NAV Data state
  const [benchmarkJobId, setBenchmarkJobId] = useState(null);
  const [benchmarkJobStatus, setBenchmarkJobStatus] = useState(null);
  
  // Benchmark API Sync state
  const [syncSchedulerStatus, setSyncSchedulerStatus] = useState(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(false);
  const [syncBackfillJobId, setSyncBackfillJobId] = useState(null);
  const [syncBackfillStatus, setSyncBackfillStatus] = useState(null);
  const [triggeringSync, setTriggeringSync] = useState(false);
  const [togglingScheduler, setTogglingScheduler] = useState(false);
  
  // Active upload jobs state
  const [activeJobs, setActiveJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  
  // CAS Analysis sub-tab state
  const [casActiveSubTab, setCasActiveSubTab] = useState("amfi-scheme-data");
  
  // NCD sub-tab state
  const [ncdActiveSubTab, setNcdActiveSubTab] = useState("create-ncd");

  // Real Estate sub-tab state (Create / Payment Schedule / Payment Details)
  const [reActiveSubTab, setReActiveSubTab] = useState("create-real-estate");
  
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ["sub-brokers", "clients", "re-brokers", "ncd", "real-estate", "cas-analysis"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Load user from localStorage
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);
  
  // Fetch scheme master status when tab is cas-analysis and subtab is scheme-master
  useEffect(() => {
    if (activeTab === 'cas-analysis') {
      if (casActiveSubTab === 'amfi-scheme-data') {
        fetchAmfiSchemeStatus();
      } else if (casActiveSubTab === 'scheme-master') {
        fetchSchemeMasterStatus();
      } else if (casActiveSubTab === 'benchmark-data') {
        fetchBenchmarkStatus();
        fetchSyncSchedulerStatus(); // Also fetch API sync status
      } else if (casActiveSubTab === 'stockwise-holding') {
        fetchStockwiseStatus();
      } else if (casActiveSubTab === 'scheme-benchmark-mapping') {
        fetchSchemeBenchmarkStatus();
      }
    }
  }, [activeTab, casActiveSubTab]);
  
  const fetchBenchmarkStatus = async () => {
    try {
      setLoadingBenchmark(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/benchmark-data/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBenchmarkStatus(response.data);
    } catch (error) {
      console.error("Error fetching benchmark status:", error);
    } finally {
      setLoadingBenchmark(false);
    }
  };
  
  const fetchStockwiseStatus = async () => {
    try {
      setLoadingStockwise(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/stockwise-holding/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStockwiseStatus(response.data);
    } catch (error) {
      console.error("Error fetching stockwise status:", error);
    } finally {
      setLoadingStockwise(false);
    }
  };
  
  const fetchSchemeBenchmarkStatus = async () => {
    try {
      setLoadingSchemeBenchmark(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/scheme-benchmark-mapping/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchemeBenchmarkStatus(response.data);
    } catch (error) {
      console.error("Error fetching scheme-benchmark mapping status:", error);
    } finally {
      setLoadingSchemeBenchmark(false);
    }
  };
  
  const fetchAmfiSchemeStatus = async () => {
    try {
      setLoadingAmfiScheme(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/amfi-scheme-data/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAmfiSchemeStatus(response.data);
    } catch (error) {
      console.error("Error fetching AMFI scheme status:", error);
    } finally {
      setLoadingAmfiScheme(false);
    }
  };
  
  // Fetch active jobs on mount and when CAS Analysis tab is active
  useEffect(() => {
    if (activeTab === 'cas-analysis') {
      fetchActiveJobs();
    }
  }, [activeTab]);
  
  // Poll AMFI job status
  const pollAmfiJobStatus = async (jobId) => {
    const token = localStorage.getItem("token");
    const poll = async () => {
      try {
        const response = await axios.get(`${API}/bulk/amfi-scheme-data/job/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAmfiJobStatus(response.data);
        
        if (response.data.status === 'completed') {
          toast.success(`AMFI upload complete! ${response.data.success} schemes, ${response.data.isin_records_created} ISIN records`);
          setAmfiJobId(null);
          fetchAmfiSchemeStatus();
        } else if (response.data.status === 'failed') {
          toast.error(`Upload failed: ${response.data.error}`);
          setAmfiJobId(null);
        } else {
          // Continue polling
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error("Error polling AMFI job:", error);
        setTimeout(poll, 3000);
      }
    };
    poll();
  };
  
  // Poll Benchmark NAV job status
  const pollBenchmarkJobStatus = async (jobId) => {
    const token = localStorage.getItem("token");
    const poll = async () => {
      try {
        const response = await axios.get(`${API}/bulk/benchmark-nav-data/job/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setBenchmarkJobStatus(response.data);
        
        if (response.data.status === 'completed') {
          toast.success(`Benchmark NAV upload complete! ${response.data.success} records from ${response.data.unique_benchmarks} benchmarks`);
          setBenchmarkJobId(null);
          fetchBenchmarkStatus();
        } else if (response.data.status === 'failed') {
          toast.error(`Upload failed: ${response.data.error}`);
          setBenchmarkJobId(null);
        } else {
          // Continue polling
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error("Error polling benchmark job:", error);
        setTimeout(poll, 3000);
      }
    };
    poll();
  };
  
  // Cancel AMFI upload job
  const cancelAmfiJob = async () => {
    if (!amfiJobId) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/bulk/amfi-scheme-data/job/${amfiJobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("AMFI upload cancelled");
      setAmfiJobId(null);
      setAmfiJobStatus(null);
      fetchAmfiSchemeStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to cancel job");
    }
  };
  
  // Cancel Benchmark upload job
  const cancelBenchmarkJob = async () => {
    if (!benchmarkJobId) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`${API}/bulk/benchmark-nav-data/job/${benchmarkJobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Benchmark upload cancelled");
      setBenchmarkJobId(null);
      setBenchmarkJobStatus(null);
      fetchBenchmarkStatus();
      fetchActiveJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to cancel job");
    }
  };
  
  // Fetch all active upload jobs
  const fetchActiveJobs = async () => {
    try {
      setLoadingJobs(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bulk/upload-jobs?limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Filter only processing/reading jobs
      const runningJobs = (response.data.jobs || []).filter(
        job => ['processing', 'reading_complete', 'reading'].includes(job.status)
      );
      setActiveJobs(runningJobs);
    } catch (error) {
      console.error("Error fetching active jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  };
  
  // Cancel any upload job by ID and type
  const cancelJobById = async (jobId, jobType) => {
    try {
      const token = localStorage.getItem("token");
      const endpoint = jobType === 'amfi_scheme' 
        ? `/bulk/amfi-scheme-data/job/${jobId}`
        : `/bulk/benchmark-nav-data/job/${jobId}`;
      
      await axios.delete(`${API}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Upload cancelled");
      fetchActiveJobs();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to cancel job");
    }
  };
  
  // Fetch benchmark API sync scheduler status
  const fetchSyncSchedulerStatus = async () => {
    try {
      setLoadingSyncStatus(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/benchmark-sync/scheduler-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSyncSchedulerStatus(response.data);
    } catch (error) {
      console.error("Error fetching sync scheduler status:", error);
      // If endpoint not found, scheduler might not be initialized
      setSyncSchedulerStatus({ status: 'not_initialized' });
    } finally {
      setLoadingSyncStatus(false);
    }
  };
  
  // Poll backfill job status
  const pollBackfillJobStatus = async (jobId) => {
    const token = localStorage.getItem("token");
    const poll = async () => {
      try {
        const response = await axios.get(`${API}/benchmark-sync/job/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSyncBackfillStatus(response.data);
        
        if (response.data.status === 'completed') {
          toast.success(`Backfill complete! ${response.data.result?.total_added || 0} records added`);
          setSyncBackfillJobId(null);
          fetchBenchmarkStatus();
          fetchSyncSchedulerStatus();
        } else if (response.data.status === 'failed') {
          toast.error(`Backfill failed: ${response.data.error}`);
          setSyncBackfillJobId(null);
        } else {
          setTimeout(poll, 5000); // Poll every 5 seconds
        }
      } catch (error) {
        console.error("Error polling backfill job:", error);
        setTimeout(poll, 5000);
      }
    };
    poll();
  };
  
  // Trigger daily sync manually
  const handleTriggerDailySync = async () => {
    setTriggeringSync(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/benchmark-sync/trigger-daily`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Daily sync completed! ${response.data.result?.added || 0} records added`);
      fetchBenchmarkStatus();
      fetchSyncSchedulerStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to trigger daily sync");
    } finally {
      setTriggeringSync(false);
    }
  };
  
  // Start or stop the scheduler
  const handleToggleScheduler = async (start) => {
    setTogglingScheduler(true);
    try {
      const token = localStorage.getItem("token");
      const endpoint = start ? 'start-scheduler' : 'stop-scheduler';
      const response = await axios.post(`${API}/benchmark-sync/${endpoint}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(response.data.message);
      fetchSyncSchedulerStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${start ? 'start' : 'stop'} scheduler`);
    } finally {
      setTogglingScheduler(false);
    }
  };
  
  // Trigger backfill
  const handleTriggerBackfill = async (startDate) => {
    setTriggeringSync(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API}/benchmark-sync/backfill?start_date=${startDate}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSyncBackfillJobId(response.data.job_id);
      setSyncBackfillStatus({ status: 'processing' });
      toast.info("Backfill started. This may take several minutes...");
      pollBackfillJobStatus(response.data.job_id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to start backfill");
    } finally {
      setTriggeringSync(false);
    }
  };
  
  // Sync repayments from email (reads from updates@kinntegraa.club)
  const handleSyncEmailRepayments = async (daysBack = 30) => {
    setSyncingEmails(true);
    setEmailSyncResults(null);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${API}/email-reader/process?days_back=${daysBack}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const result = response.data;
      setEmailSyncResults(result);
      
      if (result.processed > 0 || result.matched > 0) {
        toast.success(`Synced ${result.matched} repayments from ${result.total_emails} emails`);
      } else if (result.total_emails === 0) {
        toast.info("No new repayment emails found");
      } else {
        toast.warning(`Found ${result.total_emails} emails but no matches`);
      }
    } catch (error) {
      console.error("Error syncing email repayments:", error);
      toast.error(error.response?.data?.detail || "Failed to sync repayments from emails");
    } finally {
      setSyncingEmails(false);
    }
  };

  const fetchSchemeMasterStatus = async () => {
    try {
      setLoadingSchemeMaster(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/analysis/scheme-master/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchemeMasterStatus(response.data);
    } catch (error) {
      console.error('Error fetching scheme master status:', error);
    } finally {
      setLoadingSchemeMaster(false);
    }
  };

  const handleSchemeMasterUpload = async (e) => {
    e.preventDefault();
    
    if (!schemeMasterFile) {
      toast.error('Please select a scheme master file');
      return;
    }

    setSchemeUploading(true);
    setSchemeProcessingStatus('Uploading BSE Scheme Master...');
    setSchemeProcessingProgress(20);
    
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', schemeMasterFile);

      setSchemeProcessingStatus('Processing scheme data...');
      setSchemeProcessingProgress(50);

      const response = await axios.post(`${API}/analysis/upload-scheme-master`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setSchemeProcessingProgress(90);

      setSchemeProcessingStatus('Scheme master uploaded successfully!');
      setSchemeProcessingProgress(100);
      
      setTimeout(() => {
        toast.success(`${response.data.schemes_added} new schemes added (${response.data.total_schemes_in_file} total in file)`);
        setSchemeMasterFile(null);
        setSchemeProcessingStatus('');
        setSchemeProcessingProgress(0);
        fetchSchemeMasterStatus();
      }, 500);
    } catch (error) {
      console.error('Error uploading scheme master:', error);
      setSchemeProcessingStatus('');
      setSchemeProcessingProgress(0);
      toast.error(error.response?.data?.detail || 'Error uploading file');
    } finally {
      setSchemeUploading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const tabs = [
    { id: "sub-brokers", label: "MFD/RIA Partners", icon: Users, color: "indigo" },
    { id: "clients", label: "Private Investors", icon: Users, color: "purple" },
    { id: "re-brokers", label: "Real Estate Partners", icon: Building2, color: "teal" },
    { id: "ncd", label: "NCD", icon: TrendingUp, color: "green" },
    { id: "real-estate", label: "Real Estate", icon: Building2, color: "orange" },
    { id: "cas-analysis", label: "CAS Analysis", icon: Database, color: "blue" }
  ];
  
  // NCD sub-tabs
  const ncdSubTabs = [
    { id: "create-ncd", label: "Create NCD", icon: TrendingUp },
    { id: "investment-details", label: "Investment Details", icon: FileText },
    { id: "historical-repayments", label: "Historical Repayments", icon: History }
  ];

  // Real Estate sub-tabs
  const reSubTabs = [
    { id: "create-real-estate", label: "Create Real Estate", icon: Building2 },
    { id: "real-estate-investors", label: "Real Estate Investors", icon: Users },
    { id: "real-estate-invoices", label: "Real Estate Invoices", icon: FileCheck },
    { id: "investor-payment-details", label: "Investor Payment Details", icon: FileSpreadsheet },
    { id: "investor-payment-receipts", label: "Investor Payment Receipts", icon: Receipt }
  ];
  
  // CAS Analysis sub-tabs
  const casSubTabs = [
    { id: "amfi-scheme-data", label: "AMFI Data", icon: Database },
    { id: "scheme-benchmark-mapping", label: "ISIN-Benchmark Link", icon: Link2 },
    { id: "scheme-master", label: "BSE Scheme Master", icon: Database },
    { id: "stockwise-holding", label: "Stocklist", icon: FileSpreadsheet },
    { id: "benchmark-data", label: "Benchmark Data", icon: TrendingUp }
  ];
  
  // MF sub-tabs

  const downloadTemplate = async (type) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/bulk/template/${type}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      // Special filename overrides for specific templates
      const filenameOverrides = {
        'sub-brokers': 'MFD_RIA_PARTNER_TEMPLATE.xlsx',
        'clients-indian': 'PRIVATE_INVESTOR_INDIAN_TEMPLATE.xlsx',
        'clients-foreign': 'PRIVATE_INVESTOR_FOREIGN_TEMPLATE.xlsx',
        're-brokers': 'REAL_ESTATE_PARTNER_TEMPLATE.xlsx',
        'bonds': 'NCD_MASTER_TEMPLATE.xlsx',
        'real-estate': 'REAL_ESTATE_OPPORTUNITY_TEMPLATE.xlsx'
      };
      const filename = filenameOverrides[type] || `${type}_template.xlsx`;
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Template downloaded successfully!");
    } catch (error) {
      toast.error("Failed to download template");
    }
  };

  // Client upload type state
  const [clientUploadType, setClientUploadType] = useState('indian');
  
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    setUploading(true);
    setResults(null);

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append('file', file);

      // Determine the correct endpoint
      let uploadEndpoint = `${API}/bulk/${activeTab}`;
      if (activeTab === 'clients') {
        uploadEndpoint = `${API}/bulk/private-investors-${clientUploadType}`;
      } else if (activeTab === 'investment-details') {
        uploadEndpoint = `${API}/bulk/investment-details`;
      }

      const response = await axios.post(uploadEndpoint, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setResults(response.data);
      
      if (response.data.success > 0) {
        toast.success(`Successfully uploaded ${response.data.success} records!`);
      }
      if (response.data.failed > 0) {
        toast.error(`${response.data.failed} records failed`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
      setResults({ success: 0, failed: 1, errors: [error.message] });
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const getTabColor = (tabId) => {
    const colors = {
      "sub-brokers": { bg: "bg-etihad-maroon-600", light: "bg-indigo-50", text: "text-etihad-maroon-600", border: "border-indigo-200" },
      "clients": { bg: "bg-purple-600", light: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
      "re-brokers": { bg: "bg-teal-600", light: "bg-teal-50", text: "text-teal-600", border: "border-teal-200" },
      "ncd": { bg: "bg-green-600", light: "bg-green-50", text: "text-green-600", border: "border-green-200" },
      "real-estate": { bg: "bg-orange-600", light: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" },
      "cas-analysis": { bg: "bg-blue-600", light: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" }
    };
    return colors[tabId] || colors["sub-brokers"];
  };
  
  const getNcdSubTabColor = (subTabId) => {
    const colors = {
      "create-ncd": { bg: "bg-green-600", light: "bg-green-50", text: "text-green-600", border: "border-green-200" },
      "investment-details": { bg: "bg-cyan-600", light: "bg-cyan-50", text: "text-cyan-600", border: "border-cyan-200" },
      "historical-repayments": { bg: "bg-amber-600", light: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" }
    };
    return colors[subTabId] || colors["create-ncd"];
  };
  
  const getCasSubTabColor = (subTabId) => {
    const colors = {
      "amfi-scheme-data": { bg: "bg-indigo-600", light: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200" },
      "scheme-master": { bg: "bg-blue-600", light: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
      "benchmark-data": { bg: "bg-violet-600", light: "bg-violet-50", text: "text-violet-600", border: "border-violet-200" },
      "stockwise-holding": { bg: "bg-emerald-600", light: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
      "scheme-benchmark-mapping": { bg: "bg-orange-600", light: "bg-orange-50", text: "text-orange-600", border: "border-orange-200" }
    };
    return colors[subTabId] || colors["scheme-master"];
  };

  const currentColor = getTabColor(activeTab);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className={`${currentColor.bg} text-white px-8 py-6`}>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate("/broker/opportunities")}
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <FileSpreadsheet className="h-7 w-7" />
                Bulk Upload
              </h1>
              <p className="text-white/80 mt-1">Upload multiple records using Excel templates</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setResults(null); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === tab.id
                    ? `${getTabColor(tab.id).bg} text-white shadow-lg`
                    : 'bg-white text-gray-600 hover:bg-gray-100 border'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* NCD Content - with sub-tabs */}
          {activeTab === "ncd" ? (
            <div className="space-y-6">
              {/* Sub-tabs for NCD */}
              <div className="flex gap-2 border-b border-gray-200 pb-4">
                {ncdSubTabs.map((subTab) => {
                  const subColor = getNcdSubTabColor(subTab.id);
                  return (
                    <button
                      key={subTab.id}
                      onClick={() => setNcdActiveSubTab(subTab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        ncdActiveSubTab === subTab.id
                          ? `${subColor.bg} text-white shadow-md`
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      data-testid={`ncd-subtab-${subTab.id}`}
                    >
                      <subTab.icon className="h-4 w-4" />
                      {subTab.label}
                    </button>
                  );
                })}
              </div>

              {/* Create NCD Sub-tab */}
              {ncdActiveSubTab === "create-ncd" && (
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-green-50 rounded-xl border border-green-200 p-6">
                    <h2 className="text-lg font-semibold text-green-600 mb-4 flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      Step 1: Download Template
                    </h2>
                    
                    <div className="space-y-4">
                      <p className="text-gray-600">
                        Download the Excel template, fill in your NCD details, and upload it back.
                      </p>
                      
                      <div className="bg-white rounded-lg p-4 border">
                        <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• NCD Code, Name, Principal Amount</li>
                          <li>• Primary/Secondary IRR</li>
                          <li>• Start and Maturity Dates</li>
                          <li>• Auto-generates payment schedules</li>
                        </ul>
                      </div>

                      <Button 
                        onClick={() => downloadTemplate('bonds')}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Create NCD Template
                      </Button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-green-600" />
                      Step 2: Upload Filled Template
                    </h2>

                    <div 
                      className="border-2 border-dashed border-green-300 rounded-xl p-8 text-center hover:border-green-500 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('create-ncd-upload-input').click()}
                    >
                      <input
                        id="create-ncd-upload-input"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setUploading(true);
                          setResults(null);
                          try {
                            const token = localStorage.getItem("token");
                            const formData = new FormData();
                            formData.append('file', file);
                            const response = await axios.post(`${API}/bulk/bonds`, formData, {
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                            });
                            setResults(response.data);
                            if (response.data.success > 0) toast.success(`Successfully created ${response.data.success} NCDs!`);
                            if (response.data.failed > 0) toast.error(`${response.data.failed} NCDs failed`);
                          } catch (error) {
                            toast.error(error.response?.data?.detail || "Upload failed");
                            setResults({ success: 0, failed: 1, errors: [error.message] });
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        data-testid="create-ncd-upload-input"
                      />
                      <Upload className="h-12 w-12 mx-auto text-green-400 mb-4" />
                      <p className="text-gray-600 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload Excel file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports .xlsx and .xls files
                      </p>
                    </div>
                    
                    <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                      <strong>Note:</strong> This creates new NCD bonds with auto-generated payment schedules.
                    </div>
                  </div>
                </div>
              )}

              {/* Investment Details Sub-tab */}
              {ncdActiveSubTab === "investment-details" && (
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-cyan-50 rounded-xl border border-cyan-200 p-6">
                    <h2 className="text-lg font-semibold text-cyan-600 mb-4 flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      Step 1: Download Template
                    </h2>
                    
                    <div className="space-y-4">
                      <p className="text-gray-600">
                        Download the Excel template, fill in your investment details, and upload it back.
                      </p>
                      
                      <div className="bg-white rounded-lg p-4 border">
                        <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Deal ID, Date, PAN, Units, Amount, UTR</li>
                          <li>• Investment details only (no repayments)</li>
                          <li>• Simpler upload for investment data</li>
                        </ul>
                      </div>
                      
                      <div className="bg-cyan-100 border border-cyan-300 rounded-lg p-3 text-sm text-cyan-800">
                        <strong>⚠️ Important:</strong> Create NCDs & investors FIRST before uploading investment details!
                      </div>

                      <Button 
                        onClick={() => downloadTemplate('investment-details')}
                        className="w-full bg-cyan-600 hover:bg-cyan-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Investment Details Template
                      </Button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-cyan-600" />
                      Step 2: Upload Filled Template
                    </h2>

                    <div 
                      className="border-2 border-dashed border-cyan-300 rounded-xl p-8 text-center hover:border-cyan-500 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('investment-details-upload-input').click()}
                    >
                      <input
                        id="investment-details-upload-input"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setUploading(true);
                          setResults(null);
                          try {
                            const token = localStorage.getItem("token");
                            const formData = new FormData();
                            formData.append('file', file);
                            const response = await axios.post(`${API}/bulk/investment-details`, formData, {
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                            });
                            setResults(response.data);
                            if (response.data.success > 0) toast.success(`Successfully uploaded ${response.data.success} investments!`);
                            if (response.data.failed > 0) toast.error(`${response.data.failed} investments failed`);
                          } catch (error) {
                            toast.error(error.response?.data?.detail || "Upload failed");
                            setResults({ success: 0, failed: 1, errors: [error.message] });
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        data-testid="investment-details-upload-input"
                      />
                      <Upload className="h-12 w-12 mx-auto text-cyan-400 mb-4" />
                      <p className="text-gray-600 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload Excel file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports .xlsx and .xls files
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Historical Repayments Sub-tab */}
              {ncdActiveSubTab === "historical-repayments" && (
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                    <h2 className="text-lg font-semibold text-amber-600 mb-4 flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      Step 1: Download Template
                    </h2>
                    
                    <div className="space-y-4">
                      <p className="text-gray-600">
                        Download the Excel template, fill in your repayment details, and upload it back.
                      </p>
                      
                      <div className="bg-white rounded-lg p-4 border">
                        <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• <strong>Repayment Details Only:</strong></li>
                          <li className="ml-4">Deal ID, Date, PAN, Principal, Interest, TDS, Net</li>
                          <li>• Use this for uploading actual repayment data</li>
                          <li>• For investment data, use "Investment Details" tab</li>
                        </ul>
                      </div>
                      
                      <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 text-sm text-amber-800">
                        <strong>⚠️ Important:</strong> Create investments FIRST via Investment Details tab before uploading repayments!
                      </div>

                      <Button 
                        onClick={() => downloadTemplate('historical-trades')}
                        className="w-full bg-amber-600 hover:bg-amber-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Historical Repayments Template
                      </Button>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-amber-600" />
                      Step 2: Upload Filled Template
                    </h2>

                    <div 
                      className="border-2 border-dashed border-amber-300 rounded-xl p-8 text-center hover:border-amber-500 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('historical-repayments-upload-input').click()}
                    >
                      <input
                        id="historical-repayments-upload-input"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setUploading(true);
                          setResults(null);
                          try {
                            const token = localStorage.getItem("token");
                            const formData = new FormData();
                            formData.append('file', file);
                            const response = await axios.post(`${API}/bulk/historical-trades`, formData, {
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                            });
                            setResults(response.data);
                            if (response.data.success > 0) toast.success(`Successfully uploaded ${response.data.success} repayments!`);
                            if (response.data.failed > 0) toast.error(`${response.data.failed} repayments failed`);
                          } catch (error) {
                            toast.error(error.response?.data?.detail || "Upload failed");
                            setResults({ success: 0, failed: 1, errors: [error.message] });
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        data-testid="historical-repayments-upload-input"
                      />
                      <Upload className="h-12 w-12 mx-auto text-amber-400 mb-4" />
                      <p className="text-gray-600 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload Excel file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports .xlsx and .xls files
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Results Section for NCD */}
              {results && (
                <div className={`rounded-xl border p-6 ${
                  results.failed === 0 ? 'bg-green-50 border-green-200' : 
                  results.success === 0 ? 'bg-red-50 border-red-200' : 
                  'bg-yellow-50 border-yellow-200'
                }`}>
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    {results.failed === 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : results.success === 0 ? (
                      <XCircle className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    )}
                    Upload Results
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-4 text-center border">
                      <p className="text-2xl font-bold text-green-600">{results.success || 0}</p>
                      <p className="text-sm text-gray-600">Successful</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center border">
                      <p className="text-2xl font-bold text-red-600">{results.failed || 0}</p>
                      <p className="text-sm text-gray-600">Failed</p>
                    </div>
                  </div>

                  {results.errors && results.errors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-red-800 mb-2">Errors ({results.errors.length}):</p>
                      <div className="max-h-40 overflow-y-auto bg-white rounded p-3 border text-sm">
                        {results.errors.slice(0, 10).map((err, i) => (
                          <p key={i} className="text-red-600">{err}</p>
                        ))}
                        {results.errors.length > 10 && (
                          <p className="text-gray-500 mt-2">... and {results.errors.length - 10} more errors</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === "cas-analysis" ? (
            <div className="space-y-6">
              {/* Sub-tabs for CAS Analysis */}
              <div className="flex gap-2 border-b border-gray-200 pb-4">
                {casSubTabs.map((subTab) => {
                  const subColor = getCasSubTabColor(subTab.id);
                  return (
                    <button
                      key={subTab.id}
                      onClick={() => setCasActiveSubTab(subTab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        casActiveSubTab === subTab.id
                          ? `${subColor.bg} text-white shadow-md`
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      data-testid={`cas-subtab-${subTab.id}`}
                    >
                      <subTab.icon className="h-4 w-4" />
                      {subTab.label}
                    </button>
                  );
                })}
              </div>

              {/* Active Uploads Warning Banner */}
              {activeJobs.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-amber-800 flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {activeJobs.length} Active Upload{activeJobs.length > 1 ? 's' : ''} Running
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={fetchActiveJobs}
                      disabled={loadingJobs}
                      data-testid="refresh-active-jobs-btn"
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingJobs ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {activeJobs.map((job) => (
                      <div key={job.job_id} className="bg-white rounded-lg p-3 border border-amber-200 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-gray-800">{job.filename || 'Unknown file'}</span>
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                              {job.type === 'amfi_scheme' ? 'AMFI Data' : 'Benchmark Data'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                            <span>{job.progress_pct?.toFixed(1) || 0}%</span>
                            <span>{(job.processed_rows || 0).toLocaleString()} / {(job.total_rows || 0).toLocaleString()} rows</span>
                            {job.values_added > 0 && <span className="text-green-600">+{job.values_added.toLocaleString()} added</span>}
                          </div>
                          <div className="w-full bg-amber-100 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-amber-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${job.progress_pct || 0}%` }}
                            ></div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => cancelJobById(job.job_id, job.type)}
                          className="ml-4"
                          data-testid={`cancel-job-${job.job_id}`}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Stop
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AMFI Scheme Data Sub-tab */}
              {casActiveSubTab === "amfi-scheme-data" && (
                <div className="grid grid-cols-2 gap-8">
                  {/* Left: Current Status */}
                  <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-6">
                    <h2 className="text-lg font-semibold text-indigo-600 mb-4 flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Current Status
                    </h2>
                    
                    {loadingAmfiScheme ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-4 text-center border">
                            <p className="text-2xl font-bold text-indigo-600">
                              {amfiSchemeStatus?.total_records?.toLocaleString() || 0}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">Total Records</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center border">
                            <p className="text-2xl font-bold text-blue-600">
                              {amfiSchemeStatus?.unique_schemes?.toLocaleString() || 0}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">Unique Schemes</p>
                          </div>
                        </div>
                        
                        <div className="bg-white rounded-lg p-4 border">
                          <p className="text-lg font-bold text-gray-800 text-center">
                            {amfiSchemeStatus?.unique_isins?.toLocaleString() || 0}
                          </p>
                          <p className="text-sm text-gray-600 mt-1 text-center">Unique ISINs</p>
                        </div>
                        
                        {amfiSchemeStatus?.by_isin_type && (
                          <div className="bg-white rounded-lg p-3 border text-sm">
                            <p className="font-medium text-gray-700 mb-2">By ISIN Type:</p>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-green-50 rounded p-2">
                                <p className="font-bold text-green-700">{amfiSchemeStatus.by_isin_type.growth || 0}</p>
                                <p className="text-xs text-green-600">Growth</p>
                              </div>
                              <div className="bg-blue-50 rounded p-2">
                                <p className="font-bold text-blue-700">{amfiSchemeStatus.by_isin_type.dividend_payout || 0}</p>
                                <p className="text-xs text-blue-600">Div Payout</p>
                              </div>
                              <div className="bg-purple-50 rounded p-2">
                                <p className="font-bold text-purple-700">{amfiSchemeStatus.by_isin_type.dividend_reinvestment || 0}</p>
                                <p className="text-xs text-purple-600">Div Reinvest</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Last 3 Upload Dates */}
                        {amfiSchemeStatus?.upload_history && amfiSchemeStatus.upload_history.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border">
                            <p className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <History className="h-4 w-4" />
                              Last 3 Uploads
                            </p>
                            <div className="space-y-2">
                              {amfiSchemeStatus.upload_history.map((upload, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded p-2">
                                  <span className="text-gray-600 truncate max-w-[150px]">{upload.filename}</span>
                                  <span className="text-indigo-600 font-medium">{formatDate(upload.uploaded_at)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <Button 
                          variant="outline"
                          onClick={fetchAmfiSchemeStatus}
                          className="w-full"
                          data-testid="refresh-amfi-status-button"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh Status
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Right: Upload */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-indigo-600" />
                      Upload AMFI Scheme Data
                    </h2>

                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                      <h4 className="font-medium text-indigo-900 mb-2">File Format:</h4>
                      <ul className="text-sm text-indigo-800 space-y-1">
                        <li>• CSV or Excel file with AMFI scheme data</li>
                        <li>• Required columns: <strong>Code</strong> (scheme code), <strong>ISIN</strong></li>
                        <li>• Optional: Scheme Name, AMC, Scheme Type, Category</li>
                        <li>• Concatenated ISINs (e.g., INF...INF...) will be split automatically</li>
                      </ul>
                    </div>

                    <div 
                      className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('amfi-scheme-upload-input').click()}
                    >
                      <input
                        id="amfi-scheme-upload-input"
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setUploading(true);
                          setResults(null);
                          setAmfiJobId(null);
                          setAmfiJobStatus(null);
                          try {
                            const token = localStorage.getItem("token");
                            const formData = new FormData();
                            formData.append('file', file);
                            const response = await axios.post(`${API}/bulk/amfi-scheme-data`, formData, {
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                            });
                            
                            // Check if background processing started
                            if (response.data.job_id) {
                              setAmfiJobId(response.data.job_id);
                              setAmfiJobStatus({ status: 'processing', progress_pct: 0 });
                              toast.info(`Processing ${response.data.file_size_mb} MB file in background...`);
                              // Start polling
                              pollAmfiJobStatus(response.data.job_id);
                            } else {
                              setResults(response.data);
                              if (response.data.success > 0) toast.success(`Successfully processed ${response.data.success} schemes!`);
                              if (response.data.failed > 0) toast.error(`${response.data.failed} records failed`);
                              fetchAmfiSchemeStatus();
                            }
                          } catch (error) {
                            toast.error(error.response?.data?.detail || "Upload failed");
                            setResults({ success: 0, failed: 1, errors: [error.message] });
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        data-testid="amfi-scheme-upload-input"
                      />
                      <Upload className="h-12 w-12 mx-auto text-indigo-400 mb-4" />
                      <p className="text-gray-600 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload CSV or Excel file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports .csv, .xlsx and .xls files
                      </p>
                    </div>
                    
                    {/* Progress bar for background job */}
                    {amfiJobId && amfiJobStatus && (
                      <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-indigo-800">Processing in background...</span>
                          <div className="flex items-center gap-3">
                            <span className="text-indigo-600 font-bold">{amfiJobStatus.progress_pct || 0}%</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={cancelAmfiJob}
                              className="h-7 px-2"
                              data-testid="cancel-amfi-upload-btn"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          </div>
                        </div>
                        <div className="w-full bg-indigo-200 rounded-full h-3">
                          <div 
                            className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${amfiJobStatus.progress_pct || 0}%` }}
                          ></div>
                        </div>
                        <div className="mt-2 text-sm text-indigo-700">
                          {amfiJobStatus.processed_rows || 0} / {amfiJobStatus.total_rows || '?'} rows processed
                          {amfiJobStatus.isin_records_created > 0 && ` • ${amfiJobStatus.isin_records_created} ISINs created`}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800">
                      <strong>Note:</strong> This data links AMFI scheme codes to ISINs. Each scheme code can have multiple ISINs (Growth, Dividend Payout, Dividend Reinvestment).
                    </div>
                  </div>
                </div>
              )}

              {/* Scheme Master Sub-tab */}
              {casActiveSubTab === "scheme-master" && (
                <div className="space-y-6">
                  {/* Progress Bar - Show when processing */}
                  {schemeProcessingStatus && (
                    <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm" data-testid="scheme-processing-status">
                      <div className="flex items-center gap-3 mb-2">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        <span className="text-gray-900 font-medium">{schemeProcessingStatus}</span>
                      </div>
                      <Progress value={schemeProcessingProgress} className="h-2" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-8">
                    {/* Left: Current Status */}
                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
                      <h2 className="text-lg font-semibold text-blue-600 mb-4 flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Current Status
                      </h2>
                      
                      {loadingSchemeMaster ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white rounded-lg p-4 text-center border">
                              <div className={`text-2xl font-bold ${schemeMasterStatus?.exists ? 'text-green-600' : 'text-etihad-gold-600'}`}>
                                {schemeMasterStatus?.exists ? (
                                  <CheckCircle2 className="h-8 w-8 mx-auto" />
                                ) : (
                                  <Database className="h-8 w-8 mx-auto text-gray-400" />
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                {schemeMasterStatus?.exists ? 'Available' : 'Not Uploaded'}
                              </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 text-center border">
                              <p className="text-2xl font-bold text-blue-600">
                                {schemeMasterStatus?.total_schemes?.toLocaleString() || 0}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">Total Schemes</p>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded-lg p-4 border">
                            <div className="flex items-center justify-center gap-2 text-gray-700">
                              <Calendar className="h-4 w-4" />
                              <span className="font-medium">
                                {schemeMasterStatus?.last_upload ? formatDate(schemeMasterStatus.last_upload) : 'Never uploaded'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1 text-center">Last Updated</p>
                          </div>
                          
                          {schemeMasterStatus?.last_filename && (
                            <div className="flex items-center gap-2 text-sm text-gray-600 bg-white rounded-lg p-3 border">
                              <FileText className="h-4 w-4" />
                              <span>Last file: <strong>{schemeMasterStatus.last_filename}</strong></span>
                            </div>
                          )}
                          
                          {/* Last 3 Upload Dates */}
                          {schemeMasterStatus?.upload_history && schemeMasterStatus.upload_history.length > 0 && (
                            <div className="bg-white rounded-lg p-3 border">
                              <p className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <History className="h-4 w-4" />
                                Last 3 Uploads
                              </p>
                              <div className="space-y-2">
                                {schemeMasterStatus.upload_history.map((upload, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded p-2">
                                    <span className="text-gray-600 truncate max-w-[150px]">{upload.filename}</span>
                                    <span className="text-blue-600 font-medium">{formatDate(upload.uploaded_at)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <Button 
                            variant="outline"
                            onClick={fetchSchemeMasterStatus}
                            className="w-full"
                            data-testid="refresh-scheme-status-button"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh Status
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Right: Upload */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Upload className="h-5 w-5 text-blue-600" />
                        Upload Scheme Master
                      </h2>

                      {/* Download Instructions */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <h4 className="font-medium text-blue-900 mb-2">How to download:</h4>
                        <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                          <li>Visit the BSE StAR MF website</li>
                          <li>Download the Scheme Master file (SCHMSTRPHY.txt)</li>
                          <li>Upload the downloaded file below</li>
                        </ol>
                        <a 
                          href="https://www.bsestarmf.in/RptSchemeMaster.aspx" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open BSE StAR MF - Scheme Master
                        </a>
                      </div>

                      {/* Upload Form */}
                      <form onSubmit={handleSchemeMasterUpload} className="space-y-4">
                        <div>
                          <Label htmlFor="scheme-file" className="text-gray-700">
                            Scheme Master File (.txt)
                          </Label>
                          <Input
                            id="scheme-file"
                            type="file"
                            accept=".txt"
                            onChange={(e) => setSchemeMasterFile(e.target.files[0])}
                            className="mt-1"
                            data-testid="scheme-file-input"
                          />
                          {schemeMasterFile && (
                            <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              {schemeMasterFile.name} ({(schemeMasterFile.size / 1024 / 1024).toFixed(2)} MB)
                            </p>
                          )}
                        </div>
                        
                        <Button 
                          type="submit" 
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          disabled={schemeUploading || !schemeMasterFile}
                          data-testid="upload-scheme-button"
                        >
                          {schemeUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Scheme Master
                            </>
                          )}
                        </Button>
                      </form>

                      {/* Info Note */}
                      <div className="mt-6 bg-etihad-gold-50 border border-etihad-gold-200 rounded-lg p-3 text-sm text-etihad-gold-800">
                        <strong>Note:</strong> New schemes will be added to the existing database. Duplicate ISINs will be skipped. 
                        Upload monthly for the latest NAV mapping data.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Benchmark Data Sub-tab */}
              {casActiveSubTab === "benchmark-data" && (
                <>
                <div className="grid grid-cols-2 gap-8">
                  {/* Left: Current Status */}
                  <div className="bg-violet-50 rounded-xl border border-violet-200 p-6">
                    <h2 className="text-lg font-semibold text-violet-600 mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Historical Benchmark NAV Status
                    </h2>
                    
                    {loadingBenchmark ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-4 text-center border">
                            <p className="text-2xl font-bold text-violet-600">
                              {benchmarkStatus?.benchmark_values_count?.toLocaleString() || 0}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">NAV Data Points</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center border">
                            <p className="text-2xl font-bold text-blue-600">
                              {benchmarkStatus?.unique_benchmarks || 0}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">Unique Benchmarks</p>
                          </div>
                        </div>
                        
                        {benchmarkStatus?.sample_benchmarks && benchmarkStatus.sample_benchmarks.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border text-sm">
                            <p className="font-medium text-gray-700 mb-2">Sample Benchmarks:</p>
                            <div className="text-gray-600 text-xs">
                              {benchmarkStatus.sample_benchmarks.join(', ')}
                            </div>
                          </div>
                        )}
                        
                        {benchmarkStatus?.date_range && benchmarkStatus.date_range.earliest && (
                          <div className="bg-white rounded-lg p-3 border text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>Date Range: <strong>{benchmarkStatus.date_range.earliest}</strong> to <strong>{benchmarkStatus.date_range.latest}</strong></span>
                            </div>
                          </div>
                        )}
                        
                        {/* Last 3 Upload Dates */}
                        {benchmarkStatus?.upload_history && benchmarkStatus.upload_history.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border">
                            <p className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <History className="h-4 w-4" />
                              Last 3 Uploads
                            </p>
                            <div className="space-y-2">
                              {benchmarkStatus.upload_history.map((upload, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded p-2">
                                  <span className="text-gray-600 truncate max-w-[150px]">{upload.filename}</span>
                                  <span className="text-violet-600 font-medium">{formatDate(upload.uploaded_at)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <Button 
                          variant="outline"
                          onClick={fetchBenchmarkStatus}
                          className="w-full"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh Status
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Right: Upload */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-violet-600" />
                      Upload Benchmark NAV Data
                    </h2>

                    <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 mb-6">
                      <h4 className="font-medium text-violet-900 mb-2">What is this for?</h4>
                      <p className="text-sm text-violet-800 mb-3">
                        Historical benchmark NAV values are used to compare how your mutual fund performed against its benchmark over time.
                      </p>
                      <h4 className="font-medium text-violet-900 mb-2">File Format:</h4>
                      <ul className="text-sm text-violet-800 space-y-1">
                        <li>• <strong>benchmark</strong> - Benchmark name</li>
                        <li>• <strong>benchmark_code</strong> - Unique code (required)</li>
                        <li>• <strong>benchmark_value</strong> - NAV value (required)</li>
                        <li>• <strong>as_on_date</strong> - Date (required)</li>
                      </ul>
                    </div>

                    <div 
                      className="border-2 border-dashed border-violet-300 rounded-xl p-8 text-center hover:border-violet-500 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('benchmark-upload-input').click()}
                    >
                      <input
                        id="benchmark-upload-input"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setUploading(true);
                          setResults(null);
                          setBenchmarkJobId(null);
                          setBenchmarkJobStatus(null);
                          try {
                            const token = localStorage.getItem("token");
                            const formData = new FormData();
                            formData.append('file', file);
                            const response = await axios.post(`${API}/bulk/benchmark-nav-data`, formData, {
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
                            });
                            
                            // Check if background processing started
                            if (response.data.job_id) {
                              setBenchmarkJobId(response.data.job_id);
                              setBenchmarkJobStatus({ status: 'processing', progress_pct: 0 });
                              toast.info(`Processing ${response.data.file_size_mb} MB file in background...`);
                              // Start polling
                              pollBenchmarkJobStatus(response.data.job_id);
                            } else {
                              setResults(response.data);
                              if (response.data.success > 0) toast.success(`Successfully uploaded ${response.data.success} benchmark values!`);
                              if (response.data.failed > 0) toast.error(`${response.data.failed} records failed`);
                              fetchBenchmarkStatus();
                            }
                          } catch (error) {
                            toast.error(error.response?.data?.detail || "Upload failed");
                            setResults({ success: 0, failed: 1, errors: [error.message] });
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        data-testid="benchmark-upload-input"
                      />
                      <Upload className="h-12 w-12 mx-auto text-violet-400 mb-4" />
                      <p className="text-gray-600 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload Excel or CSV file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports .xlsx, .xls and .csv files
                      </p>
                    </div>
                    
                    {/* Progress bar for background job */}
                    {benchmarkJobId && benchmarkJobStatus && (
                      <div className="mt-6 bg-violet-50 border border-violet-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-violet-800">Processing in background...</span>
                          <div className="flex items-center gap-3">
                            <span className="text-violet-600 font-bold">{benchmarkJobStatus.progress_pct || 0}%</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={cancelBenchmarkJob}
                              className="h-7 px-2"
                              data-testid="cancel-benchmark-upload-btn"
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          </div>
                        </div>
                        <div className="w-full bg-violet-200 rounded-full h-3">
                          <div 
                            className="bg-violet-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${benchmarkJobStatus.progress_pct || 0}%` }}
                          ></div>
                        </div>
                        <div className="mt-2 text-sm text-violet-700">
                          {benchmarkJobStatus.processed_rows || 0} / {benchmarkJobStatus.total_rows || '?'} rows processed
                          {benchmarkJobStatus.values_added > 0 && ` • ${benchmarkJobStatus.values_added} values added`}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-6 bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-800">
                      <strong>Note:</strong> This data is used to calculate how your mutual funds would have performed if the same amount was invested in the benchmark instead.
                    </div>
                  </div>
                </div>
                
                {/* API Sync Management Section */}
                <div className="mt-8 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
                  <h2 className="text-lg font-semibold text-indigo-700 mb-4 flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Automatic Sync from PulseLabs API
                  </h2>
                  
                  <div className="grid grid-cols-3 gap-6">
                    {/* Scheduler Status */}
                    <div className="bg-white rounded-lg p-4 border border-indigo-100">
                      <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-indigo-500" />
                        Daily Scheduler
                      </h3>
                      
                      {loadingSyncStatus ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            {syncSchedulerStatus?.status === 'running' ? (
                              <>
                                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-green-700 font-medium">Running</span>
                              </>
                            ) : (
                              <>
                                <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
                                <span className="text-gray-600">Stopped</span>
                              </>
                            )}
                          </div>
                          
                          {syncSchedulerStatus?.jobs?.[0]?.next_run && (
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">Next Run:</span><br/>
                              {new Date(syncSchedulerStatus.jobs[0].next_run).toLocaleString('en-IN', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                                timeZone: 'Asia/Kolkata'
                              })} IST
                            </div>
                          )}
                          
                          <Button
                            size="sm"
                            variant={syncSchedulerStatus?.status === 'running' ? 'outline' : 'default'}
                            onClick={() => handleToggleScheduler(syncSchedulerStatus?.status !== 'running')}
                            disabled={togglingScheduler}
                            className="w-full"
                            data-testid="toggle-scheduler-btn"
                          >
                            {togglingScheduler ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : syncSchedulerStatus?.status === 'running' ? (
                              <XCircle className="h-4 w-4 mr-2" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                            )}
                            {syncSchedulerStatus?.status === 'running' ? 'Stop Scheduler' : 'Start Scheduler'}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* Manual Sync */}
                    <div className="bg-white rounded-lg p-4 border border-indigo-100">
                      <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-indigo-500" />
                        Manual Sync
                      </h3>
                      
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                          Fetch today's benchmark data from PulseLabs API immediately.
                        </p>
                        
                        <Button
                          size="sm"
                          onClick={handleTriggerDailySync}
                          disabled={triggeringSync}
                          className="w-full bg-indigo-600 hover:bg-indigo-700"
                          data-testid="trigger-daily-sync-btn"
                        >
                          {triggeringSync ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Sync Today's Data
                        </Button>
                        
                        <div className="border-t pt-3 mt-3">
                          <p className="text-xs text-gray-500 mb-2">Backfill missing dates:</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTriggerBackfill('2026-03-10')}
                            disabled={triggeringSync || syncBackfillJobId}
                            className="w-full text-xs"
                            data-testid="trigger-backfill-btn"
                          >
                            {syncBackfillJobId ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <History className="h-3 w-3 mr-1" />
                            )}
                            Backfill from Mar 10
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Recent Sync History */}
                    <div className="bg-white rounded-lg p-4 border border-indigo-100">
                      <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                        <History className="h-4 w-4 text-indigo-500" />
                        Recent Syncs
                      </h3>
                      
                      {syncSchedulerStatus?.recent_syncs?.length > 0 ? (
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {syncSchedulerStatus.recent_syncs.map((sync, idx) => (
                            <div key={idx} className="bg-gray-50 rounded p-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className={`font-medium ${sync.error ? 'text-red-600' : 'text-green-600'}`}>
                                  {sync.error ? 'Failed' : 'Success'}
                                </span>
                                <span className="text-gray-500">
                                  {new Date(sync.timestamp).toLocaleString('en-IN', { 
                                    dateStyle: 'short', 
                                    timeStyle: 'short' 
                                  })}
                                </span>
                              </div>
                              {sync.result && (
                                <div className="text-gray-600 mt-1">
                                  +{sync.result.added || 0} added
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 py-4 text-center">
                          No sync history yet
                        </p>
                      )}
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={fetchSyncSchedulerStatus}
                        className="w-full mt-2"
                        data-testid="refresh-sync-status-btn"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                  
                  {/* Backfill Progress */}
                  {syncBackfillJobId && syncBackfillStatus && (
                    <div className="mt-4 bg-indigo-100 border border-indigo-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-indigo-800">Backfill in progress...</span>
                        <span className="text-indigo-600 font-medium">
                          {syncBackfillStatus.result?.dates_processed || 0} dates processed
                        </span>
                      </div>
                      <div className="text-sm text-indigo-700">
                        {syncBackfillStatus.result?.total_added || 0} records added • 
                        {syncBackfillStatus.result?.dates_with_data || 0} days with data
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 text-xs text-gray-500">
                    <strong>Note:</strong> The scheduler syncs benchmark NAV data from PulseLabs API daily at 6:00 AM IST. 
                    Each sync fetches ~213 benchmark values for the previous trading day.
                  </div>
                </div>
                </>
              )}

              {/* Stockwise Holding Sub-tab */}
              {casActiveSubTab === "stockwise-holding" && (
                <div className="grid grid-cols-2 gap-8">
                  {/* Left: Current Status */}
                  <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-6">
                    <h2 className="text-lg font-semibold text-emerald-600 mb-4 flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      Current Status
                    </h2>
                    
                    {loadingStockwise ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-4 text-center border">
                            <p className="text-2xl font-bold text-emerald-600">
                              {stockwiseStatus?.total_holdings?.toLocaleString() || 0}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">Total Holdings</p>
                          </div>
                          <div className="bg-white rounded-lg p-4 text-center border">
                            <p className="text-2xl font-bold text-blue-600">
                              {stockwiseStatus?.unique_schemes || 0}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">Unique Schemes</p>
                          </div>
                        </div>
                        
                        <div className="bg-white rounded-lg p-4 border">
                          <p className="text-lg font-bold text-gray-800 text-center">
                            {stockwiseStatus?.unique_instruments || 0}
                          </p>
                          <p className="text-sm text-gray-600 mt-1 text-center">Unique Instruments</p>
                        </div>
                        
                        {stockwiseStatus?.month_ends && stockwiseStatus.month_ends.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>Months: <strong>{stockwiseStatus.month_ends.join(', ')}</strong></span>
                            </div>
                          </div>
                        )}
                        
                        {stockwiseStatus?.last_updated && (
                          <div className="bg-white rounded-lg p-3 border text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>Last Updated: <strong>{formatDate(stockwiseStatus.last_updated)}</strong></span>
                            </div>
                          </div>
                        )}
                        
                        {/* Last 3 Upload Dates */}
                        {stockwiseStatus?.upload_history && stockwiseStatus.upload_history.length > 0 && (
                          <div className="bg-white rounded-lg p-3 border">
                            <p className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <History className="h-4 w-4" />
                              Last 3 Uploads
                            </p>
                            <div className="space-y-2">
                              {stockwiseStatus.upload_history.map((upload, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 rounded p-2">
                                  <span className="text-gray-600 truncate max-w-[150px]">{upload.filename}</span>
                                  <span className="text-emerald-600 font-medium">{formatDate(upload.uploaded_at)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <Button 
                          variant="outline"
                          onClick={fetchStockwiseStatus}
                          className="w-full"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh Status
                        </Button>
                      </div>
                    )}
                    
                    <div className="mt-6">
                      <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Scheme Name, AMFI Code, Scheme ISIN</li>
                        <li>• Instrument Name, ISIN, Sector, Rating</li>
                        <li>• Quantity, Market Value, % to Net Assets</li>
                        <li>• Market Cap Category (Large/Mid/Small)</li>
                      </ul>
                      
                      <Button 
                        onClick={() => downloadTemplate('stockwise-holding')}
                        className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                    </div>
                  </div>

                  {/* Right: Upload */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-emerald-600" />
                      Upload Stockwise Holding
                    </h2>

                    <div 
                      className="border-2 border-dashed border-emerald-300 rounded-xl p-8 text-center hover:border-emerald-500 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('stockwise-upload-input').click()}
                    >
                      <input
                        id="stockwise-upload-input"
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setUploading(true);
                          setResults(null);
                          try {
                            const token = localStorage.getItem("token");
                            const formData = new FormData();
                            formData.append('file', file);
                            toast.info("Starting upload... Please wait.");
                            
                            const response = await axios.post(`${API}/bulk/stockwise-holding`, formData, {
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
                              timeout: 0 // No timeout
                            });
                            
                            // Check if this is a background job
                            if (response.data.status === 'processing' && response.data.job_id) {
                              const jobId = response.data.job_id;
                              toast.info(`Processing large file (${response.data.file_size_mb} MB) in background...`);
                              
                              // Poll for progress
                              const pollInterval = setInterval(async () => {
                                try {
                                  const statusResponse = await axios.get(`${API}/bulk/stockwise-holding/job/${jobId}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                  });
                                  const job = statusResponse.data;
                                  
                                  // Update results with progress
                                  setResults({
                                    ...job,
                                    progress_message: `Processing: ${job.processed_rows?.toLocaleString() || 0} / ${job.total_rows?.toLocaleString() || 0} rows (${job.progress_pct || 0}%)`
                                  });
                                  
                                  if (job.status === 'completed') {
                                    clearInterval(pollInterval);
                                    setUploading(false);
                                    toast.success(`Successfully uploaded ${job.success?.toLocaleString() || 0} records!`);
                                    fetchStockwiseStatus();
                                  } else if (job.status === 'failed') {
                                    clearInterval(pollInterval);
                                    setUploading(false);
                                    toast.error(`Upload failed: ${job.error || 'Unknown error'}`);
                                  }
                                } catch (pollError) {
                                  console.error('Error polling job status:', pollError);
                                }
                              }, 2000); // Poll every 2 seconds
                              
                            } else {
                              // Immediate result (small file)
                              setResults(response.data);
                              if (response.data.success > 0) toast.success(`Successfully uploaded ${response.data.success.toLocaleString()} records!`);
                              if (response.data.failed > 0) toast.error(`${response.data.failed} records failed`);
                              fetchStockwiseStatus();
                              setUploading(false);
                            }
                          } catch (error) {
                            toast.error(error.response?.data?.detail || "Upload failed");
                            setResults({ success: 0, failed: 1, errors: [error.message] });
                            setUploading(false);
                          } finally {
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        data-testid="stockwise-upload-input"
                      />
                      <Upload className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
                      <p className="text-gray-600 font-medium">
                        {uploading ? (results?.progress_message || 'Uploading...') : 'Click to upload Excel file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports .xlsx and .xls files (no size limit)
                      </p>
                      {uploading && results?.progress_pct > 0 && (
                        <div className="mt-4 w-full bg-emerald-100 rounded-full h-3">
                          <div 
                            className="bg-emerald-600 h-3 rounded-full transition-all duration-300" 
                            style={{ width: `${results.progress_pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-6 bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-800">
                      <strong>Warning:</strong> Uploading a new file will <strong>DELETE ALL EXISTING</strong> stockwise data and replace it with the new file contents.
                    </div>
                    
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                      <strong>Note:</strong> Shows stock-level holdings in each mutual fund scheme. Upload monthly for the latest portfolio data.
                    </div>
                  </div>
                </div>
              )}

              {/* Scheme-Benchmark Mapping Sub-tab */}
              {casActiveSubTab === "scheme-benchmark-mapping" && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-orange-600" />
                      ISIN to Benchmark Mapping
                    </h3>
                    
                    {loadingSchemeBenchmark ? (
                      <div className="text-center py-8 text-gray-500">Loading status...</div>
                    ) : schemeBenchmarkStatus ? (
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-orange-50 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold text-orange-600">
                            {schemeBenchmarkStatus?.total_mappings?.toLocaleString() || 0}
                          </p>
                          <p className="text-sm text-orange-700 mt-1">Total Mappings</p>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold text-orange-600">
                            {schemeBenchmarkStatus?.unique_benchmarks || 0}
                          </p>
                          <p className="text-sm text-orange-700 mt-1">Unique Benchmarks</p>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-4 text-center">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={fetchSchemeBenchmarkStatus}
                            className="text-orange-600 hover:text-orange-800"
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Refresh
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">No mapping data uploaded yet</div>
                    )}
                    
                    {schemeBenchmarkStatus?.sample_benchmarks && schemeBenchmarkStatus.sample_benchmarks.length > 0 && (
                      <div className="mb-6 p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <p className="text-sm text-orange-800">
                          <strong>Sample Benchmarks:</strong> {schemeBenchmarkStatus.sample_benchmarks.join(', ')}
                        </p>
                      </div>
                    )}
                    
                    {schemeBenchmarkStatus?.last_updated && (
                      <div className="mb-6 flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>Last Updated: <strong>{formatDate(schemeBenchmarkStatus.last_updated)}</strong></span>
                      </div>
                    )}
                    
                    {/* Last 3 Upload Dates */}
                    {schemeBenchmarkStatus?.upload_history && schemeBenchmarkStatus.upload_history.length > 0 && (
                      <div className="mb-6 bg-orange-50 rounded-lg p-3 border border-orange-200">
                        <p className="font-medium text-orange-800 mb-2 flex items-center gap-2">
                          <History className="h-4 w-4" />
                          Last 3 Uploads
                        </p>
                        <div className="space-y-2">
                          {schemeBenchmarkStatus.upload_history.map((upload, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm bg-white rounded p-2">
                              <span className="text-gray-600 truncate max-w-[200px]">{upload.filename}</span>
                              <span className="text-orange-600 font-medium">{formatDate(upload.uploaded_at)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 mb-6">
                      <Button 
                        variant="outline" 
                        className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        onClick={() => downloadTemplate('scheme-benchmark-mapping')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                    </div>

                    <div
                      onClick={() => document.getElementById('scheme-benchmark-upload-input').click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                        ${uploading ? 'border-orange-300 bg-orange-50' : 'border-orange-200 hover:border-orange-400 hover:bg-orange-50'}`}
                    >
                      <input
                        type="file"
                        id="scheme-benchmark-upload-input"
                        accept=".xlsx,.xls"
                        disabled={uploading}
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setUploading(true);
                          try {
                            const token = localStorage.getItem("token");
                            const formData = new FormData();
                            formData.append('file', file);
                            const response = await axios.post(`${API}/bulk/scheme-benchmark-mapping`, formData, {
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
                              timeout: 120000
                            });
                            setResults(response.data);
                            if (response.data.success > 0) toast.success(`Successfully uploaded ${response.data.success} mappings!`);
                            if (response.data.failed > 0) toast.error(`${response.data.failed} records failed`);
                            fetchSchemeBenchmarkStatus();
                          } catch (error) {
                            toast.error(error.response?.data?.detail || "Upload failed");
                            setResults({ success: 0, failed: 1, errors: [error.message] });
                          } finally {
                            setUploading(false);
                            e.target.value = '';
                          }
                        }}
                        className="hidden"
                        data-testid="scheme-benchmark-upload-input"
                      />
                      <Upload className="h-12 w-12 mx-auto text-orange-400 mb-4" />
                      <p className="text-gray-600 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload Excel file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports .xlsx and .xls files
                      </p>
                    </div>
                    
                    <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
                      <strong>Note:</strong> This mapping links scheme codes and ISINs to their benchmark codes. Required for accurate benchmark comparison in CAS Analysis reports.
                    </div>
                  </div>
                </div>
              )}

              {/* Results Section for CAS Analysis */}
              {results && (
                <div className={`rounded-xl border p-6 ${
                  results.failed === 0 ? 'bg-green-50 border-green-200' : 
                  results.success === 0 ? 'bg-red-50 border-red-200' : 
                  'bg-yellow-50 border-yellow-200'
                }`}>
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    {results.failed === 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : results.success === 0 ? (
                      <XCircle className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    )}
                    Upload Results
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-4 text-center border">
                      <p className="text-2xl font-bold text-green-600">{results.success || 0}</p>
                      <p className="text-sm text-gray-600">Successful</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center border">
                      <p className="text-2xl font-bold text-red-600">{results.failed || 0}</p>
                      <p className="text-sm text-gray-600">Failed</p>
                    </div>
                  </div>

                  {/* Additional stats for benchmark/stockwise */}
                  {(results.scheme_mappings_added !== undefined || results.holdings_added !== undefined) && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {results.scheme_mappings_added !== undefined && (
                        <>
                          <div className="bg-white rounded-lg p-3 text-center border">
                            <p className="text-lg font-bold text-violet-600">{results.scheme_mappings_added}</p>
                            <p className="text-xs text-gray-600">Mappings Added</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center border">
                            <p className="text-lg font-bold text-blue-600">{results.benchmark_values_added || 0}</p>
                            <p className="text-xs text-gray-600">BM Values Added</p>
                          </div>
                        </>
                      )}
                      {results.holdings_added !== undefined && (
                        <>
                          <div className="bg-white rounded-lg p-3 text-center border">
                            <p className="text-lg font-bold text-emerald-600">{results.holdings_added}</p>
                            <p className="text-xs text-gray-600">Holdings Added</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center border">
                            <p className="text-lg font-bold text-blue-600">{results.unique_schemes || 0}</p>
                            <p className="text-xs text-gray-600">Unique Schemes</p>
                          </div>
                          {results.month_end && (
                            <div className="bg-white rounded-lg p-3 text-center border">
                              <p className="text-lg font-bold text-gray-600">{results.month_end}</p>
                              <p className="text-xs text-gray-600">Month End</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {results.errors && results.errors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-red-800 mb-2">Errors ({results.errors.length}):</p>
                      <div className="max-h-40 overflow-y-auto bg-white rounded p-3 border text-sm">
                        {results.errors.slice(0, 10).map((err, i) => (
                          <p key={i} className="text-red-600">{err}</p>
                        ))}
                        {results.errors.length > 10 && (
                          <p className="text-gray-500 mt-2">... and {results.errors.length - 10} more errors</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Regular Excel Upload Content */
            <>
              {/* Real Estate sub-tabs (Create / Payment Schedule / Payment Details) */}
              {activeTab === "real-estate" && (
                <div className="flex gap-2 border-b border-gray-200 pb-4 mb-6">
                  {reSubTabs.map((subTab) => {
                    const active = reActiveSubTab === subTab.id;
                    return (
                      <button
                        key={subTab.id}
                        onClick={() => setReActiveSubTab(subTab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                          active
                            ? 'bg-orange-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        data-testid={`re-subtab-${subTab.id}`}
                      >
                        <subTab.icon className="h-4 w-4" />
                        {subTab.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Placeholder panels for not-yet-built RE sub-tabs */}
              {activeTab === "real-estate" && reActiveSubTab === "real-estate-investors" && (
                <RealEstateInvestorBulkUpload />
              )}
              {activeTab === "real-estate" && reActiveSubTab === "real-estate-invoices" && (
                <RealEstateUploadPanel
                  category="real-estate-invoices"
                  title="Real Estate Invoices"
                  description="Upload developer invoices for an opportunity at a specific payment-schedule milestone date."
                  investorScoped={false}
                  accent="orange"
                />
              )}
              {activeTab === "real-estate" && reActiveSubTab === "investor-payment-details" && (
                <RealEstateUploadPanel
                  category="investor-payment-details"
                  title="Investor Payment Details"
                  description="Upload per-investor payment-details documents, tagged to a specific milestone date of the payment schedule."
                  investorScoped={true}
                  accent="blue"
                />
              )}
              {activeTab === "real-estate" && reActiveSubTab === "investor-payment-receipts" && (
                <RealEstateUploadPanel
                  category="investor-payment-receipts"
                  title="Investor Payment Receipts"
                  description="Upload per-investor payment receipts, tagged to a specific milestone date of the payment schedule."
                  investorScoped={true}
                  accent="teal"
                />
              )}

              {/* Existing generic upload layout — shown for all non-RE tabs,
                  and for RE only when the "Create Real Estate" sub-tab is active */}
              {!(activeTab === "real-estate" && reActiveSubTab !== "create-real-estate") && (
              <>
              <div className="grid grid-cols-2 gap-8">
                {/* Left: Instructions & Download */}
                <div className={`${currentColor.light} rounded-xl border ${currentColor.border} p-6`}>
                  <h2 className={`text-lg font-semibold ${currentColor.text} mb-4 flex items-center gap-2`}>
                    <Download className="h-5 w-5" />
                    Step 1: Download Template
                  </h2>
                  
                  <div className="space-y-4">
                    <p className="text-gray-600">
                      Download the Excel template, fill in your data, and upload it back.
                    </p>
                    
                    <div className="bg-white rounded-lg p-4 border">
                      <h3 className="font-medium text-gray-800 mb-2">Template includes:</h3>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {activeTab === "sub-brokers" && (
                          <>
                            <li>• <strong>Partner Type*</strong> - MFD, RIA, or Both</li>
                            <li>• Name*, PAN*, Email*, Mobile*</li>
                            <li>• <strong>MFD Fields:</strong> ARN Number* (required if MFD/Both), EUIN</li>
                            <li>• <strong>RIA Fields:</strong> SEBI Registration No* (required if RIA/Both), Registration Type</li>
                            <li>• Years of Experience, Current AUM</li>
                            <li>• City*, State*, Pincode, Full Address</li>
                            <li>• About (optional)</li>
                            <li className="text-blue-600 mt-2">• <strong>Note:</strong> Password reset email sent after broker verification</li>
                          </>
                        )}
                        {activeTab === "clients" && (
                          <>
                            <li>• <strong>Two templates available:</strong></li>
                            <li className="ml-4">🇮🇳 Indian Passport - PAN, Bonds, Real Estate</li>
                            <li className="ml-4">🌍 Foreign Passport - Passport No, Real Estate</li>
                            <li>• Bank details required for NCD (Indian only)</li>
                            <li>• Passport validity required for Real Estate</li>
                            <li>• Emirates ID required for UAE residents</li>
                          </>
                        )}
                        {activeTab === "re-brokers" && (
                          <>
                            <li>• <strong>Required:</strong> Full Name*, Email*, Mobile Number*</li>
                            <li>• Password*, PIN* (for login credentials)</li>
                            <li>• Company Name*, RERA License Number*</li>
                            <li>• Specialization* (Residential/Commercial/Luxury/Off-Plan/Rental/Mixed)</li>
                            <li>• Years of Experience* (0-2, 2-5, 5-10, 10+)</li>
                            <li>• <strong>Optional:</strong> RERA Expiry Date, Emirate, Office Address</li>
                            <li>• Team Size, Primary Areas, Website, LinkedIn, About</li>
                          </>
                        )}
                        {activeTab === "real-estate" && (
                          <>
                            <li>• Building, Developer, Unit Details</li>
                            <li>• Pricing: Unit Price, DLD, Admin Fees</li>
                            <li>• Developer Discount (Amount or %)</li>
                            <li>• Separate sheet for Payment Schedule</li>
                            <li>• Default schedule if none provided</li>
                          </>
                        )}
                      </ul>
                    </div>

                    {activeTab === "clients" ? (
                      <div className="space-y-2">
                        <Button 
                          onClick={() => downloadTemplate('clients-indian')}
                          className="w-full bg-etihad-gold-600 hover:bg-etihad-gold-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          🇮🇳 Download Indian Passport Template
                        </Button>
                        <Button 
                          onClick={() => downloadTemplate('clients-foreign')}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          🌍 Download Foreign Passport Template
                        </Button>
                        <p className="text-xs text-gray-500 text-center mt-2">
                          Choose the template that matches your investor&apos;s passport type
                        </p>
                      </div>
                    ) : activeTab === "re-brokers" ? (
                      <Button 
                        onClick={() => downloadTemplate('re-brokers')}
                        className="w-full bg-teal-600 hover:bg-teal-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Real Estate Partners Template
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => downloadTemplate(activeTab)}
                        className={`w-full ${currentColor.bg} hover:opacity-90`}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download {tabs.find(t => t.id === activeTab)?.label} Template
                      </Button>
                    )}
                  </div>
                </div>

                {/* Right: Upload */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className={`text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2`}>
                    <Upload className={`h-5 w-5 ${currentColor.text}`} />
                    Step 2: Upload Filled Template
                  </h2>

                  {/* Client passport type selector */}
                  {activeTab === "clients" && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <p className="text-sm font-medium text-gray-700 mb-3">Select passport type for this upload:</p>
                      <div className="flex gap-4">
                        <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          clientUploadType === 'indian' 
                            ? 'border-etihad-gold-500 bg-etihad-gold-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input 
                            type="radio" 
                            name="clientType" 
                            value="indian" 
                            checked={clientUploadType === 'indian'}
                            onChange={(e) => setClientUploadType(e.target.value)}
                            className="sr-only"
                          />
                          <div className="flex items-center gap-2">
                            <span>🇮🇳</span>
                            <span className="font-medium">Indian Passport</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">PAN as Login ID</p>
                        </label>
                        <label className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          clientUploadType === 'foreign' 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input 
                            type="radio" 
                            name="clientType" 
                            value="foreign" 
                            checked={clientUploadType === 'foreign'}
                            onChange={(e) => setClientUploadType(e.target.value)}
                            className="sr-only"
                          />
                          <div className="flex items-center gap-2">
                            <span>🌍</span>
                            <span className="font-medium">Foreign Passport</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Passport No as Login ID</p>
                        </label>
                      </div>
                    </div>
                  )}

                  <label className={`block border-2 border-dashed ${currentColor.border} rounded-xl p-8 text-center cursor-pointer hover:${currentColor.light} transition-colors`}>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                    {uploading ? (
                      <div className="animate-pulse">
                        <div className={`w-16 h-16 ${currentColor.light} rounded-full flex items-center justify-center mx-auto mb-4`}>
                          <FileSpreadsheet className={`h-8 w-8 ${currentColor.text}`} />
                        </div>
                        <p className={`font-medium ${currentColor.text}`}>Uploading...</p>
                        <p className="text-sm text-gray-500 mt-1">Please wait while we process your file</p>
                      </div>
                    ) : (
                      <>
                        <div className={`w-16 h-16 ${currentColor.light} rounded-full flex items-center justify-center mx-auto mb-4`}>
                          <Upload className={`h-8 w-8 ${currentColor.text}`} />
                        </div>
                        <p className="font-medium text-gray-800">Click to upload Excel file</p>
                        <p className="text-sm text-gray-500 mt-1">Supports .xlsx and .xls files</p>
                      </>
                    )}
                  </label>

                  {/* Results */}
                  {results && (
                    <div className="mt-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <span className="font-medium text-green-800">Success</span>
                          </div>
                          <p className="text-2xl font-bold text-green-700 mt-1">{results.success}</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-5 w-5 text-red-600" />
                            <span className="font-medium text-red-800">Failed</span>
                          </div>
                          <p className="text-2xl font-bold text-red-700 mt-1">{results.failed}</p>
                        </div>
                      </div>

                      {results.errors && results.errors.length > 0 && (
                        <div className="bg-etihad-gold-50 rounded-lg p-4 border border-etihad-gold-200">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="h-5 w-5 text-etihad-gold-600" />
                            <span className="font-medium text-etihad-gold-800">Errors</span>
                          </div>
                          <ul className="text-sm text-etihad-gold-700 space-y-1 max-h-40 overflow-y-auto">
                            {results.errors.map((error, idx) => (
                              <li key={idx}>• {error}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {results.created_bonds && results.created_bonds.length > 0 && (
                        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                          <p className="font-medium text-green-800 mb-2">Created Bonds:</p>
                          <div className="flex flex-wrap gap-2">
                            {results.created_bonds.map((bond, idx) => (
                              <Badge key={idx} className="bg-green-100 text-green-700">
                                {bond.code}: {bond.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.created_properties && results.created_properties.length > 0 && (
                        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                          <p className="font-medium text-orange-800 mb-2">Created Properties:</p>
                          <div className="flex flex-wrap gap-2">
                            {results.created_properties.map((prop, idx) => (
                              <Badge key={idx} className="bg-orange-100 text-orange-700">
                                {prop.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.created_trades && results.created_trades.length > 0 && (
                        <div className="bg-etihad-gold-50 rounded-lg p-4 border border-etihad-gold-200">
                          <p className="font-medium text-etihad-gold-800 mb-2">Created Trades:</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {results.created_trades.map((trade, idx) => (
                              <div key={idx} className="bg-white rounded p-2 border border-etihad-gold-100 text-sm">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="font-medium text-gray-800">{trade.client}</span>
                                    <span className="text-gray-500 mx-2">→</span>
                                    <span className="text-etihad-gold-700">{trade.bond}</span>
                                  </div>
                                  <Badge className="bg-etihad-gold-100 text-etihad-gold-700">{trade.units} units</Badge>
                                </div>
                                <div className="text-gray-500 mt-1">
                                  ₹{trade.amount?.toLocaleString()} on {trade.investment_date}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.validation_summary && (
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                          <p className="font-medium text-blue-800 mb-2">Validation Summary:</p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Total Rows:</span>
                              <span className="ml-2 font-medium">{results.validation_summary.total_rows}</span>
                            </div>
                            <div>
                              <span className="text-green-600">Amount Matched:</span>
                              <span className="ml-2 font-medium text-green-700">{results.validation_summary.matched_amounts}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Real Estate Step 3 & Step 4 — image + presentation upload, per property, grouped by building */}
              {activeTab === "real-estate" && (
                (results?.created_properties?.length > 0 || results?.existing_properties?.length > 0)
              ) && (() => {
                const newProps = (results?.created_properties || []).map(p => ({ ...p, _wasExisting: false }));
                const existProps = (results?.existing_properties || []).map(p => ({ ...p, _wasExisting: true }));
                const allProps = [...newProps, ...existProps];
                // Group by building_name (fallback to property name when missing).
                const groups = allProps.reduce((acc, p) => {
                  const bn = (p.building_name || p.name || "Unknown").trim();
                  if (!acc[bn]) acc[bn] = [];
                  acc[bn].push(p);
                  return acc;
                }, {});
                const buildingNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));
                return (
                <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Step 3: Upload Images */}
                  <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                    <h2 className="text-lg font-semibold text-amber-800 mb-4 flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      Step 3: Upload Images
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">
                      Upload once per building — the same images are applied to every unit. Duplicate filenames of the same size are skipped automatically. Expand a building to upload unit-specific images.
                    </p>
                    {existProps.length > 0 && (
                      <p className="text-xs text-amber-700 mb-3" data-testid="re-step3-existing-note">
                        {existProps.length} existing property record(s) detected — you can still add/modify images here.
                      </p>
                    )}
                    <div className="space-y-3 max-h-[28rem] overflow-auto">
                      {buildingNames.map((bn) => {
                        const units = groups[bn];
                        const groupKey = `img::${bn}`;
                        const unitIds = units.map(u => u.id);
                        const groupUploading = reImageUploadingId === groupKey;
                        const anyUnitUploading = units.some(u => reImageUploadingId === u.id);
                        const expanded = !!reExpandedBuildings[`img::${bn}`];
                        const totalImages = units.reduce((s, u) => s + (reUploadedCounts[u.id]?.images || 0), 0);
                        const hasExisting = units.some(u => u._wasExisting);
                        return (
                          <div key={groupKey} className="bg-white border border-amber-200 rounded-lg">
                            <div className="p-3 flex items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => toggleReBuilding(`img::${bn}`)}
                                className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                data-testid={`re-step3-building-toggle-${bn}`}
                              >
                                {expanded ? <ChevronDown className="h-4 w-4 text-amber-700 shrink-0" /> : <ChevronRight className="h-4 w-4 text-amber-700 shrink-0" />}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{bn}</p>
                                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                      {units.length} unit{units.length > 1 ? "s" : ""}
                                    </Badge>
                                    {hasExisting && (
                                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700" data-testid={`re-step3-existing-badge-${bn}`}>
                                        Includes existing
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    {totalImages > 0 ? `${totalImages} image(s) uploaded across units` : "No images yet"}
                                  </p>
                                </div>
                              </button>
                              <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border cursor-pointer shrink-0 ${groupUploading || anyUnitUploading ? "opacity-60 pointer-events-none" : "hover:bg-amber-100"} border-amber-300 text-amber-800`}>
                                {groupUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                {groupUploading ? "Uploading..." : `Upload to all ${units.length}`}
                                <input
                                  type="file"
                                  multiple
                                  accept="image/*"
                                  className="hidden"
                                  data-testid={`re-step3-building-upload-${bn}`}
                                  disabled={groupUploading || anyUnitUploading}
                                  onChange={(e) => {
                                    handleReImageBatchUpload(unitIds, e.target.files, groupKey);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                            {expanded && (
                              <div className="border-t border-amber-100 bg-amber-50/40 p-3 space-y-2">
                                {units.map((prop) => {
                                  const count = reUploadedCounts[prop.id]?.images || 0;
                                  const uploading = reImageUploadingId === prop.id;
                                  return (
                                    <div key={prop.id} className="bg-white border border-amber-200 rounded-md p-2.5 flex items-center justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="text-xs font-medium text-gray-800 truncate">Unit {prop.unit_no || prop.name}</p>
                                          {prop._wasExisting && (
                                            <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700">Existing</Badge>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-gray-500">
                                          {count > 0 ? `${count} image(s) uploaded` : "No images yet"}
                                        </p>
                                      </div>
                                      <label className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : "hover:bg-amber-100"} border-amber-300 text-amber-800`}>
                                        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                        {uploading ? "..." : "Upload"}
                                        <input
                                          type="file"
                                          multiple
                                          accept="image/*"
                                          className="hidden"
                                          data-testid={`re-step3-image-upload-${prop.id}`}
                                          disabled={uploading}
                                          onChange={(e) => {
                                            handleReImageUpload(prop.id, e.target.files);
                                            e.target.value = "";
                                          }}
                                        />
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 4: Upload Presentations */}
                  <div className="bg-purple-50 rounded-xl border border-purple-200 p-6">
                    <h2 className="text-lg font-semibold text-purple-800 mb-4 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Step 4: Upload Presentations
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">
                      Upload once per building — the same PDFs are applied to every unit. Duplicate filenames of the same size are skipped automatically. Expand a building to upload unit-specific presentations.
                    </p>
                    {existProps.length > 0 && (
                      <p className="text-xs text-purple-700 mb-3" data-testid="re-step4-existing-note">
                        {existProps.length} existing property record(s) detected — you can still add/modify presentations here.
                      </p>
                    )}
                    <div className="space-y-3 max-h-[28rem] overflow-auto">
                      {buildingNames.map((bn) => {
                        const units = groups[bn];
                        const groupKey = `pres::${bn}`;
                        const unitIds = units.map(u => u.id);
                        const groupUploading = rePresUploadingId === groupKey;
                        const anyUnitUploading = units.some(u => rePresUploadingId === u.id);
                        const expanded = !!reExpandedBuildings[`pres::${bn}`];
                        const totalPres = units.reduce((s, u) => s + (reUploadedCounts[u.id]?.presentations || 0), 0);
                        const hasExisting = units.some(u => u._wasExisting);
                        return (
                          <div key={groupKey} className="bg-white border border-purple-200 rounded-lg">
                            <div className="p-3 flex items-center justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => toggleReBuilding(`pres::${bn}`)}
                                className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                data-testid={`re-step4-building-toggle-${bn}`}
                              >
                                {expanded ? <ChevronDown className="h-4 w-4 text-purple-700 shrink-0" /> : <ChevronRight className="h-4 w-4 text-purple-700 shrink-0" />}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{bn}</p>
                                    <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700">
                                      {units.length} unit{units.length > 1 ? "s" : ""}
                                    </Badge>
                                    {hasExisting && (
                                      <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-700" data-testid={`re-step4-existing-badge-${bn}`}>
                                        Includes existing
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500">
                                    {totalPres > 0 ? `${totalPres} presentation(s) uploaded across units` : "No presentations yet"}
                                  </p>
                                </div>
                              </button>
                              <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium border cursor-pointer shrink-0 ${groupUploading || anyUnitUploading ? "opacity-60 pointer-events-none" : "hover:bg-purple-100"} border-purple-300 text-purple-800`}>
                                {groupUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                {groupUploading ? "Uploading..." : `Upload to all ${units.length}`}
                                <input
                                  type="file"
                                  multiple
                                  accept="application/pdf"
                                  className="hidden"
                                  data-testid={`re-step4-building-upload-${bn}`}
                                  disabled={groupUploading || anyUnitUploading}
                                  onChange={(e) => {
                                    handleRePresentationBatchUpload(unitIds, e.target.files, groupKey);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                            {expanded && (
                              <div className="border-t border-purple-100 bg-purple-50/40 p-3 space-y-2">
                                {units.map((prop) => {
                                  const count = reUploadedCounts[prop.id]?.presentations || 0;
                                  const uploading = rePresUploadingId === prop.id;
                                  return (
                                    <div key={prop.id} className="bg-white border border-purple-200 rounded-md p-2.5 flex items-center justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="text-xs font-medium text-gray-800 truncate">Unit {prop.unit_no || prop.name}</p>
                                          {prop._wasExisting && (
                                            <Badge variant="outline" className="text-[9px] border-purple-300 text-purple-700">Existing</Badge>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-gray-500">
                                          {count > 0 ? `${count} presentation(s) uploaded` : "No presentations yet"}
                                        </p>
                                      </div>
                                      <label className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : "hover:bg-purple-100"} border-purple-300 text-purple-800`}>
                                        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                        {uploading ? "..." : "Upload"}
                                        <input
                                          type="file"
                                          multiple
                                          accept="application/pdf"
                                          className="hidden"
                                          data-testid={`re-step4-presentation-upload-${prop.id}`}
                                          disabled={uploading}
                                          onChange={(e) => {
                                            handleRePresentationUpload(prop.id, e.target.files);
                                            e.target.value = "";
                                          }}
                                        />
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );})()}

              {/* Email Sync Section - Only for historical-trades tab */}
              {activeTab === "historical-trades" && (
                <div className="mt-8 bg-gradient-to-r from-blue-50 to-etihad-maroon-50 rounded-xl border border-blue-200 p-6">
                  <h3 className="font-semibold text-blue-800 mb-4 flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Sync Repayments from Email
                  </h3>
                  <p className="text-sm text-blue-700 mb-4">
                    Automatically sync repayment data from <strong>updates@kinntegraa.club</strong> inbox. 
                    This reads repayment notification emails and updates client holdings across all customers.
                  </p>
                  
                  <div className="flex items-center gap-4">
                    <Button 
                      onClick={() => handleSyncEmailRepayments(7)}
                      disabled={syncingEmails}
                      className="bg-blue-600 hover:bg-blue-700"
                      data-testid="sync-email-7-days-btn"
                    >
                      {syncingEmails ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Sync Last 7 Days
                        </>
                      )}
                    </Button>
                    
                    <Button 
                      onClick={() => handleSyncEmailRepayments(30)}
                      disabled={syncingEmails}
                      variant="outline"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      data-testid="sync-email-30-days-btn"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Last 30 Days
                    </Button>
                    
                    <Button 
                      onClick={() => handleSyncEmailRepayments(90)}
                      disabled={syncingEmails}
                      variant="outline"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      data-testid="sync-email-90-days-btn"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Last 90 Days
                    </Button>
                  </div>
                  
                  {/* Email Sync Results */}
                  {emailSyncResults && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-blue-200">
                      <h4 className="font-medium text-gray-800 mb-2">Sync Results</h4>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Emails Found:</span>
                          <span className="ml-2 font-medium">{emailSyncResults.total_emails}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Processed:</span>
                          <span className="ml-2 font-medium text-blue-600">{emailSyncResults.processed}</span>
                        </div>
                        <div>
                          <span className="text-green-600">Matched:</span>
                          <span className="ml-2 font-medium text-green-700">{emailSyncResults.matched}</span>
                        </div>
                        <div>
                          <span className="text-red-600">Errors:</span>
                          <span className="ml-2 font-medium text-red-700">{emailSyncResults.errors?.length || 0}</span>
                        </div>
                      </div>
                      
                      {emailSyncResults.errors?.length > 0 && (
                        <div className="mt-2 text-xs text-red-600">
                          {emailSyncResults.errors.slice(0, 3).map((err, idx) => (
                            <p key={idx}>• {err}</p>
                          ))}
                          {emailSyncResults.errors.length > 3 && (
                            <p>...and {emailSyncResults.errors.length - 3} more errors</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tips */}
              <div className="mt-8 bg-blue-50 rounded-xl border border-blue-200 p-6">
                <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Tips for Successful Upload
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm text-blue-700">
                  <div>
                    <p className="font-medium">Data Validation</p>
                    <p>• Ensure all required fields are filled</p>
                    <p>• Check for duplicate entries (PAN, codes)</p>
                    {activeTab === "historical-trades" && (
                      <p>• NCD codes must exist in the system</p>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">Date Format</p>
                    <p>• Use YYYY-MM-DD format</p>
                    <p>• Or standard Excel date format</p>
                  </div>
                  <div>
                    <p className="font-medium">Limits</p>
                    <p>• Sub Brokers: Max 100 per upload</p>
                    <p>• Bonds: Max 50 per upload</p>
                    <p>• Real Estate: Max 30 per upload</p>
                    {activeTab === "historical-trades" && (
                      <p>• Purchase prices are validated against system calculations</p>
                    )}
                  </div>
                </div>
              </div>
              </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
