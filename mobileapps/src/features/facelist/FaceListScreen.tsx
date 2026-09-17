import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React, { useEffect } from 'react'
import { use$ } from '@legendapp/state/react'
import type { Faces } from './store/faceStores'
import { storeFaces$ } from './store/faceStores'
import { deleteFace, getListFaces } from './actions/action'
import { buildUrlImage } from 'core/utility/Contants'
import { useNavigation } from '@react-navigation/native'

const FaceListScreen = () => {
    const loading = use$(storeFaces$.loading) as boolean
    const faces = use$(storeFaces$.faces) as Faces[]
    // Use any type for navigation to allow arbitrary route names without TypeScript errors
    const navigation = useNavigation<any>()
    useEffect(() => {
        void getListFaces()
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity onPress={() => navigation.navigate("FormAddFace")}>
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
    const handleDelete = async (id: string) => {
        // Tampilkan konfirmasi sebelum menghapus wajah
        Alert.alert(
            'Konfirmasi Hapus',
            'Apakah Anda yakin ingin menghapus wajah ini?',
            [
                {
                    text: 'Batal',
                    style: 'cancel',
                },
                {
                    text: 'Hapus',
                    onPress: async () => {
                        try {
                            await deleteFace(id)
                        } catch (error) {
                            console.log(error?.message)
                        }
                    },
                },
            ],
            { cancelable: true }
        )
    }

    return (
        <View style={styles.container}>
            <FlatList
                numColumns={2}
                initialNumToRender={10}
                data={faces ?? []}
                // Add spacing between columns for a cleaner grid layout
                columnWrapperStyle={styles.columnWrapper}
                renderItem={({ item, index }) => (
                    // TouchableOpacity does not need a key prop; FlatList handles keys via keyExtractor
                    <TouchableOpacity
                        style={styles.itemContainer}
                        onLongPress={() => handleDelete(item?.id)}
                    >
                        <View style={styles.itemRow}>
                            {/* Use style for consistent image dimensions */}
                            <Image
                                source={{ uri: buildUrlImage(item?.image_url) }}
                                style={styles.itemImage}
                                resizeMode='contain'
                            />
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
        alignItems: 'center',
    },
    // Wrapper for each column to add spacing between grid items
    columnWrapper: {
        justifyContent: 'space-between',
        paddingHorizontal: 8,
    },
    // Container for each TouchableOpacity item to provide margin
    itemContainer: {
        flex: 1,
        margin: 8,
    },
    // Consistent image size for grid items
    itemImage: {
        width: '100%',
        height: 150,
        marginBottom: 8,
    },
    emptyText: {
        padding: 16,
        color: '#666',
        textAlign: 'center',
    },
})
