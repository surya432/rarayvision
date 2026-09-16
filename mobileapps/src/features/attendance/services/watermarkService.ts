/**
 * Watermark service — render teks ke foto hasil capture.
 *
 * Setiap baris dirender sebagai layer terpisah agar konsisten antar
 * platform (iOS/Android). Posisi default: pojok kiri-bawah dengan
 * background semi-transparan agar terbaca di atas foto apapun.
 *
 * DEPENDENCY: react-native-image-marker 2.1.0
 */
import Marker, {
  type MarkOptions,
  type TextOptions,
  ImageFormat,
  Position,
  TextBackgroundType,
} from 'react-native-image-marker'

export interface WatermarkLine {
  text: string
  bold?: boolean
}

export interface WatermarkInput {
  sourceUri: string
  lines: WatermarkLine[]
  filename: string
}

export interface WatermarkService {
  applyTextWatermark(input: WatermarkInput): Promise<string>
}

const TEXT_STYLE_BASE = {
  color: '#FFFFFF',
  fontSize: 36,
  fontName: 'sans-serif',
  textBackgroundStyle: {
    color: '#00000099',
    paddingX: 18,
    paddingY: 10,
    type: TextBackgroundType.stretchX,
  },
  shadowStyle: {
    dx: 0,
    dy: 1,
    radius: 2,
    color: '#00000088',
  },
}

const buildTextOptions = (line: WatermarkLine): TextOptions => ({
  text: line.text,
  position: {
    position: Position.bottomLeft,
    Y: 32,
  },
  style: {
    ...TEXT_STYLE_BASE,
    ...(line.bold ? { bold: true } : {}),
  },
})

const offsetPosition = (index: number): TextOptions['position'] => ({
  position: Position.bottomLeft,
  Y: 32 + index * 64,
})

class ImageMarkerWatermarkService implements WatermarkService {
  async applyTextWatermark(input: WatermarkInput): Promise<string> {
    if (!input.sourceUri || input.sourceUri.length === 0) {
      throw new Error('sourceUri kosong — tidak bisa render watermark')
    }
    if (input.lines.length === 0) {
      throw new Error('lines kosong — minimal satu baris watermark')
    }

    const watermarkTexts: TextOptions[] = input.lines.map((line, index) => ({
      ...buildTextOptions(line),
      position: offsetPosition(index),
    }))

    const options: MarkOptions = {
      backgroundImage: {
        src: input.sourceUri.startsWith('file://')
          ? input.sourceUri
          : `file://${input.sourceUri}`,
      },
      watermarkTexts,
      quality: 90,
      filename: input.filename,
      saveFormat: ImageFormat.jpg,
    }

    const result = await Marker.mark(options)
    return result.uri.startsWith('file://')
      ? result.uri
      : `file://${result.uri}`
  }
}

export const watermarkService: WatermarkService =
  new ImageMarkerWatermarkService()
