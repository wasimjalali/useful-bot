import SwiftUI
import UsefulBotCore

struct SidebarView: View {
    @EnvironmentObject private var model: AppModel
    @State private var expanded: [String: Bool] = [:]

    var body: some View {
        List(selection: selection) {
            if let store = model.store {
                let pinned = store.bots.filter { $0.pinned && !$0.hidden }
                if !pinned.isEmpty {
                    Section("Pinned") {
                        ForEach(pinned) { bot in row(bot) }
                    }
                }
                ForEach(store.sections.sorted { $0.order < $1.order }) { section in
                    let bots = store.bots.filter {
                        $0.sectionId == section.id && !$0.hidden && !$0.pinned
                    }
                    if !bots.isEmpty {
                        // Key the override by the server value so a change made
                        // elsewhere resets the local expansion.
                        let key = "\(section.id):\(section.collapsed)"
                        let isExpanded = expanded[key] ?? !section.collapsed
                        Section {
                            if isExpanded {
                                ForEach(bots) { bot in row(bot) }
                            }
                        } header: {
                            Button {
                                expanded[key] = !isExpanded
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                                        .font(.system(size: 9, weight: .semibold))
                                    Text(section.name)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                let unassigned = store.bots.filter {
                    $0.sectionId == nil && !$0.hidden && !$0.pinned
                }
                if !unassigned.isEmpty {
                    Section("Unassigned") {
                        ForEach(unassigned) { bot in row(bot) }
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    private var selection: Binding<String?> {
        Binding(
            get: { model.selectedBotId },
            set: { id in
                if let id { model.select(id) }
            }
        )
    }

    private func row(_ bot: ShellBot) -> some View {
        HStack(spacing: 8) {
            BotAvatarView(bot: bot, size: 22)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 5) {
                    Text(bot.name)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)
                    if bot.isGroup {
                        Image(systemName: "person.2")
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                    }
                    if !bot.label.isEmpty {
                        Text(bot.label.uppercased())
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                if !bot.lastPreview.isEmpty {
                    Text(bot.lastPreview)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
        .tag(bot.id)
    }
}
