// winrec2x <windowId> <seconds> <outDir> [fps]
// UB-001 copy of ~/.agents/tools/winrec.swift that captures at 2x (Retina pixels)
// and writes JPEG at quality 0.95, so the film can crop without upscaling.
// Records one window (even when covered by others) to numbered JPEGs.
import AppKit
import CoreImage
import Foundation
import ScreenCaptureKit

_ = NSApplication.shared
let args = CommandLine.arguments
guard args.count >= 4, let windowId = UInt32(args[1]), let seconds = Double(args[2]) else {
    FileHandle.standardError.write("usage: winrec2x <windowId> <seconds> <outDir> [fps]\n".data(using: .utf8)!)
    exit(2)
}
let outDir = URL(fileURLWithPath: args[3])
let fps = args.count > 4 ? Int32(args[4]) ?? 30 : 30
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

final class Sink: NSObject, SCStreamOutput {
    let dir: URL
    let start = Date()
    var n = 0
    let ctx = CIContext()
    init(dir: URL) { self.dir = dir }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, let px = sb.imageBuffer else { return }
        let ms = Int(Date().timeIntervalSince(start) * 1000)
        let img = CIImage(cvPixelBuffer: px)
        let url = dir.appendingPathComponent(String(format: "f%05d_%06dms.jpg", n, ms))
        n += 1
        if let cs = CGColorSpace(name: CGColorSpace.sRGB) {
            try? ctx.writeJPEGRepresentation(of: img, to: url, colorSpace: cs, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.95])
        }
    }
}

let sem = DispatchSemaphore(value: 0)
Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let win = content.windows.first(where: { $0.windowID == windowId }) else {
            FileHandle.standardError.write("window \(windowId) not found\n".data(using: .utf8)!)
            exit(1)
        }
        let filter = SCContentFilter(desktopIndependentWindow: win)
        let cfg = SCStreamConfiguration()
        cfg.width = Int(win.frame.width) * 2
        cfg.height = Int(win.frame.height) * 2
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: fps)
        cfg.showsCursor = false
        let sink = Sink(dir: outDir)
        let stream = SCStream(filter: filter, configuration: cfg, delegate: nil)
        try stream.addStreamOutput(sink, type: .screen, sampleHandlerQueue: DispatchQueue(label: "rec"))
        try await stream.startCapture()
        print("recording")
        fflush(stdout)
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        try await stream.stopCapture()
        print("frames \(sink.n)")
    } catch {
        FileHandle.standardError.write("error: \(error)\n".data(using: .utf8)!)
        exit(1)
    }
    sem.signal()
}
sem.wait()
