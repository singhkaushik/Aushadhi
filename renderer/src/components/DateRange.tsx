export default function DateRange({ from, to, children }: { from?: string; to: string; children?: React.ReactNode }) {
  return (
    <form className="no-print mb-3 flex flex-wrap items-end gap-2">
      {from !== undefined && (
        <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
      )}
      <div><label className="label">{from !== undefined ? "To" : "As on"}</label><input type="date" name="to" defaultValue={to} className="input" /></div>
      {children}
      <button className="btn-sec">Show</button>
    </form>
  );
}
