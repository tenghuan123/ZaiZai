import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Assemble image_gen's locally repaired hand/bell into the approved artwork.
// This copies existing raster pixels; it does not draw or repaint character parts.
let pack = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "resources/pets/chou-chou-wang", isDirectory: true)
func load(_ path: String) -> CGImage {
    let url = pack.appendingPathComponent(path)
    let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(source, 0, nil)!
}
let original = load("source/history/remind-v1.png")
let repaired = load("source/edits/remind-handbell.png")
for image in [original, repaired] {
    precondition(image.width == 1536 && image.height == 1024)
    precondition(image.bitsPerComponent == 8 && image.bitsPerPixel == 32 && image.alphaInfo == .last)
    precondition(image.bytesPerRow == image.width * 4 && image.bitmapInfo.rawValue == 3)
}
let approved = [UInt8](original.dataProvider!.data! as Data)
let replacement = [UInt8](repaired.dataProvider!.data! as Data)
var output = approved
let tops = [154,146,132,113,94,84,84,84,84,84,84,84,84,84,84,84,84,94,100,122,146,157,160,158]
let bottoms = [208,203,190,179,165,156,156,156,156,156,156,156,156,156,156,156,156,166,177,190,204,212,216,214]
var changedPixels = 0
for frame in 0..<24 {
    let originX = frame % 6 * 256
    let originY = frame / 6 * 256
    for y in tops[frame]..<bottoms[frame] {
        // Protect the head/cheek: the patch widens only below the chin.
        let right = y < 100 ? 124.0 : min(136.0, 124.0 + Double(y - 100) * 1.5)
        for x in 84..<136 {
            let edgeDistance = min(Double(x - 84), right - Double(x), Double(y - tops[frame]), Double(bottoms[frame] - 1 - y))
            let weight = min(1.0, max(0.0, edgeDistance / 2.0))
            if weight == 0 { continue }
            let offset = ((originY + y) * 1536 + originX + x) * 4
            if weight == 1 {
                for channel in 0..<4 { output[offset + channel] = replacement[offset + channel] }
            } else {
                let oldAlpha = Double(approved[offset + 3])
                let newAlpha = Double(replacement[offset + 3])
                let alpha = oldAlpha * (1 - weight) + newAlpha * weight
                if alpha > 0 {
                    for channel in 0..<3 {
                        let value = (Double(approved[offset + channel]) * oldAlpha * (1 - weight) + Double(replacement[offset + channel]) * newAlpha * weight) / alpha
                        output[offset + channel] = UInt8(max(0, min(255, value.rounded())))
                    }
                }
                output[offset + 3] = UInt8(max(0, min(255, alpha.rounded())))
            }
            if (0..<4).contains(where: { output[offset + $0] != approved[offset + $0] }) { changedPixels += 1 }
        }
    }
}
let provider = CGDataProvider(data: Data(output) as CFData)!
let assembled = CGImage(width: 1536, height: 1024, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: 6144, space: original.colorSpace!, bitmapInfo: original.bitmapInfo, provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
let destinationURL = pack.appendingPathComponent("source/sheets/remind.png")
let destination = CGImageDestinationCreateWithURL(destinationURL as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, assembled, nil)
precondition(CGImageDestinationFinalize(destination))
let record: [String: Any] = [
    "date": "2026-11-03", "version": "1.0.2",
    "approvedBase": "history/remind-v1.png", "imageGenRepair": "edits/remind-handbell.png",
    "output": "sheets/remind.png", "method": "local raster asset assembly; approved pixels copied outside hand/bell region",
    "changedPixelsBeforeEncoding": changedPixels,
    "cellSize": [256, 256], "left": 84, "maximumRight": 136, "featherPixels": 2,
    "tops": tops, "bottoms": bottoms,
    "headBoundary": "right edge 124 for y < 100; widens to 136 below the chin by y = 108"
]
let data = try JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys])
try data.write(to: pack.appendingPathComponent("source/remind-assembly.json"))
print("Assembled repaired bell into approved character artwork: \(changedPixels) local pixels updated.")
