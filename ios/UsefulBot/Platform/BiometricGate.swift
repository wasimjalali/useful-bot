import LocalAuthentication
import UsefulBotCore

enum BiometricOutcome: Equatable {
    case success
    case cancel
    case passcodeNotSet
    case failed
}

/// Class B is one successful check per foreground activation. Class A never
/// reaches this gate — it goes through OwnerGate's named checks instead.
@MainActor
@Observable
final class BiometricGate {
    private(set) var unlocked = false
    private let evaluate: () async -> BiometricOutcome

    init(evaluate: @escaping () async -> BiometricOutcome = BiometricGate.deviceOwner) {
        self.evaluate = evaluate
    }

    func resetActivation() {
        unlocked = false
    }

    /// Nil means the action may proceed. A string is the inline reason.
    /// Cancel returns nil and leaves the UI where it was.
    func unlockForActivation() async -> String? {
        if unlocked { return nil }
        return await run(setUnlock: true)
    }

    private func run(setUnlock: Bool) async -> String? {
        switch await evaluate() {
        case .success:
            if setUnlock { unlocked = true }
            return nil
        case .cancel:
            return nil
        case .passcodeNotSet:
            return "Set a passcode on this iPhone to approve actions"
        case .failed:
            return "Face ID did not recognize you."
        }
    }

    static func deviceOwner() async -> BiometricOutcome {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            if (error as? LAError)?.code == .passcodeNotSet { return .passcodeNotSet }
            return .failed
        }
        do {
            let ok = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Confirm it's you"
            )
            return ok ? .success : .failed
        } catch let la as LAError {
            switch la.code {
            case .userCancel, .appCancel, .systemCancel: return .cancel
            case .passcodeNotSet: return .passcodeNotSet
            default: return .failed
            }
        } catch {
            return .failed
        }
    }
}
