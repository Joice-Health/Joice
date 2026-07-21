'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders an assistant answer as markdown — the models emit **bold**, numbered
 * and bulleted lists, headings, and occasional tables, which read as literal
 * asterisks and hashes without this.
 *
 * Elements are styled explicitly (rather than via a typography plugin) so the
 * answer inherits the house palette and spacing. `react-markdown` does not
 * render raw HTML by default, which is what we want for model-generated text.
 */
export function AnswerMarkdown({ children }: { children: string }) {
  return (
    <div className="text-ink leading-relaxed [&>*+*]:mt-3">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings inside a chat bubble should read as strong labels, not page titles.
          h1: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h2: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h3: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          h4: ({ children }) => <p className="font-semibold text-ink">{children}</p>,
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5 [&>*+*]:mt-2">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-brand-400/40 pl-3 text-muted">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-brand-400/12 px-1.5 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-card bg-canvas p-3 font-mono text-xs">
              {children}
            </pre>
          ),
          hr: () => <hr className="border-line" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-ink/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-ink/5 px-3 py-2">{children}</td>,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
