import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let folder = URL(fileURLWithPath: CommandLine.arguments[1])
let manifestURL = URL(fileURLWithPath: CommandLine.arguments[2])
let timelineURL = URL(fileURLWithPath: CommandLine.arguments[3])
let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as! [String: Any]
let states = manifest["states"] as! [String: [String: Any]]
let timelines = try JSONSerialization.jsonObject(with: Data(contentsOf: timelineURL)) as! [String: [String: Any]]
let outputFolder = folder.appendingPathComponent("animations")
try FileManager.default.createDirectory(at: outputFolder, withIntermediateDirectories: true)
for action in ["celebrate", "all_done", "drink_water"] {
    let timeline = timelines[action]!["timeline"] as! [Int]
    let target = outputFolder.appendingPathComponent(action + ".png")
    guard let destination = CGImageDestinationCreateWithURL(target as CFURL, UTType.png.identifier as CFString, timeline.count, nil) else { fatalError("Cannot create APNG") }
    let loops = states[action]!["loop"] as! Bool
    CGImageDestinationSetProperties(destination, [kCGImagePropertyPNGDictionary: [kCGImagePropertyAPNGLoopCount: loops ? 0 : 1]] as CFDictionary)
    var images: [Int: CGImage] = [:]
    for key in Set(timeline) {
        let url = folder.appendingPathComponent(String(format: "keyframes/%@/%02d.png", action, key))
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("Cannot read \(url.path)") }
        images[key] = image
    }
    for key in timeline {
        CGImageDestinationAddImage(destination, images[key]!, [kCGImagePropertyPNGDictionary: [kCGImagePropertyAPNGUnclampedDelayTime: 1.0 / 24.0, kCGImagePropertyAPNGDelayTime: 1.0 / 24.0]] as CFDictionary)
    }
    guard CGImageDestinationFinalize(destination) else { fatalError("Cannot finalize APNG") }
    print("Exported \(action): \(timeline.count) frames")
}
