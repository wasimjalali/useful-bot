import type { ReactNode } from "react";
import { blocksFromMarkdown } from "../../shared/chat-markdown.ts";

function Inline({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const match = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(rest);
    if (!match || match.index === undefined) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    if (match[1] !== undefined) nodes.push(<code key={key}>{match[1]}</code>);
    else if (match[2] !== undefined) nodes.push(<strong key={key}>{match[2]}</strong>);
    else if (match[3] !== undefined) nodes.push(<strong key={key}>{match[3]}</strong>);
    else if (match[4] !== undefined) nodes.push(<em key={key}>{match[4]}</em>);
    else if (match[5] !== undefined) nodes.push(<em key={key}>{match[5]}</em>);
    else if (match[6] !== undefined && match[7] !== undefined) {
      nodes.push(<a href={match[7]} key={key} rel="noreferrer" target="_blank">{match[6]}</a>);
    }
    rest = rest.slice(match.index + match[0].length);
    key += 1;
  }
  return <>{nodes}</>;
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
        return <p key={index}><Inline text={block.text} /></p>;
      })}
    </div>
  );
}
