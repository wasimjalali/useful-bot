import Foundation
import Testing
@testable import UsefulBotCore

/// The agent-working mark's keyframes. The arrival, the four-dot figure and
/// the timings follow the tables in
/// ~/.agents/skills/useful-brand/references/agent-working-motion.md; the
/// three-dot loop follows the capture frames (rec-02) where the table
/// disagrees with them.
@Suite struct AgentMarkFramesTests {
    private func same(_ a: [MarkDot], _ b: [MarkDot], tolerance: Double = 0.001) -> Bool {
        a.count == b.count && zip(a, b).allSatisfy {
            abs($0.x - $1.x) < tolerance && abs($0.y - $1.y) < tolerance && abs($0.d - $1.d) < tolerance
        }
    }

    private func dots(_ values: [(Double, Double, Double)]) -> [MarkDot] {
        values.map { MarkDot($0.0, $0.1, $0.2) }
    }

    private let eps = 1e-6

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
        // 4.62 s lands on the dot 0.00 starts from, 1.26 s on the square.
        #expect(same(AgentMarkFrames.thinkingLoop(at: 4.62), AgentMarkFrames.thinkingLoop(at: 0)))
        #expect(same(AgentMarkFrames.commandLoop(at: 1.26), AgentMarkFrames.commandLoop(at: 0)))
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

    // MARK: Three-dot loop (4.2, from the capture)

    @Test func threeDotLoopFollowsTheCapture() {
        let f = AgentMarkFrames.thinkingLoop(at:)
        let blob = dots([(0, 0, 4.8), (0, 0, 4.8), (0, 0, 4.8)])
        let row = dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5)])
        // The loop opens on the dot the arrival and the restart leave, fans
        // into the row by 0.30 s and holds it.
        #expect(same(f(0), blob))
        #expect(same(f(0.30), row))
        #expect(same(f(0.40), row))
        // Dot 2 runs into dot 1 and the blob slides right.
        #expect(same(f(0.63), dots([(-5.8, 0, 4.5), (-4.8, 0, 4.5), (8.3, 0, 4.3)])))
        // Split into small, big, small, then the rotating triangle.
        #expect(same(f(0.81), dots([(-5.6, -0.2, 3.3), (-1.1, 1, 5.2), (6.8, -0.4, 3.4)])))
        #expect(same(f(1.07), dots([(-8.2, 1.2, 4.3), (7.6, 2.4, 4.7), (1.3, -2.5, 3.1)])))
        #expect(same(f(1.35), dots([(-1.1, 5.6, 5), (7.2, -1.6, 3.4), (-5.5, -2.4, 3.3)])))
        #expect(same(f(1.73), dots([(8.4, 0.2, 3.9), (-2.2, -0.6, 2.9), (-6.3, 0.8, 5)])))
        // The gather, the shrink and the dot that comes back.
        #expect(same(f(2.62), dots([(0.2, -0.1, 6.7), (0.2, -0.1, 6.7), (0.2, -0.1, 6.7)])))
        #expect(f(2.78).isEmpty)
        #expect(f(2.80).isEmpty)
        #expect(same(f(2.83), dots([(0, 0, 2.6), (0, 0, 2.6), (0, 0, 2.6)])))
        // Phrase 2: fan into the row, meet, fuse into one blob, split.
        #expect(same(f(3.32), row))
        #expect(same(f(3.39), row))
        #expect(same(f(3.70), dots([(0.1, 0, 6.4), (0.1, 0, 6.4), (0.1, 0, 6.4)])))
        #expect(same(f(3.94), row))
        #expect(same(f(4.37), dots([(0.1, 0, 4.7), (0.1, 0, 4.7), (0.1, 0, 4.7)])))
        // The 4.54 s dot is small but never gone: the capture has no blank frame.
        #expect(!f(4.54).isEmpty)
    }

    @Test func phraseTwoHoldsTheRowThenFusesThenSplits() {
        let f = AgentMarkFrames.thinkingLoop(at:)
        // The row holds, then eases in (the capture's dots barely move until
        // about 3.50), fused by about 3.70 and split from 3.74: the blob shows
        // for about 30 ms.
        #expect(same(f(3.39), f(3.32)))
        #expect(abs(f(3.45)[0].x - f(3.39)[0].x) < 1)
        let meeting = f(3.60)
        #expect(meeting[1].x - meeting[0].x < 1)
        let fused = f(3.70)
        #expect(fused.allSatisfy { $0.x == fused[0].x && $0.d == fused[0].d })
        let split = f(3.74)
        #expect(split[0].x < -5 && split[1].x > 2)
    }

    @Test func theTriangleKeepsEveryDotInItsLane() {
        // From the capture: dot 1 (large at the bottom) lands on the right,
        // dot 3 on the left, dot 2 in the middle, and none of them crosses
        // another between 1.49 and 1.73. The spec's table has them landing
        // the other way round.
        for t in stride(from: 1.49, through: 1.73, by: 0.005) {
            let d = AgentMarkFrames.thinkingLoop(at: t)
            #expect(d[2].x < d[1].x + 0.0001)
            #expect(d[1].x < d[0].x + 0.0001)
        }
        let landed = AgentMarkFrames.thinkingLoop(at: 1.73)
        #expect(landed[0].x > 8 && landed[2].x < -6)
    }

    @Test func theTriangleSpreadsAboutNinePointsTall() {
        // Dot centres run from y -3.7 to +5.8 in the capture (the spec's
        // table says 8 pt, read from every third frame).
        let ys = (0..<462).flatMap { AgentMarkFrames.thinkingLoop(at: Double($0) * 0.01).map(\.y) }
        let spread = (ys.max() ?? 0) - (ys.min() ?? 0)
        #expect(spread > 8)
        #expect(spread < 10.5)
    }

    @Test func theLoopRestartIsAFanFromTheOneDotNotAPop() {
        // 4.58 to 4.62 and on into the next loop: a dot of 3.2 pt grows to 4.8
        // and then fans out over about 0.27 s.
        #expect(!AgentMarkFrames.thinkingLoop(at: 4.58).isEmpty)
        #expect(abs(AgentMarkFrames.thinkingLoop(at: 4.58)[0].d - 3.2) < 0.001)
        var previousSpread = -1.0
        for t in stride(from: 0.03, through: 0.30, by: 0.01) {
            let d = AgentMarkFrames.thinkingLoop(at: t)
            let spread = d[2].x - d[0].x
            #expect(spread >= previousSpread - 0.0001)
            previousSpread = spread
        }
        // Halfway through it is neither the dot nor the row.
        let mid = AgentMarkFrames.thinkingLoop(at: 0.12)
        #expect(mid[2].x - mid[0].x > 2 && mid[2].x - mid[0].x < 16)
        // No jump across the 4.62 seam.
        let before = AgentMarkFrames.thinkingLoop(at: 4.619)
        let after = AgentMarkFrames.thinkingLoop(at: 4.621)
        #expect(zip(before, after).allSatisfy { abs($0.x - $1.x) < 0.2 && abs($0.d - $1.d) < 0.2 })
    }

    @Test func splitsStartSlowSoTheyAreNotTheBrandCurve() {
        // The 0.81 split moves symmetrically: the first quarter of its time
        // covers little ground. The brand curve would be most of the way by 40%.
        let a = AgentMarkFrames.thinkingLoop(at: 0.78)
        let b = AgentMarkFrames.thinkingLoop(at: 0.81)
        let early = AgentMarkFrames.thinkingLoop(at: 0.78 + 0.03 * 0.25)
        let travelled = abs(early[1].x - a[1].x) / abs(b[1].x - a[1].x)
        #expect(travelled < 0.2)
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

    @Test func collapseFusesTowardEightPointsThenShrinksAway() {
        let snapshot = dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5.5)])
        #expect(same(AgentMarkFrames.collapse(from: snapshot, at: 0), snapshot))
        // Each dot swells to 8 pt at most, and a small one swells less.
        let fused = AgentMarkFrames.collapse(from: snapshot, at: 0.12)
        #expect(same(fused, dots([(0, 0, 7.65), (0, 0, 5.1), (0, 0, 8)])))
        let shrinking = AgentMarkFrames.collapse(from: snapshot, at: 0.16)
        #expect(shrinking.allSatisfy { $0.d > 0 && $0.x == 0 })
        #expect(zip(shrinking, fused).allSatisfy { $0.d < $1.d })
        #expect(AgentMarkFrames.collapse(from: snapshot, at: 0.2).isEmpty)
        #expect(AgentMarkFrames.collapse(from: [], at: 0.05).isEmpty)
    }

    @Test func aDotOnItsWayOutDoesNotBalloonInACollapse() {
        let snapshot = dots([(0, 0, 0.8)])
        for t in stride(from: 0.0, to: 0.2, by: 0.01) {
            #expect(AgentMarkFrames.collapse(from: snapshot, at: t).allSatisfy { $0.d <= 0.8 * 1.7 + 0.0001 })
        }
    }

    @Test func completionShrinksTowardTwoPointsAndVanishesWithinFiftyMilliseconds() {
        let snapshot = dots([(-8, 0, 4.5), (0, 0, 3), (8, 0, 5.5)])
        #expect(same(AgentMarkFrames.completion(from: snapshot, at: 0), snapshot))
        let late = AgentMarkFrames.completion(from: snapshot, at: 0.04)
        #expect(late.allSatisfy { abs($0.d - 2) < 0.1 })
        #expect(AgentMarkFrames.completion(from: snapshot, at: 0.05).isEmpty)
        // A dot already under 2 pt is not made bigger on its way out.
        let small = dots([(0, 0, 1.2)])
        for t in stride(from: 0.0, to: 0.05, by: 0.005) {
            #expect(AgentMarkFrames.completion(from: small, at: t).allSatisfy { $0.d <= 1.2 + 0.0001 })
        }
    }

    // MARK: Sequencer

    @Test func sequencerArrivesThenJoinsTheLoopAtItsRow() {
        let s = AgentMarkSequencer(start: 100)
        #expect(same(s.dots(at: 100), AgentMarkFrames.arrival(at: 0)))
        // The arrival has already fanned, so the loop is joined at its row.
        #expect(same(s.dots(at: 100.66 + eps), AgentMarkFrames.thinkingLoop(at: 0.30)))
        #expect(same(s.dots(at: 100.66 + 0.55), AgentMarkFrames.thinkingLoop(at: 0.85)))
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
        #expect(same(s.dots(at: 10 + 0.2 + 0.03 + eps), AgentMarkFrames.burst(at: 0)))
        #expect(same(s.dots(at: 10 + 0.2 + 0.03 + 0.2 + eps), AgentMarkFrames.commandLoop(at: 0)))
        #expect(same(s.dots(at: 10 + 0.2 + 0.03 + 0.2 + 0.09 + eps), AgentMarkFrames.commandLoop(at: 0.09)))
        // Thinking again: the square contracts, 200 ms of nothing, then the
        // arrival from 0.48 and the three-dot loop resumes at its row.
        s.set(.thinking, at: 20)
        #expect(s.dots(at: 20.3).isEmpty)
        #expect(same(s.dots(at: 20 + 0.2 + 0.2 + eps), AgentMarkFrames.arrival(at: 0.48)))
        #expect(same(s.dots(at: 20 + 0.2 + 0.2 + 0.18 + eps), AgentMarkFrames.thinkingLoop(at: 0.30)))
    }

    @Test func aSecondCommandStepFoldsAndBurstsAgainWhileThePhaseStaysCommand() {
        var s = AgentMarkSequencer(start: 0)
        s.set(.command, at: 10)
        // Well into the first command's loop.
        let t = 10 + 0.2 + 0.03 + 0.2 + 0.5
        let looping = s.dots(at: t)
        #expect(same(looping, AgentMarkFrames.commandLoop(at: 0.5)))
        // The next command step: same phase, restart.
        s.set(.command, at: t, restart: true)
        #expect(same(s.dots(at: t), looping))
        #expect(s.dots(at: t + 0.2 + 0.015).isEmpty)
        #expect(same(s.dots(at: t + 0.2 + 0.03 + eps), AgentMarkFrames.burst(at: 0)))
        #expect(same(s.dots(at: t + 0.2 + 0.03 + 0.2 + eps), AgentMarkFrames.commandLoop(at: 0)))
        // Without `restart` the same phase is left alone, and `restart` means
        // nothing for the three-dot figure.
        var plain = AgentMarkSequencer(start: 0)
        plain.set(.command, at: 10)
        plain.set(.command, at: t)
        #expect(same(plain.dots(at: t), looping))
        var thinking = AgentMarkSequencer(start: 0)
        let before = thinking.dots(at: 3)
        thinking.set(.thinking, at: 3, restart: true)
        #expect(same(thinking.dots(at: 3), before))
    }

    @Test func aPhaseChangeMidFoldFoldsFromWhatIsOnScreen() {
        var s = AgentMarkSequencer(start: 0)
        s.set(.command, at: 10)
        let half = s.dots(at: 10.1)
        #expect(!half.isEmpty)
        s.set(.thinking, at: 10.1)
        #expect(same(s.dots(at: 10.1), half))
    }

    @Test func aPhaseChangeDuringAnEmptyFrameGoesStraightToTheEntry() {
        var s = AgentMarkSequencer(start: 0)
        s.set(.command, at: 10)
        // 10.21 s: the fold is over and the gap is on, so nothing is drawn.
        #expect(s.dots(at: 10.21).isEmpty)
        // Back to thinking in the gap: nothing to fold, so the fan starts at once.
        s.set(.thinking, at: 10.21)
        #expect(same(s.dots(at: 10.21 + eps), AgentMarkFrames.arrival(at: 0.48)))
        #expect(same(s.dots(at: 10.21 + 0.18 + eps), AgentMarkFrames.thinkingLoop(at: 0.30)))
        // The same from the three-dot figure's own blank frames, into a command.
        var t = AgentMarkSequencer(start: 0)
        // 0.44 s into the arrival the dot has blinked out.
        #expect(t.dots(at: 0.45).isEmpty)
        t.set(.command, at: 0.45)
        #expect(same(t.dots(at: 0.45 + eps), AgentMarkFrames.burst(at: 0)))
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

    @Test func doneToThinkingIsAFreshArrival() {
        var s = AgentMarkSequencer(start: 0)
        s.set(.done, at: 5)
        s.set(.thinking, at: 8)
        #expect(same(s.dots(at: 8), AgentMarkFrames.arrival(at: 0)))
        #expect(same(s.dots(at: 8.07), AgentMarkFrames.arrival(at: 0.07)))
        // Done, then a command: the burst, with no fold of nothing.
        var c = AgentMarkSequencer(start: 0)
        c.set(.done, at: 5)
        c.set(.command, at: 8)
        #expect(same(c.dots(at: 8), AgentMarkFrames.burst(at: 0)))
    }

    @Test func aClockThatRunsBehindTheStageStartDrawsTheFirstFrameNotABlankOne() {
        let s = AgentMarkSequencer(start: 100)
        #expect(same(s.dots(at: 99.99), s.dots(at: 100)))
        #expect(!s.dots(at: 99.99).isEmpty)
        var c = AgentMarkSequencer(start: 100)
        c.set(.command, at: 105)
        #expect(same(c.dots(at: 104.9), c.dots(at: 105)))
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
        // install_cli also runs a command but is a step of its own ("Setting up a tool").
        #expect(!TurnActivity.tool("install_cli").runsCommand)
        #expect(!TurnActivity.thinking.runsCommand)
        #expect(!TurnActivity.working.runsCommand)
        #expect(TurnActivity.tool("bash").label == "Running a command")
        #expect(TurnActivity.tool("web_search").label == "Searching the web")
    }
}
