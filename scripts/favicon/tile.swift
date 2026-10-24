// tile <book.svg> <out.png> <size> <inset> <corner> <grain.png> [shadow]
// Draws the site's background (charcoal #131211, the tiled grain.png, the faint
// purple glow at the top) in a rounded square, then the book on top of it.
// inset and corner are fractions of size; shadow=1 adds a soft contact shadow.
import AppKit

let a = CommandLine.arguments
let book = NSImage(contentsOf: URL(fileURLWithPath: a[1]))!
let px = Int(a[3])!, inset = CGFloat(Double(a[4])!), corner = CGFloat(Double(a[5])!)
let grain = NSImage(contentsOf: URL(fileURLWithPath: a[6]))!
let shadow = a.count > 7 && a[7] == "1"
let s = CGFloat(px)

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: px, height: px)
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = ctx
ctx.imageInterpolation = .high
let full = NSRect(x: 0, y: 0, width: s, height: s)
let clip = NSBezierPath(roundedRect: full, xRadius: s * corner, yRadius: s * corner)
NSGraphicsContext.saveGraphicsState()
clip.addClip()
NSColor(srgbRed: 0x13 / 255.0, green: 0x12 / 255.0, blue: 0x11 / 255.0, alpha: 1).setFill()
full.fill()
// the site's grain tile is 256 css px; keep the same grain size relative to a 512 px icon
let t = max(s / 2, 8)
var y: CGFloat = 0
while y < s { var x: CGFloat = 0; while x < s { grain.draw(in: NSRect(x: x, y: y, width: t, height: t)); x += t }; y += t }
// faint purple glow at the top: ellipse 70% x 50% at 50% 0%, rgba(91,45,142,0.075) -> transparent at 70%
let glow = NSGradient(colors: [NSColor(srgbRed: 91 / 255.0, green: 45 / 255.0, blue: 142 / 255.0, alpha: 0.075), NSColor(srgbRed: 91 / 255.0, green: 45 / 255.0, blue: 142 / 255.0, alpha: 0)], atLocations: [0, 0.7], colorSpace: .sRGB)!
NSGraphicsContext.saveGraphicsState()
let tr = NSAffineTransform(); tr.translateX(by: s / 2, yBy: s); tr.scaleX(by: 0.70, yBy: 0.50); tr.concat()
glow.draw(fromCenter: .zero, radius: 0, toCenter: .zero, radius: s, options: [])
NSGraphicsContext.restoreGraphicsState()
let r = full.insetBy(dx: s * inset, dy: s * inset)
if shadow {
  // soft contact shadow under the book's foot
  let sh = NSGradient(colors: [NSColor(white: 0, alpha: 0.55), NSColor(white: 0, alpha: 0)])!
  NSGraphicsContext.saveGraphicsState()
  let st = NSAffineTransform(); st.translateX(by: r.midX + r.width * 0.02, yBy: r.minY + r.height * 0.07); st.scaleX(by: 1, yBy: 0.16); st.concat()
  sh.draw(fromCenter: .zero, radius: 0, toCenter: .zero, radius: r.width * 0.40, options: [])
  NSGraphicsContext.restoreGraphicsState()
}
book.draw(in: r, from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
