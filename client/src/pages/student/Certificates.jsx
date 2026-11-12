import { useEffect, useState } from "react";
import { Award, Download, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../services/api";

export default function Certificates() {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/student/certificates");
      setCertificates(data.certificates || []);
    } catch (e) {
      setError(e.response?.data?.message || "Could not load your certificates.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const download = async (item) => {
    setDownloading(item.requestId); setError("");
    try {
      const response = await api.get(`/student/requests/${item.requestId}/certificate/download`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a"); a.href = url;
      a.download = `${item.certificateNumber || "certificate"}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.response?.data?.message || "Certificate PDF is not available yet."); }
    finally { setDownloading(null); }
  };

  return <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-indigo-600">STUDENT DOCUMENTS</p><h1 className="mt-1 text-3xl font-bold text-slate-900">My Certificates</h1><p className="mt-2 text-sm text-slate-500">Certificates generated and recorded by your college portal.</p></div><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw size={16}/> Refresh</button></div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {loading ? <div className="flex items-center gap-2 py-16 text-slate-500"><LoaderCircle className="animate-spin"/> Loading certificates…</div> : certificates.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Award className="mx-auto text-slate-300" size={42}/><h2 className="mt-4 text-lg font-semibold text-slate-800">No certificates yet</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">When a college staff member approves your request and generates a certificate, it will appear here.</p><Link to="/student/requests" className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">View my requests</Link></div> : <div className="grid gap-4 md:grid-cols-2">{certificates.map(c => <article key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><FileText size={22}/></div><div className="min-w-0 flex-1"><h2 className="font-semibold text-slate-900">{c.certificateType || c.serviceName}</h2><p className="mt-1 break-all text-xs text-slate-500">Certificate No. {c.certificateNumber}</p><p className="mt-2 text-sm text-slate-600">Request: {c.requestNumber || `#${c.requestId}`}</p><p className="text-sm text-slate-600">Issue date: {c.issueDate ? new Date(c.issueDate).toLocaleDateString() : "—"}</p></div></div><div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Generated</span><button onClick={() => download(c)} disabled={downloading === c.requestId} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Download size={15}/>{downloading === c.requestId ? "Preparing…" : "Download PDF"}</button></div></article>)}</div>}
  </section>;
}
