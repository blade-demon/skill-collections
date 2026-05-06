import type { ArticleMetadata } from "./types.js";
import { pick, titleFallbackFromPath } from "./utils/html.js";

export function extractMetadata(html: string, htmlPath: string): ArticleMetadata {
  const title =
    pick(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/is) || pick(html, /<title>(.*?)<\/title>/is);
  const author =
    pick(html, /id=["']js_author_name["'][^>]*>(.*?)</is) || pick(html, /<meta\s+name=["']author["']\s+content=["']([^"']+)["']/is);
  const account = pick(html, /id=["']js_name["'][^>]*>\s*([^<]+?)\s*<\/a>/is);
  const published = pick(html, /id=["']publish_time["'][^>]*>(.*?)<\/em>/is);

  return {
    title: title || titleFallbackFromPath(htmlPath),
    author,
    account,
    published,
  };
}
