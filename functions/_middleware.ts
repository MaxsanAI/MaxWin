const SITE_URL = "https://maxwin-90x.pages.dev";

type Preview = { title: string; description: string; image: string; path: string };

const HOME_IMAGES = [
  "/images/book-of-ra/book-of-ra-desktop.jpg",
  "/images/slots/ai-neon-dynasty/cover-desktop.jpg",
  "/images/royal-fortune/royal-fortune-cover-desktop.jpg",
  "/images/golden-vault/golden-vault-bars.jpg"
];

const SLOT_PREVIEWS: Record<string, Preview> = {
  "/games/temple-of-ra": {
    title: "Temple of Ra | MAXWIN",
    description: "Explore Temple of Ra, a MAXWIN original slot with an ancient Egyptian theme.",
    image: "/images/book-of-ra/book-of-ra-desktop.jpg",
    path: "/games/temple-of-ra"
  },
  "/games/royal-fortune": {
    title: "Royal Fortune | MAXWIN",
    description: "Discover Royal Fortune, a premium MAXWIN original slot.",
    image: "/images/royal-fortune/royal-fortune-cover-desktop.jpg",
    path: "/games/royal-fortune"
  },
  "/games/ai-neon-dynasty": {
    title: "AI NEON DYNASTY | MAXWIN",
    description: "Enter AI NEON DYNASTY, the neon-powered MAXWIN original slot.",
    image: "/images/slots/ai-neon-dynasty/cover-desktop.jpg",
    path: "/games/ai-neon-dynasty"
  },
  "/games/golden-vault": {
    title: "Golden Vault | MAXWIN",
    description: "Step into Golden Vault, a high-stakes themed MAXWIN original slot.",
    image: "/images/golden-vault/golden-vault-bars.jpg",
    path: "/games/golden-vault"
  },
  "/games/moon-temple": {
    title: "Moon Temple | MAXWIN",
    description: "Explore Moon Temple, a mysterious MAXWIN original slot.",
    image: "/images/book-of-ra/book-of-ra-desktop.jpg",
    path: "/games/moon-temple"
  },
  "/games/lucky-7s": {
    title: "Lucky 7s | MAXWIN",
    description: "Play Lucky 7s, a classic-style MAXWIN original slot.",
    image: "/images/royal-fortune/royal-fortune-cover-desktop.jpg",
    path: "/games/lucky-7s"
  },
  "/games/cosmic-gems": {
    title: "Cosmic Gems | MAXWIN",
    description: "Discover Cosmic Gems, a jewel-inspired MAXWIN original slot.",
    image: "/images/slots/ai-neon-dynasty/cover-desktop.jpg",
    path: "/games/cosmic-gems"
  },
  "/games/crown-of-gold": {
    title: "Crown of Gold | MAXWIN",
    description: "Discover Crown of Gold, a royal-themed MAXWIN original slot.",
    image: "/images/royal-fortune/royal-fortune-cover-desktop.jpg",
    path: "/games/crown-of-gold"
  },
  "/games/midnight-spin": {
    title: "Midnight Spin | MAXWIN",
    description: "Discover Midnight Spin, a classic-style MAXWIN original slot.",
    image: "/images/slots/ai-neon-dynasty/cover-desktop.jpg",
    path: "/games/midnight-spin"
  }
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildPreview(pathname: string): Preview | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const slot = SLOT_PREVIEWS[path];
  if (slot) return slot;
  if (path !== "/") return null;

  // Rotate the homepage social image by day, keeping the result stable for crawler retries.
  const day = Math.floor(Date.now() / 86400000);
  const image = HOME_IMAGES[((day % HOME_IMAGES.length) + HOME_IMAGES.length) % HOME_IMAGES.length];
  return {
    title: "MAXWIN — Premium Casino Games",
    description: "Discover MAXWIN original slots, featured games and newly opened experiences.",
    image,
    path: "/"
  };
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const preview = buildPreview(url.pathname);
  const response = await context.next();
  if (!preview) return response;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const canonical = SITE_URL + preview.path;
  const imageUrl = SITE_URL + preview.image;
  let html = await response.text();
  html = html.replace(/<title>[^<]*<\/title>/i, "<title>" + escapeHtml(preview.title) + "</title>");
  html = html.replace(/<meta\s+name=["']description["'][^>]*>/i, "");
  html = html.replace(/<meta\b[^>]*(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "");
  html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, "");

  const tags = [
    '<meta name="description" content="' + escapeHtml(preview.description) + '" />',
    '<link rel="canonical" href="' + escapeHtml(canonical) + '" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="MAXWIN" />',
    '<meta property="og:title" content="' + escapeHtml(preview.title) + '" />',
    '<meta property="og:description" content="' + escapeHtml(preview.description) + '" />',
    '<meta property="og:url" content="' + escapeHtml(canonical) + '" />',
    '<meta property="og:image" content="' + escapeHtml(imageUrl) + '" />',
    '<meta property="og:image:secure_url" content="' + escapeHtml(imageUrl) + '" />',
    '<meta property="og:image:alt" content="' + escapeHtml(preview.title + " slot artwork") + '" />',
    '<meta property="og:image:type" content="image/jpeg" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + escapeHtml(preview.title) + '" />',
    '<meta name="twitter:description" content="' + escapeHtml(preview.description) + '" />',
    '<meta name="twitter:image" content="' + escapeHtml(imageUrl) + '" />',
    '<meta name="twitter:image:alt" content="' + escapeHtml(preview.title + " slot artwork") + '" />'
  ].join("\n    ");

  html = html.replace("</head>", "    " + tags + "\n  </head>");
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, s-maxage=300");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
};
