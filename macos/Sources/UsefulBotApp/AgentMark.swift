import SwiftUI
import UsefulBotCore

/// The mark that shows the agent is working: a few round dots that juggle,
/// merge and split. The keyframes are `AgentMarkFrames`; this draws them.
/// Spec: ~/.agents/skills/useful-brand/references/agent-working-motion.md.
///
/// - `phase` picks the figure: three dots (thinking), four (a command), or
///   the shrink-away when the turn is done.
/// - `scale` is 1 in the chat's working row and 0.6 in a sidebar row. Sizes,
///   offsets and the fuse blur all scale with it.
/// - `arrives` runs the turn's arrival first. A sidebar mark skips it and
///   loops from the shared clock, so every mark in the app stays in step.
struct AgentMark: View {
    var phase: AgentMarkPhase = .thinking
    var scale: CGFloat = 1
    var arrives = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var clock: MarkClock
    /// Off screen the timeline stops, so a list full of marks costs only the
    /// rows in view.
    @State private var visible = true

    /// The box every figure fits in, in points at scale 1.
    static let box: CGFloat = 24

    init(phase: AgentMarkPhase = .thinking, scale: CGFloat = 1, arrives: Bool = true) {
        self.phase = phase
        self.scale = scale
        self.arrives = arrives
        _clock = State(initialValue: MarkClock(phase: phase, arrives: arrives))
    }

    var body: some View {
        TimelineView(.animation(paused: reduceMotion || !visible)) { timeline in
            let dots = frame(at: timeline.date.timeIntervalSinceReferenceDate)
            Canvas { context, size in
                Self.draw(dots, in: &context, size: size, scale: scale, ink: ink)
            }
            .frame(width: Self.box * scale, height: Self.box * scale)
        }
        .frame(width: Self.box * scale, height: Self.box * scale)
        .onChange(of: phase) { _, next in
            clock.sequencer.set(next, at: Date.now.timeIntervalSinceReferenceDate)
        }
        .onAppear { visible = true }
        .onDisappear { visible = false }
        .accessibilityHidden(true)
    }

    private func frame(at now: Double) -> [MarkDot] {
        // Reduce Motion: three still dots, whatever the figure; gone when done.
        if reduceMotion { return phase == .done ? [] : AgentMarkFrames.reducedMotion }
        return clock.sequencer.dots(at: now)
    }

    /// The ink token, resolved here: the filter below takes one fixed colour.
    private var ink: Color {
        Theme.color(colorScheme == .dark ? DesignTokens.DarkHex.ink : DesignTokens.Hex.ink)
    }

    /// The fuse filter: blur the dots, then threshold the alpha, so dots that
    /// overlap join into one round blob and pull apart again.
    ///
    /// Brand-law sweep exception: this is the one `blur` in the app that is
    /// not decoration. It is never seen; it only shapes the silhouette, and
    /// the threshold turns every edge back into solid ink. It runs on this
    /// mark's own 24 x 24 pt canvas and nothing else. The blur scales with the
    /// mark (0.6 in the sidebar), so a 1.5 pt dot still clears the threshold.
    static func draw(_ dots: [MarkDot], in context: inout GraphicsContext, size: CGSize, scale: CGFloat, ink: Color) {
        // Filters run last-added first: blur, then threshold.
        context.addFilter(.alphaThreshold(min: fuseThreshold, color: ink))
        context.addFilter(.blur(radius: fuseBlur * scale))
        context.drawLayer { layer in
            for dot in dots where dot.d > 0 {
                let d = CGFloat(dot.d) * scale
                let rect = CGRect(
                    x: size.width / 2 + CGFloat(dot.x) * scale - d / 2,
                    y: size.height / 2 + CGFloat(dot.y) * scale - d / 2,
                    width: d,
                    height: d
                )
                layer.fill(Path(ellipseIn: rect), with: .color(.black))
            }
        }
    }

    static let fuseBlur: CGFloat = 1.0
    static let fuseThreshold: CGFloat = 0.4
}

/// One mark's sequencer. A class so the phase can change from `onChange`
/// without a state write that redraws the row; the timeline redraws it anyway.
final class MarkClock {
    var sequencer: AgentMarkSequencer

    init(phase: AgentMarkPhase, arrives: Bool) {
        sequencer = AgentMarkSequencer(
            start: Date.now.timeIntervalSinceReferenceDate,
            phase: phase,
            arrives: arrives
        )
    }
}
