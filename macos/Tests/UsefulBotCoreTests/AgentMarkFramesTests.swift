import Foundation
import Testing
@testable import UsefulBotCore

/// The agent-working mark's keyframes, against the tables in
/// ~/.agents/skills/useful-brand/references/agent-working-motion.md.
@Suite struct AgentMarkFramesTests {
    private func same(_ a: [MarkDot], _ b: [MarkDot], tolerance: Double = 0.001) -> Bool {
        a.count == b.count && zip(a, b).allSatisfy {
            abs($0.x - $1.x) < tolerance && abs($0.y - $1.y) < tolerance && abs($0.d - $1.d) < tolerance
        }
    }

    private func dots(_ values: [(Double, Double, Double)]) -> [MarkDot] {
        values.map { MarkDot($0.0, $0.1, $0.2) }
    }

    // MARK: Periods

    @Test func loopsRepeatExactlyEveryPeriod() {
        for t in stride(from: 0.0, to: 4.62, by: 0.037) {
            #expect(same(AgentMarkFrames.thinkingLoop(at: t), AgentMarkFrames.thinkingLoop(at: t + 4.62)))
            #expect(same(AgentMarkFrames.thinkingLoop(at: t), AgentMarkFrames.thinkingLoop(at: t + 9.24)))
        }
        for t in stride(from: 0.0, to: 1.26, by: 0.011) {
            #expect(same(AgentMarkFrames.commandLoop(at: t), AgentMarkFrames.commandLoop(at: t + 1.26)))
        }
        #expect(AgentMarkFrames.thinkingPeriod == 4.62)
        #expect(AgentMarkFrames.commandPeriod == 1.26)
        #expect(AgentMarkFrames.arrivalDuration == 0.66)
    }

    @Test func loopsRestartWhereTheyEnd() {
        // 4.62 s lands on the row 0.00 starts from, 1.26 s on the square.
        #expect(same(AgentMarkFrames.thinkingLoop(at: 4.62), AgentMarkFrames.thinkingLoop(at: 0)))
        #expect(same(AgentMarkFrames.commandLoop(at: 1.26), AgentMarkFrames.commandLoop(at: 0)))
        // No jump across the seam: the last frame before it is the row fanning in.
        let before = AgentMarkFrames.thinkingLoop(at: 4.619)
        let after = AgentMarkFrames.thinkingLoop(at: 0)
        #expect(zip(before, after).allSatisfy { abs($0.x - $1.x) < 0.5 && abs($0.d - $1.d) < 0.5 })
    }

    // MARK: Arrival (4.1)

    @Test func arrivalFollowsTheTable() {
        #expect(same(AgentMarkFrames.arrival(at: 0), dots([(0, 0, 9), (0, 0, 9), (0, 0, 9)])))
        #expect(same(AgentMarkFrames.arrival(at: 0.07), dots([(0, 0, 9), (0, 0, 9), (0, 0, 9)])))
        #expect(same(AgentMarkFrames.arrival(at: 0.31), dots([(0, 0, 3.5), (0, 0, 3.5), (0, 0, 3.5)])))
        #expect(AgentMarkFrames.arrival(at: 0.44).isEmpty)
        #expect(AgentMarkFrames.arrival(at: 0.46).isEmpty)
        #expect(same(AgentMarkFrames.arrival(at: 0.48), dots([(0, 0, 3.5), (0, 0, 3.5), (0, 0, 3.5)])))
        #expect(same(AgentMarkFrames.arrival(at: 0.53), dots([(-2, 0, 3.5), (0, 0, 3), (2, 0, 4)])))
        #expect(same(AgentMarkFrames.arrival(at: 0.66), dots([(-8, 0, 4.5), (0, 0, 2.75), (8, 0, 5)])))
    }

    @Test func arrivalShrinksWithoutFadingIn() {
        // Full size in the first frame, never smaller on the way in.
        #expect(AgentMarkFrames.arrival(at: 0).allSatisfy { $0.d == 9 })
        var last = 9.0
        for t in stride(from: 0.0, through: 0.31, by: 0.01) {
            let d = AgentMarkFrames.arrival(at: t)[0].d
            #expect(d <= last + 0.0001)
            last = d
        }
    }

    // MARK: Three-dot loop (4.2)

    @Test func threeDotLoopFollowsTheTable() {
        let f = AgentMarkFrames.thinkingLoop(at:)
        #expect(same(f(0), dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5.5)])))
        // Holds the row for about half a second.
        #expect(same(f(0.4), f(0)))
        #expect(same(f(0.74), dots([(0, 0, 4.5), (1.5, 0, 4.5), (8, 0, 5.5)])))
        #expect(same(f(0.85), dots([(-5, -3, 3), (1, 3, 6.5), (7, -3, 4)])))
        #expect(same(f(1.10), dots([(-1, -5, 3), (-4, 3, 6.5), (6, 0, 4)])))
        #expect(same(f(1.35), dots([(4, -5, 3), (-6, 2, 6.5), (1, 3, 4)])))
        #expect(same(f(2.59), dots([(0, 0, 8.5), (0, 0, 8.5), (0, 0, 8.5)])))
        #expect(f(2.78).isEmpty)
        #expect(same(f(2.83), dots([(0, 0, 2.5), (0, 0, 2.5), (0, 0, 2.5)])))
        #expect(same(f(3.08), dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5)])))
        #expect(same(f(3.58), dots([(-2, 0, 5), (2, 0, 5.5), (9, 0, 4)])))
        #expect(same(f(3.84), dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5)])))
        #expect(same(f(4.32), dots([(0, 0, 8), (0, 0, 8), (0, 0, 8)])))
        #expect(f(4.54).isEmpty)
        #expect(f(4.56).isEmpty)
        #expect(same(f(4.58), dots([(0, 0, 2.5), (0, 0, 2.5), (0, 0, 2.5)])))
    }

    @Test func tripleSpreadsToEightPointsTallAndFusesIntoOneBlob() {
        let spread = (0..<462).map { AgentMarkFrames.thinkingLoop(at: Double($0) * 0.01) }
            .map { dots in dots.map(\.y).max().map { top in top - (dots.map(\.y).min() ?? 0) } ?? 0 }
            .max() ?? 0
        // Dot centres run from y -5 to +3 in the triangle.
        // Spline overshoot of a tenth of a point at most.
        #expect(spread <= 8.2)
        #expect(spread > 7)
    }

    // MARK: Four-dot figure (4.3)

    @Test func burstFollowsTheTable() {
        let f = AgentMarkFrames.burst(at:)
        #expect(same(f(0), dots([(0, 0, 7), (0, 0, 7), (0, 0, 7), (0, 0, 7)])))
        #expect(same(f(0.07), dots([(-1.5, -1.5, 5), (1.5, -1.5, 5), (-1.5, 1.5, 5), (1.5, 1.5, 5)])))
        #expect(same(f(0.20), dots([(-6, -6, 5), (6, -6, 5), (-6, 6, 5), (6, 6, 5)])))
    }

    @Test func fourDotLoopFollowsTheTable() {
        let f = AgentMarkFrames.commandLoop(at:)
        let square = dots([(-6, -6, 5), (6, -6, 5), (-6, 6, 5), (6, 6, 5)])
        #expect(same(f(0), square))
        #expect(same(f(0.09), dots([(2.5, -2.5, 5), (7, -7, 5), (-7, 7, 5), (-2.5, 2.5, 5)])))
        #expect(same(f(0.17), dots([(3, -6, 5), (8, -6, 5), (-8, 6, 5), (-3, 6, 5)])))
        #expect(same(f(0.33), square))
        // The hold on the square, 0.30 s.
        #expect(same(f(0.5), square))
        #expect(same(f(0.63), square))
        // The mirror shear is the first shifted half a period.
        #expect(same(f(0.72), dots([(-7, -7, 5), (-2.5, -2.5, 5), (2.5, 2.5, 5), (7, 7, 5)])))
        #expect(same(f(0.80), dots([(-8, -6, 5), (-3, -6, 5), (3, 6, 5), (8, 6, 5)])))
        #expect(same(f(0.96), square))
        #expect(same(f(1.1), square))
    }

    // MARK: Fits the box

    @Test func everyFigureStaysInsideTheTwentyFourPointBox() {
        func fits(_ dots: [MarkDot]) -> Bool {
            dots.allSatisfy { abs($0.x) + $0.d / 2 <= 12 && abs($0.y) + $0.d / 2 <= 12 && $0.d >= 0 }
        }
        for t in stride(from: 0.0, to: 4.62, by: 0.01) { #expect(fits(AgentMarkFrames.thinkingLoop(at: t))) }
        for t in stride(from: 0.0, to: 1.26, by: 0.01) { #expect(fits(AgentMarkFrames.commandLoop(at: t))) }
        for t in stride(from: 0.0, to: 0.66, by: 0.01) { #expect(fits(AgentMarkFrames.arrival(at: t))) }
        for t in stride(from: 0.0, to: 0.2, by: 0.01) { #expect(fits(AgentMarkFrames.burst(at: t))) }
    }

    // MARK: Reduced motion and phases

    @Test func reducedMotionIsThreeStillDots() {
        #expect(AgentMarkFrames.reducedMotion == dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5.5)]))
    }

    @Test func phaseSelectsTheFigure() {
        #expect(same(AgentMarkFrames.dots(at: 0.85, phase: .thinking), AgentMarkFrames.thinkingLoop(at: 0.85)))
        #expect(same(AgentMarkFrames.dots(at: 0.09, phase: .command), AgentMarkFrames.commandLoop(at: 0.09)))
        #expect(AgentMarkFrames.dots(at: 0.3, phase: .done).isEmpty)
    }

    // MARK: Collapse and completion

    @Test func collapseFusesAtEightPointsThenShrinksAway() {
        let snapshot = dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5.5)])
        #expect(same(AgentMarkFrames.collapse(from: snapshot, at: 0), snapshot))
        let fused = AgentMarkFrames.collapse(from: snapshot, at: 0.12)
        #expect(same(fused, dots([(0, 0, 8), (0, 0, 8), (0, 0, 8)])))
        let shrinking = AgentMarkFrames.collapse(from: snapshot, at: 0.16)
        #expect(shrinking.allSatisfy { $0.d < 8 && $0.d > 0 && $0.x == 0 })
        #expect(AgentMarkFrames.collapse(from: snapshot, at: 0.2).isEmpty)
        #expect(AgentMarkFrames.collapse(from: [], at: 0.05).isEmpty)
    }

    @Test func completionShrinksToTwoPointsAndVanishesWithinFiftyMilliseconds() {
        let snapshot = dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5.5)])
        #expect(same(AgentMarkFrames.completion(from: snapshot, at: 0), snapshot))
        let late = AgentMarkFrames.completion(from: snapshot, at: 0.04)
        #expect(late.allSatisfy { abs($0.d - 2) < 0.1 })
        #expect(AgentMarkFrames.completion(from: snapshot, at: 0.05).isEmpty)
    }

    // MARK: Sequencer

    @Test func sequencerArrivesThenLoops() {
        let s = AgentMarkSequencer(start: 100)
        #expect(same(s.dots(at: 100), AgentMarkFrames.arrival(at: 0)))
        #expect(same(s.dots(at: 100.66 + 1e-6), AgentMarkFrames.thinkingLoop(at: 0)))
        #expect(same(s.dots(at: 100.66 + 0.85), AgentMarkFrames.thinkingLoop(at: 0.85)))
        // A sidebar mark skips the arrival and follows the shared clock.
        let side = AgentMarkSequencer(start: 100, phase: .thinking, arrives: false)
        #expect(same(side.dots(at: 107.3), AgentMarkFrames.thinkingLoop(at: 107.3)))
    }

    @Test func commandCollapsesBurstsAndLoopsThenReturnsToThree() {
        var s = AgentMarkSequencer(start: 0)
        s.set(.command, at: 10)
        // Folding: at the end of the collapse nothing is left, then a short gap.
        #expect(s.dots(at: 10.205).isEmpty)
        // Burst starts after the 30 ms gap, ends on the square 0.2 s later.
        #expect(same(s.dots(at: 10 + 0.2 + 0.03 + 1e-6), AgentMarkFrames.burst(at: 0)))
        #expect(same(s.dots(at: 10 + 0.2 + 0.03 + 0.2 + 1e-6), AgentMarkFrames.commandLoop(at: 0)))
        #expect(same(s.dots(at: 10 + 0.2 + 0.03 + 0.2 + 0.09 + 1e-6), AgentMarkFrames.commandLoop(at: 0.09)))
        // Thinking again: the square contracts, 200 ms of nothing, then the
        // arrival from 0.48 and the three-dot loop resumes.
        s.set(.thinking, at: 20)
        #expect(s.dots(at: 20.3).isEmpty)
        #expect(same(s.dots(at: 20 + 0.2 + 0.2 + 1e-6), AgentMarkFrames.arrival(at: 0.48)))
        #expect(same(s.dots(at: 20 + 0.2 + 0.2 + 0.18 + 1e-6), AgentMarkFrames.thinkingLoop(at: 0)))
    }

    @Test func aPhaseChangeMidFoldFoldsFromWhatIsOnScreen() {
        var s = AgentMarkSequencer(start: 0)
        s.set(.command, at: 10)
        let half = s.dots(at: 10.1)
        #expect(!half.isEmpty)
        s.set(.thinking, at: 10.1)
        #expect(same(s.dots(at: 10.1), half))
    }

    @Test func doneShrinksTheDotsThatWereShowingAndLeavesNothing() {
        var s = AgentMarkSequencer(start: 0)
        let showing = s.dots(at: 5)
        s.set(.done, at: 5)
        #expect(same(s.dots(at: 5), showing))
        #expect(s.dots(at: 5.06).isEmpty)
        #expect(s.dots(at: 50).isEmpty)
        // Setting the same phase again changes nothing.
        s.set(.done, at: 6)
        #expect(s.dots(at: 6).isEmpty)
    }

    // MARK: Shimmer

    @Test func shimmerFirstSweepComesSeventyHundredthsAfterTheLabelAppears() {
        #expect(AgentShimmer.bandCentre(elapsed: 0, width: 200) == nil)
        #expect(AgentShimmer.bandCentre(elapsed: 0.69, width: 200) == nil)
        let start = AgentShimmer.bandCentre(elapsed: 0.7, width: 200)
        #expect(start != nil)
        // The band begins clear of the label's left edge.
        #expect(abs((start ?? 0) + 65) < 0.001)
    }

    @Test func shimmerMovesAtAboutFourHundredEightyFivePointsASecondEveryThreeSeconds() {
        let a = AgentShimmer.bandCentre(elapsed: 0.7 + 0.1, width: 400)
        let b = AgentShimmer.bandCentre(elapsed: 0.7 + 0.2, width: 400)
        #expect(abs((b ?? 0) - (a ?? 0) - 48.5) < 0.001)
        // Repeats every 3.0 s while the label stays up.
        let again = AgentShimmer.bandCentre(elapsed: 0.7 + 3.0 + 0.1, width: 400)
        #expect(abs((again ?? 0) - (a ?? 0)) < 0.001)
        // Between sweeps there is no band.
        #expect(AgentShimmer.bandCentre(elapsed: 0.7 + 2.0, width: 400) == nil)
        // A longer label takes longer to cross: constant speed.
        #expect(AgentShimmer.sweepDuration(width: 400) > AgentShimmer.sweepDuration(width: 140))
        #expect(abs(AgentShimmer.sweepDuration(width: 485 - 130) - 1.0) < 0.001)
    }

    @Test func timerAndFirstLabelTimings() {
        #expect(AgentShimmer.timerAfter == 5)
        #expect(AgentShimmer.firstLabelDelay == 0.6)
    }

    // MARK: Easing

    @Test func easingCurvesMatchTheBrandCurves() {
        // cubic-bezier(0.22, 1, 0.36, 1) is front-loaded: nearly done at 40%.
        #expect(Ease.out(0.4) > 0.88)
        #expect(Ease.out(0) == 0 && Ease.out(1) == 1)
        // The loop curve is symmetric.
        #expect(abs(Ease.inOut(0.5) - 0.5) < 0.0001)
        #expect(abs(Ease.inOut(0.3) + Ease.inOut(0.7) - 1) < 0.0001)
        // Shrinks start slow.
        #expect(Ease.shrink(0.3) < 0.3)
    }

    // MARK: TurnActivity

    @Test func onlyABashStepRunsACommand() {
        #expect(TurnActivity.tool("bash", detail: "npm test").runsCommand)
        #expect(TurnActivity.tool("bash").runsCommand)
        #expect(!TurnActivity.tool("web_search").runsCommand)
        #expect(!TurnActivity.thinking.runsCommand)
        #expect(!TurnActivity.working.runsCommand)
        #expect(TurnActivity.tool("bash").label == "Running a command")
        #expect(TurnActivity.tool("web_search").label == "Searching the web")
    }
}
