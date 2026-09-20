import XCTest

/// PR-2 visual gate: screenshots for every screen/state PR-2 adds, in both
/// appearances, at the device width, plus one accessibility-XXXL pass.
/// Pairing-form states live in PairingUITests; this class owns the states
/// behind a live session (Bots list, Devices, signed-out, credential-invalid,
/// failed/manual connect, readiness banner).
///
/// States needing a live stack read the pairing payload from
/// `/tmp/ub-pair.json` (the simulator shares the host filesystem) and skip
/// without it — scripts/ios-pairing-gate.sh runs them as legs around its
/// credential flips. `testFailed`/`testConnecting` need no stack.
final class ShotsUITests: XCTestCase {
    private struct Pairing {
        let host: String
        let token: String
        let name: String
    }

    private let pairFilePath = "/tmp/ub-pair.json"

    private func pairing() throws -> Pairing {
        guard let data = FileManager.default.contents(atPath: pairFilePath) else {
            throw XCTSkip("\(pairFilePath) missing — drive this test through scripts/ios-pairing-gate.sh")
        }
        struct Raw: Decodable { let v: Int; let host: String; let token: String; let name: String }
        guard let raw = try? JSONDecoder().decode(Raw.self, from: data) else {
            XCTFail("pairing payload is not the expected shape")
            throw NSError(domain: "test", code: 1)
        }
        return Pairing(host: raw.host, token: raw.token, name: raw.name)
    }

    private func shot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        // The simulator shares the host filesystem: drop the PNG on /tmp so
        // the shot survives Xcode pruning the xcresult. The caller copies
        // them to docs/audit/ios-shots/PR-2/.
        let dir = URL(fileURLWithPath: "/tmp/ub-shots", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: dir.appendingPathComponent(name + ".png"))
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func suffix(_ app: XCUIApplication, appearance: String, typeSize: String?) -> String {
        let width = Int(app.frame.width.rounded())
        var s = appearance
        if width != 390 { s += "-\(width)" }
        if typeSize != nil { s += "-xxxl" }
        return s
    }

    /// System alerts that slip through (Keychain "Save Password", camera
    /// consent) must not wedge a leg — answer them and carry on.
    private func installInterruptionMonitor() {
        addUIInterruptionMonitor(withDescription: "system alerts") { alert in
            for label in ["Not Now", "Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
    }

    /// The Keychain "Save Password?" sheet can surface *after* the last
    /// synthesized event — during a hold there is nothing for the
    /// interruption monitor to interrupt, so it lingers into the shot.
    /// Query + tap the buttons directly (the sheet lives on the app or
    /// springboard depending on runtime).
    private func dismissSystemAlerts(_ app: XCUIApplication) {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for host in [app, springboard] {
            guard host.alerts.firstMatch.waitForExistence(timeout: 0.3) else { continue }
            for label in ["Not Now", "Allow", "OK"] {
                let button = host.buttons[label]
                if button.exists { button.tap() }
            }
        }
    }

    private func launch(_ app: XCUIApplication, appearance: String, typeSize: String? = nil,
                        reset: Bool = false, offline: Bool = false,
                        holdConnected: Bool = false) {
        app.launchEnvironment["UB_APPEARANCE"] = appearance
        app.launchEnvironment["UB_CAMERA_STATE"] = "denied"
        if reset { app.launchEnvironment["UB_RESET_PAIRING"] = "1" }
        if offline { app.launchEnvironment["UB_OFFLINE"] = "1" }
        if holdConnected { app.launchEnvironment["UB_HOLD_CONNECTED"] = "1" }
        if let typeSize { app.launchEnvironment["UB_TYPE_SIZE"] = typeSize }
        installInterruptionMonitor()
        app.launch()
    }

    private func type(_ app: XCUIApplication, _ element: XCUIElement, _ text: String) {
        XCTAssertTrue(element.waitForExistence(timeout: 15))
        element.tap()
        element.typeText(text)
    }

    /// Sheet buttons can hit a stale snapshot mid-rerender ("Computed hit
    /// point {-1,-1}"). Gate on isHittable first, then coordinate-tap — a
    /// coordinate tap can never fail "not hittable".
    private func tapButton(_ app: XCUIApplication, _ label: String) {
        let el = app.buttons[label]
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline {
            if el.exists, el.isHittable {
                el.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                return
            }
            // Offscreen or covered: a swipe scrolls the sheet's list and
            // dismisses a keyboard still over the bottom half on 375 pt.
            app.swipeUp()
            usleep(400_000)
        }
        XCTFail("\(label) never became hittable")
    }

    private func pairThroughManualEntry(_ app: XCUIApplication, _ pair: Pairing) {
        type(app, app.textFields["Mac address"], pair.host)
        type(app, app.secureTextFields["Pairing token"], pair.token)
        // A system alert surfacing mid-type can steal the SecureField's
        // first responder and silently drop the token — SecureField values
        // are unreadable, so the disabled Connect button is the tell. Give
        // the binding a beat to propagate before deciding it dropped.
        var waited = 0.0
        while !app.buttons["Connect"].isEnabled && waited < 3 {
            usleep(250_000)
            waited += 0.25
        }
        if !app.buttons["Connect"].isEnabled {
            type(app, app.secureTextFields["Pairing token"], pair.token)
        }
        tapButton(app, "Connect")
        // The keyboard can outlive the push to the Bots list and cover the
        // Devices sheet's bottom rows on small screens. Dismiss it with a
        // bare swipe (scrollDismissesKeyboard is .interactively): no element
        // resolution, so it can never fail on a keyboard already gone.
        if app.keyboards.firstMatch.waitForExistence(timeout: 2) {
            app.swipeDown()
            _ = app.keyboards.firstMatch.waitForNonExistence(timeout: 8)
        }
    }
    /// Full paired journey: bots list → Devices sheet → sign out → sign in.
    /// One run per (appearance, typeSize) the gate requires.
    private func sessionJourney(appearance: String, typeSize: String? = nil) throws {
        let pair = try pairing()
        let app = XCUIApplication()
        launch(app, appearance: appearance, typeSize: typeSize, reset: true)

        XCTAssertTrue(app.textFields["Mac address"].waitForExistence(timeout: 15))
        pairThroughManualEntry(app, pair)
        XCTAssertTrue(app.navigationBars["Useful Bot"].waitForExistence(timeout: 20))
        let s = suffix(app, appearance: appearance, typeSize: typeSize)
        dismissSystemAlerts(app)
        shot("bots-paired-\(s)")

        for _ in 0..<6 {
            if app.buttons["Done"].exists { break }
            let gear = app.buttons["Devices"]
            if gear.exists { gear.tap() }
            usleep(400_000)
        }
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 10),
                      "Devices sheet never presented")
        XCTAssertTrue(app.staticTexts["This Mac"].waitForExistence(timeout: 10))
        dismissSystemAlerts(app)
        shot("devices-paired-\(s)")

        tapButton(app, "Sign out on this phone")
        XCTAssertTrue(app.staticTexts["Signed out"].waitForExistence(timeout: 10))
        dismissSystemAlerts(app)
        shot("signed-out-\(s)")

        tapButton(app, "signed-out-sign-in")
        XCTAssertTrue(app.navigationBars["Useful Bot"].waitForExistence(timeout: 15))
        dismissSystemAlerts(app)
        shot("bots-resigned-in-\(s)")
    }

    func testJourneyLight() throws { try sessionJourney(appearance: "light") }
    func testJourneyDark() throws { try sessionJourney(appearance: "dark") }
    func testJourneyAccessibilityLight() throws {
        try sessionJourney(appearance: "light", typeSize: "xxxl")
    }
    func testJourneyAccessibilityDark() throws {
        try sessionJourney(appearance: "dark", typeSize: "xxxl")
    }

    /// Revoked credential → idle + invalid copy. Driven as a gate leg right
    /// after `setup-local.mjs --revoke-phone`, while the stored token is a
    /// live 401. The light variant is captured by PairingFlowUITests.
    func testCredentialInvalidDark() throws {
        guard FileManager.default.contents(atPath: "/tmp/ub-pair-revoked") != nil else {
            throw XCTSkip("/tmp/ub-pair-revoked missing — only valid inside the gate's revoked window")
        }
        let app = XCUIApplication()
        launch(app, appearance: "dark")
        XCTAssertTrue(app.staticTexts[
            "This pairing was revoked or expired. Scan a new code from your Mac."
        ].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Pair again"].exists)
        shot("pairing-credential-invalid-\(suffix(app, appearance: "dark", typeSize: nil))")
    }

    /// Mac unreachable readiness banner: the gate kills the web service
    /// before this leg, so the list's refresh fails and the banner shows.
    /// Both appearances in one run — the stack stays down between launches.
    func testMacUnreachableBanner() throws {
        guard FileManager.default.contents(atPath: "/tmp/ub-web-down") != nil else {
            throw XCTSkip("/tmp/ub-web-down missing — only valid while the gate holds the web service down")
        }
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            launch(app, appearance: appearance)
            XCTAssertTrue(
                app.staticTexts["Mac unreachable"].waitForExistence(timeout: 25)
                    || app.staticTexts["Agent runtime is down on your Mac"].waitForExistence(timeout: 5),
                "readiness banner never appeared")
            shot("bots-unreachable-\(suffix(app, appearance: appearance, typeSize: nil))")
            app.terminate()
        }
    }

    /// No-network banner: UB_OFFLINE pins the path monitor unsatisfied, so
    /// the paired app lands on the cached-read view with the offline copy.
    func testOfflineBanner() throws {
        guard FileManager.default.contents(atPath: pairFilePath) != nil else {
            throw XCTSkip("\(pairFilePath) missing — drive this test through scripts/ios-pairing-gate.sh")
        }
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            launch(app, appearance: appearance, offline: true)
            XCTAssertTrue(
                app.staticTexts["You're offline — showing cached data"].waitForExistence(timeout: 25),
                "offline banner never appeared")
            shot("bots-offline-\(suffix(app, appearance: appearance, typeSize: nil))")
            app.terminate()
        }
    }

    /// Runtime-down banner: the gate kills eve (:4321) but leaves the web
    /// service up, so `/api/status` answers with the probe failed and the
    /// chat-down copy shows. The paired app is left on the sim from leg C.
    func testRuntimeDownBanner() throws {
        guard FileManager.default.contents(atPath: "/tmp/ub-eve-down") != nil else {
            throw XCTSkip("/tmp/ub-eve-down missing — only valid while the gate holds eve down")
        }
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            launch(app, appearance: appearance)
            XCTAssertTrue(
                app.staticTexts["Agent runtime is down on your Mac"].waitForExistence(timeout: 25),
                "runtime-down banner never appeared")
            shot("bots-runtime-down-\(suffix(app, appearance: appearance, typeSize: nil))")
            app.terminate()
        }
    }

    /// Failed manual connect: a refused loopback port fails the session
    /// exchange fast, landing the error copy on the status line.
    func testConnectFailedBothAppearances() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            launch(app, appearance: appearance, reset: true)
            XCTAssertTrue(app.textFields["Mac address"].waitForExistence(timeout: 15))
            type(app, app.textFields["Mac address"], "http://127.0.0.1:1")
            type(app, app.secureTextFields["Pairing token"], "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
            app.buttons["Connect"].tap()
            // The failure copy differs per failure mode; poll the status
            // label until it leaves idle/connecting, then shoot the error.
            let status = app.staticTexts["pairing-status"]
            let deadline = Date().addingTimeInterval(20)
            while Date() < deadline {
                if status.exists {
                    let label = status.label
                    if label != "Connecting to your Mac"
                        && label != "Point the camera at the code on your Mac" { break }
                }
                usleep(300_000)
            }
            XCTAssertTrue(status.exists)
            shot("pairing-connect-failed-\(suffix(app, appearance: appearance, typeSize: nil))")
            app.terminate()
        }
    }

    /// Success line: "Connected to <name>" is a 600 ms transient by design,
    /// faster than XCTest polls. UB_HOLD_CONNECTED stretches the hold to 8 s
    /// so the state is capturable; each run pairs fresh against the live
    /// credential, so it needs the live token like every pairing leg.
    func testConnectedPairScreen() throws {
        guard FileManager.default.contents(atPath: pairFilePath) != nil else {
            throw XCTSkip("\(pairFilePath) missing — drive this test through scripts/ios-pairing-gate.sh")
        }
        for appearance in ["light", "dark"] {
            let pair = try pairing()
            let app = XCUIApplication()
            launch(app, appearance: appearance, reset: true, holdConnected: true)
            XCTAssertTrue(app.textFields["Mac address"].waitForExistence(timeout: 15))
            type(app, app.textFields["Mac address"], pair.host)
            type(app, app.secureTextFields["Pairing token"], pair.token)
            var waited = 0.0
            while !app.buttons["Connect"].isEnabled && waited < 3 {
                usleep(250_000)
                waited += 0.25
            }
            if !app.buttons["Connect"].isEnabled {
                type(app, app.secureTextFields["Pairing token"], pair.token)
            }
            tapButton(app, "Connect")
            // The hold is 8 s — poll for the success line and dismiss the
            // keyboard on the way (a blocking wait for non-existence would
            // outlast the hold and shoot the Bots list instead). Manual
            // pairing names the Mac by its host (PairingPayload falls back
            // to host when the QR name is absent), so match the prefix.
            let status = app.staticTexts["pairing-status"]
            let deadline = Date().addingTimeInterval(15)
            var connectedSeen = false
            while Date() < deadline {
                if status.exists, status.label.hasPrefix("Connected to ") {
                    connectedSeen = true
                    break
                }
                if app.keyboards.firstMatch.exists { app.swipeDown() }
                usleep(250_000)
            }
            if !connectedSeen {
                XCTFail("success line never appeared; status='\(status.exists ? status.label : "<none>")'")
                shot("pairing-connected-debug-\(suffix(app, appearance: appearance, typeSize: nil))")
                app.terminate()
                continue
            }
            dismissSystemAlerts(app)
            XCTAssertTrue(status.exists && status.label.hasPrefix("Connected to "),
                          "success line expired before the shot — hold too short")
            shot("pairing-connected-\(suffix(app, appearance: appearance, typeSize: nil))")
            // markPaired lands only after the hold; terminating mid-hold
            // would leave the store unpaired for the revoke/testB legs.
            // Wait for the positive paired-root signal (its nav bar): a
            // nonexistence poll can return on a transient snapshot miss.
            _ = app.navigationBars["Useful Bot"].waitForExistence(timeout: 15)
            app.terminate()
        }
    }

    /// Same success line at XXXL — the spec's accessibility pass applies to
    /// every pairing state, transient included.
    func testConnectedPairScreenAccessibility() throws {
        guard FileManager.default.contents(atPath: pairFilePath) != nil else {
            throw XCTSkip("\(pairFilePath) missing — drive this test through scripts/ios-pairing-gate.sh")
        }
        for appearance in ["light", "dark"] {
            let pair = try pairing()
            let app = XCUIApplication()
            launch(app, appearance: appearance, typeSize: "xxxl", reset: true,
                   holdConnected: true)
            XCTAssertTrue(app.textFields["Mac address"].waitForExistence(timeout: 15))
            type(app, app.textFields["Mac address"], pair.host)
            type(app, app.secureTextFields["Pairing token"], pair.token)
            var waited = 0.0
            while !app.buttons["Connect"].isEnabled && waited < 3 {
                usleep(250_000)
                waited += 0.25
            }
            if !app.buttons["Connect"].isEnabled {
                type(app, app.secureTextFields["Pairing token"], pair.token)
            }
            tapButton(app, "Connect")
            let status = app.staticTexts["pairing-status"]
            let deadline = Date().addingTimeInterval(15)
            var connectedSeen = false
            while Date() < deadline {
                if status.exists, status.label.hasPrefix("Connected to ") {
                    connectedSeen = true
                    break
                }
                if app.keyboards.firstMatch.exists { app.swipeDown() }
                usleep(250_000)
            }
            if !connectedSeen {
                XCTFail("success line never appeared; status='\(status.exists ? status.label : "<none>")'")
                shot("pairing-connected-debug-\(suffix(app, appearance: appearance, typeSize: "xxxl"))")
                app.terminate()
                continue
            }
            dismissSystemAlerts(app)
            XCTAssertTrue(status.exists && status.label.hasPrefix("Connected to "),
                          "success line expired before the shot — hold too short")
            shot("pairing-connected-\(suffix(app, appearance: appearance, typeSize: "xxxl"))")
            // markPaired lands only after the hold; terminating mid-hold
            // would leave the store unpaired for the revoke/testB legs.
            // Wait for the positive paired-root signal (its nav bar): a
            // nonexistence poll can return on a transient snapshot miss.
            _ = app.navigationBars["Useful Bot"].waitForExistence(timeout: 15)
            app.terminate()
        }
    }

    /// Connecting state: a loopback listener that accepts and never answers
    /// holds the exchange open, so the spinner copy is stable. The gate
    /// starts the stub (see ios-pairing-gate.sh); without it this skips.
    func testConnectingBothAppearances() throws {
        guard FileManager.default.contents(atPath: "/tmp/ub-stub-up") != nil else {
            throw XCTSkip("/tmp/ub-stub-up missing — the gate's stall stub is not running")
        }
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            launch(app, appearance: appearance, reset: true)
            XCTAssertTrue(app.textFields["Mac address"].waitForExistence(timeout: 15))
            type(app, app.textFields["Mac address"], "http://127.0.0.1:59999")
            type(app, app.secureTextFields["Pairing token"], "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
            app.buttons["Connect"].tap()
            XCTAssertTrue(
                app.staticTexts["Connecting to your Mac"].waitForExistence(timeout: 15),
                "connecting copy never appeared")
            shot("pairing-connecting-\(suffix(app, appearance: appearance, typeSize: nil))")
            app.terminate()
        }
    }
}
