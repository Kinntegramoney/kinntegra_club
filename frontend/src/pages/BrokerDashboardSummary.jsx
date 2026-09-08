// Broker-only "Dashboard" page that summarises every approved NCD
// investment. Data source: `GET /api/broker/dashboard/ncd-summary`.
// Two views: NCD-wise (default) and Client-wise. Real Estate will be
// layered on the same page later.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LayoutGrid, RefreshCw, Download, Search, Users, Wallet,
  CheckCircle2, Clock, TrendingUp, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown, Calendar,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtINR = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
const fmtLakh = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${fmtINR(v)}`;
};

// Generic sort helper used by both tables. Numeric keys sort as
// numbers, string keys as case-insensitive strings.
const sortRows = (rows, { key, dir }) => {
  if (!key) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = a?.[key];
    const vb = b?.[key];
    if (typeof va === "number" || typeof vb === "number") {
      const na = Number(va || 0);
      const nb = Number(vb || 0);
      return dir === "asc" ? na - nb : nb - na;
    }
    const sa = String(va || "").toLowerCase();
    const sb = String(vb || "").toLowerCase();
    if (sa < sb) return dir === "asc" ? -1 : 1;
    if (sa > sb) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return copy;
};

// Sortable table header. Clicking toggles asc/desc; clicking a
// different column resets that column to desc for numerics, asc for
// strings.
const SortTh = ({ label, sortKey, sort, setSort, align = "left", numeric = false, className = "" }) => {
  const active = sort.key === sortKey;
  const dir = active ? sort.dir : null;
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const jc = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const onClick = () => {
    if (active) {
      setSort({ key: sortKey, dir: dir === "asc" ? "desc" : "asc" });
    } else {
      setSort({ key: sortKey, dir: numeric ? "desc" : "asc" });
    }
  };
  return (
    <th
      className={`${alignCls} px-4 py-2 font-medium cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={onClick}
      data-testid={`sort-${sortKey}`}
    >
      <span className={`inline-flex items-center gap-1 ${jc}`}>
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-gray-300" />
        )}
      </span>
    </th>
  );
};

const KpiCard = ({ label, value, sub, icon: Icon, tint = "blue" }) => {
  const tints = {
    blue:  "from-blue-50 to-blue-100 text-blue-700 border-blue-200",
    green: "from-green-50 to-green-100 text-green-700 border-green-200",
    amber: "from-amber-50 to-amber-100 text-amber-700 border-amber-200",
    slate: "from-slate-50 to-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <div className={`rounded-lg border bg-gradient-to-br ${tints[tint]} p-4`} data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
          <p className="text-2xl font-bold mt-1 leading-tight">{value}</p>
          {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
        </div>
        {Icon && <Icon className="h-8 w-8 opacity-60" />}
      </div>
    </div>
  );
};

export default function BrokerDashboardSummary() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("ncd"); // "ncd" | "client" | "month"
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState({}); // per client_id
  const [monthExpanded, setMonthExpanded] = useState({}); // per month
  // Sort state per tab. Default: total invested desc on both tabs so
  // the biggest exposure sits at the top.
  const [ncdSort, setNcdSort] = useState({ key: "total_invested", dir: "desc" });
  const [clientSort, setClientSort] = useState({ key: "total_invested", dir: "desc" });
  // Inner (per-NCD) sort inside each expanded client row.
  const [clientInnerSort, setClientInnerSort] = useState({ key: "invested", dir: "desc" });
  const [monthSort, setMonthSort] = useState({ key: "sort", dir: "asc" });
  // Inner (per-client) sort inside each expanded month row. Shared
  // across all months so the ordering feels consistent when jumping
  // between months.
  const [monthInnerSort, setMonthInnerSort] = useState({ key: "expected_date", dir: "asc" });

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) { navigate("/"); return; }
    const u = JSON.parse(raw);
    if (u.role !== "broker" && u.role !== "sub_broker") { navigate("/"); return; }
    setUser(u);
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${API}/broker/dashboard/ncd-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const totals = data?.totals || {};
  // Add expected_profit to every row BEFORE sorting so the sort
  // comparator can see it. expected_profit = (repaid + pending) − invested.
  const filteredNcd = useMemo(() => {
    const enriched = (data?.by_ncd || []).map(r => ({
      ...r,
      expected_profit: (Number(r.total_repaid || 0) + Number(r.total_pending || 0)) - Number(r.total_invested || 0),
    }));
    const s = q.toLowerCase();
    const matched = !q ? enriched : enriched.filter(r =>
      (r.ncd_name || "").toLowerCase().includes(s) ||
      (r.bond_code || "").toLowerCase().includes(s)
    );
    return sortRows(matched, ncdSort);
  }, [data, q, ncdSort]);

  const filteredClient = useMemo(() => {
    const enriched = (data?.by_client || []).map(r => ({
      ...r,
      expected_profit: (Number(r.total_repaid || 0) + Number(r.total_pending || 0)) - Number(r.total_invested || 0),
    }));
    const s = q.toLowerCase();
    const matched = !q ? enriched : enriched.filter(r =>
      (r.client_name || "").toLowerCase().includes(s) ||
      (r.pan || "").toLowerCase().includes(s) ||
      (r.ncds || []).some(n => (n.ncd_name || "").toLowerCase().includes(s))
    );
    return sortRows(matched, clientSort);
  }, [data, q, clientSort]);

  const filteredMonth = useMemo(() => {
    const rows = data?.by_month || [];
    const s = q.toLowerCase();
    const matched = !q ? rows : rows.filter(r =>
      (r.label || "").toLowerCase().includes(s) ||
      (r.clients || []).some(c =>
        (c.client_name || "").toLowerCase().includes(s) ||
        (c.ncd_name || "").toLowerCase().includes(s)
      )
    );
    return sortRows(matched, monthSort);
  }, [data, q, monthSort]);

  const downloadExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (data.by_ncd || []).map(r => {
        const profit = (Number(r.total_repaid || 0) + Number(r.total_pending || 0)) - Number(r.total_invested || 0);
        return {
          "NCD Name":        r.ncd_name,
          "Bond Code":       r.bond_code,
          "Maturity Date":   r.maturity_date || "",
          "Status":          r.status,
          "Investors":       r.num_investors,
          "Total Units":     r.total_units,
          "Total Invested":  r.total_invested,
          "Total Repaid":    r.total_repaid,
          "Total Pending":   r.total_pending,
          "Expected Profit": profit,
        };
      })
    ), "By NCD");

    const clientRows = [];
    (data.by_client || []).forEach(c => {
      (c.ncds || []).forEach(n => {
        const profit = (Number(n.repaid || 0) + Number(n.pending || 0)) - Number(n.invested || 0);
        clientRows.push({
          "Client Name":     c.client_name,
          "PAN":             c.pan,
          "NCD Name":        n.ncd_name,
          "Bond Code":       n.bond_code,
          "Units":           n.units,
          "Invested":        n.invested,
          "Repaid":          n.repaid,
          "Pending":         n.pending,
          "Expected Profit": profit,
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientRows), "By Client");

    // By-Month maturity ladder — flatten per-client rows so every
    // scheduled payout is one row: Month, Client, NCD, principal,
    // interest, gross, net.
    const monthRows = [];
    (data.by_month || []).forEach(m => {
      (m.clients || []).forEach(c => {
        monthRows.push({
          "Month":         m.label,
          "Expected Date": c.expected_date || "",
          "Client":        c.client_name,
          "NCD":           c.ncd_name,
          "Principal":     c.principal,
          "Interest":      c.interest,
          "Gross":         c.gross,
          "Net":           c.net,
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthRows), "By Month");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      "Total Invested":       totals.invested,
      "Total Repaid":         totals.repaid,
      "Total Pending":        totals.pending,
      "# Trades":             totals.num_trades,
      "# NCDs":               totals.num_ncds,
      "# Clients":            totals.num_clients,
      "# Active trades":      totals.num_active,
      "# Matured trades":     totals.num_matured,
    }]), "Totals");

    const stamp = new Date().toISOString().slice(0, 16).replace(":", "");
    XLSX.writeFile(wb, `ncd_dashboard_${stamp}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar user={user} />
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <LayoutGrid className="h-6 w-6 text-blue-600" /> NCD Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Every approved NCD investment across your book, aggregated by NCD and by client.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="dashboard-refresh-btn">
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button
                size="sm"
                onClick={downloadExcel}
                disabled={loading || !data}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="dashboard-download-btn"
              >
                <Download className="h-4 w-4 mr-1" /> Download Excel
              </Button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="Total Invested" value={fmtLakh(totals.invested)} sub={`${totals.num_trades || 0} trades · ${totals.num_ncds || 0} NCDs`} icon={Wallet} tint="blue" />
            <KpiCard label="Repaid" value={fmtLakh(totals.repaid)} sub={totals.invested > 0 ? `${((totals.repaid / totals.invested) * 100).toFixed(1)}% of invested` : "—"} icon={CheckCircle2} tint="green" />
            <KpiCard label="Pending" value={fmtLakh(totals.pending)} sub={`${totals.num_active || 0} active, ${totals.num_matured || 0} matured`} icon={Clock} tint="amber" />
            <KpiCard label="Investors" value={String(totals.num_clients || 0)} sub={`Avg ${(totals.num_clients ? (totals.invested / totals.num_clients) : 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} per investor`} icon={Users} tint="slate" />
          </div>

          {/* Tab switcher + search */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
              <Button
                variant={tab === "ncd" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("ncd")}
                className={tab === "ncd" ? "bg-blue-600 hover:bg-blue-700" : ""}
                data-testid="dashboard-tab-ncd"
              >
                <TrendingUp className="h-4 w-4 mr-1" /> By NCD
              </Button>
              <Button
                variant={tab === "client" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("client")}
                className={tab === "client" ? "bg-blue-600 hover:bg-blue-700" : ""}
                data-testid="dashboard-tab-client"
              >
                <Users className="h-4 w-4 mr-1" /> By Client
              </Button>
              <Button
                variant={tab === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("month")}
                className={tab === "month" ? "bg-blue-600 hover:bg-blue-700" : ""}
                data-testid="dashboard-tab-month"
              >
                <Calendar className="h-4 w-4 mr-1" /> By Month
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder={
                    tab === "ncd" ? "Search NCD name or code…" :
                    tab === "client" ? "Search client name, PAN or NCD…" :
                    "Search month, client or NCD…"
                  }
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-64 h-8 text-sm"
                  data-testid="dashboard-search-input"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-gray-500">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mx-auto mb-2" />
                Loading dashboard…
              </div>
            ) : tab === "ncd" ? (
              <NcdTable rows={filteredNcd} sort={ncdSort} setSort={setNcdSort} />
            ) : tab === "client" ? (
              <ClientTable rows={filteredClient} sort={clientSort} setSort={setClientSort} expanded={expanded} setExpanded={setExpanded} innerSort={clientInnerSort} setInnerSort={setClientInnerSort} />
            ) : (
              <MonthTable rows={filteredMonth} sort={monthSort} setSort={setMonthSort} expanded={monthExpanded} setExpanded={setMonthExpanded} innerSort={monthInnerSort} setInnerSort={setMonthInnerSort} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const NcdTable = ({ rows, sort, setSort }) => {
  if (!rows.length) {
    return <div className="p-10 text-center text-sm text-gray-500">No NCD investments found.</div>;
  }
  const totals = rows.reduce((a, r) => ({
    invested: a.invested + r.total_invested,
    repaid:   a.repaid   + r.total_repaid,
    pending:  a.pending  + r.total_pending,
    profit:   a.profit   + (r.expected_profit || 0),
    units:    a.units    + r.total_units,
  }), { invested: 0, repaid: 0, pending: 0, profit: 0, units: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b text-gray-600">
          <tr>
            <SortTh label="NCD"             sortKey="ncd_name"        sort={sort} setSort={setSort} />
            <SortTh label="Code"            sortKey="bond_code"       sort={sort} setSort={setSort} />
            <SortTh label="Investors"       sortKey="num_investors"   sort={sort} setSort={setSort} align="center" numeric />
            <SortTh label="Units"           sortKey="total_units"     sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Invested"        sortKey="total_invested"  sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Repaid"          sortKey="total_repaid"    sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Pending"         sortKey="total_pending"   sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Expected Profit" sortKey="expected_profit" sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Status"          sortKey="status"          sort={sort} setSort={setSort} align="center" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ncd_id || r.ncd_name} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-800">{r.ncd_name}</td>
              <td className="px-4 py-2 font-mono text-gray-600">{r.bond_code || "—"}</td>
              <td className="px-4 py-2 text-center">{r.num_investors}</td>
              <td className="px-4 py-2 text-right font-mono">{fmtINR(r.total_units)}</td>
              <td className="px-4 py-2 text-right font-mono font-semibold text-blue-700">₹{fmtINR(r.total_invested)}</td>
              <td className="px-4 py-2 text-right font-mono text-green-700">₹{fmtINR(r.total_repaid)}</td>
              <td className="px-4 py-2 text-right font-mono text-amber-700">₹{fmtINR(r.total_pending)}</td>
              <td className={`px-4 py-2 text-right font-mono font-semibold ${r.expected_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {r.expected_profit >= 0 ? '' : '-'}₹{fmtINR(Math.abs(r.expected_profit))}
              </td>
              <td className="px-4 py-2 text-center">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  r.status === 'matured' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
                }`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t font-semibold">
          <tr>
            <td colSpan={3} className="px-4 py-2">Total ({rows.length} NCDs)</td>
            <td className="px-4 py-2 text-right font-mono">{fmtINR(totals.units)}</td>
            <td className="px-4 py-2 text-right font-mono text-blue-800">₹{fmtINR(totals.invested)}</td>
            <td className="px-4 py-2 text-right font-mono text-green-800">₹{fmtINR(totals.repaid)}</td>
            <td className="px-4 py-2 text-right font-mono text-amber-800">₹{fmtINR(totals.pending)}</td>
            <td className={`px-4 py-2 text-right font-mono ${totals.profit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
              {totals.profit >= 0 ? '' : '-'}₹{fmtINR(Math.abs(totals.profit))}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const ClientTable = ({ rows, sort, setSort, expanded, setExpanded, innerSort, setInnerSort }) => {
  if (!rows.length) {
    return <div className="p-10 text-center text-sm text-gray-500">No clients with NCD investments.</div>;
  }
  const totals = rows.reduce((a, r) => ({
    invested: a.invested + r.total_invested,
    repaid:   a.repaid   + r.total_repaid,
    pending:  a.pending  + r.total_pending,
    profit:   a.profit   + (r.expected_profit || 0),
  }), { invested: 0, repaid: 0, pending: 0, profit: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b text-gray-600">
          <tr>
            <th className="w-8 px-2 py-2"></th>
            <SortTh label="Client"          sortKey="client_name"     sort={sort} setSort={setSort} />
            <SortTh label="PAN"             sortKey="pan"             sort={sort} setSort={setSort} />
            <SortTh label="NCDs"            sortKey="num_ncds"        sort={sort} setSort={setSort} align="center" numeric />
            <SortTh label="Invested"        sortKey="total_invested"  sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Repaid"          sortKey="total_repaid"    sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Pending"         sortKey="total_pending"   sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Expected Profit" sortKey="expected_profit" sort={sort} setSort={setSort} align="right" numeric />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const isOpen = expanded[c.client_id];
            return (
              <>
                <tr
                  key={c.client_id || c.client_name}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(s => ({ ...s, [c.client_id]: !s[c.client_id] }))}
                  data-testid={`client-row-${c.client_id}`}
                >
                  <td className="px-2 py-2 text-center">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800">{c.client_name}</td>
                  <td className="px-4 py-2 font-mono text-gray-600 text-xs">{c.pan || "—"}</td>
                  <td className="px-4 py-2 text-center">{c.num_ncds}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-blue-700">₹{fmtINR(c.total_invested)}</td>
                  <td className="px-4 py-2 text-right font-mono text-green-700">₹{fmtINR(c.total_repaid)}</td>
                  <td className="px-4 py-2 text-right font-mono text-amber-700">₹{fmtINR(c.total_pending)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold ${c.expected_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {c.expected_profit >= 0 ? '' : '-'}₹{fmtINR(Math.abs(c.expected_profit))}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-gray-50 border-b">
                    <td></td>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="rounded border bg-white">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100 text-gray-600">
                            <tr>
                              <SortTh label="NCD"             sortKey="ncd_name"        sort={innerSort} setSort={setInnerSort} />
                              <SortTh label="Code"            sortKey="bond_code"       sort={innerSort} setSort={setInnerSort} />
                              <SortTh label="Units"           sortKey="units"           sort={innerSort} setSort={setInnerSort} align="right" numeric />
                              <SortTh label="Invested"        sortKey="invested"        sort={innerSort} setSort={setInnerSort} align="right" numeric />
                              <SortTh label="Repaid"          sortKey="repaid"          sort={innerSort} setSort={setInnerSort} align="right" numeric />
                              <SortTh label="Pending"         sortKey="pending"         sort={innerSort} setSort={setInnerSort} align="right" numeric />
                              <SortTh label="Expected Profit" sortKey="expected_profit" sort={innerSort} setSort={setInnerSort} align="right" numeric />
                            </tr>
                          </thead>
                          <tbody>
                            {sortRows((c.ncds || []).map(n => ({
                              ...n,
                              expected_profit: (Number(n.repaid || 0) + Number(n.pending || 0)) - Number(n.invested || 0),
                            })), innerSort).map(n => (
                              <tr key={n.ncd_id || n.ncd_name} className="border-t">
                                <td className="px-3 py-1.5">{n.ncd_name}</td>
                                <td className="px-3 py-1.5 font-mono text-gray-500">{n.bond_code || "—"}</td>
                                <td className="px-3 py-1.5 text-right font-mono">{fmtINR(n.units)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-blue-700">₹{fmtINR(n.invested)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-green-700">₹{fmtINR(n.repaid)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-amber-700">₹{fmtINR(n.pending)}</td>
                                <td className={`px-3 py-1.5 text-right font-mono ${n.expected_profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                  {n.expected_profit >= 0 ? '' : '-'}₹{fmtINR(Math.abs(n.expected_profit))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 border-t font-semibold">
          <tr>
            <td></td>
            <td colSpan={3} className="px-4 py-2">Total ({rows.length} clients)</td>
            <td className="px-4 py-2 text-right font-mono text-blue-800">₹{fmtINR(totals.invested)}</td>
            <td className="px-4 py-2 text-right font-mono text-green-800">₹{fmtINR(totals.repaid)}</td>
            <td className="px-4 py-2 text-right font-mono text-amber-800">₹{fmtINR(totals.pending)}</td>
            <td className={`px-4 py-2 text-right font-mono ${totals.profit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
              {totals.profit >= 0 ? '' : '-'}₹{fmtINR(Math.abs(totals.profit))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// Month-wise maturity ladder — shows every month in which one or more
// scheduled repayments are expected to land, so a sub-broker can plan
// what cash will arrive when. Expanding a row reveals the per-client
// breakdown for that month.
const MonthTable = ({ rows, sort, setSort, expanded, setExpanded, innerSort, setInnerSort }) => {
  if (!rows.length) {
    return <div className="p-10 text-center text-sm text-gray-500">No upcoming repayments.</div>;
  }
  const totals = rows.reduce((a, r) => ({
    count:     a.count     + Number(r.count || 0),
    principal: a.principal + Number(r.principal || 0),
    interest:  a.interest  + Number(r.interest  || 0),
    gross:     a.gross     + Number(r.gross     || 0),
    net:       a.net       + Number(r.net       || 0),
  }), { count: 0, principal: 0, interest: 0, gross: 0, net: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b text-gray-600">
          <tr>
            <th className="w-8 px-2 py-2"></th>
            <SortTh label="Month"     sortKey="sort"      sort={sort} setSort={setSort} />
            <SortTh label="# Payouts" sortKey="count"     sort={sort} setSort={setSort} align="center" numeric />
            <SortTh label="Principal" sortKey="principal" sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Interest"  sortKey="interest"  sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Gross"     sortKey="gross"     sort={sort} setSort={setSort} align="right" numeric />
            <SortTh label="Net"       sortKey="net"       sort={sort} setSort={setSort} align="right" numeric />
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const isOpen = expanded[m.month];
            return (
              <>
                <tr
                  key={m.month}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(s => ({ ...s, [m.month]: !s[m.month] }))}
                  data-testid={`month-row-${m.month}`}
                >
                  <td className="px-2 py-2 text-center">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800">{m.label}</td>
                  <td className="px-4 py-2 text-center">{m.count}</td>
                  <td className="px-4 py-2 text-right font-mono text-blue-700">₹{fmtINR(m.principal)}</td>
                  <td className="px-4 py-2 text-right font-mono text-purple-700">₹{fmtINR(m.interest)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-700">₹{fmtINR(m.gross)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-800">₹{fmtINR(m.net)}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-gray-50 border-b">
                    <td></td>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="rounded border bg-white">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100 text-gray-600">
                            <tr>
                              <SortTh label="Expected Date" sortKey="expected_date" sort={innerSort} setSort={setInnerSort} />
                              <SortTh label="Client"        sortKey="client_name"   sort={innerSort} setSort={setInnerSort} />
                              <SortTh label="NCD"           sortKey="ncd_name"      sort={innerSort} setSort={setInnerSort} />
                              <SortTh label="Principal"     sortKey="principal"     sort={innerSort} setSort={setInnerSort} align="right" numeric />
                              <SortTh label="Interest"      sortKey="interest"      sort={innerSort} setSort={setInnerSort} align="right" numeric />
                              <SortTh label="Gross"         sortKey="gross"         sort={innerSort} setSort={setInnerSort} align="right" numeric />
                              <SortTh label="Net"           sortKey="net"           sort={innerSort} setSort={setInnerSort} align="right" numeric />
                            </tr>
                          </thead>
                          <tbody>
                            {sortRows(m.clients || [], innerSort).map((c, i) => (
                              <tr key={`${m.month}-${c.client_id}-${c.expected_date}-${i}`} className="border-t">
                                <td className="px-3 py-1.5 font-mono text-gray-700">
                                  {c.expected_date ? new Date(c.expected_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                </td>
                                <td className="px-3 py-1.5">{c.client_name || "—"}</td>
                                <td className="px-3 py-1.5 text-gray-500">{c.ncd_name || "—"}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-blue-700">₹{fmtINR(c.principal)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-purple-700">₹{fmtINR(c.interest)}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-emerald-700">₹{fmtINR(c.gross)}</td>
                                <td className="px-3 py-1.5 text-right font-mono">₹{fmtINR(c.net)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 border-t font-semibold">
          <tr>
            <td></td>
            <td className="px-4 py-2">Total ({rows.length} months)</td>
            <td className="px-4 py-2 text-center">{totals.count}</td>
            <td className="px-4 py-2 text-right font-mono text-blue-800">₹{fmtINR(totals.principal)}</td>
            <td className="px-4 py-2 text-right font-mono text-purple-800">₹{fmtINR(totals.interest)}</td>
            <td className="px-4 py-2 text-right font-mono text-emerald-800">₹{fmtINR(totals.gross)}</td>
            <td className="px-4 py-2 text-right font-mono text-gray-900">₹{fmtINR(totals.net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

