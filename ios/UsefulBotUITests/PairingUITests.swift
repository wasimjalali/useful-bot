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
        if let typeSize {
            app.launchEnvironment["UB_TYPE_SIZE"] = typeSize
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
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
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
        app.textFields["Mac address"].tap()
        app.textFields["Mac address"].typeText("example.internal")
        XCTAssertFalse(app.buttons["Connect"].isEnabled)
    }

    func testPairingLight() { pairingShots(appearance: "light") }
    func testPairingDark() { pairingShots(appearance: "dark") }
    func testPairingAccessibilityLight() {
        pairingShots(appearance: "light", typeSize: "xxxl")
    }
    func testPairingAccessibilityDark() {
        pairingShots(appearance: "dark", typeSize: "xxxl")
    }
}
