import XCTest

/// PR-3 through PR-8 visual + behavioural gate: chat, approval cards,
/// biometrics, widgets, attachments, settings, proposals and the owner
/// question card — driven against the running stack by
/// scripts/ios-surfaces-gate.sh. Each leg assumes a paired app; the first
/// leg pairs through manual entry and the pairing persists between runs.
///
/// Host coordination uses the same sentinel pattern as `hostShot` in
/// ShotsUITests: the test drops `/tmp/ub-cmd-<name>` and the driver's
/// watcher answers `/tmp/ub-done-<name>`. Commands:
///   biomatch / bionomatch   → notifyutil pearl match/nomatch on the sim
///   decide-<id>-<decision>  → ApprovalStore.decide (the Mac deciding first)
///   churn-<id>              → rewrite the record's actionSha256 (pending)
///   probe-reset             → zero the widget nav-probe hit counter
final class SurfacesUITests: XCTestCase {
    private struct Pairing {
        let host: String
        let token: String
        let name: String
    }

    private let pairFilePath = "/tmp/ub-pair.json"

    private func pairing() throws -> Pairing {
        guard let data = FileManager.default.contents(atPath: pairFilePath) else {
            throw XCTSkip("\(pairFilePath) missing — drive this test through scripts/ios-surfaces-gate.sh")
        }
        struct Raw: Decodable { let v: Int; let host: String; let token: String; let name: String }
        guard let raw = try? JSONDecoder().decode(Raw.self, from: data) else {
            XCTFail("pairing payload is not the expected shape")
            throw NSError(domain: "test", code: 1)
        }
        return Pairing(host: raw.host, token: raw.token, name: raw.name)
    }

    private func shot(_ name: String, _ app: XCUIApplication, alertsWindow: TimeInterval = 2) {
        dismissSystemAlerts(app, window: alertsWindow)
        let shot = XCUIScreen.main.screenshot()
        let dir = URL(fileURLWithPath: "/tmp/ub-shots", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: dir.appendingPathComponent(name + ".png"))
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func suffix(_ app: XCUIApplication, appearance: String, typeSize: String? = nil) -> String {
        let width = Int(app.frame.width.rounded())
        var s = appearance
        if width != 390 { s += "-\(width)" }
        if let typeSize { s += "-\(typeSize)" }
        return s
    }

    private func installInterruptionMonitor() {
        addUIInterruptionMonitor(withDescription: "system alerts") { alert in
            for label in ["Not Now", "Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
    }

    private func dismissSystemAlerts(_ app: XCUIApplication, window: TimeInterval = 2) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deadline = Date().addingTimeInterval(window)
        while Date() < deadline {
            for host in [app, springboard] where host.alerts.firstMatch.exists {
                for label in ["Not Now", "Allow", "OK"] {
                    let button = host.buttons[label]
                    if button.exists { button.tap() }
                }
            }
            usleep(300_000)
        }
    }

    private func launch(
        _ app: XCUIApplication,
        appearance: String = "light",
        typeSize: String? = nil,
        reset: Bool = false,
        extra: [String: String] = [:]
    ) {
        app.launchEnvironment["UB_APPEARANCE"] = appearance
        app.launchEnvironment["UB_CAMERA_STATE"] = "denied"
        if let typeSize { app.launchEnvironment["UB_TYPE_SIZE"] = typeSize }
        if reset { app.launchEnvironment["UB_RESET_PAIRING"] = "1" }
        for (key, value) in extra { app.launchEnvironment[key] = value }
        installInterruptionMonitor()
        app.launch()
    }

    @discardableResult
    private func waitForBotsRoot(_ app: XCUIApplication, timeout: TimeInterval = 20) -> Bool {
        app.descendants(matching: .any)["bots-list"].waitForExistence(timeout: timeout)
    }

    /// Selection persists across launches: a relaunch can restore straight
    /// into the last chat, hiding the roster. Pop back when that happened —
    /// a no-op on the roster itself (no navbar back button there).
    private func popIfRestored(_ app: XCUIApplication) {
        // A restored launch can need a beat before `bots-list` enters the
        // tree; only pop on a real back control — on the roster root the
        // nav bar's first button is the Settings toolbar item, and tapping
        // it pushes instead of popping.
        for _ in 0..<3 {
            if app.descendants(matching: .any)["bots-list"].waitForExistence(timeout: 4) { return }
            let back = app.navigationBars.buttons.element(boundBy: 0)
            guard back.waitForExistence(timeout: 3),
                  back.label.localizedCaseInsensitiveContains("back")
                    || back.identifier == "BackButton" else { return }
            back.tap()
            usleep(400_000)
        }
    }

    private func tapButton(_ app: XCUIApplication, _ label: String) {
        // Several cards can carry the same action label, and a popped
        // screen's copies linger in the tree off-screen — resolve to the
        // first match that actually takes a hit.
        let matches = app.buttons.matching(identifier: label)
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline {
            for index in 0..<matches.count {
                let el = matches.element(boundBy: index)
                if el.exists, el.isHittable {
                    el.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                    return
                }
            }
            app.swipeUp()
            usleep(400_000)
        }
        // Diagnose "exists but never hittable": print every match's frame
        // so a covered or off-screen row shows where it actually sits.
        let frames = (0..<matches.count).map { i -> String in
            let el = matches.element(boundBy: i)
            return "#\(i) f=\(el.exists ? el.frame.debugDescription : "∅") hit=\(el.isHittable)"
        }.joined(separator: " ")
        print("diag hittable-miss \(label): \(frames)")
        XCTFail("\(label) never became hittable")
    }

    private func type(_ app: XCUIApplication, _ element: XCUIElement, _ text: String) {
        XCTAssertTrue(element.waitForExistence(timeout: 15))
        element.tap()
        element.typeText(text)
    }

    private func dismissKeyboard(_ app: XCUIApplication) {
        guard app.keyboards.firstMatch.exists else { return }
        for name in ["return", "Return", "Done", "done"] {
            let key = app.keyboards.buttons[name]
            if key.exists {
                key.tap()
                break
            }
        }
        if app.keyboards.firstMatch.waitForNonExistence(timeout: 6) { return }
        app.swipeDown()
        _ = app.keyboards.firstMatch.waitForNonExistence(timeout: 4)
    }

    private func pairThroughManualEntry(_ app: XCUIApplication, _ pair: Pairing) {
        type(app, app.textFields["Mac address"], pair.host)
        for _ in 0..<2 {
            type(app, app.secureTextFields["Pairing token"], pair.token)
            var waited = 0.0
            while !app.buttons["manual-connect"].isEnabled && waited < 3 {
                usleep(250_000)
                waited += 0.25
            }
            if !app.buttons["manual-connect"].isEnabled { continue }
            dismissKeyboard(app)
            tapButton(app, "Connect")
            let moved = app.staticTexts.matching(NSPredicate(
                format: "identifier == 'pairing-status' AND label != '' AND label != %@",
                "Point the camera at the code on your Mac")).firstMatch
            let deadline = Date().addingTimeInterval(12)
            while Date() < deadline {
                if app.descendants(matching: .any)["bots-list"].exists { return }
                if moved.exists { return }
                usleep(300_000)
            }
        }
        dismissKeyboard(app)
    }

    /// Reaches the paired Bots list: pairs through manual entry when the
    /// banked state lapsed (the pairing suite leaves the store unpaired).
    private func ensurePaired(_ app: XCUIApplication, reset: Bool = false, appearance: String = "light", extra: [String: String] = [:]) throws {
        let pair = try pairing()
        launch(app, appearance: appearance, reset: reset, extra: extra)
        popIfRestored(app)
        if waitForBotsRoot(app, timeout: 6) { return }
        guard app.textFields["Mac address"].waitForExistence(timeout: 10) else {
            XCTFail("neither bots list nor pairing screen rendered")
            return
        }
        pairThroughManualEntry(app, pair)
        XCTAssertTrue(waitForBotsRoot(app, timeout: 25), "pairing never reached the Bots list")
    }

    /// Opens a bot's chat from the roster. iOS 26 XCUI dead-taps .plain
    /// List-row buttons (the synthesized event lands in the row's Spacer
    /// region); tapping the row's label text hits live content instead.
    private func openChat(_ app: XCUIApplication, _ botName: String) {
        let row = app.buttons[botName]
        let deadline = Date().addingTimeInterval(20)
        // The roster can be parked at either end between legs; hunt the row
        // in both directions.
        var swipeDown = false
        while Date() < deadline && !(row.exists && row.isHittable) {
            if swipeDown { app.swipeDown() } else { app.swipeUp() }
            swipeDown.toggle()
            usleep(400_000)
        }
        let label = app.staticTexts[botName]
        if label.exists && label.isHittable {
            label.tap()
        } else if row.exists && row.isHittable {
            row.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5)).tap()
        } else {
            XCTFail("\(botName) row never became hittable")
            return
        }
        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 15),
                      "chat composer never appeared")
    }

    /// PhoneSettingsView hangs off the toolbar's Settings nav link — a link,
    /// not a button, so it answers .links not .buttons. The Routines section
    /// keys off the selected bot, so a chat must have been opened first.
    private func openSettings(_ app: XCUIApplication) {
        // The Settings nav link sits inside the merged trailing toolbar
        // HStack on iOS 26, where it may answer as either a link or a button
        // — and which it is can flicker during toolbar layout. Wait on both.
        let deadline = Date().addingTimeInterval(10)
        var el: XCUIElement?
        while Date() < deadline {
            if app.links["Settings"].exists { el = app.links["Settings"].firstMatch; break }
            if app.buttons["Settings"].exists { el = app.buttons["Settings"].firstMatch; break }
            usleep(300_000)
        }
        XCTAssertNotNil(el, "Settings link missing")
        el?.tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10))
    }

    /// Back to the roster root.
    private func popToBots(_ app: XCUIApplication) {
        app.navigationBars.buttons.element(boundBy: 0).tap()
        _ = waitForBotsRoot(app, timeout: 10)
    }

    /// Drops a host command and waits for the driver's ack.
    private func hostCmd(_ name: String) {
        let cmd = URL(fileURLWithPath: "/tmp/ub-cmd-\(name)")
        let done = URL(fileURLWithPath: "/tmp/ub-done-\(name)")
        try? FileManager.default.removeItem(at: done)
        try? Data().write(to: cmd)
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline, !FileManager.default.fileExists(atPath: done.path) {
            usleep(200_000)
        }
        try? FileManager.default.removeItem(at: cmd)
    }

    // MARK: - PR-3 chat core

    /// The sectioned roster: Pinned / Work / Home / Unassigned / Hidden.
    /// The seed script writes ten bots across those groups.
    func testBotsList() throws {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            try ensurePaired(app, appearance: appearance)
            shot("bots-list-\(suffix(app, appearance: appearance))", app)
            app.terminate()
        }
    }

    /// The seeded 240-event transcript on Test Bot, plus its composer.
    func testChat() throws {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            try ensurePaired(app, appearance: appearance)
            openChat(app, "Test Bot")
            XCTAssertTrue(waitForNonEmptyTranscript(app))
            shot("chat-\(suffix(app, appearance: appearance))", app)
            app.terminate()
        }
    }

    /// XXXL pass over the same surfaces (PR-7).
    func testChatAccessibility() throws {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            launch(app, appearance: appearance, typeSize: "xxxl")
            popIfRestored(app)
            XCTAssertTrue(waitForBotsRoot(app, timeout: 25))
            shot("bots-list-\(suffix(app, appearance: appearance, typeSize: "xxxl"))", app)
            openChat(app, "Test Bot")
            XCTAssertTrue(waitForNonEmptyTranscript(app))
            shot("chat-\(suffix(app, appearance: appearance, typeSize: "xxxl"))", app)
            app.terminate()
        }
    }

    /// Cold-open timing on the long transcript: launch → first transcript
    /// block, written to /tmp/ub-perf.json for the driver to roll into
    /// docs/audit/PERFORMANCE-IOS.md with the dataset note.
    func testLongChatPerf() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        let opened = Date()
        openChat(app, "Test Bot")
        XCTAssertTrue(waitForNonEmptyTranscript(app, timeout: 30))
        let ms = Int(Date().timeIntervalSince(opened) * 1000)
        recordPerf(["chat_open_ms": ms])
        shot("chat-longfixture-light", app)
    }

    // MARK: - Appendix B measurement legs

    /// §16: cold launch to an interactive bots list. The disk cache warms
    /// the shell, so this measures the cached path; five samples.
    func testPerfColdLaunch() throws {
        var interactive: [Int] = []
        var firstRow: [Int] = []
        for _ in 0..<5 {
            let app = XCUIApplication()
            let t0 = Date()
            launch(app, appearance: "light")
            popIfRestored(app)
            if waitForBotsRoot(app, timeout: 30) {
                interactive.append(Int(Date().timeIntervalSince(t0) * 1000))
                let rowDeadline = Date().addingTimeInterval(20)
                var rowAt = interactive.last ?? 0
                let skeleton = app.descendants(matching: .any)["bots-skeleton"]
                // First data paint = the roster skeleton resolving into loaded
                // content. On a warm-cache launch the skeleton may never mount
                // and data paints with the list root, so fall back to the
                // interactive time. Row labels sit below the fold in a lazy
                // list and header labels are styled — neither is a probe.
                if skeleton.waitForExistence(timeout: 3) {
                    while Date() < rowDeadline {
                        if !skeleton.exists {
                            rowAt = Int(Date().timeIntervalSince(t0) * 1000)
                            break
                        }
                        usleep(100_000)
                    }
                }
                if rowAt > 0 { firstRow.append(rowAt) }
            }
            app.terminate()
        }
        recordPerf([
            "cold_launch_interactive_ms": interactive,
            "cold_launch_first_data_paint_ms": firstRow,
        ])
    }

    /// §16: open a small cached transcript (Test Bot's 240-event thread).
    /// The merge is the same code the long fixture exercises; the durable
    /// thread is capped at 300 events so this is near worst-case for the
    /// cached path.
    func testPerfChatOpenCached() throws {
        var samples: [Int] = []
        for _ in 0..<5 {
            let app = XCUIApplication()
            try ensurePaired(app)
            let t0 = Date()
            openChat(app, "Test Bot")
            if waitForNonEmptyTranscript(app, timeout: 30) {
                samples.append(Int(Date().timeIntervalSince(t0) * 1000))
            }
            app.terminate()
        }
        recordPerf(["chat_open_cached_ms": samples])
    }

    /// §16: cold replay of the long fixture — the durable thread holds the
    /// product's 300-event cap (EVENT_CAP_PER_THREAD); "Answer 299" is the
    /// visible tail row once the merge lands.
    func testPerfChatOpenColdReplay() throws {
        var samples: [Int] = []
        for _ in 0..<5 {
            let app = XCUIApplication()
            try ensurePaired(app)
            let t0 = Date()
            openChat(app, "Long Fixture")
            if app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Answer 299'")).firstMatch
                .waitForExistence(timeout: 30) {
                samples.append(Int(Date().timeIntervalSince(t0) * 1000))
            } else {
                shot("coldreplay-miss-\(samples.count)", app)
                let rows = app.staticTexts.matching(
                    NSPredicate(format: "label BEGINSWITH 'Question ' OR label BEGINSWITH 'Answer '")).count
                print("diag: turn rows visible at miss = \(rows)")
                print("diag: empty=\(app.staticTexts["What can I do for you?"].exists) skeleton=\(app.otherElements["chat-skeleton"].exists) showEarlier=\(app.buttons["Show earlier"].exists)")
            }
            app.terminate()
        }
        recordPerf(["chat_open_cold_replay_long_ms": samples])
        XCTAssertFalse(samples.isEmpty, "cold replay never reached the durable tail")
    }

    /// §16: scrolling workload on the long fixture — twelve fast swipes,
    /// wall clock, five runs. Frame-rate numbers come from the host-side
    /// trace; this records the UI-test-side cost.
    func testPerfScroll() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Long Fixture")
        // The 3.5k-event replay keeps growing the tail while it streams, so
        // the pin can trail the bottom; nudge toward it like a reader would.
        let tail = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'Answer 299'")).firstMatch
        let transcript = app.scrollViews["transcript"]
        let tailDeadline = Date().addingTimeInterval(45)
        while Date() < tailDeadline && !tail.exists {
            transcript.swipeUp()
            usleep(400_000)
        }
        if !tail.exists {
            shot("scroll-tail-miss", app)
            let rows = app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH 'Question ' OR label BEGINSWITH 'Answer '")).count
            print("diag: turn rows visible at scroll miss = \(rows)")
        }
        XCTAssertTrue(tail.exists, "long-fixture tail never rendered")
        var samples: [Int] = []
        for _ in 0..<5 {
            let list = app.scrollViews["transcript"]
            let t0 = Date()
            for _ in 0..<12 {
                list.swipeUp(velocity: .fast)
            }
            samples.append(Int(Date().timeIntervalSince(t0) * 1000))
        }
        recordPerf(["scroll_12_swipes_ms": samples])
    }

    /// Merge a key into /tmp/ub-perf.json so the gate driver can read all
    /// legs' samples from one file.
    private func recordPerf(_ pairs: [String: Any]) {
        let url = URL(fileURLWithPath: "/tmp/ub-perf.json")
        var bag = (try? JSONSerialization.jsonObject(
            with: Data(contentsOf: url))) as? [String: Any] ?? [:]
        for (key, value) in pairs { bag[key] = value }
        try? JSONSerialization.data(withJSONObject: bag)
            .write(to: url)
    }

    private func waitForNonEmptyTranscript(_ app: XCUIApplication, timeout: TimeInterval = 20) -> Bool {
        // Any rendered row inside the transcript scroll view: plain rows are
        // staticTexts, markdown rows surface as textViews, "Show earlier" is
        // a button. A fixed label can't be trusted — seeded copy scrolls out
        // of the 60-block window once live events land.
        let transcript = app.scrollViews["transcript"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if transcript.staticTexts.count + transcript.textViews.count + transcript.buttons.count > 0 {
                return true
            }
            usleep(200_000)
        }
        return false
    }

    /// One live Test Bot send. Test Bot is full_access, so send goes through
    /// the Face-ID unlock path: marker biomatch, then the working/streaming
    /// state, then the landed reply.
    func testLiveSend() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("Reply with the single word: aye")
        // The composer is not keyboard-avoiding: while the keyboard is up it
        // covers the send button, and a vertical-axis field's Return inserts a
        // newline instead of dismissing. Pop to the roster — resigning the
        // field on the way — and reopen; the draft round-trips through the
        // per-chat cache.
        popToBots(app)
        openChat(app, "Test Bot")
        // Send is Face-ID locked: drop the marker first so the watcher
        // answers the prompt the moment it mounts.
        hostCmd("biomatch")
        let sendBtn = app.buttons["Send, locked. Face ID required"]
        if sendBtn.exists && !sendBtn.isHittable {
            // Disabled or covered — capture which on-screen reason explains it.
            shot("send-blocked-debug", app)
            for reason in ["Connecting to your Mac", "Your Mac is unreachable",
                           "Agent runtime is down on your Mac", "Session expired. Sign in again",
                           "You're offline", "This phone doesn't speak this Mac's protocol."] {
                if app.staticTexts[reason].exists { print("LIVESEND-BLOCKED: \(reason)") }
            }
            print("LIVESEND-BLOCKED: enabled=\(sendBtn.isEnabled) keyboard=\(app.keyboards.firstMatch.exists)")
        }
        tapButton(app, "Send, locked. Face ID required")
        // No LLM provider is configured on this VM's stack, so the gate runs
        // this leg against the S2 fixture: the reply lands as the planted
        // token rather than "aye". Accept either a real provider's echo or
        // the fixture's streamed reply — both prove the unlock→send→stream
        // path end to end.
        let aye = app.staticTexts.matching(NSPredicate(
            format: "label CONTAINS[c] 'aye'")).firstMatch
        let planted = app.staticTexts.matching(NSPredicate(
            format: "label CONTAINS 'S2-TOOL-PLANT'")).firstMatch
        let transcript = app.scrollViews["transcript"]
        // The reply lands below the fold: swipe toward the tail so the lazy
        // stack materialises it instead of waiting on a row that never
        // renders.
        let deadline = Date().addingTimeInterval(60)
        while Date() < deadline && !aye.exists && !planted.exists {
            transcript.swipeUp()
            usleep(300_000)
        }
        XCTAssertTrue(aye.exists || planted.exists, "no streamed reply landed")
        shot("chat-send-live-light", app)
    }

    /// Two-client rule: createBot, New chat and Continue must carry
    /// preserveSelection so the Mac's selected bot never moves. The gate
    /// reads the store before and after this leg and fails if
    /// selectedBotId changed; the test only performs the actions.
    func testTwoClientPreserveSelection() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        // New chat on a bot — class A, needs the biometric marker first.
        openChat(app, "Test Bot")
        popToBots(app)
        // Context menu on the row: long-press → New chat. Off-screen rows
        // are not in the tree — scroll until the row shows. The roster may
        // have restored its scroll offset at the bottom, so hunt both ways.
        let row = app.buttons["QA Runner"]
        let rowDeadline = Date().addingTimeInterval(20)
        var swipeDown = false
        while Date() < rowDeadline && !(row.exists && row.isHittable) {
            if swipeDown { app.swipeDown() } else { app.swipeUp() }
            swipeDown.toggle()
            usleep(400_000)
        }
        XCTAssertTrue(row.exists && row.isHittable, "QA Runner row never became hittable")
        row.press(forDuration: 1.2)
        let newChat = app.buttons["New chat"]
        XCTAssertTrue(newChat.waitForExistence(timeout: 8))
        hostCmd("biomatch")
        newChat.tap()
        // Face ID prompt → match → action lands. Bots root returns.
        _ = waitForBotsRoot(app, timeout: 15)
        shot("two-client-after-newchat-light", app)
    }

    // MARK: - PR-4 asks

    /// The pending card: provenance (bot name, working directory, full
    /// preview in its scroll view), Deny + Approve at 44 pt.
    func testApprovalPending() throws {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            try ensurePaired(app, appearance: appearance)
            openChat(app, "Test Bot")
            XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20),
                          "approval card never rendered")
            XCTAssertTrue(app.buttons["Deny"].exists)
            XCTAssertTrue(app.buttons["Approve"].exists)
            shot("approval-pending-\(suffix(app, appearance: appearance))", app)
            app.terminate()
        }
    }

    /// Scripted deny: ungated, one tap → "Denied".
    func testApprovalDeny() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        tapButton(app, "Deny")
        XCTAssertTrue(app.staticTexts["Denied"].waitForExistence(timeout: 15))
        shot("approval-denied-light", app)
        // Dark pass: settled approvals drop out of the server snapshot, so
        // a relaunch can't see the light pass's card. Seed a fresh pending
        // ask and deny it inside the dark session instead.
        hostCmd("reseed-apr_deny")
        app.terminate()
        let dark = XCUIApplication()
        launch(dark, appearance: "dark")
        popIfRestored(dark)
        XCTAssertTrue(waitForBotsRoot(dark, timeout: 20))
        openChat(dark, "Test Bot")
        XCTAssertTrue(dark.buttons["Deny"].firstMatch.waitForExistence(timeout: 20))
        tapButton(dark, "Deny")
        XCTAssertTrue(dark.staticTexts["Denied"].waitForExistence(timeout: 20))
        shot("approval-denied-dark", dark)
    }

    /// Scripted approve: Face ID match → "Approved".
    func testApprovalApprove() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("biomatch")
        tapButton(app, "Approve")
        XCTAssertTrue(app.staticTexts["Approved"].waitForExistence(timeout: 20),
                      "biometric match never approved the card")
        shot("approval-approved-light", app)
        // Dark pass: the approved card is gone from the server snapshot, so
        // re-seed the ask and approve it inside the dark session.
        hostCmd("reseed-apr_ok")
        app.terminate()
        let dark = XCUIApplication()
        launch(dark, appearance: "dark")
        popIfRestored(dark)
        XCTAssertTrue(waitForBotsRoot(dark, timeout: 20))
        openChat(dark, "Test Bot")
        XCTAssertTrue(dark.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("biomatch")
        tapButton(dark, "Approve")
        XCTAssertTrue(dark.staticTexts["Approved"].waitForExistence(timeout: 20))
        shot("approval-approved-dark", dark)
    }

    /// Biometric failure then user cancel: neither may send the class-A
    /// decide — the card stays pending with "Approve" still offered.
    func testApprovalBioFailure() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("bionomatch")
        tapButton(app, "Approve")
        // nomatch → Face ID "not recognized" prompt; a second nomatch ends
        // the policy as failed. The watcher sends two nomatch events.
        let deadline = Date().addingTimeInterval(12)
        while Date() < deadline {
            if app.buttons["Approve"].exists { break }
            usleep(300_000)
        }
        XCTAssertTrue(app.buttons["Approve"].waitForExistence(timeout: 10),
                      "card left pending after a failed biometric")
        // No "Approved"/"Denied" status line may be present.
        XCTAssertFalse(app.staticTexts["Approved"].exists)
        XCTAssertFalse(app.staticTexts["Denied"].exists)
        shot("approval-bio-failed-light", app)
    }

    /// Biometric cancel: the simulator's Face ID sheet offers Cancel only on
    /// the "Face Not Recognized" fallback, so the leg posts one nomatch to
    /// surface it, then taps Cancel. The card must stay pending and no
    /// class-A action may be sent.
    func testApprovalBioCancel() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("biocancel")
        tapButton(app, "Approve")
        // The LA dialog can render inside the app window, on springboard, or
        // in the LocalAuthenticationUIService process that owns the sheet.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let laService = XCUIApplication(bundleIdentifier: "com.apple.LocalAuthenticationUIService")
        var cancel: XCUIElement?
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline, cancel == nil {
            for host in [app, springboard, laService] {
                for probe in [host.alerts.buttons["Cancel"].firstMatch,
                              host.sheets.buttons["Cancel"].firstMatch,
                              host.dialogs.buttons["Cancel"].firstMatch,
                              host.buttons["Cancel"].firstMatch] where probe.exists && probe.isHittable {
                    cancel = probe
                }
            }
            usleep(400_000)
        }
        XCTAssertNotNil(cancel, "biometric fallback sheet never offered Cancel")
        cancel?.tap()
        // Back on the card: still pending, still actionable, never decided.
        XCTAssertTrue(app.buttons["Approve"].waitForExistence(timeout: 10),
                      "card left pending after a cancelled biometric")
        XCTAssertFalse(app.staticTexts["Approved"].exists)
        XCTAssertFalse(app.staticTexts["Denied"].exists)
        shot("approval-bio-cancelled-light", app)
    }

    /// Approving mid-flight: the driver adds a decide delay, so the
    /// "Approving" button state is capturable.
    func testApprovalApproving() throws {
        let app = XCUIApplication()
        try ensurePaired(app, extra: ["UB_DECIDE_DELAY_MS": "2500"])
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("biomatch")
        tapButton(app, "Approve")
        XCTAssertTrue(app.buttons["Approving"].waitForExistence(timeout: 10),
                      "approving phase never rendered")
        shot("approval-approving-light", app, alertsWindow: 0.5)
        // Then let it land so the store is clean for the next leg.
        _ = app.staticTexts["Approved"].waitForExistence(timeout: 20)
        // Dark pass: the first pass settled the record, so re-seed apr_slow
        // to pending, then capture the transient phase with the delay seam.
        hostCmd("reseed-apr_slow")
        app.terminate()
        let dark = XCUIApplication()
        launch(dark, appearance: "dark", extra: ["UB_DECIDE_DELAY_MS": "2500"])
        popIfRestored(dark)
        XCTAssertTrue(waitForBotsRoot(dark, timeout: 20))
        openChat(dark, "Test Bot")
        XCTAssertTrue(dark.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("biomatch")
        tapButton(dark, "Approve")
        XCTAssertTrue(dark.buttons["Approving"].waitForExistence(timeout: 10))
        shot("approval-approving-dark", dark, alertsWindow: 0.5)
        _ = dark.staticTexts["Approved"].waitForExistence(timeout: 20)
    }

    /// Resolved: the Mac decides first; the phone's own approve 404s into
    /// "Resolved on your Mac".
    func testApprovalResolved() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        // The marker names the record id out of the card; the watcher
        // decides it in the store first, then answers Face ID.
        hostCmd("decide-resolve")
        tapButton(app, "Approve")
        if !app.staticTexts["Resolved on your Mac"].waitForExistence(timeout: 20) {
            shot("approval-resolved-miss", app)
            let phases = ["Approved", "Denied", "Approving", "This request changed. Check it again.",
                          "Expired", "Test Bot asks"].map {
                "\($0)=\(app.staticTexts[$0].exists || app.buttons[$0].exists)"
            }.joined(separator: " ")
            print("diag resolved-miss: \(phases)")
        }
        XCTAssertTrue(app.staticTexts["Resolved on your Mac"].exists,
                      "card never reached resolved")
        shot("approval-resolved-light", app)
        // Dark pass: settled records leave the pending list, so the dark
        // session seeds the ask again and resolves it the same way.
        hostCmd("reseed-apr_resolve")
        app.terminate()
        let dark = XCUIApplication()
        launch(dark, appearance: "dark")
        popIfRestored(dark)
        XCTAssertTrue(waitForBotsRoot(dark, timeout: 20))
        openChat(dark, "Test Bot")
        XCTAssertTrue(dark.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("decide-resolve")
        tapButton(dark, "Approve")
        XCTAssertTrue(dark.staticTexts["Resolved on your Mac"].waitForExistence(timeout: 20))
        shot("approval-resolved-dark", dark)
    }

    /// Changed: the record's action hash moved under the card; the phone's
    /// poll flips it to the changed copy.
    func testApprovalChanged() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("churn")
        XCTAssertTrue(app.staticTexts["This request changed. Check it again."]
            .waitForExistence(timeout: 20), "changed copy never rendered")
        shot("approval-changed-light", app)
        // Dark pass: "changed" needs the hash to move while the card is
        // pending in this session, so re-seed then churn under dark.
        hostCmd("reseed-apr_churn")
        app.terminate()
        let dark = XCUIApplication()
        launch(dark, appearance: "dark")
        popIfRestored(dark)
        XCTAssertTrue(waitForBotsRoot(dark, timeout: 20))
        openChat(dark, "Test Bot")
        XCTAssertTrue(dark.staticTexts["Test Bot asks"].waitForExistence(timeout: 20))
        hostCmd("churn")
        XCTAssertTrue(dark.staticTexts["This request changed. Check it again."].waitForExistence(timeout: 20))
        shot("approval-changed-dark", dark)
    }

    /// Expired pending record: the driver seeds one with a ~12s TTL; the
    /// app fetches it pending, the TTL lapses, and the card flips to the
    /// expired copy with no Approve/Deny. The driver clears the store
    /// first so no other pending card exists; each appearance re-seeds.
    func testApprovalExpired() throws {
        for appearance in ["light", "dark"] {
            hostCmd("reseed-apr_exp")
            let app = XCUIApplication()
            try ensurePaired(app, appearance: appearance)
            openChat(app, "Test Bot")
            XCTAssertTrue(app.staticTexts["Expired"].waitForExistence(timeout: 30),
                          "expired copy never rendered")
            XCTAssertFalse(app.buttons["Approve"].exists, "expired card still offers Approve")
            XCTAssertFalse(app.buttons["Deny"].exists, "expired card still offers Deny")
            shot("approval-expired-\(suffix(app, appearance: appearance))", app)
            app.terminate()
        }
    }

    /// Reduce Motion (PR-7): the driver toggles the sim's accessibility flag
    /// before the leg. Bots list and chat re-shot under it.
    func testReduceMotion() throws {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            try ensurePaired(app, appearance: appearance)
            shot("bots-list-\(suffix(app, appearance: appearance))-rm", app)
            openChat(app, "Test Bot")
            XCTAssertTrue(waitForNonEmptyTranscript(app))
            shot("chat-\(suffix(app, appearance: appearance))-rm", app)
            app.terminate()
        }
    }

    // MARK: - PR-5 attachments and widgets

    /// The seeded widget row inside Test Bot's transcript: the stub MCP
    /// page renders; its JS attempts navigations the nav policy must all
    /// cancel (probe listener on the host stays at zero).
    func testWidget() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        // The chat lands short of the tail while the lazy stack settles; the
        // seeded widget row sits near the newest events, so hunt toward the
        // tail. Swipe the transcript's scroll view itself — docked ask cards
        // below it can eat an app-wide swipe. The chat opens pinned to the
        // newest events and the widget row sits above them, so hunt toward
        // older rows (swipe down).
        let webview = app.webViews.firstMatch
        let skeleton = app.descendants(matching: .any)["Loading drawing"]
        let failedText = app.staticTexts["This drawing could not be opened."]
        let transcript = app.scrollViews["transcript"]
        let earlier = app.buttons["Show earlier"]
        let deadline = Date().addingTimeInterval(45)
        while Date() < deadline && !webview.exists && !failedText.exists {
            if skeleton.exists {
                usleep(300_000)   // slot mounted, fetch in flight
            } else if earlier.exists && earlier.isHittable {
                // The thread fixture grows a few rows every run; once the
                // widget slips above the transcript's window, swiping alone
                // can never reach it — the window only widens through "Show
                // earlier".
                earlier.tap()
                usleep(300_000)
            } else {
                transcript.swipeDown()   // still hunting the row
                usleep(300_000)
            }
        }
        hostCmd("probe-reset")
        XCTAssertTrue(webview.exists,
                      "widget webview never rendered (skeleton=\(skeleton.exists) failed=\(failedText.exists))")
        // Give its JS nav attempts time to fire and be cancelled, and hunt
        // until the row is actually on screen for the shot — `exists` answers
        // true while the lazy stack still holds it off-frame.
        let visibleDeadline = Date().addingTimeInterval(20)
        while Date() < visibleDeadline && !webview.isHittable {
            transcript.swipeDown()
            usleep(300_000)
        }
        sleep(3)
        shot("widget-light", app)
    }

    /// Attachment round trip: photo from the seeded Photos library goes in
    /// the composer and out with the send.
    func testAttachPhoto() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        tapButton(app, "Add to message")
        // The sheet's own rows answer .cells; open the system picker first
        // so the probe only ever sees remote photo cells.
        tapButton(app, "Photos")
        // Photos picker: a remote-rendered sheet — its photo cells do not
        // always answer app.images, so probe cells and large images alike.
        usleep(1_200_000)
        var first: XCUIElement?
        let cellDeadline = Date().addingTimeInterval(15)
        // The remote picker renders its grid as cells or labelled images;
        // presentation dimming overlays answer .images too — skip any element
        // whose label names an overlay rather than a photo.
        while Date() < cellDeadline && first == nil {
            for query in [app.cells, app.images] {
                for i in 0..<query.count {
                    let el = query.element(boundBy: i)
                    guard el.exists else { continue }
                    // The picker's dimming overlay answers .images with the
                    // name on the identifier, not the label.
                    let names = el.label + el.identifier
                    if names.contains("Overlay") || names.contains("Dimming") { continue }
                    let f = el.frame
                    if f.width > 60 && f.height > 60 && f.minX >= 0 && f.minY >= 0 {
                        first = el; break
                    }
                }
                if first != nil { break }
            }
            if first == nil { usleep(300_000) }
        }
        guard let first else {
            XCTFail("no photo cell in the picker")
            return
        }
        // The remote picker's cells answer .images but report not-hittable
        // (out-of-process hit testing) — a raw coordinate tap still lands.
        first.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        // The chip appears once addPhoto lands it.
        XCTAssertTrue(app.buttons["Remove"].waitForExistence(timeout: 10),
                      "attachment chip never appeared")
        shot("attach-photo-chip-light", app)
    }

    /// Over-64 KB text file: UB_TEXT_FILE points the seam at a file the
    /// driver wrote; the app must refuse it without a full read.
    func testTextFileCap() throws {
        let app = XCUIApplication()
        try ensurePaired(app, reset: false)
        app.terminate()
        let relaunched = XCUIApplication()
        launch(relaunched, appearance: "light", extra: ["UB_TEXT_FILE": "/tmp/ub-big.txt"])
        XCTAssertTrue(waitForBotsRoot(relaunched, timeout: 20))
        openChat(relaunched, "Test Bot")
        XCTAssertTrue(
            relaunched.staticTexts.matching(NSPredicate(
                format: "label CONTAINS[c] %@", "64")).firstMatch
                .waitForExistence(timeout: 10),
            "the 64 KB refusal never surfaced")
        shot("attach-textfile-cap-light", relaunched)
    }

    // MARK: - PR-6 management and Devices

    func testSettings() throws {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            try ensurePaired(app, appearance: appearance)
            openChat(app, "Test Bot")
            popToBots(app)
            openSettings(app)
            shot("settings-\(suffix(app, appearance: appearance))", app)
            app.terminate()
        }
    }

    /// Routine create is class A: fields filled, Add routine, Face ID. On the
    /// phone the editor lives in the bot settings sheet (the roster's global
    /// Settings only sees a selection on iPad, where pop doesn't clear it).
    func testRoutineCreate() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        tapButton(app, "Bot settings")
        // The floating sheet hides its inner nav bar and carries the title in
        // its own header — the trailing Done button only exists while it's up.
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 15),
                      "bot settings sheet never opened")
        // The editor lives behind the "New routine" row — the settings form's
        // own Name field would otherwise swallow the routine's name.
        let newRoutine = app.buttons["New routine"]
        let newRoutineDeadline = Date().addingTimeInterval(15)
        while Date() < newRoutineDeadline && !(newRoutine.exists && newRoutine.isHittable) {
            app.swipeUp()
            usleep(300_000)
        }
        XCTAssertTrue(newRoutine.waitForExistence(timeout: 5), "New routine row never rendered")
        newRoutine.tap()
        let nameField = app.textFields["Name"]
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline && !nameField.exists {
            app.swipeUp()
            usleep(300_000)
        }
        type(app, nameField, "Morning check")
        // The instruction field is multi-line (axis: .vertical): XCUI
        // reports those under textViews, not textFields, and the row may sit
        // below the fold — scroll until some element labels itself so.
        var instructionField = app.textViews["Instruction"]
        let instructionDeadline = Date().addingTimeInterval(15)
        while Date() < instructionDeadline && !instructionField.exists {
            if app.textFields["Instruction"].exists {
                instructionField = app.textFields["Instruction"]
                break
            }
            let byLabel = app.descendants(matching: .any)
                .matching(NSPredicate(format: "label == %@", "Instruction"))
                .firstMatch
            if byLabel.exists { instructionField = byLabel; break }
            app.swipeUp()
            usleep(300_000)
        }
        XCTAssertTrue(instructionField.waitForExistence(timeout: 5),
                      "Instruction field never rendered")
        type(app, instructionField, "Ping the morning status")
        hostCmd("biomatch")
        tapButton(app, "Save")
        // Back in the settings sheet the Routines section sits mid-list —
        // below the fold after the round-3 sections above it — so the lazy
        // List only materializes the new row once it scrolls into view.
        let createdRoutine = app.staticTexts["Morning check"]
        let createdDeadline = Date().addingTimeInterval(20)
        while Date() < createdDeadline && !createdRoutine.exists {
            app.swipeUp()
            usleep(300_000)
        }
        XCTAssertTrue(createdRoutine.waitForExistence(timeout: 5),
                      "created routine never listed")
        shot("settings-routine-created-light", app)
    }

    // MARK: - extras

    /// The seeded createBot proposal card on Test Bot's chat. The leg only
    /// captures the card — confirm coverage lives in testProposalConfirm.
    func testProposalCard() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["New bot"].waitForExistence(timeout: 20),
                      "proposal card never rendered")
        shot("proposal-card-light", app)
        // Dark pass on the same card.
        app.terminate()
        let dark = XCUIApplication()
        launch(dark, appearance: "dark")
        popIfRestored(dark)
        XCTAssertTrue(waitForBotsRoot(dark, timeout: 20))
        openChat(dark, "Test Bot")
        XCTAssertTrue(dark.staticTexts["New bot"].waitForExistence(timeout: 20))
        shot("proposal-card-dark", dark)
    }

    /// Confirm proposal is class A: Face ID match → the bot is created.
    func testProposalConfirm() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["New bot"].waitForExistence(timeout: 20))
        hostCmd("biomatch")
        tapButton(app, "Confirm")
        // The new bot joins the roster (seeded proposal names it "Field
        // Notes"); the card resolves and the phone selects the new bot.
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline && !app.staticTexts["Field Notes"].exists
            && !app.navigationBars.staticTexts["Field Notes"].exists {
            usleep(400_000)
        }
        shot("proposal-confirmed-light", app)
    }

    /// connectApp proposal → Composio authorize → Safari sheet.
    func testSafariSheet() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        // The connectApp card titles itself with the app name.
        XCTAssertTrue(app.staticTexts["GitHub"].waitForExistence(timeout: 20),
                      "connect proposal never rendered")
        hostCmd("biomatch")
        tapButton(app, "Confirm")
        // The sheet only presents when the Mac mints an authorize URL, which
        // needs a live connectors key; this stack has none, so the confirm is
        // refused — and the card must stay pending rather than settle silently.
        let safari = app.otherElements["SFRemoteView"]
        let safariHost = XCUIApplication(bundleIdentifier: "com.apple.SafariViewService")
        let sheetPresented = safari.waitForExistence(timeout: 20)
            || safariHost.otherElements.firstMatch.waitForExistence(timeout: 2)
        XCTAssertTrue(sheetPresented || app.staticTexts["GitHub"].exists,
                      "connect confirm vanished the card without a sheet")
        shot("safari-sheet-light", app)
    }

    /// Dark-pass twin of testSafariSheet; the gate re-seeds a fresh
    /// connectApp proposal before this leg runs.
    func testSafariSheetDark() throws {
        let app = XCUIApplication()
        try ensurePaired(app, appearance: "dark")
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["GitHub"].waitForExistence(timeout: 20),
                      "connect proposal never rendered")
        hostCmd("biomatch")
        tapButton(app, "Confirm")
        let safari = app.otherElements["SFRemoteView"]
        let safariHost = XCUIApplication(bundleIdentifier: "com.apple.SafariViewService")
        let sheetPresented = safari.waitForExistence(timeout: 20)
            || safariHost.otherElements.firstMatch.waitForExistence(timeout: 2)
        XCTAssertTrue(sheetPresented || app.staticTexts["GitHub"].exists,
                      "connect confirm vanished the card without a sheet")
        shot("safari-sheet-dark", app)
    }

    /// Owner-question card: the fixture's ask_question lands as
    /// input.requested on the stamped session; the card offers the options.
    func testOwnerQuestion() throws {
        let app = XCUIApplication()
        try ensurePaired(app)
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Which route do you want?"].waitForExistence(timeout: 30),
                      "owner-question card never rendered")
        XCTAssertTrue(app.buttons["Coastal route"].exists)
        shot("owner-question-light", app)
        tapButton(app, "Coastal route")
    }

    /// Dark-pass twin of testOwnerQuestion; the gate stamps a fresh question
    /// session before this leg runs.
    func testOwnerQuestionDark() throws {
        let app = XCUIApplication()
        try ensurePaired(app, appearance: "dark")
        openChat(app, "Test Bot")
        XCTAssertTrue(app.staticTexts["Which route do you want?"].waitForExistence(timeout: 30),
                      "owner-question card never rendered")
        XCTAssertTrue(app.buttons["Coastal route"].exists)
        shot("owner-question-dark", app)
        tapButton(app, "Coastal route")
    }
}
