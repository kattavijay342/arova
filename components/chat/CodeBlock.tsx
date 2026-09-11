"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { Check, Copy } from "lucide-react";
import { toString as hastToString } from "hast-util-to-string";
import type { Element } from "hast";

/**
 * Custom renderer for react-markdown's `pre` — every fenced code block
 * (```...```) becomes a `<pre><code>...</code></pre>`, unlike inline code
 * spans (single backticks), which are never wrapped in `<pre>`. Intercepting
 * `pre` rather than `code` is what makes that distinction reliable: a hast
 * node here has no `className` heuristic to lean on for an untagged fenced
 * block (```` ``` ```` with no language), but it's always a `pre`.
 *
 * Adds two things react-markdown's default `<pre>` doesn't: a copy button
 * (mirrors the same clipboard pattern as MessageBubble's own Copy button)
 * and a small language label, both useful now that rehype-highlight (see
 * MessageContent.tsx) actually makes the language visually distinguishable.
 */
export function CodeBlock({ node, children, ...props }: ComponentPropsWithoutRef<"pre"> & { node?: Element }) {
  const [copied, setCopied] = useState(false);

  const codeNode = node?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  const languageClass = (codeNode?.properties?.className as string[] | undefined)?.find((c) =>
    c.startsWith("language-")
  );
  const language = languageClass?.slice("language-".length);

  // Flattens the hast subtree back to plain text — robust regardless of how
  // many `<span class="hljs-...">` wrappers rehype-highlight split the
  // tokens into, unlike trying to read text out of the already-rendered
  // React children.
  const rawCode = node ? hastToString(node) : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing to fall back to here.
    }
  }

  return (
    <div className="code-block">
      {language && <span className="code-block-lang">{language}</span>}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="code-block-copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre {...props}>{children}</pre>
    </div>
  );
}
