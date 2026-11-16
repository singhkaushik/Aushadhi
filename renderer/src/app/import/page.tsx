import ImportWizard from "@/components/ImportWizard";

export default function ImportPage() {
  return (
    <div className="max-w-6xl">
      <h1 className="h1">Import Marg Data</h1>
      <p className="mb-3 text-sm text-slate-600">
        Export lists from Marg ERP to Excel (.xls/.xlsx) or CSV and import them here. Recommended order: 1) Parties, 2) Items, 3) Opening Stock.
        Re-importing updates existing records matched by name.
      </p>
      <ImportWizard />
    </div>
  );
}
