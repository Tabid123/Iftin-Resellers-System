import CoreGraphics
import Foundation
import ImageIO

// Generate opaque PNG artwork with the tools supplied by the macOS runner.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let environment = ProcessInfo.processInfo.environment
let hex = environment["SPLASH_COLOR", default: "#0F4C81"].dropFirst()
let logoURL = root.appendingPathComponent("assets/icon-only.png")
guard let rgb = UInt32(hex, radix: 16), hex.count == 6,
      let source = CGImageSourceCreateWithURL(logoURL as CFURL, nil),
      let logo = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fatalError("A valid tenant logo and six-digit splash colour are required")
}

func writeImage(size: Int, logoSize: CGFloat, filename: String) {
    guard let context = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: size * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        fatalError("Could not create the iOS artwork bitmap")
    }
    context.setFillColor(
        red: CGFloat((rgb >> 16) & 255) / 255,
        green: CGFloat((rgb >> 8) & 255) / 255,
        blue: CGFloat(rgb & 255) / 255,
        alpha: 1
    )
    context.fill(CGRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size)))
    context.interpolationQuality = .high
    let scale = logoSize / CGFloat(max(logo.width, logo.height))
    let width = CGFloat(logo.width) * scale
    let height = CGFloat(logo.height) * scale
    context.draw(logo, in: CGRect(
        x: (CGFloat(size) - width) / 2,
        y: (CGFloat(size) - height) / 2,
        width: width,
        height: height
    ))
    let path = root.appendingPathComponent("ios/App/App/Assets.xcassets/" + filename)
    guard let image = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(path as CFURL, "public.png" as CFString, 1, nil) else {
        fatalError("Could not create the iOS PNG destination")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        fatalError("Could not write iOS artwork")
    }
}

writeImage(size: 1024, logoSize: 1024, filename: "AppIcon.appiconset/AppIcon-512@2x.png")
for name in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"] {
    writeImage(size: 2732, logoSize: 512, filename: "Splash.imageset/\(name)")
}
print("Generated tenant iOS icon and splash artwork")
