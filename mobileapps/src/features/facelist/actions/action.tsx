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