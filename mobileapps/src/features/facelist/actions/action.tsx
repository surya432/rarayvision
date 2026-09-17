import { CLIENT_SECRET } from "core/utility/Contants";
import { storeFaces$ } from "../store/faceStores";
import { AxiosConfig } from "core/utility";

export async function getListFaces(): Promise<void> {
    storeFaces$.loading.set(true)
    try {
        const pages = storeFaces$.page.get()
        const limit = storeFaces$.limit.get()
        const { data } = await AxiosConfig.get(`/api/v1/faces?page=${pages}&limit=${limit}`)
        const { status, ...dataRest } = data
        storeFaces$.assign(dataRest)
    } catch (error) {
        // Keep the failure silent for production, while the UI can surface an error state if needed.
    } finally {
        storeFaces$.loading.set(false)
    }
}
interface PostAddFace {
    name: string;
    foto: string;

}
export async function addFace(params: PostAddFace) {
    const name = params.name;
    const foto = params.foto;

    // send request to server
    const formData = new FormData();
    formData.append('file', {
        uri: foto,
        type: 'image/jpeg',
        name: `${name}.jpeg`,
    });
    formData.append('user_name', name);
    const { data } = await AxiosConfig.post('/api/v1/faces', formData, {
        headers: {
            "Content-Type": "multipart/form-data",
            'Authorization': CLIENT_SECRET
        }
    });

    console.log('response', data)
    if (data?.status == "error") throw new Error(data?.message)
    return data;
}

export async function deleteFace(id: string) {
    storeFaces$.loading.set(true)
    try {

        const { data } = await AxiosConfig.delete(`/api/v1/faces/${id}`);

        console.log('response', data)
        if (data?.status == "error") throw new Error(data?.message)
        await getListFaces()
    } catch (error) {
        console.log('ok', error?.message)
    } finally {
        storeFaces$.loading.set(false)
    }
} 