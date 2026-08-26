import { MODE_LIST } from "@/lib/modes";
import { Card } from "@/components/ui/Card";

export function ModeShowcase() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <h2 className="font-display text-2xl font-semibold text-text sm:text-3xl">
          Three modes, one conversation away
        </h2>
        <p className="mt-3 text-muted">
          Pick a mode when you start chatting. Switch anytime from the sidebar.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {MODE_LIST.map((mode) => {
          const Icon = mode.icon;
          return (
            <Card key={mode.id} className="p-6">
              <span
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: mode.color }}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="font-display text-lg font-semibold text-text">{mode.label}</h3>
              <p className="mt-1.5 text-sm text-muted">{mode.valueProp}</p>
              <p
                className="mt-3 font-mono text-xs font-medium uppercase tracking-wide"
                style={{ color: mode.color }}
              >
                {mode.features.join(" • ")}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
