import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { buildUrlImage } from 'core/utility/Contants'
import { useObservable, useValue } from '@legendapp/state/react'
import { useNavigation } from '@react-navigation/native'

const FormAddFace = () => {
    const form$ = useObservable<{ name: string; foto: string | null }>({
        name: '',
        foto: null,
    })

    const name = useValue(form$.name) as string
    const foto = useValue(form$.foto) as string | null
    const isValid = name.trim().length > 0 && !!foto

    const navigation = useNavigation()
    const handleChoosePhoto = () => {
        // form$.foto.set(buildUrlImage('1_face_1aa265b4.jpg'))
        navigation.navigate('CaptureFoto', {
            onDone: (text) => form$.foto.set(text)
        })
    }

    const handleSave = () => {
        const trimmedName = name.trim()

        if (!trimmedName) {
            Alert.alert('Validasi', 'Nama tidak boleh kosong.')
            return
        }

        if (!foto) {
            Alert.alert('Validasi', 'Foto wajah belum dipilih.')
            return
        }

        Alert.alert('Berhasil', `Data ${trimmedName} siap disimpan.`)
        form$.name.set('')
        form$.foto.set(null)
    }

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.section}>
                    <Text style={styles.label}>Nama</Text>
                    <View style={styles.inputWrapper}>
                        <TextInput
                            value={name}
                            placeholder='Masukkan Nama'
                            placeholderTextColor='#9CA3AF'
                            autoCapitalize='words'
                            onChangeText={text => form$.name.set(text)}
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Foto Wajah</Text>
                    <TouchableOpacity
                        onPress={handleChoosePhoto}
                        activeOpacity={0.8}
                        style={styles.photoWrapper}
                    >
                        {foto ? (
                            <Image
                                source={{ uri: foto }}
                                resizeMode='contain'
                                style={styles.photo}
                            />
                        ) : (
                            <View style={styles.emptyPhoto}>
                                <Text style={styles.emptyPhotoText}>Pilih Foto</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    onPress={handleSave}
                    disabled={!isValid}
                    style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
                >
                    <Text style={styles.saveText}>Simpan</Text>
                </TouchableOpacity>
            </View>
        </View>
    )
}

export default FormAddFace

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    scrollContent: {
        paddingTop: 15,
        paddingBottom: 20,
    },
    section: {
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 5,
        color: '#111827',
    },
    inputWrapper: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    photoWrapper: {
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    photo: {
        width: '100%',
        height: 450,
    },
    emptyPhoto: {
        height: 300,
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyPhotoText: {
        color: '#6B7280',
        fontSize: 16,
        fontWeight: '600',
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
    },
    saveButton: {
        paddingVertical: 18,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#2563EB',
    },
    saveButtonDisabled: {
        backgroundColor: '#93C5FD',
    },
    saveText: {
        fontSize: 18,
        color: '#FFFFFF',
        fontWeight: '600',
    },
})