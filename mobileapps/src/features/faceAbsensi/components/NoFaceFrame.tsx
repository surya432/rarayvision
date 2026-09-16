import moment from 'moment'
import { StyleSheet, Text, View } from 'react-native'
import React, { useEffect, useState } from 'react'

const NoFaceFrame = () => {
    const [timeNow, setTimeNow] = useState(moment().format('HH:mm:ss'))
    useEffect(() => {
        const intervals = setInterval(() => {
            setTimeNow(moment().format('HH:mm:ss'))
        }, 1000)
        return () => {
            clearInterval(intervals)
        };
    }, []);
    return (
        <View style={styles.notDetectFaces}>
            <Text style={styles.textTimeNow}>{timeNow}</Text>
            <Text style={styles.textNoFaces}>Pastikan wajah berada di dalam frame</Text>
        </View>
    )
}

export default NoFaceFrame

const styles = StyleSheet.create({
    notDetectFaces: {
        flex: 1,
        justifyContent: "center",
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,1)'
    },
    textTimeNow: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
        width: '80%',
        margin: 10
    },
    textNoFaces: {
        color: '#FFFFFF',
        fontSize: 14,
        textAlign: 'center',
        width: '80%'
    }
})