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
    var onOpenAppSettings: (AppSettingsTab) -> Void
    /// Window frame of the New Bot plus button, so overlays outside the rail
    /// can treat clicks on it as the toggle rather than "outside".
    @Binding var newChatTriggerFrame: CGRect

    @State private var searchHovering = false
    @State private var accountOpen = false
    @State private var accountAnchor: CGRect = .zero
    @State private var accountButtonFrame = CGRect.zero
    @State private var rowMenuBot: ShellBot?
    @State private var rowMenuAnchor: CGRect = .zero
    @State private var rowMenuTrigger: CGRect = .zero
    @State private var rowMenuPage: RowMenuPage = .root

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                UsefulBotLogoView()
                Spacer(minLength: 0)
                // The New Bot affordance is one minimal plus beside the logo.
                Button(action: onNewChat) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.C.ink)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointerOnHover()
                .trackWindowFrame($newChatTriggerFrame)
                .accessibilityLabel("New Bot")
            }
            .padding(.horizontal, 4)
            .padding(.top, 4)

            searchTrigger

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
        .coordinateSpace(name: "rail")
        .overlay(alignment: .topLeading) {
            if let bot = rowMenuBot {
                RowMenuPopover(
                    bot: bot,
                    page: $rowMenuPage,
                    onPin: {
                        model.perform(ShellActions.pin(botId: bot.id, pinned: !bot.pinned))
                        closeRowMenu()
                    },
                    onMove: { sectionId in
                        model.perform(ShellActions.move(botId: bot.id, sectionId: sectionId))
                        closeRowMenu()
                    },
                    onSettings: {
                        closeRowMenu()
                        onOpenSettings(bot.id)
                    },
                    onRename: {
                        closeRowMenu()
                        onRenameRequest(bot)
                    },
                    onHide: {
                        model.perform(ShellActions.hide(botId: bot.id, hidden: !bot.hidden))
                        closeRowMenu()
                    },
                    onNewSection: {
                        closeRowMenu()
                        onCreateSection()
                    },
                    onDelete: {
                        closeRowMenu()
                        onDeleteRequest(bot)
                    }
                )
                .frame(width: 200)
                .offset(x: max(8, rowMenuAnchor.maxX - 200), y: rowMenuAnchor.maxY + 4)
                .dismissOnOutsideClick(triggers: { [rowMenuTrigger] }) { closeRowMenu() }
            }
        }
        .overlay(alignment: .topLeading) {
            if accountOpen {
                accountPopover
                    .frame(width: 220)
                    .offset(x: 12, y: max(8, accountAnchor.minY - 84))
                    .dismissOnOutsideClick(triggers: { [accountButtonFrame] }) { accountOpen = false }
            }
        }
        .onExitCommand {
            accountOpen = false
            closeRowMenu()
        }
    }

    private func closeRowMenu() {
        rowMenuBot = nil
        rowMenuPage = .root
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
                            onCreateSection: onCreateSection,
                            onMenu: { frame, trigger in
                                rowMenuAnchor = frame
                                rowMenuTrigger = trigger
                                rowMenuBot = bot
                                rowMenuPage = .root
                            }
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
                                onCreateSection: onCreateSection,
                                onMenu: { frame, trigger in
                                    rowMenuAnchor = frame
                                    rowMenuTrigger = trigger
                                    rowMenuBot = bot
                                    rowMenuPage = .root
                                }
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
                                onCreateSection: onCreateSection,
                                onMenu: { frame, trigger in
                                    rowMenuAnchor = frame
                                    rowMenuTrigger = trigger
                                    rowMenuBot = bot
                                    rowMenuPage = .root
                                }
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
            Button {
                accountOpen.toggle()
            } label: {
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
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            .trackWindowFrame($accountButtonFrame)
            .accessibilityLabel("Account")
            .accessibilityIdentifier("account-row")
            .background(
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { accountAnchor = proxy.frame(in: .named("rail")) }
                        .onChange(of: proxy.frame(in: .named("rail"))) { _, next in
                            accountAnchor = next
                        }
                }
            )
        }
    }

    private var accountPopover: some View {
        VStack(alignment: .leading, spacing: 2) {
            popItem(icon: "chart.bar", title: "Token usage") {
                accountOpen = false
                onOpenAppSettings(.usage)
            }
            .accessibilityIdentifier("account-usage")
            popItem(icon: "gearshape", title: "Settings") {
                accountOpen = false
                onOpenAppSettings(.general)
            }
            .accessibilityIdentifier("account-settings")
        }
        .padding(6)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .popShadow()
    }

    private func popItem(icon: String, title: String, action: @escaping () -> Void) -> some View {
        MenuRowButton(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.ink)
                    .frame(width: 16)
                Text(title)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 32)
            .frame(maxWidth: .infinity, alignment: .leading)
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

private struct AccountAnchorKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        value = nextValue()
    }
}

/// Which panel the row menu shows: the actions or the section picker.
enum RowMenuPage {
    case root
    case sections
}

/// The on-brand replacement for the system `Menu` on a bot row: the same
/// white card, hairline border and sunken hover as every other popover.
struct RowMenuPopover: View {
    let bot: ShellBot
    @Binding var page: RowMenuPage
    let onPin: () -> Void
    let onMove: (String?) -> Void
    let onSettings: () -> Void
    let onRename: () -> Void
    let onHide: () -> Void
    let onNewSection: () -> Void
    let onDelete: () -> Void

    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            switch page {
            case .root:
                item(icon: bot.pinned ? "pin.slash" : "pin", title: bot.pinned ? "Unpin" : "Pin", action: onPin)
                item(icon: "folder", title: "Move to section", action: { page = .sections })
                item(icon: "gearshape", title: "Settings", action: onSettings)
                item(icon: "pencil", title: "Rename", action: onRename)
                item(icon: bot.hidden ? "eye" : "eye.slash", title: bot.hidden ? "Unhide" : "Hide", action: onHide)
                Divider()
                    .overlay(Theme.C.border)
                    .padding(.vertical, 2)
                item(icon: "trash", title: "Delete", danger: true, action: onDelete)
            case .sections:
                item(icon: "chevron.left", title: "Move to section", action: { page = .root })
                Divider()
                    .overlay(Theme.C.border)
                    .padding(.vertical, 2)
                item(icon: "tray", title: "Unassigned", action: { onMove(nil) })
                ForEach(model.store?.sections ?? []) { section in
                    item(icon: "folder", title: section.name, action: { onMove(section.id) })
                }
                Divider()
                    .overlay(Theme.C.border)
                    .padding(.vertical, 2)
                item(icon: "plus", title: "New section", action: onNewSection)
            }
        }
        .padding(6)
        .background(Theme.C.surface)
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous)
                .strokeBorder(Theme.C.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.settingsGroup, style: .continuous))
        .popShadow()
    }

    private func item(
        icon: String,
        title: String,
        danger: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        MenuRowButton(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundStyle(danger ? Theme.C.danger : Theme.C.ink)
                    .frame(width: 16)
                Text(title)
                    .font(.system(size: 13))
                    .foregroundStyle(danger ? Theme.C.danger : Theme.C.ink)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 32)
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
    let onMenu: (CGRect, CGRect) -> Void

    @EnvironmentObject private var model: AppModel
    @State private var hovering = false
    @State private var ellipsisFrame: CGRect = .zero
    @State private var ellipsisWindowFrame: CGRect = .zero

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 8) {
                BotAvatarView(bot: bot, size: 36)
                VStack(alignment: .leading, spacing: 1) {
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
                    }
                    // The label lives under the name; the row stays clean, so
                    // no preview and no timestamp.
                    if !bot.label.isEmpty {
                        Text(bot.label.uppercased())
                            .font(.system(size: DesignTokens.FontSize.railLabel, weight: .semibold))
                            .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.railLabel)
                            .foregroundStyle(Theme.C.inkFaint)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                Spacer(minLength: 0)
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
        .overlay(alignment: .trailing) {
            // Always visible so the pointer never has to chase a control that
            // appears and disappears under it.
            Button {
                onMenu(ellipsisFrame, ellipsisWindowFrame)
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.C.inkMuted)
                    .frame(width: 24, height: 24)
                    .background(hovering ? Theme.C.accentSoft : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .pointerOnHover()
            .background(
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { ellipsisFrame = proxy.frame(in: .named("rail")) }
                        .onChange(of: proxy.frame(in: .named("rail"))) { _, next in
                            ellipsisFrame = next
                        }
                }
            )
            .trackWindowFrame($ellipsisWindowFrame)
            .fixedSize()
            .padding(.trailing, 2)
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
            HStack(spacing: 10) {
                BotAvatarView(bot: bot, size: 60)
                VStack(alignment: .leading, spacing: 1) {
                    Text(bot.name)
                        .font(.system(size: DesignTokens.FontSize.railName, weight: .semibold))
                        .foregroundStyle(Theme.C.ink)
                        .lineLimit(1)
                    if !bot.label.isEmpty {
                        Text(bot.label.uppercased())
                            .font(.system(size: DesignTokens.FontSize.railLabel, weight: .semibold))
                            .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.railLabel)
                            .foregroundStyle(Theme.C.inkFaint)
                            .lineLimit(1)
                    }
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
}
