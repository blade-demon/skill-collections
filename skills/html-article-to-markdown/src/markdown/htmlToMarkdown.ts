import type { ImageResolver } from "../types.js";
import { tokenizeHtml } from "../utils/html.js";

type InlineMarker = string | { type: "a"; href: string };

interface ListState {
  type: "ul" | "ol";
  idx: number;
}

export class HtmlToMarkdownConverter {
  private readonly parts: string[] = [];
  private readonly lists: ListState[] = [];
  private readonly inline: InlineMarker[] = [];
  private ignoreDepth = 0;
  private inLi = 0;
  private inPre = false;
  private blockquoteDepth = 0;
  private atLineStart = true;
  private imageCounter = 0;

  constructor(private readonly imageResolver: ImageResolver) {}

  async convert(html: string): Promise<string> {
    for (const token of tokenizeHtml(html)) {
      if (token.type === "text") {
        this.handleData(token.text ?? "");
      } else if (token.type === "start") {
        await this.handleStartTag(token.tagName ?? "", token.attrs ?? {});
      } else if (token.type === "end") {
        this.handleEndTag(token.tagName ?? "");
      }
    }
    return this.markdown();
  }

  private emit(text: string): void {
    if (!text) {
      return;
    }

    if (this.blockquoteDepth) {
      for (const segment of text.split(/(\n)/)) {
        if (!segment) {
          continue;
        }
        if (segment !== "\n" && this.atLineStart) {
          this.parts.push("> ".repeat(this.blockquoteDepth));
        }
        this.parts.push(segment);
        this.atLineStart = segment === "\n";
      }
      return;
    }

    this.parts.push(text);
    this.atLineStart = text.endsWith("\n");
  }

  private nl(count = 1): void {
    this.emit("\n".repeat(count));
  }

  private block(): void {
    if (!this.inLi) {
      this.nl(2);
    }
  }

  private async handleStartTag(tag: string, attrs: Record<string, string>): Promise<void> {
    if (tag === "script" || tag === "style") {
      this.ignoreDepth += 1;
      return;
    }
    if (this.ignoreDepth) {
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      this.block();
      this.emit(`${"#".repeat(Number(tag[1]))} `);
    } else if (tag === "blockquote") {
      this.block();
      this.blockquoteDepth += 1;
    } else if (["p", "section", "div", "figure"].includes(tag)) {
      if (!this.blockquoteDepth) {
        this.block();
      }
    } else if (tag === "hr") {
      this.nl(2);
      this.emit("---");
      this.nl(2);
    } else if (tag === "br") {
      this.nl();
    } else if (tag === "pre") {
      this.nl(2);
      this.emit("```\n");
      this.inPre = true;
    } else if (tag === "code" && !this.inPre) {
      this.emit("`");
    } else if (tag === "strong" || tag === "b") {
      this.emit("**");
      this.inline.push("**");
    } else if (tag === "em" || tag === "i") {
      this.emit("*");
      this.inline.push("*");
    } else if (tag === "ul" || tag === "ol") {
      this.lists.push({ type: tag, idx: 0 });
      this.nl();
    } else if (tag === "li") {
      this.inLi += 1;
      this.nl();
      const indent = "  ".repeat(Math.max(0, this.lists.length - 1));
      const current = this.lists[this.lists.length - 1];
      if (current?.type === "ol") {
        current.idx += 1;
        this.emit(`${indent}${current.idx}. `);
      } else {
        this.emit(`${indent}- `);
      }
    } else if (tag === "a") {
      this.emit("[");
      this.inline.push({ type: "a", href: (attrs.href ?? "").trim() });
    } else if (tag === "img") {
      this.imageCounter += 1;
      const image = await this.imageResolver.resolve(attrs, this.imageCounter);
      if (image) {
        this.nl(2);
        this.emit(image);
        this.nl(2);
      }
    }
  }

  private handleEndTag(tag: string): void {
    if (tag === "script" || tag === "style") {
      this.ignoreDepth = Math.max(0, this.ignoreDepth - 1);
      return;
    }
    if (this.ignoreDepth) {
      return;
    }

    if (tag === "pre") {
      if (this.inPre) {
        this.nl();
        this.emit("```");
        this.nl(2);
      }
      this.inPre = false;
    } else if (tag === "code" && !this.inPre) {
      this.emit("`");
    } else if (tag === "strong" || tag === "b") {
      this.closeInline("**");
    } else if (tag === "em" || tag === "i") {
      this.closeInline("*");
    } else if (tag === "a") {
      this.closeLink();
    } else if (tag === "ul" || tag === "ol") {
      this.lists.pop();
      this.nl();
    } else if (tag === "li") {
      this.inLi = Math.max(0, this.inLi - 1);
      this.nl();
    } else if (tag === "blockquote") {
      if (!this.inLi) {
        this.nl();
      }
      this.blockquoteDepth = Math.max(0, this.blockquoteDepth - 1);
    } else if (["p", "section", "div", "figure"].includes(tag) && !this.inLi) {
      this.nl();
    }
  }

  private handleData(data: string): void {
    if (this.ignoreDepth) {
      return;
    }
    if (this.inPre) {
      this.emit(data);
      return;
    }
    const text = data.replace(/\u200b/g, "").replace(/\xa0/g, " ").replace(/\s+/g, " ");
    if (text.trim()) {
      this.emit(text);
    }
  }

  private closeInline(marker: string): void {
    for (let index = this.inline.length - 1; index >= 0; index -= 1) {
      if (this.inline[index] === marker) {
        this.inline.splice(index, 1);
        this.emit(marker);
        break;
      }
    }
  }

  private closeLink(): void {
    for (let index = this.inline.length - 1; index >= 0; index -= 1) {
      const item = this.inline[index];
      if (typeof item === "object" && item.type === "a") {
        this.inline.splice(index, 1);
        this.emit(item.href && !item.href.startsWith("javascript:") ? `](<${item.href}>)` : "]");
        break;
      }
    }
  }

  private markdown(): string {
    let out = this.parts
      .join("")
      .replace(/\u200b/g, "")
      .replace(/\xa0/g, " ")
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    let previous: string | null = null;
    while (previous !== out) {
      previous = out;
      out = out.replace(/^(- .+)\n\n(?=- )/gm, "$1\n").replace(/^(\d+\. .+)\n\n(?=\d+\. )/gm, "$1\n");
    }

    return `${out}\n`;
  }
}
