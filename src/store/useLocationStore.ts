import { create } from 'zustand';

type PermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

interface LocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  timestamp: number | null;
  permissionStatus: PermissionState;
  _watchId: number | null;

  init: () => void;
  stop: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  lat: null,
  lng: null,
  accuracy: null,
  timestamp: null,
  permissionStatus: 'prompt',
  _watchId: null,

  init: () => {
    if (get()._watchId !== null) return;

    if (!navigator.geolocation) {
      set({ permissionStatus: 'unavailable' });
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        set({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          permissionStatus: 'granted',
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          set({ permissionStatus: 'denied' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );

    set({ _watchId: id });
  },

  stop: () => {
    const id = get()._watchId;
    if (id !== null) {
      navigator.geolocation.clearWatch(id);
      set({ _watchId: null });
    }
  },
}));
