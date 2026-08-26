"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MODE_LIST } from "@/lib/modes";

export function Hero() {
  const router = useRouter();

  return (
    <section className="relative flex min-h-[calc(100svh-65px)] flex-col justify-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-[-140px] -z-10 flex justify-center"
        aria-hidden
      >
        <div
          className="h-[460px] w-[460px] rounded-full blur-3xl"
          style={{ background: "var(--color-brand)", opacity: 0.16 }}
        />
      </div>

      <div className="mx-auto max-w-3xl px-5 py-12 text-center sm:px-8 sm:py-16">
        <span className="mb-6 inline-block rounded-full bg-brand-soft px-3 py-1 font-mono text-xs uppercase tracking-wider text-brand">
          One assistant, three modes
        </span>
        <h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] text-text sm:text-6xl">
          One AI. Three ways to get ahead.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-muted sm:text-xl">
          Study smarter, prepare for interviews, and get instant answers — all in one place.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={() => router.push("/signup")} className="px-7 py-3.5 text-base sm:w-auto">
            Get started free
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => router.push("/login")}
            className="px-7 py-3.5 text-base sm:w-auto"
          >
            Try it as a guest
          </Button>
        </div>
        <p className="mt-4 text-sm text-faint">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Log in
          </Link>
        </p>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 sm:gap-10">
          {MODE_LIST.map((mode) => {
            const Icon = mode.icon;
            return (
              <div key={mode.id} className="flex flex-col items-center gap-2.5">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-soft"
                  style={{ backgroundColor: mode.color }}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-text">{mode.shortLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
