import { AxiosConfig } from "core/utility"
import { CLIENT_SECRET } from "core/utility/Contants"

interface faceRecognizeDto {
    uri: string
    filename: string,
    timestamp: number
    geolocation: {
        lat: number
        long: number
    }
}
interface responseFaceRecognize {
    match: boolean
    face_id: string
    similarity: number
    name?: string
    image_url: string,
    time: number | null
}

export const faceRecognize = async (payload: faceRecognizeDto): Promise<responseFaceRecognize> => {
    try {
        if (__DEV__) {
            console.log('Face Recognize Payload: ', JSON.stringify(payload, null, 2))
        }
        // send request to server
        const formData = new FormData();
        formData.append('file', {
            uri: payload.uri,
            type: 'image/jpeg',
            name: `${payload.filename}.jpeg`,
        });
        formData.append('geotag', JSON.stringify(payload.geolocation));
        formData.append('mode', 'insert');
        formData.append('timestamp', payload.timestamp.toString());
        const { data } = await AxiosConfig.post('/api/v1/faces/recognize', formData, {
            headers: {
                "Content-Type": "multipart/form-data",
                'Authorization': CLIENT_SECRET
            }
        })

        if (data.status == 'error' || data.match == false) {
            throw new Error(data?.message || "Anda tidak terdaftar sebagai karyawan");
        }

        if (__DEV__) {
            console.log('FaceRecognize Response: ', JSON.stringify(data, null, 2))
        }
        const result: responseFaceRecognize = {
            match: data.match,
            face_id: data.data.face_id,
            similarity: data.data.similarity,
            name: data.data.name,
            image_url: data.data.image_url,
            time: data?.take_time ?? null
        }
        return result
    } catch (error: any) {
        throw new Error(error?.message ?? "Error System");
    }
}