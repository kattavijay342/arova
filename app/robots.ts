import type { MetadataRoute } from "next";

/**
 * The authenticated app routes (chat, dashboard, projects, settings) show
 * nothing to a crawler anyway — AppLayout redirects a signed-out request to
 * /login — but excluding them explicitly is still worth doing: it keeps
 * search engines from wasting crawl budget on URLs that can never resolve
 * to indexable content, and avoids a private conversation/project URL that
 * leaked externally ending up in a search index. /auth/callback is
 * excluded for the same reason (a one-time redirect target, never a page
 * worth indexing) plus its query params (an auth code) shouldn't be
 * crawled at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/chat", "/dashboard", "/projects", "/settings", "/auth/callback"],
    },
  };
}
