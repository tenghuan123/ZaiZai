import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import CoreText

// Only slices, registers and encodes the image_gen artwork; no character parts are redrawn.
let fileManager = FileManager.default
let packURL = URL(fileURLWithPath:CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "resources/pets/xiang-xiang-mao", isDirectory:true)
let colorSpace = CGColorSpace(name:CGColorSpace.sRGB)!
let frameSize = 320
let actionOrder = ["idle", "react", "celebrate", "all_done", "remind", "drink_water", "stretch"]
let labels = ["待机眨眼", "挥手回应", "鼓掌庆祝", "跳跃欢呼", "摇铃提醒", "喝水提醒", "头顶伸展"]
let timelines = try JSONDecoder().decode([String:[Int]].self, from:Data(contentsOf:packURL.appendingPathComponent("source/timelines.json")))

func canvas(_ width:Int, _ height:Int) -> CGContext {
    CGContext(data:nil, width:width, height:height, bitsPerComponent:8, bytesPerRow:width*4,
        space:colorSpace, bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func load(_ url:URL) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL,nil),
          let image = CGImageSourceCreateImageAtIndex(source,0,nil) else {
        throw NSError(domain:"XiangXiangMaoPack",code:1,userInfo:[NSLocalizedDescriptionKey:"Cannot read \(url.path)"])
    }
    return image
}

func save(_ image:CGImage, _ url:URL) throws {
    try fileManager.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL,UTType.png.identifier as CFString,1,nil) else {
        throw NSError(domain:"XiangXiangMaoPack",code:2)
    }
    CGImageDestinationAddImage(destination,image,nil)
    guard CGImageDestinationFinalize(destination) else { throw NSError(domain:"XiangXiangMaoPack",code:3) }
}

func clearAlphaResidue(_ image:CGImage) -> CGImage {
    let context = canvas(image.width,image.height)
    context.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
    let bytes = context.data!.bindMemory(to:UInt8.self,capacity:image.width*image.height*4)
    for offset in stride(from:0,to:image.width*image.height*4,by:4) where bytes[offset+3] <= 4 {
        for channel in 0..<4 { bytes[offset+channel] = 0 }
    }
    return context.makeImage()!
}

struct Anchor:Codable {
    let x:Double
    let sole:Double
    let top:Double
}

func anchor(_ image:CGImage) -> Anchor {
    let context = canvas(image.width,image.height)
    context.draw(image,in:CGRect(x:0,y:0,width:image.width,height:image.height))
    let bytes = context.data!.bindMemory(to:UInt8.self,capacity:image.width*image.height*4)
    var minY = image.height, maxY = 0
    for y in 0..<image.height {
        for x in 0..<image.width where bytes[(y*image.width+x)*4+3] > 24 {
            minY = min(minY,y); maxY = max(maxY,y)
        }
    }
    var weightedX = 0.0, weight = 0.0
    for y in max(0,maxY-12)...maxY {
        for x in 0..<image.width {
            let alpha = Double(bytes[(y*image.width+x)*4+3])
            if alpha > 24 { weightedX += Double(x)*alpha; weight += alpha }
        }
    }
    precondition(weight > 0,"Empty generated cell")
    return Anchor(x:weightedX/weight,sole:Double(maxY+1),top:Double(minY))
}

func register(_ image:CGImage, _ current:Anchor, _ neutral:Anchor, _ scale:Double, _ airborne:Bool) -> CGImage {
    let context = canvas(frameSize,frameSize)
    context.interpolationQuality = .high
    let left = 160-current.x*scale
    let sourceSole = airborne ? neutral.sole : current.sole
    let top = 304-sourceSole*scale
    context.draw(image,in:CGRect(x:left,y:Double(frameSize)-top-Double(image.height)*scale,
        width:Double(image.width)*scale,height:Double(image.height)*scale))
    return context.makeImage()!
}

func crc32(_ bytes:ArraySlice<UInt8>) -> UInt32 {
    var value:UInt32 = 0xffffffff
    for byte in bytes {
        value ^= UInt32(byte)
        for _ in 0..<8 { value = (value >> 1) ^ (value & 1 == 1 ? 0xedb88320 : 0) }
    }
    return value ^ 0xffffffff
}

// ImageIO rounds 1/24 s; store an exact rational delay in each APNG control chunk.
func exactAPNGDelays(_ url:URL) throws {
    var bytes = [UInt8](try Data(contentsOf:url))
    var offset = 8
    while offset+12 <= bytes.count {
        let length = Int(bytes[offset])<<24 | Int(bytes[offset+1])<<16 | Int(bytes[offset+2])<<8 | Int(bytes[offset+3])
        guard offset+12+length <= bytes.count else { throw NSError(domain:"XiangXiangMaoPack",code:4) }
        let type = String(bytes:bytes[(offset+4)..<(offset+8)],encoding:.ascii)
        if type == "fcTL" {
            precondition(length == 26)
            bytes[offset+28] = 0; bytes[offset+29] = 1
            bytes[offset+30] = 0; bytes[offset+31] = 24
            let crc = crc32(bytes[(offset+4)..<(offset+8+length)])
            for i in 0..<4 { bytes[offset+8+length+i] = UInt8((crc >> (24-i*8)) & 255) }
        }
        offset += length+12
    }
    try Data(bytes).write(to:url)
}

func animation(_ frames:[CGImage], _ timeline:[Int], _ url:URL, _ loop:Bool) throws {
    try fileManager.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true)
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL,UTType.png.identifier as CFString,timeline.count,nil) else {
        throw NSError(domain:"XiangXiangMaoPack",code:5)
    }
    CGImageDestinationSetProperties(destination,[kCGImagePropertyPNGDictionary:[kCGImagePropertyAPNGLoopCount:loop ? 0 : 1]] as CFDictionary)
    let properties = [kCGImagePropertyPNGDictionary:[kCGImagePropertyAPNGDelayTime:1.0/24,kCGImagePropertyAPNGUnclampedDelayTime:1.0/24]] as CFDictionary
    for index in timeline { CGImageDestinationAddImage(destination,frames[index],properties) }
    guard CGImageDestinationFinalize(destination) else { throw NSError(domain:"XiangXiangMaoPack",code:6) }
    try exactAPNGDelays(url)
}

func text(_ value:String, _ context:CGContext, _ x:Double, _ y:Double, _ size:Double, _ color:CGColor) {
    let font = CTFontCreateWithName("PingFangSC-Regular" as CFString,size,nil)
    let attributes = [kCTFontAttributeName:font,kCTForegroundColorAttributeName:color] as CFDictionary
    let string = CFAttributedStringCreate(nil,value as CFString,attributes)!
    context.textPosition = CGPoint(x:x,y:y)
    CTLineDraw(CTLineCreateWithAttributedString(string),context)
}

var allFrames:[String:[CGImage]] = [:]
var anchors:[String:[Anchor]] = [:]
var scales:[String:Double] = [:]
for action in actionOrder {
    let source = try load(packURL.appendingPathComponent("source/sheets/\(action).png"))
    precondition(source.width == 1536 && source.height == 1024,"Unexpected sheet geometry")
    var cells:[CGImage] = []
    for index in 0..<24 {
        let rect = CGRect(x:index%6*256,y:index/6*256,width:256,height:256)
        cells.append(clearAlphaResidue(source.cropping(to:rect)!))
    }
    let sourceAnchors = cells.map(anchor)
    let neutral = sourceAnchors[0]
    let scale = 260/(neutral.sole-neutral.top)
    let frames = cells.enumerated().map { index,image in
        register(image,sourceAnchors[index],neutral,scale,action == "all_done" && (9...14).contains(index))
    }
    for (index,image) in frames.enumerated() {
        try save(image,packURL.appendingPathComponent(String(format:"keyframes/%@/%02d.png",action,index)))
    }
    let timeline = timelines[action]!
    precondition(timeline.allSatisfy { (0..<24).contains($0) })
    let rows = (timeline.count+7)/8
    let sheet = canvas(8*frameSize,rows*frameSize)
    for (tick,key) in timeline.enumerated() {
        sheet.draw(frames[key],in:CGRect(x:tick%8*frameSize,y:(rows-1-tick/8)*frameSize,width:frameSize,height:frameSize))
    }
    try save(sheet.makeImage()!,packURL.appendingPathComponent("\(action).png"))
    try animation(frames,timeline,packURL.appendingPathComponent("animations/\(action).png"),!["react","celebrate","all_done"].contains(action))
    if action == "react" { try animation(frames,timeline,packURL.appendingPathComponent("previews/react-loop.png"),true) }
    allFrames[action] = frames; anchors[action] = sourceAnchors; scales[action] = scale
    print("Built \(action): 24 drawings, \(timeline.count) playback frames, scale \(String(format:"%.4f",scale))")
}

// The contact sheet provides a convenient visual inventory; alpha remains in the actual assets.
let overview = canvas(1400,830)
overview.setFillColor(CGColor(srgbRed:0.99,green:0.97,blue:0.94,alpha:1))
overview.fill(CGRect(x:0,y:0,width:1400,height:830))
let ink = CGColor(srgbRed:0.34,green:0.23,blue:0.20,alpha:1)
text("香香猫 · 桌面陪伴角色资源包",overview,44,767,28,ink)
text("高马尾卷发 / 白色荷叶边衬衫 / 米杏长裙 · 7 组透明动画",overview,45,730,16,ink)
let representative = [0,8,13,11,14,10,10]
for (index,action) in actionOrder.enumerated() {
    let col = index%4, row = index/4
    let left = 35+col*337, top = 135+row*325
    overview.draw(allFrames[action]![representative[index]],in:CGRect(x:left,y:830-top-280,width:280,height:280))
    text(labels[index],overview,Double(left+98),Double(830-top-300),16,ink)
}
try save(overview.makeImage()!,packURL.appendingPathComponent("preview.png"))
let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted,.sortedKeys]
try encoder.encode(anchors).write(to:packURL.appendingPathComponent("source/anchors.json"))
try encoder.encode(scales).write(to:packURL.appendingPathComponent("source/scales.json"))
let previewData:[String:Any] = [
    "manifest":try JSONSerialization.jsonObject(with:Data(contentsOf:packURL.appendingPathComponent("manifest.json"))),
    "timelines":timelines
]
let previewJSON = try JSONSerialization.data(withJSONObject:previewData,options:[.sortedKeys])
try ("window.xiangXiangMaoPack = "+String(data:previewJSON,encoding:.utf8)!+";\n").write(to:packURL.appendingPathComponent("source/preview-data.js"),atomically:true,encoding:.utf8)
print("Saved preview.png and source registration records")
