import axios from "axios";
import { BASE_URL, CLIENT_SECRET } from "./Contants";

const AxiosConfig = axios.create({
    baseURL: BASE_URL,
    timeout: 60000,
    headers: {
        "Content-Type": "application/json",
        'Authorization': CLIENT_SECRET
    },
});

AxiosConfig.interceptors.response.use((response) => {
    if (__DEV__) {
        console.log('Axios Config Response: ', JSON.stringify(response, null, 2))
    }
    return response;
}, (error) => {
    if (__DEV__) {
        console.log('Axios Config Error: ', error?.response?.data || error?.message)
    }
    throw error;
});

AxiosConfig.interceptors.request.use((request) => {
    if (__DEV__) {
        console.log('Axios Config Request: ', JSON.stringify(request, null, 2))
    }
    return request;
}, (error) => {
    if (__DEV__) {
        console.log('Axios Config Error: ', error)
    }
    throw error;
});


export default AxiosConfig;
