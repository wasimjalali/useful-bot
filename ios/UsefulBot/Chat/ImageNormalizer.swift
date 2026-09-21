import UIKit
import UsefulBotCore

/// Turns a camera or library image into a JPEG that fits the attachment cap.
/// HEIC decodes through `UIImage`. Drawing the image applies its orientation.
enum ImageNormalizer {
    static func jpeg(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        var scale: CGFloat = 1
        var quality: CGFloat = 0.86
        var bytes = rendered(image, scale: scale, quality: quality)
        while let current = bytes, current.count > Attachments.maxBytes, scale > 0.25 {
            scale *= 0.72
            quality = max(0.5, quality - 0.08)
            bytes = rendered(image, scale: scale, quality: quality)
        }
        guard let bytes, bytes.count <= Attachments.maxBytes else { return nil }
        return bytes
    }

    private static func rendered(_ image: UIImage, scale: CGFloat, quality: CGFloat) -> Data? {
        let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let drawn = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return drawn.jpegData(compressionQuality: quality)
    }
}
