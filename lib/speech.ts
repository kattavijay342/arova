/**
 * Browser-native voice support (Web Speech API) — Speech-to-Text via
 * SpeechRecognition (mic input) and Text-to-Speech via SpeechSynthesis
 * (reading a reply aloud). Deliberately not routed through any server or
 * third-party API: zero new dependencies, zero API keys, zero per-use cost.
 * The tradeoff is browser support — SpeechRecognition is not implemented in
 * Firefox, so callers must feature-detect and disable voice input there
 * rather than assume it's always available.
 */

export function getSpeechRecognitionConstructor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Friendly text for SpeechRecognition's `error` event codes — never shown as the raw code. */
export function speechRecognitionErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow microphone access in your browser's site settings to use voice input.";
    case "no-speech":
      return "No speech was detected. Please try again.";
    case "audio-capture":
      return "No microphone was found. Please connect a microphone and try again.";
    case "network":
      return "A network error interrupted voice input. Please try again.";
    default:
      return "Voice input failed. Please try again.";
  }
}

/**
 * Renders Markdown into plain, speakable text — e.g. a heading's "##" or a
 * link's "[text](url)" syntax would otherwise be read aloud literally. A
 * lightweight regex pass rather than a full Markdown parse: this only needs
 * to sound reasonable, not preserve structure, and stays synchronous with
 * no bundle-size cost (no need to pull remark into every page that renders
 * a message bubble just for this).
 */
export function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^-{3,}$/gm, "")
    .replace(/\|/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

// Module-level (not React state) because SpeechSynthesis is a single,
// page-wide resource — the browser can only speak one utterance at a time
// regardless of which component asked. Tracking "who's currently speaking"
// here lets a click on a second message cleanly stop the first one and
// reset its own button, without prop-drilling shared state between every
// independent, memoized MessageBubble.
let active: { utterance: SpeechSynthesisUtterance; onStop: () => void } | null = null;

/** Speaks `text` aloud, stopping any other message currently being read. `onSpeakingChange` is called with true when playback starts and false when it ends (naturally, on error, or when stopped). */
export function speak(text: string, onSpeakingChange: (speaking: boolean) => void): void {
  stopSpeaking();
  if (!isSpeechSynthesisSupported() || !text.trim()) return;

  const utterance = new SpeechSynthesisUtterance(text);
  const stop = () => {
    if (active?.utterance === utterance) active = null;
    onSpeakingChange(false);
  };
  utterance.onend = stop;
  utterance.onerror = stop;

  active = { utterance, onStop: stop };
  window.speechSynthesis.speak(utterance);
  onSpeakingChange(true);
}

/** Stops whatever message is currently being read aloud, if any, and resets its button state. */
export function stopSpeaking(): void {
  if (!active) return;
  const current = active;
  active = null;
  window.speechSynthesis.cancel();
  current.onStop();
}
