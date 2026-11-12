import { useEffect, useState } from "react";
import { RefreshCw, Truck, PackageCheck } from "lucide-react";
import api from "../../services/api";

export default function PostalDispatch() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [forms, setForms] = useState({});
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/staff/postal-dispatch");
      const rows = data.deliveries || [];
      setDeliveries(rows);
      setForms(Object.fromEntries(rows.map((d) => [d.deliveryId, {
        courierName: d.courierName || "India Post",
        trackingNumber: d.trackingNumber || "",
        location: "",
        remarks: "",
        status: d.deliveryStatus === "READY_FOR_DISPATCH" ? "DISPATCHED" : d.deliveryStatus === "DISPATCHED" ? "IN_TRANSIT" : d.deliveryStatus === "IN_TRANSIT" ? "IN_TRANSIT" : "DELIVERED",
      }])));
    } catch (e) { setError(e.response?.data?.message || "Unable to load postal dispatch queue."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateForm = (id, key, value) => setForms((old) => ({ ...old, [id]: { ...old[id], [key]: value } }));
  const submit = async (delivery) => {
    const form = forms[delivery.deliveryId] || {};
    setBusyId(delivery.deliveryId); setMessage(""); setError("");
    try {
      await api.patch(`/staff/postal-dispatch/${delivery.deliveryId}`, form);
      setMessage(`Tracking updated for ${delivery.requestNumber}.`);
      await load();
    } catch (e) { setError(e.response?.data?.message || "Could not update dispatch details."); }
    finally { setBusyId(null); }
  };

  return <div className="mx-auto max-w-6xl p-5 sm:p-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">Postal Dispatch</h1><p className="mt-1 text-sm text-slate-500">Paid physical-copy orders waiting for dispatch or tracking updates.</p></div>
      <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><RefreshCw size={16}/> Refresh</button>
    </div>
    {error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading postal orders…</p> : deliveries.length === 0 ? <div className="rounded-2xl border bg-white p-8 text-center"><PackageCheck className="mx-auto mb-3 text-slate-400"/><p className="font-semibold">No paid postal orders are waiting.</p></div> : <div className="space-y-4">{deliveries.map((d) => {
      const form = forms[d.deliveryId] || {};
      return <section key={d.deliveryId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{d.requestNumber} · {d.studentName}</p><p className="mt-1 text-xs text-slate-500">{d.rollNumber} · {d.certificateType} · ₹{d.postalFee}</p><p className="mt-2 text-sm text-slate-700">{[d.recipientName,d.addressLine1,d.addressLine2,d.city,d.district,d.state,d.pincode].filter(Boolean).join(", ")}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{d.deliveryStatus.replaceAll("_"," ")}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-xs font-medium text-slate-600">Courier / Postal service<input value={form.courierName || ""} onChange={(e)=>updateForm(d.deliveryId,"courierName",e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="India Post"/></label><label className="text-xs font-medium text-slate-600">Tracking / Consignment number<input value={form.trackingNumber || ""} onChange={(e)=>updateForm(d.deliveryId,"trackingNumber",e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="Enter consignment number"/></label><label className="text-xs font-medium text-slate-600">Delivery status<select value={form.status || "DISPATCHED"} onChange={(e)=>updateForm(d.deliveryId,"status",e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm">{(d.deliveryStatus === "READY_FOR_DISPATCH" ? ["DISPATCHED"] : d.deliveryStatus === "DISPATCHED" ? ["IN_TRANSIT","DELIVERED","RETURNED"] : ["IN_TRANSIT","DELIVERED","RETURNED"]).map((status) => <option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Current location / post office<input value={form.location || ""} onChange={(e)=>updateForm(d.deliveryId,"location",e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="e.g. Keonjhar HO"/></label><label className="text-xs font-medium text-slate-600">Update note (optional)<input value={form.remarks || ""} onChange={(e)=>updateForm(d.deliveryId,"remarks",e.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="e.g. Consignment accepted"/></label></div>
        <button disabled={busyId===d.deliveryId} onClick={()=>submit(d)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Truck size={16}/>{busyId===d.deliveryId ? "Saving…" : "Save tracking update"}</button>
      </section>;
    })}</div>}
  </div>;
}
