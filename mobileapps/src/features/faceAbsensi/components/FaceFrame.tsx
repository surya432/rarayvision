import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'

interface FaceFrameProps {
    width: number
    height: number
    x: number
    y: number
    color: string
    message: string
    screenWidth: number
    screenHeight: number
}

/**
 * Bingkai panduan posisi wajah + separuh badan.
 *
 * Menggambar siluet wajah (bukan oval geometris): bagian atas — kepala —
 * dibulatkan penuh, bagian bawah — dagu — sengaja dibuat sedikit lebih
 * runcing agar bingkai terasa seperti kontur wajah manusia, bukan elips
 * sempurna. Efek dicapai lewat `borderRadius` diferensial per sudut,
 * tanpa依赖 library eksternal.
 *
 * Vignette (overlay gelap) tetap dipasang untuk memfokuskan pengguna pada
 * area yang harus diisi. Komponen murni presentasional — tidak mengelola
 * state, hanya menerima prop dan menampilkan UI.
 */
const FaceFrame: React.FC<FaceFrameProps> = ({
    width,
    height,
    x,
    y,
    color,
    message,
    screenHeight,
}) => {
    // Rasio radius sudut bawah terhadap atas: < 1 berarti dagu lebih
    // runcing dari kepala. Nilai 0.78 menghasilkan taper yang terasa
    // natural tanpa terlihat seperti telur/lozenge.
    const HEAD_RATIO = 0.78
    const headRadius = width / 2
    const chinRadius = width / 2 * HEAD_RATIO

    const faceFrameStyle: ViewStyle = {
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        borderColor: color,
        borderWidth: 3,
        borderTopLeftRadius: headRadius,
        borderTopRightRadius: headRadius,
        borderBottomLeftRadius: chinRadius,
        borderBottomRightRadius: chinRadius,
    }

    const bottomHeight = Math.max(0, screenHeight - (y + height))
    const topHeight = Math.max(0, y)

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.vignette, { top: 0, left: 0, right: 0, height: topHeight }]} />
            <View
                style={[
                    styles.vignette,
                    { top: y + height, left: 0, right: 0, height: bottomHeight },
                ]}
            />
            <View style={[styles.vignette, { top: y, left: 0, width: x, height }]} />
            <View
                style={[styles.vignette, { top: y, left: x + width, right: 0, height }]}
            />

            <View style={faceFrameStyle} />

            <View style={[styles.messageContainer, { top: y + height + 24 }]}>
                <Text style={[styles.message, { borderColor: color }]}>{message}</Text>
            </View>
        </View>
    )
}

export default FaceFrame

const styles = StyleSheet.create({
    vignette: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    messageContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    message: {
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
        color: '#FFFFFF',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
    },
})