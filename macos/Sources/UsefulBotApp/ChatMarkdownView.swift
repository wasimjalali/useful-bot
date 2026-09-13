import SwiftUI
import UsefulBotCore

/// Renders the blocks from `ChatMarkdownParser` with the web's `.chat-md`
/// type scale: 15pt body at 1.65 line height, 13pt mono code on the sunken
/// surface, 12pt block gaps.
struct ChatMarkdownView: View {
    let text: String
    var textColor: Color = Theme.C.ink

    var body: some View {
        let blocks = ChatMarkdownParser.blocks(from: text)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                blockView(block)
            }
        }
        .font(Theme.font(DesignTokens.FontSize.chatBody, .regular))
        .foregroundStyle(textColor)
        .lineSpacing(7)
        .frame(maxWidth: .infinity, alignment: .leading)
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
            ScrollView(.horizontal, showsIndicators: false) {
                Text(body)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(Theme.C.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Theme.C.sunken)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func headingSize(_ level: Int) -> CGFloat {
        switch level {
        case 1: return DesignTokens.FontSize.chatBody * 1.15
        case 2: return DesignTokens.FontSize.chatBody * 1.05
        default: return DesignTokens.FontSize.chatBody
        }
    }

    /// Inline spans via AttributedString: bold, italic, code, links.
    private func inline(_ source: String) -> AttributedString {
        var attributed = (try? AttributedString(
            markdown: source,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? AttributedString(source)
        for run in attributed.runs {
            let intent = run.inlinePresentationIntent
            if run.link != nil {
                attributed[run.range].foregroundColor = Theme.C.ink
                attributed[run.range].underlineStyle = .single
            }
            if intent?.contains(.code) == true {
                attributed[run.range].font = .system(size: 13, design: .monospaced)
                attributed[run.range].backgroundColor = Theme.C.sunken
            } else if intent?.contains(.stronglyEmphasized) == true {
                attributed[run.range].font = Theme.font(DesignTokens.FontSize.chatBody, .semibold)
            } else if intent?.contains(.emphasized) == true {
                attributed[run.range].font = .system(size: DesignTokens.FontSize.chatBody).italic()
            }
        }
        return attributed
    }
}
