// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "UsefulBot",
    platforms: [.macOS(.v14)],
    targets: [
        .target(name: "UsefulBotCore"),
        .executableTarget(name: "UsefulBotApp", dependencies: ["UsefulBotCore"]),
        .testTarget(name: "UsefulBotCoreTests", dependencies: ["UsefulBotCore"]),
    ]
)
