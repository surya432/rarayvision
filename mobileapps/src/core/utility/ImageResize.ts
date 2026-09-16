
import { Platform } from 'react-native'
import ImageResizer from '@bam.tech/react-native-image-resizer'

export const resizeImage = async (
    uri: string,
    maxSize: number = 720,
): Promise<string> => {
    if (!uri) {
        throw new Error('URI is required for resizing.')
    }
    const isLocal = /^file:\/\//.test(uri)
    const sourcePath =
        Platform.OS === 'android' && isLocal
            ? uri.replace(/^file:\/\//, '')
            : uri
    try {
        const response = await ImageResizer.createResizedImage(
            sourcePath,
            maxSize,
            maxSize,
            'JPEG',
            90,
            0,
            undefined,
            true, // keepMeta: preserve EXIF so orientation is retained
        )
        if (!response) {
            throw new Error('ImageResizer returned null response.')
        }
        return Platform.OS === 'android' ? response.uri : response.path
    } catch (e) {
        console.warn('ImageResizer failed, falling back to original URI:', e)
        return uri
    }
}