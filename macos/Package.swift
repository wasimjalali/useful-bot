// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "UsefulBot",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        // Explicit so the iOS Xcode project can link it; implicit products do
        // not resolve outside SwiftPM.
        .library(name: "UsefulBotCore", targets: ["UsefulBotCore"]),
    ],
    targets: [
        .target(name: "UsefulBotCore"),
        .executableTarget(name: "UsefulBotApp", dependencies: ["UsefulBotCore"]),
        .testTarget(name: "UsefulBotCoreTests", dependencies: ["UsefulBotCore"]),
    ]
)
