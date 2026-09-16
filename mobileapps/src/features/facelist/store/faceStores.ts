import { observable } from "@legendapp/state";

export interface Faces {
    id: string,
    name: string,
    image_url: string,
    created_at: string,
    updated_at: string
}

export interface StoreFaces {
    faces: Faces[],
    total: number;
    page: number;
    limit: number;
    loading: boolean;
}

export const storeFaces$ = observable<StoreFaces>({
    faces: [],
    total: 0,
    page: 1,
    limit: 50,
    loading: false
})