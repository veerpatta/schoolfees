import { SectionCard } from "@/components/admin/section-card";
import { schoolProfile } from "@/lib/config/fee-rules";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Control school profile, role access, and future fee policy revisions.
        </p>
      </header>

      <SectionCard
        title="School profile"
        description="Single-school deployment assumptions for this project."
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>School: {schoolProfile.name}</p>
          <p>Access type: {schoolProfile.adminOnly ? "Internal Admin" : "Public"}</p>
        </div>
      </SectionCard>
    </div>
  );
}
