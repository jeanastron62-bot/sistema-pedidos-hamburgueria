import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/useAuthStore';

let publicSocket: Socket | null = null;
let staffSocket: Socket | null = null;

export function getPublicSocket(): Socket {
  if (!publicSocket) {
    publicSocket = io('/public', { transports: ['websocket', 'polling'] });
  }
  return publicSocket;
}

export function getStaffSocket(): Socket {
  if (!staffSocket) {
    const token = useAuthStore.getState().token;
    staffSocket = io('/staff', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
  }
  return staffSocket;
}

export function disconnectSockets(): void {
  publicSocket?.disconnect();
  staffSocket?.disconnect();
  publicSocket = null;
  staffSocket = null;
}
