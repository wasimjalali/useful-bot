import SwiftUI
import UsefulBotCore

/// Renders the blocks from `ChatMarkdownParser` with the web's `.chat-md`
/// type scale: 15pt body at 1.65 line height, 13pt mono code on the sunken
/// surface, 12pt block gaps. Inline spans come from the web parser so the
/// native transcript reads exactly like the browser one.
struct ChatMarkdownView: View, Equatable {
    let text: String
    var textColor: Color = Theme.C.ink
    /// Chat bubbles hug their content up to a cap; full-width surfaces such as
    /// proposal cards keep the expand-to-fill behavior.
    var expandsWidth = true

    var body: some View {
        let blocks = ChatMarkdownCache.blocks(from: text)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .font(Theme.font(DesignTokens.FontSize.chatBody, .regular))
        .foregroundStyle(textColor)
        .lineSpacing(7)
        .frame(maxWidth: expandsWidth ? .infinity : nil, alignment: .leading)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .paragraph(let content):
            Text(inline(content))
        case .heading(let level, let content):
            Text(inline(content))
                .font(Theme.font(headingSize(level), .semibold))
                .tracking(-0.02 * headingSize(level))
                .padding(.top, level == 1 ? 2 : 1)
        case .unorderedList(let items):
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .foregroundStyle(Theme.C.inkMuted)
                        Text(inline(item))
                    }
                }
            }
            .padding(.leading, 18)
        case .orderedList(let items):
            VStack(alignment: .leading, spacing: 3) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(index + 1).")
                            .foregroundStyle(Theme.C.inkMuted)
                            .monospacedDigit()
                        Text(inline(item))
                    }
                }
            }
            .padding(.leading, 18)
        case .code(_, let body):
            CodeBlockView(text: body)
        case .table(let table):
            MarkdownTableView(table: table) { inline($0) }
        case .quote(let content):
            HStack(alignment: .top, spacing: 10) {
                // The bar carries the quote; no tint, so a quoted line stays
                // as readable as the prose around it.
                Rectangle()
                    .fill(Theme.C.borderStrong)
                    .frame(width: 2)
                Text(inline(content))
                    .foregroundStyle(Theme.C.inkMuted)
            }
            .fixedSize(horizontal: false, vertical: true)
        case .rule:
            Rectangle()
                .fill(Theme.C.border)
                .frame(height: 1)
                .padding(.vertical, 2)
        }
    }

    private func headingSize(_ level: Int) -> CGFloat {
        switch level {
        case 1: return DesignTokens.FontSize.chatBody * 1.15
        case 2: return DesignTokens.FontSize.chatBody * 1.05
        default: return DesignTokens.FontSize.chatBody
        }
    }

    /// Inline spans turned into one attributed string: code on the sunken
    /// mono face, bold, italics, and http(s) links only. Parsing matches the
    /// web (`shared/chat-markdown.ts`), so `_snake_case_` stays plain and no
    /// other emphasis form renders.
    private func inline(_ source: String) -> AttributedString {
        var attributed = AttributedString()
        for span in ChatMarkdownCache.inline(from: source) {
            switch span.kind {
            case .text:
                attributed.append(AttributedString(span.text))
            case .code:
                var run = AttributedString(span.text)
                run.font = .system(size: 13, design: .monospaced)
                run.backgroundColor = Theme.C.sunken
                attributed.append(run)
            case .strong:
                var run = AttributedString(span.text)
                run.font = Theme.font(DesignTokens.FontSize.chatBody, .semibold)
                attributed.append(run)
            case .emphasized:
                var run = AttributedString(span.text)
                run.font = Theme.font(DesignTokens.FontSize.chatBody, .regular).italic()
                attributed.append(run)
            case .link:
                var run = AttributedString(span.text)
                if Self.linkTarget(span.href) != nil {
                    run.link = Self.linkTarget(span.href)
                    run.foregroundColor = Theme.C.ink
                    run.underlineStyle = .single
                }
                attributed.append(run)
            }
        }
        return attributed
    }

    /// Model output may only link to the public web; `file://` and local
    /// server links must not become tap targets.
    private static func linkTarget(_ href: String) -> URL? {
        guard let url = URL(string: href),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              !LocalHost.isLocal(url.host) else { return nil }
        return url
    }
}

/// A pipe table as a real grid.
///
/// `Grid` keeps the columns aligned across rows without measuring anything by
/// hand, and the whole table scrolls sideways inside its own scroll view so a
/// wide one never pushes the transcript column out past the window edge.
struct MarkdownTableView: View {
    let table: MarkdownTable
    /// The row renderer's inline parser, passed in so the table draws bold,
    /// code and links inside cells exactly like the prose around it.
    let inline: (String) -> AttributedString

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(Array(table.headers.enumerated()), id: \.offset) { index, cell in
                        cellView(cell, column: index, header: true)
                    }
                }
                .background(Theme.C.sunken)
                ForEach(Array(table.rows.enumerated()), id: \.offset) { rowIndex, row in
                    Divider().gridCellUnsizedAxes(.horizontal)
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { index, cell in
                            cellView(cell, column: index, header: false)
                        }
                    }
                    .background(rowIndex.isMultiple(of: 2) ? Color.clear : Theme.C.sunken.opacity(0.4))
                }
            }
            .fixedSize(horizontal: true, vertical: false)
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(Theme.C.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private func cellView(_ cell: String, column: Int, header: Bool) -> some View {
        let alignment = table.alignments.indices.contains(column)
            ? table.alignments[column]
            : .leading
        return Text(inline(cell))
            .font(header ? Theme.font(DesignTokens.FontSize.chatBody, .semibold) : nil)
            .multilineTextAlignment(textAlignment(alignment))
            .frame(minWidth: 64, maxWidth: 360, alignment: frameAlignment(alignment))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
    }

    private func textAlignment(_ alignment: MarkdownTable.Alignment) -> TextAlignment {
        switch alignment {
        case .leading: return .leading
        case .center: return .center
        case .trailing: return .trailing
        }
    }

    private func frameAlignment(_ alignment: MarkdownTable.Alignment) -> Alignment {
        switch alignment {
        case .leading: return .leading
        case .center: return .center
        case .trailing: return .trailing
        }
    }
}

/// One fenced code block: the sunken mono card from the web's `pre`, with a
/// copy affordance so a drafted prompt can go straight to the pasteboard.
/// The block spans the column and long lines scroll horizontally under the
/// app-wide thin scroller instead of pushing the layout out past the edge.
struct CodeBlockView: View {
    let text: String

    @State private var copied = false

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(text)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Theme.C.ink)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .padding(.trailing, 48)
        }
        .background(Theme.C.sunken)
        .overlay(alignment: .topTrailing) {
            copyButton.padding(.top, 8).padding(.trailing, 10)
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .animation(.easeOut(duration: 0.15), value: copied)
    }

    private var copyButton: some View {
        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            copied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                copied = false
            }
        } label: {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.C.inkMuted)
                .frame(width: 26, height: 26)
                .background(Theme.C.surface)
                .overlay(Capsule().strokeBorder(Theme.C.border, lineWidth: 1))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .accessibilityLabel(copied ? "Copied" : "Copy code")
        .help("Copy")
    }
}
