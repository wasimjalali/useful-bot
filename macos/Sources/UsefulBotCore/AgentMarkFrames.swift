import Foundation

// The keyframes behind the agent-working mark (the dots that juggle while the
// agent works). Pure numbers, no SwiftUI, so the loop periods and the
// positions can be unit-tested. The shapes and times come from
// ~/.agents/skills/useful-brand/references/agent-working-motion.md (section 4);
// the view that draws them is `AgentMark` in UsefulBotApp.
//
// A dot is `(x, y, d)` in points from the centre of a 24 x 24 box, y down, d
// the diameter. Where two dots share a coordinate they are fused.

public struct MarkDot: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var d: Double

    public init(_ x: Double, _ y: Double, _ d: Double) {
        self.x = x
        self.y = y
        self.d = d
    }
}

/// What the agent is doing, as far as the mark cares.
public enum AgentMarkPhase: Equatable, Sendable {
    /// Thinking, searching, reading, waiting: the three-dot juggle.
    case thinking
    /// A command is running: the four-dot shear.
    case command
    /// The turn ended: the dots shrink away.
    case done
}

public enum AgentMarkFrames {
    // MARK: Periods (seconds)

    public static let arrivalDuration = 0.66
    public static let thinkingPeriod = 4.62
    public static let commandPeriod = 1.26
    /// The burst that opens the four-dot figure, then its loop starts.
    public static let burstDuration = 0.20
    /// A figure folding into one dot before the next one starts.
    public static let collapseDuration = 0.20
    /// Nothing on screen between a collapse and the next figure: one to two
    /// frames going to four dots, about 200 ms coming back to three.
    public static let gapToCommand = 0.03
    public static let gapToThinking = 0.20
    /// Where the arrival picks up when the three-dot figure comes back after
    /// a command: the one 3.5 pt dot, then the fan.
    public static let fanEntry = 0.48
    public static let completionDuration = 0.05

    /// Three still dots, for Reduce Motion.
    public static let reducedMotion = [MarkDot(-8, 0, 4.5), MarkDot(0, 0, 3), MarkDot(8, 0, 5.5)]

    // MARK: Figures

    /// The loop for a phase at `t` seconds (any t, it wraps). `done` has no loop.
    public static func dots(at t: Double, phase: AgentMarkPhase) -> [MarkDot] {
        switch phase {
        case .thinking: return thinkingLoop(at: t)
        case .command: return commandLoop(at: t)
        case .done: return []
        }
    }

    /// Every turn's first 0.66 s. After it, the three-dot loop.
    public static func arrival(at t: Double) -> [MarkDot] { arrivalTrack.dots(at: t) }

    public static func thinkingLoop(at t: Double) -> [MarkDot] {
        threeTrack.dots(at: wrap(t, thinkingPeriod))
    }

    public static func commandLoop(at t: Double) -> [MarkDot] {
        fourTrack.dots(at: wrap(t, commandPeriod))
    }

    /// The four-dot figure opening: one dot, a tight cluster, the square.
    public static func burst(at t: Double) -> [MarkDot] { burstTrack.dots(at: t) }

    /// A figure folding away: every dot slides to the centre and fuses at
    /// 8 pt, then shrinks to nothing (ease-in). Empty once it is done.
    public static func collapse(from snapshot: [MarkDot], at t: Double) -> [MarkDot] {
        guard !snapshot.isEmpty, t.isFinite, t >= 0, t < collapseDuration else { return [] }
        let converge = collapseDuration * 0.6
        if t < converge {
            let p = Ease.inOut(t / converge)
            return snapshot.map { MarkDot($0.x * (1 - p), $0.y * (1 - p), $0.d + (8 - $0.d) * p) }
        }
        let p = Ease.shrink((t - converge) / (collapseDuration - converge))
        return snapshot.map { _ in MarkDot(0, 0, 8 * (1 - p)) }
    }

    /// The turn ended: shrink to 2 pt and vanish within 50 ms. Nothing is left.
    public static func completion(from snapshot: [MarkDot], at t: Double) -> [MarkDot] {
        guard t.isFinite, t >= 0, t < completionDuration else { return [] }
        let p = Ease.shrink(min(1, t / (completionDuration * 0.8)))
        return snapshot.map { MarkDot($0.x, $0.y, $0.d + (2 - $0.d) * p) }
    }

    // MARK: Keyframe tables (spec section 4)

    private static let row0 = [MarkDot(-8, 0, 4.5), MarkDot(0, 0, 3), MarkDot(8, 0, 5.5)]
    private static let row1 = [MarkDot(-8, 0, 4.5), MarkDot(0, 0, 3), MarkDot(8, 0, 5)]
    /// The four-dot square, top-left, top-right, bottom-left, bottom-right.
    private static let square = [MarkDot(-6, -6, 5), MarkDot(6, -6, 5), MarkDot(-6, 6, 5), MarkDot(6, 6, 5)]

    /// 4.1: one dot at full size (no fade, no scale-in), shrinks, blinks out
    /// for a frame, then fans into the row.
    private static let arrivalTrack = MarkTrack([
        MarkKey(0.00, .linear, [MarkDot(0, 0, 9)]),
        MarkKey(0.07, .linear, [MarkDot(0, 0, 9)]),
        MarkKey(0.31, .inOut, [MarkDot(0, 0, 3.5)]),
        MarkKey(0.43, .linear, [MarkDot(0, 0, 3.5)]),
        // Gone for one frame.
        MarkKey(0.44, .easeIn, []),
        MarkKey(0.48, .linear, [MarkDot(0, 0, 3.5)]),
        MarkKey(0.53, .linear, [MarkDot(-2, 0, 3.5), MarkDot(0, 0, 3), MarkDot(2, 0, 4)]),
        MarkKey(0.66, .out, [MarkDot(-8, 0, 4.5), MarkDot(0, 0, 2.75), MarkDot(8, 0, 5)]),
    ])

    /// 4.2: dots 1, 2, 3 are small, big and middle in the rotating triangle,
    /// so identity follows the dot, not the slot, from 0.85 to 1.71.
    private static let threeTrack = MarkTrack([
        // Phrase 1, juggle.
        MarkKey(0.00, .linear, row0),
        MarkKey(0.50, .linear, row0),
        MarkKey(0.63, .smooth, [MarkDot(-6, 0, 4.5), MarkDot(-2, 0, 3), MarkDot(8, 0, 5.5)]),
        MarkKey(0.74, .smooth, [MarkDot(0, 0, 4.5), MarkDot(1.5, 0, 4.5), MarkDot(8, 0, 5.5)]),
        MarkKey(0.85, .out, [MarkDot(-5, -3, 3), MarkDot(1, 3, 6.5), MarkDot(7, -3, 4)]),
        MarkKey(1.10, .smooth, [MarkDot(-1, -5, 3), MarkDot(-4, 3, 6.5), MarkDot(6, 0, 4)]),
        MarkKey(1.35, .smooth, [MarkDot(4, -5, 3), MarkDot(-6, 2, 6.5), MarkDot(1, 3, 4)]),
        MarkKey(1.60, .smooth, [MarkDot(7, -2, 3), MarkDot(-8, 1, 6.5), MarkDot(-1, 0, 4)]),
        // Landed: the big dot is now on the left.
        MarkKey(1.71, .smooth, [MarkDot(0, 0, 3), MarkDot(-8, 0, 6), MarkDot(8, 0, 4)]),
        MarkKey(1.78, .linear, [MarkDot(0, 0, 3), MarkDot(-8, 0, 6), MarkDot(8, 0, 4)]),
        // Quick swap: dots 1 and 2 fuse and split, order swapped.
        MarkKey(1.93, .inOut, [MarkDot(-2, 0, 4.5), MarkDot(-3, 0, 4.5), MarkDot(8, 0, 4)]),
        MarkKey(2.03, .out, [MarkDot(-8, 0, 3), MarkDot(0, 0, 6), MarkDot(8, 0, 4)]),
        MarkKey(2.33, .linear, [MarkDot(-8, 0, 3), MarkDot(0, 0, 6), MarkDot(8, 0, 4)]),
        // Second swap: the pair fuses and goes on into the gather.
        MarkKey(2.45, .inOut, [MarkDot(-3, 0, 4.5), MarkDot(-2, 0, 4.5), MarkDot(8, 0, 4)]),
        MarkKey(2.59, .inOut, [MarkDot(0, 0, 8.5)]),
        MarkKey(2.78, .easeIn, []),
        MarkKey(2.83, .linear, [MarkDot(0, 0, 2.5)]),
        // Phrase 2, breathe.
        MarkKey(3.08, .out, row1),
        MarkKey(3.50, .linear, row1),
        MarkKey(3.58, .inOut, [MarkDot(-2, 0, 5), MarkDot(2, 0, 5.5), MarkDot(9, 0, 4)]),
        MarkKey(3.72, .linear, [MarkDot(-2, 0, 5), MarkDot(2, 0, 5.5), MarkDot(9, 0, 4)]),
        MarkKey(3.84, .out, row1),
        MarkKey(4.20, .linear, row1),
        MarkKey(4.29, .smooth, [MarkDot(-3, 0, 4.5), MarkDot(0, 0, 3), MarkDot(3, 0, 5)]),
        MarkKey(4.32, .smooth, [MarkDot(0, 0, 8)]),
        MarkKey(4.35, .linear, [MarkDot(0, 0, 8)]),
        MarkKey(4.54, .easeIn, []),
        MarkKey(4.58, .linear, [MarkDot(0, 0, 2.5)]),
        MarkKey(4.62, .out, row0),
    ])

    /// 4.3 burst in: one dot, a tight 2 x 2 cluster, then the square.
    private static let burstTrack = MarkTrack([
        MarkKey(0.00, .linear, [MarkDot(0, 0, 7)]),
        MarkKey(0.07, .out, [MarkDot(-1.5, -1.5, 5), MarkDot(1.5, -1.5, 5), MarkDot(-1.5, 1.5, 5), MarkDot(1.5, 1.5, 5)]),
        MarkKey(0.20, .out, square),
    ])

    /// 4.3 loop: two shears, "/" then "\", each 0.33 s of motion and a 0.30 s
    /// hold on the square. The mirror shear is the first shifted by half a
    /// period (0.63 s), the spacing the capture measured between diagonals;
    /// the spec's table lists its diagonal and fused pair at 0.63 and 0.72,
    /// which would make the two shears uneven.
    private static let fourTrack = MarkTrack([
        MarkKey(0.00, .linear, square),
        MarkKey(0.09, .smooth, [MarkDot(2.5, -2.5, 5), MarkDot(7, -7, 5), MarkDot(-7, 7, 5), MarkDot(-2.5, 2.5, 5)]),
        MarkKey(0.17, .smooth, [MarkDot(3, -6, 5), MarkDot(8, -6, 5), MarkDot(-8, 6, 5), MarkDot(-3, 6, 5)]),
        MarkKey(0.33, .smooth, square),
        MarkKey(0.63, .linear, square),
        MarkKey(0.72, .smooth, [MarkDot(-7, -7, 5), MarkDot(-2.5, -2.5, 5), MarkDot(2.5, 2.5, 5), MarkDot(7, 7, 5)]),
        MarkKey(0.80, .smooth, [MarkDot(-8, -6, 5), MarkDot(-3, -6, 5), MarkDot(3, 6, 5), MarkDot(8, 6, 5)]),
        MarkKey(0.96, .smooth, square),
        MarkKey(1.26, .linear, square),
    ])

    private static func wrap(_ t: Double, _ period: Double) -> Double {
        guard t.isFinite, t > 0 else { return 0 }
        return t.truncatingRemainder(dividingBy: period)
    }
}

// MARK: - Sequencer

/// Which figure the mark is in, and how it got there. One per mark. The
/// arrival, the collapse between figures and the completion all start from
/// "now", so the sequencer holds the moment each began; `dots(at:)` then
/// needs nothing but the clock. The label swaps on its own clock and never
/// reaches this: the dots do not reset when the label changes.
public struct AgentMarkSequencer: Equatable, Sendable {
    enum Stage: Equatable, Sendable {
        /// The turn's arrival, then the three-dot loop.
        case arrival
        /// The three-dot figure coming back after a command (4.4).
        case fan
        /// The four-dot burst, then its loop.
        case burst
        /// A loop from the shared clock, no entry (a sidebar row).
        case loop(AgentMarkPhase)
        /// Fold the figure that was showing, then enter `to`.
        case collapse(from: [MarkDot], to: AgentMarkPhase)
        case done(from: [MarkDot])
    }

    private(set) var stage: Stage
    private var stageStart: Double
    public private(set) var phase: AgentMarkPhase

    /// `arrives`: the turn's arrival first (a chat's working row). Without it
    /// the mark loops from the clock, so every sidebar mark stays in step.
    public init(start: Double, phase: AgentMarkPhase = .thinking, arrives: Bool = true) {
        self.phase = phase
        stageStart = start
        switch (arrives, phase) {
        case (_, .done): stage = .done(from: [])
        case (true, .thinking): stage = .arrival
        case (true, .command): stage = .burst
        case (false, _): stage = .loop(phase)
        }
    }

    /// The phase changed at `now`.
    public mutating func set(_ next: AgentMarkPhase, at now: Double) {
        guard next != phase else { return }
        let showing = dots(at: now)
        phase = next
        stageStart = now
        switch next {
        case .done: stage = .done(from: showing)
        case .thinking, .command: stage = .collapse(from: showing, to: next)
        }
    }

    public func dots(at now: Double) -> [MarkDot] {
        let t = now - stageStart
        guard t.isFinite, t >= 0 else { return [] }
        switch stage {
        case .arrival:
            if t < AgentMarkFrames.arrivalDuration { return AgentMarkFrames.arrival(at: t) }
            return AgentMarkFrames.thinkingLoop(at: t - AgentMarkFrames.arrivalDuration)
        case .fan:
            return Self.fan(t)
        case .burst:
            return Self.burst(t)
        case .loop(let phase):
            return AgentMarkFrames.dots(at: now, phase: phase)
        case .collapse(let snapshot, let to):
            if t < AgentMarkFrames.collapseDuration { return AgentMarkFrames.collapse(from: snapshot, at: t) }
            let gap = to == .command ? AgentMarkFrames.gapToCommand : AgentMarkFrames.gapToThinking
            let s = t - AgentMarkFrames.collapseDuration - gap
            if s < 0 { return [] }
            return to == .command ? Self.burst(s) : Self.fan(s)
        case .done(let snapshot):
            return AgentMarkFrames.completion(from: snapshot, at: t)
        }
    }

    private static func burst(_ s: Double) -> [MarkDot] {
        if s < AgentMarkFrames.burstDuration { return AgentMarkFrames.burst(at: s) }
        return AgentMarkFrames.commandLoop(at: s - AgentMarkFrames.burstDuration)
    }

    private static func fan(_ s: Double) -> [MarkDot] {
        let at = AgentMarkFrames.fanEntry + s
        if at < AgentMarkFrames.arrivalDuration { return AgentMarkFrames.arrival(at: at) }
        return AgentMarkFrames.thinkingLoop(at: at - AgentMarkFrames.arrivalDuration)
    }
}

// MARK: - Shimmer

/// The light sweep across an in-progress label (spec section 5). The numbers
/// live here so the view and the tests read the same ones.
public enum AgentShimmer {
    public static let bandWidth = 130.0
    /// Points per second.
    public static let speed = 485.0
    /// Seconds between sweeps while a label stays up.
    public static let period = 3.0
    /// The first sweep starts this long after a label appears.
    public static let firstDelay = 0.7
    /// The timer shows once the row has been live this long.
    public static let timerAfter = 5

    /// How long one sweep takes across a label of `width`.
    public static func sweepDuration(width: Double) -> Double { (max(0, width) + bandWidth) / speed }

    /// Where the band's centre is `elapsed` seconds after the label appeared,
    /// measured from the label's left edge, or nil between sweeps.
    public static func bandCentre(elapsed: Double, width: Double) -> Double? {
        let e = elapsed - firstDelay
        guard e.isFinite, e >= 0 else { return nil }
        let cycle = e.truncatingRemainder(dividingBy: period)
        guard cycle < sweepDuration(width: width) else { return nil }
        return -bandWidth / 2 + cycle * speed
    }

    /// The first label shows a beat after the mark arrives, so the row is
    /// never a bare dot for long.
    public static let firstLabelDelay = 0.6
}

// MARK: - Keyframes and easing

enum MarkEase: Sendable {
    case linear
    /// Symmetric ease-in-out, for loop moves.
    case inOut
    /// The brand curve, for arrivals.
    case out
    /// For shrinks that end in a vanish.
    case easeIn
    /// A cubic Hermite through neighbouring keys, so a run of keys moves as one gesture
    /// instead of stopping at each. Zero speed at a rest (a key equal to its neighbour).
    case smooth
}

enum Ease {
    static func inOut(_ p: Double) -> Double { bezier(0.45, 0, 0.55, 1, clamp(p)) }
    static func out(_ p: Double) -> Double { bezier(0.22, 1, 0.36, 1, clamp(p)) }
    static func shrink(_ p: Double) -> Double { bezier(0.32, 0, 0.67, 0, clamp(p)) }

    static func apply(_ ease: MarkEase, _ p: Double) -> Double {
        switch ease {
        case .linear, .smooth: return clamp(p)
        case .inOut: return inOut(p)
        case .out: return out(p)
        case .easeIn: return shrink(p)
        }
    }

    private static func clamp(_ p: Double) -> Double { min(1, max(0, p)) }

    /// CSS `cubic-bezier(x1, y1, x2, y2)` at time fraction `p`.
    static func bezier(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ p: Double) -> Double {
        if p <= 0 { return 0 }
        if p >= 1 { return 1 }
        var low = 0.0, high = 1.0
        for _ in 0..<24 {
            let t = (low + high) / 2
            let i = 1 - t
            let x = 3 * i * i * t * x1 + 3 * i * t * t * x2 + t * t * t
            if x < p { low = t } else { high = t }
        }
        let t = (low + high) / 2
        let i = 1 - t
        return 3 * i * i * t * y1 + 3 * i * t * t * y2 + t * t * t
    }
}

/// A keyframe: the dots at `t`, reached from the previous key with `ease`.
/// No dots at all means "gone": a figure shrinking into it vanishes, and one
/// leaving it pops in at the next key.
struct MarkKey: Sendable {
    let t: Double
    var dots: [MarkDot]
    let ease: MarkEase

    init(_ t: Double, _ ease: MarkEase, _ dots: [MarkDot]) {
        self.t = t
        self.ease = ease
        self.dots = dots
    }
}

struct MarkTrack: Sendable {
    let keys: [MarkKey]

    /// Every key gets the same number of dots, the extras sitting on the
    /// first one, so a fused blob can split into three and three can gather
    /// into one without a dot appearing from nowhere.
    init(_ keys: [MarkKey]) {
        let count = keys.map(\.dots.count).max() ?? 0
        self.keys = keys.map { key in
            guard let first = key.dots.first, key.dots.count < count else { return key }
            var padded = key
            padded.dots += Array(repeating: first, count: count - key.dots.count)
            return padded
        }
    }

    func dots(at t: Double) -> [MarkDot] {
        guard let first = keys.first, let last = keys.last else { return [] }
        if !(t > first.t) { return first.dots }
        if t >= last.t { return last.dots }
        var i = 0
        while i + 2 < keys.count, keys[i + 1].t <= t { i += 1 }
        let a = keys[i], b = keys[i + 1]
        let p = (t - a.t) / (b.t - a.t)
        if a.dots.isEmpty { return [] }
        if b.dots.isEmpty {
            let w = Ease.apply(b.ease == .smooth ? .easeIn : b.ease, p)
            return a.dots.map { MarkDot($0.x, $0.y, $0.d * (1 - w)) }
        }
        if b.ease == .smooth { return hermite(i, p) }
        let w = Ease.apply(b.ease, p)
        return zip(a.dots, b.dots).map { x, y in
            MarkDot(x.x + (y.x - x.x) * w, x.y + (y.y - x.y) * w, max(0, x.d + (y.d - x.d) * w))
        }
    }

    private func hermite(_ i: Int, _ u: Double) -> [MarkDot] {
        let a = keys[i], b = keys[i + 1]
        let h = b.t - a.t
        let u2 = u * u, u3 = u2 * u
        let h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u
        let h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
        let m0 = tangents(at: i), m1 = tangents(at: i + 1)
        func value(_ p0: Double, _ p1: Double, _ s0: Double, _ s1: Double) -> Double {
            h00 * p0 + h10 * h * s0 + h01 * p1 + h11 * h * s1
        }
        return a.dots.indices.map { n in
            MarkDot(
                value(a.dots[n].x, b.dots[n].x, m0[n].x, m1[n].x),
                value(a.dots[n].y, b.dots[n].y, m0[n].y, m1[n].y),
                max(0, value(a.dots[n].d, b.dots[n].d, m0[n].d, m1[n].d))
            )
        }
    }

    /// Speed of each dot through key `i`: the chord between its neighbours,
    /// or zero at a rest, at the ends and next to a gap.
    private func tangents(at i: Int) -> [MarkDot] {
        let here = keys[i]
        let still = here.dots.map { _ in MarkDot(0, 0, 0) }
        guard i > 0, i + 1 < keys.count else { return still }
        let before = keys[i - 1], after = keys[i + 1]
        if before.dots.isEmpty || after.dots.isEmpty { return still }
        if before.dots == here.dots || after.dots == here.dots { return still }
        let span = after.t - before.t
        return here.dots.indices.map { n in
            MarkDot(
                (after.dots[n].x - before.dots[n].x) / span,
                (after.dots[n].y - before.dots[n].y) / span,
                (after.dots[n].d - before.dots[n].d) / span
            )
        }
    }
}
