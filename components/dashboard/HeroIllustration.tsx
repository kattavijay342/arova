import { MODE_LIST } from "@/lib/modes";

const LAYOUT = [
  { top: "0px", left: "36px", rotate: "-6deg" },
  { top: "44px", left: "0px", rotate: "5deg" },
  { top: "68px", left: "68px", rotate: "-4deg" },
];

/** Small decorative stamp of the three mode icons — no external assets. */
export function HeroIllustration() {
  return (
    <div className="relative hidden h-36 w-36 flex-none sm:block" aria-hidden>
      {MODE_LIST.map((mode, i) => {
        const Icon = mode.icon;
        const pos = LAYOUT[i];
        return (
          <span
            key={mode.id}
            className="absolute flex h-16 w-16 items-center justify-center rounded-2xl text-white"
            style={{
              backgroundColor: mode.color,
              top: pos.top,
              left: pos.left,
              transform: `rotate(${pos.rotate})`,
              // a 4px "ring" matching the card background, plus a drop shadow
              boxShadow: "0 0 0 4px var(--color-surface), 0 8px 20px rgba(20,25,40,0.14)",
            }}
          >
            <Icon className="h-7 w-7" />
          </span>
        );
      })}
    </div>
  );
}
