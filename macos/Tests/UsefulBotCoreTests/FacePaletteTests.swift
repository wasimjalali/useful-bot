import Foundation
import Testing
@testable import UsefulBotCore

@Suite struct FacePaletteTests {
    @Test func randomFacesAreAlwaysValid() {
        for seed in stride(from: UInt64(0), through: 5_000, by: 97) {
            let face = FacePalette.randomFace(seed: seed &* 1_764_512_347)
            #expect(FacePalette.isShape(face.shape), "bad shape for seed \(seed)")
            #expect(FacePalette.isColor(face.color), "bad color for seed \(seed)")
        }
    }

    @Test func defaultFacesAreDerivedAndValid() {
        let first = FacePalette.defaultFace(for: "bot-scout")
        let second = FacePalette.defaultFace(for: "bot-scout")
        #expect(first == second)
        #expect(FacePalette.isShape(first.shape))
        #expect(FacePalette.isColor(first.color))
    }

    @Test func largeTimestampsDoNotProduceNegativeIndices() {
        // The web bug came from int32 wrap-around on Date.now()-scale values.
        let face = FacePalette.randomFace(seed: UInt64(Date().timeIntervalSince1970 * 1000))
        #expect(FacePalette.isShape(face.shape))
        #expect(FacePalette.isColor(face.color))
    }
}
