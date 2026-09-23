import SwiftUI
import UsefulBotCore

extension DynamicTypeSize {
    /// `isAccessibilityCategory` is a `ContentSizeCategory` member — this
    /// SDK's `DynamicTypeSize` has none, so the same set by hand.
    var ubIsAccessibilitySize: Bool {
        switch self {
        case .accessibility1, .accessibility2, .accessibility3, .accessibility4, .accessibility5:
            return true
        default:
            return false
        }
    }
}

/// The paired landing: the Bots list. PR-3 builds the real rail+list anatomy;
/// this is the honest minimum PR-2 needs — the nav chrome with the badge and
/// "Useful Bot", the live roster read from `/api/shell`, the readiness banner
/// states, and the entry to Devices where sign-out and unpair live.
struct BotsListView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(PhoneModel.self) private var phone
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showApprovals = false
    @State private var showSearch = false
    @State private var showCreate = false
    @State private var showGroup = false
    @State private var showSection = false
    @State private var renameTarget: ShellBot?
    @State private var deleteTarget: ShellBot?
    @State private var moveTarget: ShellBot?
    /// `loaded` means a roster fetch has *succeeded* at least once — a failed
    /// first load shows the error row, never "Create your first bot".
    private var loaded: Bool { phone.loaded }
    private var loadError: String? { phone.loadError }
    private var bots: [ShellBot] { phone.shell?.bots ?? [] }
    /// The approvals card's "N waiting" — computed once per body pass so
    /// the label's interpolation doesn't slow the type-checker.
    private var waitingLabel: String {
        "\(phone.approvals.filter { $0.phase == .pending || $0.phase == .changed }.count) waiting"
    }

    /// The pending-approvals entry is a lifted card, not a plain row
    /// (1.10): the count is a warn-soft pill.
    private var approvalsCard: some View {
        Button {
            showApprovals = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.shield")
                    .font(Theme.font(DesignTokens.FontSize.chatBody, .regular))
                    .foregroundStyle(Theme.C.warning)
                Text("Approvals")
                    .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 8)
                StatusPill(
                    text: waitingLabel,
                    foreground: Theme.C.warning,
                    background: Theme.C.warningSoft
                )
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .background(Theme.C.surface)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .cardLift(cornerRadius: DesignTokens.Radius.md)
        }
        .contentShape(Rectangle())
        .buttonStyle(RowButtonStyle())
    }
    /// When `/api/shell` last answered — the "cached N min ago" the offline
    /// banner quotes.
    @State private var lastFetchAt: Date?
    /// The expiry warning marks itself warned the moment it renders (one-time
    /// per credential); this holds it on screen for the rest of the screen's
    /// life so the banner doesn't flicker out in the same frame. It is keyed
    /// to the credential's expiry — a re-pair brings a new expiry, and the
    /// latch must not keep the old credential's banner standing (or suppress
    /// the new one's once-per-credential warning).
    @State private var expiryBannerShownFor: Date?


    var body: some View {
        List {
            if let readiness = coordinator.readiness, readiness != .ready {
                readinessBanner(readiness)
            } else if showsExpiryWarning
                        || (expiryBannerShownFor != nil
                            && expiryBannerShownFor == coordinator.store.credentialExpiresAt) {
                expiryBanner
            }
            Section {
                // §1.2 order: Search field (3), then the approvals entry (4).
                Button {
                    showSearch = true
                } label: {
                    Text("Search")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkFaintText)
                        .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                        .padding(.horizontal, 12)
                        .background(Theme.C.surface)
                        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                                .strokeBorder(Theme.C.edge, lineWidth: 1)
                        )
                }
                .buttonStyle(RowButtonStyle())
                .listRowBackground(Color.clear)
                .accessibilityLabel("Search")
                if !phone.approvals.isEmpty {
                    approvalsCard
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                if let loadError {
                    loadErrorRow(loadError)
                }
                if loadError == nil && !loaded {
                    skeletonRows
                } else if bots.isEmpty {
                    // A failed fetch never asserts an empty roster.
                    if loadError == nil { emptyState }
                } else if let shell = phone.shell {
                    roster(shell)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        // Lists sit on canvas, one tone under surfaces (design spec 1.0).
        .background(Theme.C.canvas)
        // The paired root's own marker: "Useful Bot" staticText alone is
        // ambiguous — the pairing badge carries it as an accessibility label.
        .accessibilityIdentifier("bots-list")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                // Design spec 1.2 item 1: badge 32 plus the 22 pt semibold
                // title — the system inline title renders ~17 pt, so the
                // tokens are drawn here instead of `.navigationTitle`.
                HStack(spacing: 10) {
                    Image("useful-bot-badge")
                        .resizable()
                        .frame(width: 32, height: 32)
                        .clipShape(Circle())
                        .accessibilityHidden(true)
                    Text("Useful Bot")
                        .tokenFont(DesignTokens.FontSize.phoneLargeTitle, .semibold)
                        .foregroundStyle(Theme.C.ink)
                        .accessibilityAddTraits(.isHeader)
                }
                // iOS 26 sizes a custom leading item to its first subview and
                // clips the rest; fixedSize keeps the title past the badge.
                .fixedSize()
            }
            // iOS 26 collapses a third topBarTrailing item into the overflow
            // menu; one HStack keeps Settings and New visible.
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 0) {
                    NavigationLink {
                        PhoneSettingsView()
                    } label: {
                        // The operator avatar opens settings (1.2 chrome);
                        // it reads the owner's initial when a name is set.
                        OperatorAvatar()
                            .frame(width: 32, height: 32)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Settings")
                    Menu {
                        if let reason = createsBlocked {
                            Button(reason) {}
                                .disabled(true)
                        }
                        Button("New bot") { showCreate = true }
                            .disabled(createsBlocked != nil)
                        Button("New group") { showGroup = true }
                            .disabled(createsBlocked != nil)
                        Button("New section") { showSection = true }
                            .disabled(createsBlocked != nil)
                    } label: {
                        Image(systemName: "plus")
                            .font(Theme.font(DesignTokens.FontSize.chatBody, .regular))
                            .foregroundStyle(Theme.C.ink)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("New")
                    .accessibilityHint(createsBlocked ?? "New bot, group, or section")
                    .ubFocusRing()
                }
            }
        }
        .task {
            await coordinator.probeReadiness()
            await refresh()
        }
        // §8.5's one resync on foreground: the coordinator stamps resyncAt
        // after its status probe; the shell re-fetch rides it.
        .onChange(of: coordinator.resyncAt) { _, _ in
            Task { await refresh() }
        }
        .refreshable {
            await coordinator.probeReadiness()
            await refresh()
        }
        // Devices is a push (design spec 1.15), not a sheet — the nav stack
        // gives it the back chevron.
        .navigationDestination(isPresented: $showApprovals) {
            PendingApprovalsView()
        }
        .navigationDestination(isPresented: chatPresented) {
            if let id = phone.selectedBotId, UIDevice.current.userInterfaceIdiom != .pad {
                ChatScreen(botId: id)
            }
        }
        // A past conversation is a push (1.4), not a sheet — the stack's
        // back chevron is the exit.
        .navigationDestination(item: Binding(
            get: { phone.pastRecent },
            set: { if $0 == nil { phone.pastRecent = nil } }
        )) { _ in
            PastConversationView()
        }
        .modifier(Sheets(
            showSearch: $showSearch,
            showCreate: $showCreate,
            showSection: $showSection,
            showGroup: $showGroup,
            renameTarget: $renameTarget,
            deleteTarget: $deleteTarget,
            moveTarget: $moveTarget,
            createsBlocked: createsBlocked,
            bots: bots,
            sections: phone.shell?.sections ?? [],
            phone: phone
        ))
    }

    /// The list's floating sheets — kept out of `body` so the generic
    /// modifier stack doesn't stall the type-checker on the whole tree.
    private struct Sheets: ViewModifier {
        @Binding var showSearch: Bool
        @Binding var showCreate: Bool
        @Binding var showSection: Bool
        @Binding var showGroup: Bool
        @Binding var renameTarget: ShellBot?
        @Binding var deleteTarget: ShellBot?
        @Binding var moveTarget: ShellBot?
        let createsBlocked: String?
        let bots: [ShellBot]
        let sections: [ShellSection]
        let phone: PhoneModel

        func body(content: Content) -> some View {
            content
                .floatingSheet(isPresented: $showSearch, title: "Search", detent: .large) {
                    GlobalSearchSheet(onClose: { showSearch = false }) {
                        showCreate = true
                    }
                }
                .floatingSheet(
                    isPresented: $showCreate,
                    title: "New bot",
                    detent: .large,
                    leading: { Button("Cancel") { showCreate = false } }
                ) {
                    CreateBotSheet(blocked: createsBlocked) { name, label, brief, color in
                        showCreate = false
                        await phone.createBot(name: name, label: label, description: brief, color: color)
                    }
                }
                .floatingSheet(
                    isPresented: $showSection,
                    title: "Create section",
                    detent: .fit,
                    leading: { Button("Cancel") { showSection = false } }
                ) {
                    CreateSectionSheet(blocked: createsBlocked) { name in
                        showSection = false
                        await phone.createSection(name: name)
                    }
                }
                .floatingSheet(
                    isPresented: $showGroup,
                    title: "New group",
                    detent: .large,
                    leading: { Button("Cancel") { showGroup = false } }
                ) {
                    CreateGroupSheet(bots: bots.filter { $0.kind == "bot" && !$0.hidden && $0.id != Threads.defaultBotId }, blocked: createsBlocked) { name, members in
                        showGroup = false
                        await phone.createGroup(name: name, memberIds: members)
                    }
                }
                .floatingSheet(
                    item: $renameTarget,
                    detent: .fit,
                    title: { _ in "Rename" },
                    leading: { _ in Button("Cancel") { renameTarget = nil } },
                    trailing: { _ in EmptyView() },
                    content: { bot in
                        RenameSheet(bot: bot, blocked: createsBlocked) { name in
                            renameTarget = nil
                            await phone.rename(bot.id, name)
                        }
                    }
                )
                // Spec 1.7's delete confirm: a smallest-detent floating
                // sheet, not the system action sheet — title asks,
                // message gives the consequence, "Delete bot" is the
                // destructive action.
                .floatingSheet(
                    item: $deleteTarget,
                    detent: .fit,
                    title: { "Delete \($0.name)?" },
                    content: { bot in
                        ConfirmSheet(
                            message: "Its conversation and routines are removed from your Mac.",
                            confirmTitle: "Delete bot",
                            onConfirm: { Task { await phone.deleteBot(bot.id) } },
                            onClose: { deleteTarget = nil }
                        )
                    }
                )
                .floatingSheet(
                    item: $moveTarget,
                    detent: .medium,
                    title: { _ in "Move to section" },
                    content: { bot in
                        MoveToSectionSheet(
                            bot: bot,
                            sections: sections,
                            onPick: { sectionId in
                                moveTarget = nil
                                Task { await phone.move(bot.id, sectionId: sectionId) }
                            },
                            onClose: { moveTarget = nil }
                        )
                    }
                )
        }
    }

    private var createsBlocked: String? {
        phone.mutationBlocked(coordinator.readiness)
    }



    private var chatPresented: Binding<Bool> {
        Binding(
            get: { phone.selectedBotId != nil && UIDevice.current.userInterfaceIdiom != .pad },
            set: { if !$0 { phone.clearSelection() } }
        )
    }

    @ViewBuilder
    private func roster(_ shell: ShellStore) -> some View {
        let pinned = shell.pinnedBots
        // Spec 1.2 orders pinned first and gives the section no header —
        // the lifted cards mark the group by themselves.
        if !pinned.isEmpty {
            ForEach(pinned) { botRow($0, shell: shell) }
        }
        ForEach(shell.sections.sorted { $0.order < $1.order }) { section in
            sectionHeader(section.name, id: section.id, collapsed: section.collapsed)
            if !section.collapsed {
                ForEach(shell.sectionBots(section.id)) { botRow($0, shell: shell) }
            }
        }
        sectionHeader("Unassigned", id: "unassigned", collapsed: shell.collapsedUnassigned)
        if !shell.collapsedUnassigned {
            ForEach(shell.sectionBots(nil)) { botRow($0, shell: shell) }
        }
        sectionHeader("Hidden", id: "hidden", collapsed: shell.collapsedHidden)
        if !shell.collapsedHidden {
            ForEach(shell.hiddenBots) { botRow($0, shell: shell) }
        }
    }

    private func sectionHeader(_ title: String, id: String?, collapsed: Bool) -> some View {
        Button {
            if let id { Task { await phone.toggleSection(id) } }
        } label: {
            HStack(spacing: 8) {
                if id != nil {
                    Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                        .font(Theme.font(12, .regular))
                        .foregroundStyle(Theme.C.inkMuted)
                }
                Text(title)
                    .tokenFont(DesignTokens.FontSize.fieldLabel, .medium)
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer()
            }
            .frame(minHeight: 44)
        }
        .contentShape(Rectangle())
        .buttonStyle(RowButtonStyle(cornerRadius: DesignTokens.Radius.sm))
        .disabled(id == nil)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }

    /// The row's subtitle: the uppercase tracked label, with 'Working'
    /// appended while a Reduce Motion bot is mid-turn — and the whole line
    /// standing alone as just 'WORKING' when the bot has no label.
    private func rowSubtitle(_ bot: ShellBot) -> String? {
        let label = bot.label == bot.name ? "" : bot.label
        let working = phone.workingBotIds.contains(bot.id) && reduceMotion
        switch (label.isEmpty, working) {
        case (false, true): return "\(label) · Working".uppercased()
        case (true, true): return "WORKING"
        case (false, false): return label.uppercased()
        case (true, false): return nil
        }
    }

    private func botRow(_ bot: ShellBot, shell: ShellStore) -> some View {
        Button {
            phone.select(bot.id)
        } label: {
            HStack(spacing: 12) {
                // Working bots breathe with the brand motion layers (1.2);
                // idle and Reduce Motion draw the static avatar. A group
                // row carries the two-face member stack instead of one
                // mascot (spec 1.6), in the same slot.
                if bot.isGroup {
                    AvatarStackView(bots: groupMemberBots(bot, shell: shell), size: 20, maxVisible: 2)
                        .frame(width: bot.pinned ? 44 : 40, height: bot.pinned ? 44 : 40)
                } else if phone.workingBotIds.contains(bot.id) && !reduceMotion {
                    BrandMotionAvatar(size: bot.pinned ? 44 : 40, color: FacePalette.displayColor(for: bot), avatar: true)
                } else {
                    BotFace(bot: bot, size: bot.pinned ? 44 : 40)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(bot.name)
                        .tokenFont(DesignTokens.FontSize.chatName, .semibold)
                        .foregroundStyle(Theme.C.ink)
                    if let subtitle = rowSubtitle(bot) {
                        // 1.2's label recipe: uppercase, medium, tracked
                        // out — not a second sentence-case text style.
                        Text(subtitle)
                            .tokenFont(DesignTokens.FontSize.phoneRailLabel, .medium)
                            .tracking(DesignTokens.Tracking.label * DesignTokens.FontSize.phoneRailLabel)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                }
                Spacer()
            }
            .padding(.horizontal, bot.pinned ? 12 : 0)
            .padding(.vertical, bot.pinned ? 14 : 0)
            .frame(minHeight: DesignTokens.Space.phoneRowMinHeight)
            .background {
                if bot.pinned {
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.lg, style: .continuous)
                        .fill(Theme.C.surface)
                }
            }
            // A pinned card is lifted, not edge-only (1.2).
            .cardLift(cornerRadius: DesignTokens.Radius.lg, enabled: bot.pinned)
        }
        .contentShape(Rectangle())
        .buttonStyle(RowButtonStyle(cornerRadius: bot.pinned ? DesignTokens.Radius.lg : DesignTokens.Radius.sm))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .accessibilityLabel(phone.workingBotIds.contains(bot.id) ? "\(bot.name), working" : bot.name)
        .accessibilityHint("Double-tap to open")
        .swipeActions(edge: .leading) {
            if createsBlocked == nil {
                Button(bot.pinned ? "Unpin" : "Pin") { Task { await phone.pin(bot.id, !bot.pinned) } }
            }
        }
        .swipeActions(edge: .trailing) {
            if createsBlocked == nil {
                Button("Hide") { Task { await phone.hide(bot.id, !bot.hidden) } }
            }
        }
        .contextMenu {
            if let reason = createsBlocked {
                Button(reason) {}
                    .disabled(true)
            }
            Button(bot.pinned ? "Unpin" : "Pin") { Task { await phone.pin(bot.id, !bot.pinned) } }
                .disabled(createsBlocked != nil)
            Button("Rename") {
                renameTarget = bot
            }
            .disabled(createsBlocked != nil)
            // 1.7's Move to section is a floating sheet of option rows
            // with the current one checked, not a nested menu.
            Button("Move to section") { moveTarget = bot }
                .disabled(createsBlocked != nil)
            Button("New chat") { Task { await phone.newChat(bot.id) } }
                .disabled(createsBlocked != nil)
            Button("Hide") { Task { await phone.hide(bot.id, true) } }
                .disabled(createsBlocked != nil)
            // Settings opens the chat's own bot-settings sheet — the flag
            // lands it once the push completes (1.2's menu).
            Button("Settings") {
                phone.pendingSettingsBot = bot.id
                phone.select(bot.id)
            }
            Button("Delete", role: .destructive) { deleteTarget = bot }
                .disabled(createsBlocked != nil)
        }
    }

    private func refresh() async {
        phone.attach(coordinator)
        if ProcessInfo.processInfo.environment["UB_HANG_SHELL"] != "1" {
            await phone.refresh()
            if phone.loaded { lastFetchAt = Date() }
        } else {
            try? await Task.sleep(for: .seconds(120))
        }
    }

    /// Design spec 1.2's Error row: danger glyph, one muted sentence,
    /// trailing secondary Retry — the cached list stays visible under it.
    private func loadErrorRow(_ copy: String) -> some View {
        // Secondary recipe (sunken fill + edge stroke), never bare text:
        // A.7's 44 pt floor needs the hit area to read as a button.
        let retry = Button("Retry") {
            Task {
                await coordinator.probeReadiness()
                await refresh()
            }
        }
        .tokenFont(DesignTokens.FontSize.button, .semibold)
        .foregroundStyle(Theme.C.ink)
        .padding(.horizontal, 20)
        .frame(minHeight: 44)
        .background(
            Theme.C.sunken,
            in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .strokeBorder(Theme.C.edge, lineWidth: 1)
        )
        .buttonStyle(PressedScale())
        .ubFocusRing()
        let text = HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "exclamationmark.circle")
                .foregroundStyle(Theme.C.danger)
            Text(copy)
                .tokenFont(DesignTokens.FontSize.attachError, .regular)
                .foregroundStyle(Theme.C.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        return Group {
            if dynamicTypeSize.ubIsAccessibilitySize {
                // A.7/1.0: the trailing action drops under the text at
                // accessibility sizes instead of squeezing it.
                VStack(alignment: .leading, spacing: 8) {
                    text
                    retry
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    text
                    Spacer(minLength: 8)
                    retry
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bots-load-error")
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
    }

    /// "Create your first bot" as the only content, primary "New bot" under
    /// it (design spec 1.2 Empty row). The button is the shell's own CTA:
    /// the designed create sheet (1.7) is PR-6 scope, so until it lands the
    /// control is disabled-with-reason rather than minting an unnamed bot.
    private var emptyState: some View {
        let newBotEnabled = createsBlocked == nil
        return VStack(alignment: .leading, spacing: 12) {
            Text("Create your first bot")
                .tokenFont(DesignTokens.FontSize.emptyTitle, .semibold)
                .tracking(DesignTokens.Tracking.tight * DesignTokens.FontSize.emptyTitle)
                .foregroundStyle(Theme.C.ink)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                showCreate = true
            } label: {
                Text("New bot")
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(newBotEnabled ? Theme.C.brandInk : Theme.C.inkFaint)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .disabled(!newBotEnabled)
            .buttonStyle(PressedScale(
                fill: newBotEnabled ? Theme.C.brand : Theme.C.sunken,
                pressedFill: newBotEnabled ? Theme.C.accentStrong : Theme.C.sunken,
                shadowed: newBotEnabled
            ))
            .ubFocusRing()
            if let reason = createsBlocked {
                Text(reason)
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 48)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }


    /// Loading (design spec 1.2's mockup, §11): the "Connecting to
    /// <Mac>" status line with its `inkFaint` dot, a pinned-card skeleton,
    /// the section-title bar, then five row skeletons at loaded geometry in
    /// `border` — 1.6 s pulse; static under Reduce Motion.
    private var skeletonRows: some View {
        let rows = VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Theme.C.inkFaint)
                    .frame(width: 6, height: 6)
                Text("Connecting to \(coordinator.store.pairedName ?? "your Mac")")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                Spacer()
            }
            .frame(minHeight: DesignTokens.Space.phoneRowMinHeight)
            RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                .fill(Theme.C.border)
                .frame(height: DesignTokens.Space.phoneRowMinHeight)
                .padding(.vertical, 8)
            RoundedRectangle(cornerRadius: DesignTokens.Radius.xs)
                .fill(Theme.C.border)
                .frame(width: 90, height: 10)
                .padding(.vertical, 10)
            ForEach(0..<5, id: \.self) { _ in
                HStack(spacing: 12) {
                    Circle()
                        .fill(Theme.C.border)
                        .frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.xs)
                            .fill(Theme.C.border)
                            .frame(width: 110, height: 12)
                        RoundedRectangle(cornerRadius: DesignTokens.Radius.xs)
                            .fill(Theme.C.border)
                            .frame(width: 170, height: 10)
                    }
                    Spacer()
                }
                .frame(minHeight: DesignTokens.Space.phoneRowMinHeight)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("bots-skeleton")
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        return Group {
            if reduceMotion {
                rows
            } else {
                rows.phaseAnimator([1.0, 0.45]) { content, phase in
                    content.opacity(phase)
                } animation: { _ in
                    // The brand curve, not the default ease — the same
                    // pulse the chat skeleton rows use.
                    .timingCurve(0.22, 1, 0.36, 1, duration: 0.8)
                }
            }
        }
    }

    /// The §7.2 banner is a lifted card: glyph, title, one line, trailing
    /// "Retry" — the shared `ReadinessBanner` (design spec 1.2's table,
    /// verbatim copy).
    private func readinessBanner(_ level: MacReadiness) -> some View {
        ReadinessBanner(level: level, lastFetchAt: lastFetchAt) {
            Task {
                await coordinator.probeReadiness()
                await refresh()
            }
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(
            top: 8,
            leading: DesignTokens.Space.phoneGutter,
            bottom: 8,
            trailing: DesignTokens.Space.phoneGutter
        ))
    }

    /// §11 "Credential expiring": the one-time banner seven days out
    /// (design 1.2's banner table, fourth row). It yields the slot to a real
    /// readiness banner and fires once per credential — the store keys the
    /// warning to the expiry so a rotated credential warns again.
    private var showsExpiryWarning: Bool {
        guard let expiry = coordinator.store.credentialExpiresAt,
              expiry.timeIntervalSinceNow > 0,
              expiry.timeIntervalSinceNow <= 7 * 86_400,
              coordinator.store.expiryWarnedFor != expiry else { return false }
        return true
    }

    /// Same lifted card as the readiness banner, minus Retry — nothing
    /// retries a calendar. The `key` glyph stays `ink`: on this screen
    /// warning color belongs to pending approvals alone (design R1).
    private var expiryBanner: some View {
        let days = Int(
            ((coordinator.store.credentialExpiresAt ?? .now).timeIntervalSinceNow / 86_400)
                .rounded(.up)
        )
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: "key")
                .font(Theme.font(DesignTokens.FontSize.emptyBody, .regular))
                .foregroundStyle(Theme.C.ink)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text("Pairing expires in \(days) \(days == 1 ? "day" : "days")")
                    .tokenFont(DesignTokens.FontSize.emptyBody, .semibold)
                    .foregroundStyle(Theme.C.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Re-pair from your Mac before then.")
                    .tokenFont(DesignTokens.FontSize.attachError, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            Theme.C.surface,
            in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
        )
        .cardLift(cornerRadius: DesignTokens.Radius.md)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("expiry-banner")
        .onAppear {
            expiryBannerShownFor = coordinator.store.credentialExpiresAt
            coordinator.store.markExpiryWarned()
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(
            top: 8,
            leading: DesignTokens.Space.phoneGutter,
            bottom: 8,
            trailing: DesignTokens.Space.phoneGutter
        ))
    }

}

/// Devices (spec 6.2's sign-out home, pushed per design spec 1.15): the
/// paired Mac's name, host and status, the two expiry clocks, the
/// Diagnostics group under macUnreachable, "Sign out on this phone"
/// (class C) and "Unpair" (class A, confirm sheet then biometric).
struct DevicesView: View {
    @EnvironmentObject private var coordinator: PairingCoordinator
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var gateUnavailable = false
    @State private var confirmUnpair = false
    @State private var showRePair = false
    // The host value's mono 13 still rides Dynamic Type — footnote is the
    // nearest text style at this point size (same rule tokenFont uses).
    @ScaledMetric(relativeTo: .footnote) private var hostMonoSize: CGFloat = 13

    private var hostNeedsWrap: Bool {
        dynamicTypeSize.ubIsAccessibilitySize
    }

    /// A connect running anywhere (the pushed re-pair) makes the lifecycle
    /// rows inert: the exchange and the wipe must not interleave.
    private var connectBusy: Bool {
        switch coordinator.phase {
        case .connecting, .connected: return true
        case .idle, .failed: return false
        }
    }

    var body: some View {
        List {
            Section {
                if let name = coordinator.store.pairedName {
                    LabeledContent("Name", value: name)
                }
                if let host = pairedHost {
                    // 1.15: the host value is SF Mono 13 and scales like
                    // every other token; at accessibility sizes it wraps to
                    // two lines instead of truncating.
                    LabeledContent {
                        Text(host)
                            .font(.system(size: hostMonoSize, design: .monospaced))
                            .lineLimit(hostNeedsWrap ? 2 : 1)
                            .truncationMode(.middle)
                            .multilineTextAlignment(.trailing)
                    } label: {
                        Text("Host")
                    }
                }
                LabeledContent("Status") {
                    statusPill
                }
            } header: {
                tokenGroupHeader("This Mac")
            }
            .foregroundStyle(Theme.C.ink)

            Section {
                if let session = coordinator.store.sessionExpiresAt {
                    LabeledContent("Session expires", value: session, format: .dateTime)
                }
                if let credential = coordinator.store.credentialExpiresAt {
                    // 1.15's Credential-expiring state: the value goes
                    // `warning` inside the seven-day window and the re-pair
                    // row appears under it — the banner's "Re-pair" needs a
                    // path that is not the destructive Unpair.
                    LabeledContent {
                        Text(credential, format: .dateTime)
                            .foregroundStyle(credentialExpiring ? Theme.C.warning : Theme.C.ink)
                    } label: {
                        Text("Pairing expires")
                    }
                    if credentialExpiring {
                        Button {
                            showRePair = true
                        } label: {
                            Text("Re-pair from your Mac")
                        }
                        .disabled(connectBusy)
                        .ubFocusRing()
                    }
                }
            } header: {
                tokenGroupHeader("Expiry")
            }
            .foregroundStyle(Theme.C.ink)

            // §1.15 item 3: under macUnreachable the Diagnostics group
            // shows which layer dropped the probe — DNS, TLS, then HTTP.
            if case .macUnreachable(_, _, let diag) = coordinator.readiness {
                Section {
                    diagRow("Resolved", diag.resolved)
                    diagRow("TLS", diag.tls)
                    diagRow("HTTP status", diag.httpStatus)
                } header: {
                    tokenGroupHeader("Diagnostics")
                }
                .foregroundStyle(Theme.C.ink)
            }

            Section {
                Button("Sign out on this phone") {
                    Task {
                        await coordinator.signOut()
                        dismiss()
                    }
                }
                .foregroundStyle(Theme.C.ink)
                .disabled(connectBusy)
                .ubFocusRing()
                Button {
                    // Class A: the spec's confirm sheet explains the purge,
                    // then the biometric prompt runs (the gate is the final
                    // confirmation, not a second one).
                    confirmUnpair = true
                } label: {
                    Text("Unpair")
                        .foregroundStyle(Theme.C.danger)
                }
                .disabled(connectBusy)
                .ubFocusRing()
                if gateUnavailable {
                    Text(OwnerGate.unavailableCopy)
                        .foregroundStyle(Theme.C.danger)
                }
            } footer: {
                // §11/1.1: never grey alone — while a connect runs on the
                // re-pair push, say why these rows are inert.
                if connectBusy {
                    Text("Finishing the current connection first.")
                        .foregroundStyle(Theme.C.inkMuted)
                }
            }
        }
        // Grouped sheet recipe: canvas under the groups, surface rows,
        // fieldLabel headers — the same tokens bot settings uses.
        .scrollContentBackground(.hidden)
        .background(Theme.C.canvas)
        .listRowBackground(Theme.C.surface)
        .floatingSheet(isPresented: $confirmUnpair, title: "Unpair this iPhone?", detent: .fit) {
            ConfirmSheet(
                message: "Your bots stay on your Mac.",
                confirmTitle: "Unpair",
                onConfirm: {
                    Task {
                        let verdict = await OwnerGate.evaluate(reason: "Unpair this iPhone")
                        guard verdict == .approved else {
                            gateUnavailable = verdict == .unavailable
                            return
                        }
                        await coordinator.unpair()
                        dismiss()
                    }
                },
                onClose: { confirmUnpair = false }
            )
        }
        .navigationTitle("Devices")
        .navigationBarTitleDisplayMode(.inline)
        // Re-pairing pushes the real pairing flow; a fresh pair lands on
        // `.connected` — close back to Devices.
        .navigationDestination(isPresented: $showRePair) {
            // Pushed, not root: keep the nav bar so the back chevron is the
            // exit affordance the root flow does not need (or have).
            PairingView(pushedFlow: true)
        }
        .onChange(of: coordinator.phase) { _, phase in
            // A landed re-pair closes back to Devices; reset so a second
            // re-pair doesn't mount a view that reads busy forever.
            if case .connected = phase {
                showRePair = false
                coordinator.phase = .idle
            }
        }
        .scrollContentBackground(.hidden)
        // Grouped settings sit on canvas; the group rows are the surfaces.
        .background(Theme.C.canvas)
        // Token law on the stock LabeledContent/Button rows: the scaled
        // env font reaches the system labels and values.
        .tokenFont(DesignTokens.FontSize.chatName, .regular)
    }

    /// The tailnet host with the scheme stripped (design spec 1.15 renders
    /// the host, not the URL).
    private var pairedHost: String? {
        guard let origin = coordinator.store.pairedOrigin else { return nil }
        if let components = URLComponents(string: origin), let host = components.host {
            return components.port.map { "\(host):\($0)" } ?? host
        }
        var host = origin
        for prefix in ["https://", "http://"] where host.hasPrefix(prefix) {
            host = String(host.dropFirst(prefix.count))
        }
        if let slash = host.firstIndex(of: "/") { host = String(host[..<slash]) }
        return host
    }

    /// The 1.15 status pill speaks the spec's vocabulary (1.11): a good
    /// connection is "Connected" in `success`, anything degraded is
    /// `warning` — `danger` is reserved for refused/destructive states — and
    /// a nil readiness (probe not yet landed) is the neutral "Checking".
    private var statusPill: some View {
        let (text, foreground, background): (String, Color, Color)
        switch coordinator.readiness {
        case .ready:
            (text, foreground, background) = ("Connected", Theme.C.success, Theme.C.successSoft)
        case .noNetwork:
            // §7.2 honest copy: the phone's own path is down — pointing at
            // the Mac would send the user the wrong way.
            (text, foreground, background) = ("Offline", Theme.C.warning, Theme.C.warningSoft)
        case .macUnreachable:
            (text, foreground, background) = ("Unreachable", Theme.C.warning, Theme.C.warningSoft)
        case .runtimeDown:
            (text, foreground, background) = ("Runtime down", Theme.C.warning, Theme.C.warningSoft)
        case .unsupportedVersion:
            (text, foreground, background) = ("Unsupported version", Theme.C.warning, Theme.C.warningSoft)
        case nil:
            (text, foreground, background) = ("Checking", Theme.C.inkMuted, Theme.C.sunken)
        }
        return Text(text)
            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background, in: Capsule())
    }

    /// A §1.15 Diagnostics row: the layer name and an ok/bad pill in the
    /// status vocabulary (success/warning soft — degradation, never
    /// destructive).
    private func diagRow(_ label: String, _ verdict: ReachabilityDiagnostics.Verdict) -> some View {
        LabeledContent(label) {
            Text(verdict == .ok ? "ok" : "bad")
                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .medium)
                .foregroundStyle(verdict == .ok ? Theme.C.success : Theme.C.warning)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(verdict == .ok ? Theme.C.successSoft : Theme.C.warningSoft, in: Capsule())
        }
    }

    /// Inside the one-time seven-day warning window (spec 11) — the same
    /// predicate the banner uses.
    private var credentialExpiring: Bool {
        guard let expiry = coordinator.store.credentialExpiresAt,
              expiry.timeIntervalSinceNow > 0,
              expiry.timeIntervalSinceNow <= 7 * 86_400 else { return false }
        return true
    }
}

/// A past conversation opened from search — pushed, not a sheet (1.4).
/// Read-only until "Continue this conversation", which is class A and
/// switches the bot onto that session.
struct PastConversationView: View {
    @Environment(PhoneModel.self) private var phone
    @EnvironmentObject private var coordinator: PairingCoordinator

    private var blocked: String? {
        if phone.pastRecent?.sessionId == nil { return "This conversation cannot be continued." }
        return phone.mutationBlocked(coordinator.readiness)
    }

    /// `ShellRecent.updatedAt` is an ISO string — parse it for the
    /// principal toolbar's date subtitle; nil falls back to no subtitle.
    private var pastDate: Date? {
        guard let raw = phone.pastRecent?.updatedAt else { return nil }
        return Self.isoDate.date(from: raw) ?? Self.isoDatePlain.date(from: raw)
    }

    /// §1.4 offline: the header subtitle trades the date for the cached
    /// transcript's age — the same "Cached N min ago" the other cached
    /// surfaces carry.
    private var cachedAge: String? {
        guard coordinator.readiness != .ready, let last = phone.lastFetchAt else { return nil }
        let age = Date().timeIntervalSince(last)
        guard age > 15 else { return nil }
        return "Cached \(max(1, Int(age / 60))) min ago"
    }

    private static let isoDate: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoDatePlain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    var body: some View {
            List {
                if phone.pastRows.isEmpty {
                    Text(phone.actionError ?? "This conversation has no messages.")
                        .tokenFont(DesignTokens.FontSize.emptyBody, .regular)
                        .foregroundStyle(Theme.C.inkMuted)
                }
                // Read-only transcript, but in the chat's bubble anatomy so
                // it reads like the conversation it was (design 1.4).
                ForEach(phone.pastRows) { row in
                    if row.kind == .user {
                        HStack {
                            Spacer(minLength: 48)
                            Text(row.text)
                                .tokenFont(DesignTokens.FontSize.chatBody, .regular)
                                .foregroundStyle(Theme.C.ink)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(Theme.C.sunken)
                                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                        }
                        // The same width caps the live transcript uses —
                        // the archived bubble can't sprawl full width.
                        .containerRelativeFrame(.horizontal) { width, _ in width * 0.82 }
                        .listRowSeparator(.hidden)
                    } else {
                        HStack {
                            PhoneMarkdown(text: row.text)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(Theme.C.bubbleBot)
                                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                                // Bot bubbles lift like the live chat's,
                                // not an outlined card.
                                .cardLift(cornerRadius: DesignTokens.Radius.md)
                            Spacer(minLength: 24)
                        }
                        .containerRelativeFrame(.horizontal) { width, _ in width * 0.90 }
                        .listRowSeparator(.hidden)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.C.canvas)
            .navigationTitle(phone.pastRecent?.title ?? "Past conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Title with the date under it — the nav pattern the
                // design system uses where a title needs provenance.
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text(phone.pastRecent?.title ?? "Past conversation")
                            .tokenFont(DesignTokens.FontSize.phoneNavTitle, .semibold)
                            .foregroundStyle(Theme.C.ink)
                        if let cachedAge {
                            Text(cachedAge)
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        } else if let updated = pastDate {
                            Text(updated, format: .dateTime.month(.wide).day().year())
                                .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                                .foregroundStyle(Theme.C.inkMuted)
                        }
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    if let blocked {
                        Text(blocked)
                            .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                            .foregroundStyle(Theme.C.inkMuted)
                    }
                    // "Continue this conversation" is class A — the gate
                    // runs inside `continuePast`.
                    Button {
                        Task { await phone.continuePast() }
                    } label: {
                        Text("Continue this conversation")
                            .tokenFont(DesignTokens.FontSize.button, .semibold)
                            .foregroundStyle(blocked == nil ? Theme.C.brandInk : Theme.C.inkFaint)
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(PressedScale(
                        fill: blocked == nil ? Theme.C.brand : Theme.C.sunken,
                        pressedFill: Theme.C.accentStrong,
                        shadowed: blocked == nil
                    ))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .disabled(blocked != nil)
                }
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
                .padding(.vertical, 8)
                .background(Theme.C.surface)
            }
    }
}

/// The 1.7 field recipe: a 13 pt label over a sunken 44 pt field.
private struct CreateField: View {
    let title: String
    @Binding var text: String
    var axis: Axis = .horizontal
    var placeholder: String?

    init(_ title: String, text: Binding<String>, axis: Axis = .horizontal, placeholder: String? = nil) {
        self.title = title
        _text = text
        self.axis = axis
        self.placeholder = placeholder
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .tokenFont(DesignTokens.FontSize.fieldLabel, .medium)
                .foregroundStyle(Theme.C.inkMuted)
            TextField(
                text: $text,
                prompt: Text(placeholder ?? title).foregroundStyle(Theme.C.inkFaintText),
                axis: axis
            ) {
                EmptyView()
            }
            .tokenFont(DesignTokens.FontSize.phoneFieldInput, .regular)
            .foregroundStyle(Theme.C.ink)
            .padding(.horizontal, 12)
                .frame(minHeight: 44, alignment: axis == .vertical ? .topLeading : .center)
                .background(Theme.C.sunken, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous)
                        .strokeBorder(Theme.C.edge, lineWidth: 1)
                )
        }
    }
}

/// The create flow's full-width primary with its rendered disabled reason
/// (1.7: "Add a name" style, or the offline/creates-blocked reason).
private struct CreatePrimaryButton: View {
    let title: String
    var busyTitle: String? = nil
    var busy = false
    /// The reason the button is disabled; nil means enabled.
    var reason: String?
    var action: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                Task { await action() }
            } label: {
                Text(busy ? (busyTitle ?? title) : title)
                    .tokenFont(DesignTokens.FontSize.button, .semibold)
                    .foregroundStyle(reason == nil && !busy ? Theme.C.brandInk : Theme.C.inkFaint)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .disabled(reason != nil || busy)
            .buttonStyle(PressedScale(
                fill: reason == nil && !busy ? Theme.C.brand : Theme.C.sunken,
                pressedFill: Theme.C.accentStrong,
                shadowed: reason == nil && !busy
            ))
            .ubFocusRing()
            if let reason {
                Text(reason)
                    .tokenFont(DesignTokens.FontSize.phoneChatMeta, .regular)
                    .foregroundStyle(Theme.C.inkMuted)
            }
        }
    }
}

/// New bot (spec 1.7): centered 84 pt avatar preview, the approved-palette
/// swatches at 44 pt with the picked one ringed 2 pt `ink`, Name / Label /
/// First brief fields, and the full-width "Create bot" primary.
private struct CreateBotSheet: View {
    /// Offline/creates-blocked reason; nil means the write can run.
    var blocked: String?
    var onCreate: (_ name: String, _ label: String, _ brief: String, _ color: String) async -> Void
    @State private var name = ""
    @State private var label = ""
    @State private var brief = ""
    @State private var color = FacePalette.colors.randomElement() ?? "ink"
    @State private var busy = false

    private var reason: String? {
        if let blocked { return blocked }
        return name.trimmingCharacters(in: .whitespaces).isEmpty ? "Add a name" : nil
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(uiImage: UIImage(named: "avatar-\(color)") ?? UIImage(named: "avatar-ink") ?? UIImage())
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .frame(width: 84, height: 84)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Avatar color")
                        .tokenFont(DesignTokens.FontSize.fieldLabel, .medium)
                        .foregroundStyle(Theme.C.inkMuted)
                    // 44 pt swatch targets; they wrap to two rows at
                    // accessibility sizes (1.7 Dynamic Type).
                    FlowRow(spacing: 8) {
                        ForEach(FacePalette.colors, id: \.self) { swatch in
                            Button { color = swatch } label: {
                                ZStack {
                                    Image(uiImage: UIImage(named: "avatar-\(swatch)") ?? UIImage())
                                        .resizable()
                                        .interpolation(.high)
                                        .scaledToFit()
                                        .frame(width: 36, height: 36)
                                    if color == swatch {
                                        Circle()
                                            .strokeBorder(Theme.C.ink, lineWidth: 2)
                                            .frame(width: 42, height: 42)
                                    }
                                }
                                .frame(width: 44, height: 44)
                                .contentShape(Circle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(swatch) mascot")
                            .accessibilityAddTraits(color == swatch ? .isSelected : [])
                        }
                    }
                }
                CreateField("Name", text: $name)
                CreateField("Label", text: $label)
                CreateField("First brief", text: $brief, axis: .vertical)
                CreatePrimaryButton(
                    title: "Create bot",
                    busyTitle: "Creating",
                    busy: busy,
                    reason: reason
                ) {
                    busy = true
                    await onCreate(
                        name.trimmingCharacters(in: .whitespaces),
                        label.trimmingCharacters(in: .whitespaces),
                        brief.trimmingCharacters(in: .whitespacesAndNewlines),
                        color
                    )
                }
            }
            .padding(.horizontal, DesignTokens.Space.phoneGutter)
            .padding(.bottom, 12)
        }
        .scrollContentBackground(.hidden)
    }
}

/// New group (spec 1.7): Name field, member multi-select with avatar + a
/// trailing checkmark on the picked (sunken) row, "Create group" primary.
private struct CreateGroupSheet: View {
    let bots: [ShellBot]
    var blocked: String?
    var onCreate: (_ name: String, _ memberIds: [String]) async -> Void
    @State private var name = ""
    @State private var members: Set<String> = []
    @State private var busy = false

    private var reason: String? {
        if let blocked { return blocked }
        if name.trimmingCharacters(in: .whitespaces).isEmpty { return "Add a name" }
        return members.count < 2 ? "Pick at least two members" : nil
    }

    var body: some View {
        VStack(spacing: 16) {
            CreateField("Name", text: $name)
                .padding(.horizontal, DesignTokens.Space.phoneGutter)
            List {
                Section {
                    ForEach(bots) { bot in
                        let picked = members.contains(bot.id)
                        Button {
                            if picked { members.remove(bot.id) } else { members.insert(bot.id) }
                        } label: {
                            HStack(spacing: 10) {
                                BotFace(bot: bot, size: 32)
                                // Constant weight — the picked row marks
                                // with the checkmark alone (spec baseline).
                                Text(bot.name)
                                    .tokenFont(DesignTokens.FontSize.chatName, .regular)
                                    .foregroundStyle(Theme.C.ink)
                                Spacer(minLength: 8)
                                if picked {
                                    Image(systemName: "checkmark.circle")
                                        .font(Theme.font(DesignTokens.FontSize.chatName, .regular))
                                        .foregroundStyle(Theme.C.accent)
                                }
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                            .background(picked ? Theme.C.sunken : Color.clear, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowButtonStyle())
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12))
                        .accessibilityAddTraits(picked ? .isSelected : [])
                    }
                } header: {
                    tokenGroupHeader("Members")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            CreatePrimaryButton(
                title: "Create group",
                busyTitle: "Creating",
                busy: busy,
                reason: reason
            ) {
                busy = true
                await onCreate(
                    name.trimmingCharacters(in: .whitespaces),
                    Array(members)
                )
            }
            .padding(.horizontal, DesignTokens.Space.phoneGutter)
        }
        .padding(.bottom, 12)
    }
}

/// New section (spec 1.7): one field and "Create section" at the smallest
/// detent.
private struct CreateSectionSheet: View {
    var blocked: String?
    var onCreate: (_ name: String) async -> Void
    @State private var name = ""
    @State private var busy = false

    private var reason: String? {
        if let blocked { return blocked }
        return name.trimmingCharacters(in: .whitespaces).isEmpty ? "Add a name" : nil
    }

    var body: some View {
        VStack(spacing: 16) {
            CreateField("Name", text: $name)
            CreatePrimaryButton(
                title: "Create section",
                busyTitle: "Creating",
                busy: busy,
                reason: reason
            ) {
                busy = true
                await onCreate(name.trimmingCharacters(in: .whitespaces))
            }
        }
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.bottom, 12)
    }
}

/// Rename (spec 1.7): the prefilled name field and "Save".
private struct RenameSheet: View {
    let bot: ShellBot
    var blocked: String?
    var onSave: (_ name: String) async -> Void
    @State private var name: String
    @State private var busy = false

    init(bot: ShellBot, blocked: String?, onSave: @escaping (String) async -> Void) {
        self.bot = bot
        self.blocked = blocked
        self.onSave = onSave
        _name = State(initialValue: bot.name)
    }

    private var reason: String? {
        if let blocked { return blocked }
        return name.trimmingCharacters(in: .whitespaces).isEmpty ? "Add a name" : nil
    }

    var body: some View {
        VStack(spacing: 16) {
            CreateField("Name", text: $name)
            CreatePrimaryButton(
                title: "Save",
                busyTitle: "Saving",
                busy: busy,
                reason: reason
            ) {
                busy = true
                await onSave(name.trimmingCharacters(in: .whitespaces))
            }
        }
        .padding(.horizontal, DesignTokens.Space.phoneGutter)
        .padding(.bottom, 12)
    }
}

/// Move to section (spec 1.7): the section list plus Unassigned, with the
/// checkmark on the bot's current section.
private struct MoveToSectionSheet: View {
    let bot: ShellBot
    let sections: [ShellSection]
    var onPick: (String?) -> Void
    var onClose: () -> Void

    var body: some View {
        List {
            row(title: "Unassigned", picked: bot.sectionId == nil) {
                onPick(nil)
            }
            ForEach(sections.sorted { $0.order < $1.order }) { section in
                row(title: section.name, picked: bot.sectionId == section.id) {
                    onPick(section.id)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    private func row(title: String, picked: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Text(title)
                    .tokenFont(DesignTokens.FontSize.chatName, .regular)
                    .foregroundStyle(Theme.C.ink)
                Spacer(minLength: 8)
                if picked {
                    Image(systemName: "checkmark.circle")
                        .font(Theme.font(DesignTokens.FontSize.chatName, .regular))
                        .foregroundStyle(Theme.C.accent)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(picked ? Theme.C.sunken : Color.clear, in: RoundedRectangle(cornerRadius: DesignTokens.Radius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle())
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 2, leading: 12, bottom: 2, trailing: 12))
        .accessibilityAddTraits(picked ? .isSelected : [])
    }
}
