import XCTest

/// The §17.3 backend gate, UI side: a real pairing over the loopback dev
/// path (§7.3) against the running stack — manual entry, session exchange,
/// sign out, sign in, revocation mid-session, rotation and re-pair.
///
/// The test bundle runs inside the simulator, so host-side credential flips
/// cannot happen mid-test. scripts/ios-pairing-gate.sh drives this class in
/// three legs and runs `setup-local.mjs --revoke-phone/--rotate-phone`
/// between them; the pairing payload arrives as UB_PAIR_PAYLOAD (JSON) in the
/// launch environment. `UB_CAMERA_STATE=denied` puts the manual fields
/// inline; `UB_RESET_PAIRING=1` starts leg A at `unpaired`.
final class PairingFlowUITests: XCTestCase {
    private struct Pairing {
        let host: String
        let token: String
        let name: String
    }

    /// The runner drops the current pairing payload here between legs.
    /// (Environment variables on xcodebuild do not reach a sim-side test
    /// bundle; the simulator shares the host filesystem.)
    private let pairFilePath = "/tmp/ub-pair.json"

    private func pairing() throws -> Pairing {
        guard let data = FileManager.default.contents(atPath: pairFilePath) else {
            throw XCTSkip("\(pairFilePath) missing — drive this test through scripts/ios-pairing-gate.sh")
        }
        struct Raw: Decodable { let v: Int; let host: String; let token: String; let name: String }
        guard let raw = try? JSONDecoder().decode(Raw.self, from: data) else {
            XCTFail("UB_PAIR_PAYLOAD is not the pairing payload shape")
            throw NSError(domain: "test", code: 1)
        }
        return Pairing(host: raw.host, token: raw.token, name: raw.name)
    }

    private func shot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        // The simulator shares the host filesystem: drop the PNG on /tmp so
        // the shot survives Xcode pruning the xcresult. The caller copies
        // them to docs/audit/ios-shots/PR-2/. Flow legs always run the
        // system (light) appearance; tag the width so reruns on a second
        // device do not overwrite the first's shots.
        let app = XCUIApplication()
        let tagged = "\(name)-light-\(Int(app.frame.width.rounded()))"
        let dir = URL(fileURLWithPath: "/tmp/ub-shots", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: dir.appendingPathComponent(tagged + ".png"))
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = tagged
        attachment.lifetime = .keepAlways
        add(attachment)
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
    /// synthesized event, then linger into the shot — answer it directly
    /// (the sheet lives on the app or springboard depending on runtime).
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

    private func launch(_ app: XCUIApplication, reset: Bool) {
        app.launchEnvironment["UB_APPEARANCE"] = "light"
        app.launchEnvironment["UB_CAMERA_STATE"] = "denied"
        if reset { app.launchEnvironment["UB_RESET_PAIRING"] = "1" }
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
    /// Leg A — pair, sign out, sign in. Runs before any credential flip.
    func testA_PairAndSessionLifecycle() throws {
        let pair = try pairing()
        let app = XCUIApplication()
        launch(app, reset: true)

        // Camera-denied pairing screen → inline manual fields → connect.
        XCTAssertTrue(app.textFields["Mac address"].waitForExistence(timeout: 15))
        pairThroughManualEntry(app, pair)

        // The "Connected to <name>" line holds only 600 ms by design — XCTest
        // polls slower than that, so shoot it opportunistically and assert
        // on the Bots list it navigates to. Manual pairing names the Mac by
        // host (PairingPayload falls back when the QR name is absent).
        let status = app.staticTexts["pairing-status"]
        if status.waitForExistence(timeout: 1), status.label.hasPrefix("Connected to ") {
            dismissSystemAlerts(app)
            shot("pairing-connected")
        }
        XCTAssertTrue(app.navigationBars["Useful Bot"].waitForExistence(timeout: 15))
        dismissSystemAlerts(app)
        shot("bots-paired")

        // Devices sheet: the paired record with both clocks. The roster
        // refresh rebuilds the toolbar right after the nav bar appears, so a
        // snapshot can go stale mid-tap (hit point {-1,-1}) — retry the tap.
        for _ in 0..<6 {
            if app.buttons["Done"].exists { break }
            let gear = app.buttons["Devices"]
            if gear.exists { gear.tap() }
            usleep(400_000)
        }
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 10),
                      "Devices sheet never presented")
        XCTAssertTrue(app.staticTexts["This Mac"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Session ends"].exists)
        dismissSystemAlerts(app)
        shot("devices-paired")

        // Sign out (class C) → the signed-out screen.
        tapButton(app, "Sign out on this phone")
        XCTAssertTrue(app.staticTexts["Signed out"].waitForExistence(timeout: 10))
        dismissSystemAlerts(app)
        shot("signed-out")

        // Sign in again (class C) → back to the Bots list.
        tapButton(app, "signed-out-sign-in")
        XCTAssertTrue(app.navigationBars["Useful Bot"].waitForExistence(timeout: 10))
        dismissSystemAlerts(app)
        shot("bots-resigned-in")
    }

    /// Leg B — after the runner revoked the phone credential: relaunch and
    /// the stored token's re-exchange lands in credentialInvalid.
    func testB_RevokedCredentialInvalidates() throws {
        let app = XCUIApplication()
        launch(app, reset: false)
        XCTAssertTrue(
            app.staticTexts["Pair again"].waitForExistence(timeout: 15),
            "revoked credential did not land in credentialInvalid"
        )
        XCTAssertTrue(app.staticTexts["This pairing was revoked or expired. Scan a new code from your Mac."].exists)
        dismissSystemAlerts(app)
        shot("pairing-credential-invalid")
    }

    /// Leg C — after the runner rotated the credential: re-pair with the new
    /// token on the same host (cache kept, spec 4.8) → back to paired.
    func testC_RePairAfterRotation() throws {
        let pair = try pairing()
        let app = XCUIApplication()
        launch(app, reset: false)
        XCTAssertTrue(app.staticTexts["Pair again"].waitForExistence(timeout: 15))
        pairThroughManualEntry(app, pair)
        XCTAssertTrue(app.navigationBars["Useful Bot"].waitForExistence(timeout: 15))
        dismissSystemAlerts(app)
        shot("bots-repaired")
    }
}
