import Config from "react-native-config";

const BASE_URL = Config.APP_BASE_URL;
const CLIENT_SECRET = Config.APP_CLIENT_SECRET;
const BASE_URL_IMAGE = Config.APP_BASE_URL_IMAGE;

function buildUrlImage(filename: string) {
    return Config.APP_BASE_URL_IMAGE + filename
}
export { BASE_URL, CLIENT_SECRET, BASE_URL_IMAGE, buildUrlImage }