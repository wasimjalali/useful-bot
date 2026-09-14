import type { ReactNode } from "react";
import { blocksFromMarkdown, parseInline, type MdAlign } from "../../shared/chat-markdown.ts";

function align(value: MdAlign | undefined): "left" | "center" | "right" {
  if (value === "center") return "center";
  if (value === "trailing") return "right";
  return "left";
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, index): ReactNode => {
        if (segment.type === "code") return <code key={index}>{segment.text}</code>;
        if (segment.type === "strong") return <strong key={index}>{segment.text}</strong>;
        if (segment.type === "em") return <em key={index}>{segment.text}</em>;
        if (segment.type === "link") {
          return (
            <a href={segment.href} key={index} rel="noreferrer noopener" target="_blank">
              {segment.text}
            </a>
          );
        }
        return segment.text;
      })}
    </>
  );
}

export function ChatMarkdown({ text }: { text: string }) {
  const blocks = blocksFromMarkdown(text);
  if (blocks.length === 0) return null;
  return (
    <div className="chat-md">
      {blocks.map((block, index) => {
        if (block.type === "h") {
          const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
          return <Tag key={index}><Inline text={block.text} /></Tag>;
        }
        if (block.type === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}><Inline text={item} /></li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}><Inline text={item} /></li>
              ))}
            </ol>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "table") {
          return (
            // Wrapped so a wide table scrolls inside its own box rather than
            // pushing the transcript column past the edge.
            <div className="chat-md-table" key={index}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((cell, cellIndex) => (
                      <th key={cellIndex} style={{ textAlign: align(block.aligns[cellIndex]) }}>
                        <Inline text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} style={{ textAlign: align(block.aligns[cellIndex]) }}>
                          <Inline text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "quote") {
          return <blockquote key={index}><Inline text={block.text} /></blockquote>;
        }
        if (block.type === "rule") return <hr key={index} />;
        return <p key={index}><Inline text={block.text} /></p>;
      })}
    </div>
  );
}
