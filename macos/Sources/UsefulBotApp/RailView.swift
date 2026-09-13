import SwiftUI
import UsefulBotCore

/// The 248pt rail from `web/components/bot-rail.tsx`: logo, search pill,
/// New Bot, pinned cards, sections, unassigned/hidden, account row.
struct RailView: View {
    @EnvironmentObject private var model: AppModel

    var onSearch: () -> Void
    var onNewChat: () -> Void
    var onOpenSettings: (String) -> Void
    var onRenameRequest: (ShellBot) -> Void
    var onDeleteRequest: (ShellBot) -> Void
    var onCreateSection: () -> Void
    var onConnectors: () -> Void

    @State private var searchHovering = false
    @State private var newBotHovering = false

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                UsefulBotLogoView()
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 4)
            .padding(.top, 4)

            searchTrigger
            newChatTrigger

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let store = model.store {
                        pinnedSection(store)
                        ForEach(store.sections) { section in
                            sectionBlock(store, section)
                        }
                        unassignedSection(store)
                        hiddenSection(store)
                    }
                }
                .padding(.trailing, 1)
            }
            .uvScroll()

            operatorRow
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 16)
        .frame(width: DesignTokens.Space.railWidth)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Theme.C.rail)
    }

    // MARK: - Triggers

    private var searchTrigger: some View {
        Button(action: onSearch) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(Theme.C.inkFaint)
                Text("Search")
                    .font(.system(size: DesignTokens.FontSize.searchTrigger))
                    .foregroundStyle(Theme.C.inkFaint)
                Spacer(minLength: 0)
                Text("⌘K")
                    .font(.system(size: DesignTokens.FontSize.kbd, weight: .semibold))
                    .tracking(0.02 * DesignTokens.FontSize.kbd)
                    .foregroundStyle(Theme.C.inkFaint)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Theme.C.sunken)
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(Theme.C.border, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .padding(.horizontal, 10)
            .frame(minHeight: DesignTokens.Control.searchTrigger)
            .background(searchHovering ? Theme.C.accentSoft : Theme.C.surface)
            .overlay(
                Capsule().strokeBorder(searchHovering ? Theme.C.border : Theme.C.borderStrong, lineWidth: 1)
            )
            .clipShape(Capsule())
            .smShadow()
            .contentShape(Capsule())
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: searchHovering)
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .onHover { searchHovering = $0 }
    }

    private var newChatTrigger: some View {
        Button(action: onNewChat) {
            HStack(spacing: 8) {
                Image(systemName: "plus.bubble")
                    .font(.system(size: 15, weight: .regular))
                Text("New Bot")
                    .font(.system(size: DesignTokens.FontSize.newBotTrigger, weight: .semibold))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: DesignTokens.Control.newBotTrigger)
            .background(newBotHovering ? Theme.C.surface : Theme.C.sunken)
            .overlay(Capsule().strokeBorder(newBotHovering ? Theme.C.borderStrong : Theme.C.border, lineWidth: 1))
            .clipShape(Capsule())
            .smShadow()
            .contentShape(Capsule())
            .animation(.easeOut(duration: DesignTokens.Motion.fast), value: newBotHovering)
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .onHover { newBotHovering = $0 }
    }

    // MARK: - Groups

    @ViewBuilder
    private func pinnedSection(_ store: ShellStore) -> some View {
        let pinned = store.pinnedBots
        if !pinned.isEmpty {
            VStack(spacing: 8) {
                ForEach(pinned) { bot in
                    PinnedCardView(
                        bot: bot,
                        selected: bot.id == model.selectedBotId,
                        onSelect: { model.select(bot.id) },
                        onOpenSettings: { onOpenSettings(bot.id) },
                        onRenameRequest: { onRenameRequest(bot) },
                        onDeleteRequest: { onDeleteRequest(bot) },
                        onCreateSection: onCreateSection
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func sectionBlock(_ store: ShellStore, _ section: ShellSection) -> some View {
        let bots = store.sectionBots(section.id)
        VStack(alignment: .leading, spacing: 2) {
            SectionHeader(title: section.name, collapsed: section.collapsed) {
                model.toggleSection(section.id)
            }
            if !section.collapsed {
                VStack(spacing: 2) {
                    ForEach(bots) { bot in
                        BotRowView(
                            bot: bot,
                            selected: bot.id == model.selectedBotId,
                            onSelect: { model.select(bot.id) },
                            onOpenSettings: { onOpenSettings(bot.id) },
                            onRenameRequest: { onRenameRequest(bot) },
                            onDeleteRequest: { onDeleteRequest(bot) },
                            sections: store.sections,
                            canDelete: store.bots.count > 1,
                            onCreateSection: onCreateSection
                        )
                    }
                }
                .padding(.top, 2)
            }
        }
    }

    @ViewBuilder
    private func unassignedSection(_ store: ShellStore) -> some View {
        let bots = store.sectionBots(nil)
        VStack(alignment: .leading, spacing: 2) {
            SectionHeader(title: "Unassigned", collapsed: store.collapsedUnassigned) {
                model.toggleSection("unassigned")
            }
            if !store.collapsedUnassigned {
                VStack(alignment: .leading, spacing: 2) {
                    if bots.isEmpty {
                        Text("Default home for new bots.")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.C.inkFaint)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                    } else {
                        ForEach(bots) { bot in
                            BotRowView(
                                bot: bot,
                                selected: bot.id == model.selectedBotId,
                                onSelect: { model.select(bot.id) },
                                onOpenSettings: { onOpenSettings(bot.id) },
                                onRenameRequest: { onRenameRequest(bot) },
                                onDeleteRequest: { onDeleteRequest(bot) },
                                sections: store.sections,
                                canDelete: store.bots.count > 1,
                                onCreateSection: onCreateSection
                            )
                        }
                    }
                }
                .padding(.top, 2)
            }
        }
    }

    @ViewBuilder
    private func hiddenSection(_ store: ShellStore) -> some View {
        let bots = store.hiddenBots
        if !bots.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                SectionHeader(title: "Hidden", collapsed: store.collapsedHidden) {
                    model.toggleSection("hidden")
                }
                if !store.collapsedHidden {
                    VStack(spacing: 2) {
                        ForEach(bots) { bot in
                            BotRowView(
                                bot: bot,
                                selected: bot.id == model.selectedBotId,
                                onSelect: { model.select(bot.id) },
                                onOpenSettings: { onOpenSettings(bot.id) },
                                onRenameRequest: { onRenameRequest(bot) },
                                onDeleteRequest: { onDeleteRequest(bot) },
                                sections: store.sections,
                                canDelete: store.bots.count > 1,
                                onCreateSection: onCreateSection
                            )
                        }
                    }
                    .padding(.top, 2)
                }
            }
        }
    }

    // MARK: - Account

    private var operatorRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Hairline()
                .padding(.bottom, 8)
            connectorsRow
            HStack(spacing: 10) {
                Text(model.operatorInitials)
                    .font(.system(size: 10, weight: .bold))
                    .tracking(DesignTokens.Tracking.operatorAvatar * 10)
                    .foregroundStyle(Theme.C.ink)
                    .frame(width: DesignTokens.Control.operatorAvatar, height: DesignTokens.Control.operatorAvatar)
                    .background(Theme.C.sunken)
                    .clipShape(Circle())
                Text(model.operatorName)
                    .font(.system(size: DesignTokens.FontSize.railName, weight: .medium))
                    .foregroundStyle(Theme.C.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 6)
        }
    }

    private var connectorsRow: some View {
        MenuRowButton(action: onConnectors) {
            HStack(spacing: 10) {
                Image(systemName: "shippingbox")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.C.ink)
                    .frame(width: 16)
                Text("Connectors")
                    .font(.system(size: DesignTokens.FontSize.railName))
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Rows

private struct BotRowView: View {
    let bot: ShellBot
    let selected: Bool
    let onSelect: () -> Void
    let onOpenSettings: () -> Void
    let onRenameRequest: () -> Void
    let onDeleteRequest: () -> Void
    let sections: [ShellSection]
    let canDelete: Bool
    let onCreateSection: () -> Void

    @EnvironmentObject private var model: AppModel
    @State private var hovering = false

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 8) {
                BotAvatarView(bot: bot, size: 24)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(bot.name)
                            .font(.system(size: DesignTokens.FontSize.railName, weight: selected ? .semibold : .regular))
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        if bot.isGroup {
                            Image(systemName: "person.2")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.C.inkFaint)
                                .fixedSize()
                        }
                        if !bot.label.isEmpty {
                            BotLabelChip(text: bot.label)
                                .layoutPriority(2)
                        }
                    }
                    if !preview.isEmpty {
                        Text(preview)
                            .font(.system(size: DesignTokens.FontSize.railPreview))
                            .foregroundStyle(Theme.C.inkMuted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                Spacer(minLength: 0)
                if !time.isEmpty {
                    Text(time)
                        .font(.system(size: DesignTokens.FontSize.railTime))
                        .monospacedDigit()
                        .foregroundStyle(Theme.C.inkFaint)
                        .padding(.top, 2)
                        .fixedSize()
                }
            }
            .padding(.leading, 8)
            .padding(.trailing, 28)
            .padding(.vertical, 6)
            .frame(minHeight: DesignTokens.Space.botRow)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected || hovering ? Theme.C.sunken : .clear)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.channel, style: .continuous))
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .onHover { hovering = $0 }
        .overlay(alignment: .topTrailing) {
            Menu {
                rowMenu
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(width: 24, height: 24)
                    .background(hovering ? Theme.C.accentSoft : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .padding(.trailing, 2)
            .padding(.top, 6)
            .opacity(hovering ? 1 : 0)
        }
        .contextMenu { rowMenu }
    }

    @ViewBuilder
    private var rowMenu: some View {
        Button(bot.pinned ? "Unpin" : "Pin") {
            model.perform(ShellActions.pin(botId: bot.id, pinned: !bot.pinned))
        }
        Menu("Move to section") {
            Button("Unassigned") {
                model.perform(ShellActions.move(botId: bot.id, sectionId: nil))
            }
            ForEach(sections) { section in
                Button(section.name) {
                    model.perform(ShellActions.move(botId: bot.id, sectionId: section.id))
                }
            }
            Divider()
            Button("New section", action: onCreateSection)
        }
        Button("Settings", action: onOpenSettings)
        Button("Rename", action: onRenameRequest)
        Button(bot.hidden ? "Unhide" : "Hide") {
            model.perform(ShellActions.hide(botId: bot.id, hidden: !bot.hidden))
        }
        Divider()
        Button("Delete", role: .destructive, action: onDeleteRequest)
            .disabled(!canDelete)
    }

    private var preview: String {
        bot.lastPreview.isEmpty ? bot.description : bot.lastPreview
    }

    private var time: String {
        RailClock.label(iso: bot.lastAt)
    }
}

private struct PinnedCardView: View {
    let bot: ShellBot
    let selected: Bool
    let onSelect: () -> Void
    let onOpenSettings: () -> Void
    let onRenameRequest: () -> Void
    let onDeleteRequest: () -> Void
    let onCreateSection: () -> Void

    @EnvironmentObject private var model: AppModel
    @State private var hovering = false

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 10) {
                BotAvatarView(bot: bot, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(bot.name)
                            .font(.system(size: DesignTokens.FontSize.railName, weight: .semibold))
                            .foregroundStyle(Theme.C.ink)
                            .lineLimit(1)
                        if !bot.label.isEmpty {
                            BotLabelChip(text: bot.label)
                                .layoutPriority(2)
                        }
                    }
                    Text(preview)
                        .font(.system(size: DesignTokens.FontSize.railPreview))
                        .foregroundStyle(Theme.C.inkMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(DesignTokens.Space.pinnedCardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? Theme.C.sunken : Theme.C.surface)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.Radius.card, style: .continuous)
                    .strokeBorder(
                        selected || hovering ? Theme.C.borderStrong : Theme.C.border,
                        lineWidth: 1
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.card, style: .continuous))
            .smShadow()
            .contentShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.card, style: .continuous))
        }
        .buttonStyle(.plain)
        .pointerOnHover()
        .onHover { hovering = $0 }
        .contextMenu {
            Button(bot.pinned ? "Unpin" : "Pin") {
                model.perform(ShellActions.pin(botId: bot.id, pinned: !bot.pinned))
            }
            Button("Settings", action: onOpenSettings)
            Button("Rename", action: onRenameRequest)
            Button("Hide") {
                model.perform(ShellActions.hide(botId: bot.id, hidden: true))
            }
            Divider()
            Button("Delete", role: .destructive, action: onDeleteRequest)
        }
    }

    private var preview: String {
        if !bot.lastPreview.isEmpty { return bot.lastPreview }
        if !bot.description.isEmpty { return bot.description }
        return "Pinned"
    }
}
