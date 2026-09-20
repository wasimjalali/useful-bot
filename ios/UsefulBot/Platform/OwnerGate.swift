import Foundation
import LocalAuthentication

/// The §4.4 gate: one `evaluatePolicy(.deviceOwnerAuthentication)` —
/// biometrics with passcode fallback — immediately before a class-A action
/// is sent. Cancel or failure means the UI returns to its pre-confirm state
/// and no server call is made. The server is never told about biometrics.
enum OwnerGate {
    /// Runs one evaluation. `reason` is the sheet's explanation, shown under
    /// the title; keep it action-specific.
    static func evaluate(reason: String) async -> Bool {
        let context = LAContext()
        var failure: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &failure) else {
            return false
        }
        return (try? await context.evaluatePolicy(
            .deviceOwnerAuthentication,
            localizedReason: reason
        )) ?? false
    }
}
