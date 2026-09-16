import { observable } from "@legendapp/state"
import { observablePersistMMKV } from "@legendapp/state/persist-plugins/mmkv"
import { syncObservable } from "@legendapp/state/sync"
import {
  type GeoPosition,
} from 'react-native-geolocation-service'

const MMKV_INSTANCE_ID = 'locations-store'
const mmkvPlugin = observablePersistMMKV({ id: MMKV_INSTANCE_ID })

const initialState: GeoPosition = {
  coords: {
    latitude: 0,
    longitude: 0,
    accuracy: 0,
    altitude: 0,
    heading: 0,
    speed: 0,
  },
  mocked: false,
  timestamp: 0,
}

export const locationStore$ = observable<GeoPosition>(initialState)
// Attach MMKV persistence to the observable.
syncObservable(locationStore$, {
  persist: {
    name: MMKV_INSTANCE_ID,
    plugin: mmkvPlugin,
  },
})