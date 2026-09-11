import { ProfileSection } from "@/components/settings/ProfileSection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { UsageSection } from "@/components/settings/UsageSection";
import { MemorySection } from "@/components/settings/MemorySection";
import { PersonalizationSection } from "@/components/settings/PersonalizationSection";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="font-display text-2xl font-semibold text-text">Settings</h1>
      <p className="mt-1.5 text-muted">Manage your profile and app preferences.</p>

      <div className="mt-6 flex flex-col gap-5">
        <ProfileSection />
        <MemorySection />
        <PersonalizationSection />
        <UsageSection />
        <PreferencesSection />
      </div>
    </div>
  );
}
