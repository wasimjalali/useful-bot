import XCTest

/// Visual-gate driver for PR-1: launches the app in each required appearance
/// and size, exercises the one navigation pairing has, and attaches a
/// screenshot per state to the test run for `docs/audit/ios-shots/`.
///
/// Screenshot names follow `<screen>-<state>-<light|dark>`; non-390 pt
/// devices carry their width (`-375`), and the accessibility type-size runs
/// carry `-xxxl`.
final class PairingUITests: XCTestCase {
    private func launch(appearance: String, typeSize: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["UB_APPEARANCE"] = appearance
        // Pairing screens are the subject, whatever the device remembers.
        app.launchEnvironment["UB_RESET_PAIRING"] = "1"
        if let typeSize {
            app.launchEnvironment["UB_TYPE_SIZE"] = typeSize
        }
        // System alerts that slip through (Keychain "Save Password", camera
        // consent) must not wedge a leg — answer them and carry on.
        addUIInterruptionMonitor(withDescription: "system alerts") { alert in
            for label in ["Not Now", "Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
        app.launch()
        return app
    }

    /// `-390` is the default-size tag's home; other widths carry their width.
    /// The app under test's frame reports the device points width — the test
    /// runner's own `UIScreen` does not.
    private func suffix(appearance: String, typeSize: String?, app: XCUIApplication) -> String {
        let width = Int(app.frame.width.rounded())
        var name = appearance
        if width != 390 { name += "-\(width)" }
        if typeSize != nil { name += "-xxxl" }
        return name
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

    /// The full pairing pass: empty state, then the manual-entry push with
    /// its disabled Connect.
    private func pairingShots(appearance: String, typeSize: String? = nil) {
        let app = launch(appearance: appearance, typeSize: typeSize)
        XCTAssertTrue(app.staticTexts["Connect to your Mac"].waitForExistence(timeout: 10))
        let suffix = suffix(appearance: appearance, typeSize: typeSize, app: app)
        XCTAssertTrue(app.staticTexts["On your Mac, open Settings, then Devices."].exists)
        XCTAssertTrue(app.buttons["Enter manually"].exists)
        shot("pairing-empty-\(suffix)")

        app.buttons["Enter manually"].tap()
        XCTAssertTrue(app.textFields["Mac address"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["Pairing token"].exists)
        XCTAssertFalse(app.buttons["Connect"].isEnabled)
        shot("pairing-manual-\(suffix)")

        // Connect stays disabled until both fields hold text (design 1.1).
        // The focused field shows its ink edge and 3 pt ring; the filled
        // fields enable Connect with the keyboard still up.
        app.textFields["Mac address"].tap()
        shot("pairing-manual-focused-\(suffix)")
        app.typeText("example.internal")
        XCTAssertFalse(app.buttons["Connect"].isEnabled)
        app.secureTextFields["Pairing token"].tap()
        app.typeText("ub_pair_token_test")
        XCTAssertTrue(app.buttons["Connect"].isEnabled)
        shot("pairing-manual-ready-\(suffix)")
    }

    func testPairingLight() { pairingShots(appearance: "light") }
    func testPairingDark() { pairingShots(appearance: "dark") }
    func testPairingAccessibilityLight() {
        pairingShots(appearance: "light", typeSize: "xxxl")
    }
    func testPairingAccessibilityDark() {
        pairingShots(appearance: "dark", typeSize: "xxxl")
    }

    /// Camera denied (design 1.1): the scanner square becomes the sunken
    /// "Camera access is off" block with Open Settings, and the manual fields
    /// come inline — no sheet, no push. `UB_CAMERA_STATE` pins the status.
    private func cameraDeniedShots(appearance: String) {
        let app = XCUIApplication()
        app.launchEnvironment["UB_APPEARANCE"] = appearance
        app.launchEnvironment["UB_CAMERA_STATE"] = "denied"
        app.launchEnvironment["UB_RESET_PAIRING"] = "1"
        app.launch()
        XCTAssertTrue(app.staticTexts["Camera access is off"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Open Settings"].exists)
        // Manual fields inline, not behind another tap.
        XCTAssertTrue(app.textFields["Mac address"].exists)
        XCTAssertTrue(app.secureTextFields["Pairing token"].exists)
        shot("pairing-camera-denied-\(suffix(appearance: appearance, typeSize: nil, app: app))")
    }

    func testPairingCameraDeniedLight() { cameraDeniedShots(appearance: "light") }
    func testPairingCameraDeniedDark() { cameraDeniedShots(appearance: "dark") }
}
