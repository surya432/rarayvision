import { ActivityIndicator, Alert, Button, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React, { useEffect } from 'react'
import { use$ } from '@legendapp/state/react'
import type { Faces } from './store/faceStores'
import { storeFaces$ } from './store/faceStores'
import { getListFaces } from './actions/action'
import { buildUrlImage } from 'core/utility/Contants'
import { useNavigation } from '@react-navigation/native'

const FaceListScreen = () => {
    const loading = use$(storeFaces$.loading) as boolean
    const faces = use$(storeFaces$.faces) as Faces[]
    const navigation = useNavigation()
    useEffect(() => {
        void getListFaces()
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity onPress={() => navigation.navigate('FormAddFace')}>
                    <Text style={{ fontSize: 24 }}>+</Text>
                </TouchableOpacity>
            )
        })
    }, [])

    if (loading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" />
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <FlatList
                numColumns={2}
                initialNumToRender={10}
                data={faces ?? []}
                renderItem={({ item, index }) => (
                    <TouchableOpacity key={item?.id ?? index.toString()}
                        onLongPress={() => {

                            //todo delete faces
                            Alert.alert('sad', 'adads')
                        }}
                    >
                        <View style={styles.itemRow}>
                            <Image source={{ uri: buildUrlImage(item?.image_url) }} width={200} height={170} resizeMode='contain' />
                            <Text>{item?.name ?? 'Unknown face'}</Text>
                        </View>
                    </TouchableOpacity>
                )}
                keyExtractor={(item, index) => item?.id ?? index.toString()}
                ListEmptyComponent={<Text style={styles.emptyText}>No faces found.</Text>}
            />
        </View>
    )
}

export default FaceListScreen

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loaderContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemRow: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#d9d9d9',
        justifyContent: "center",
        alignItems: 'center'
    },
    emptyText: {
        padding: 16,
        color: '#666',
        textAlign: 'center',
    },
})
