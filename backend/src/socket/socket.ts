import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../middleware/auth';

let io: SocketServer;

export function initSocket(server: HttpServer) {
  io = new SocketServer(server);

  const staffNamespace = io.of('/staff');
  
  staffNamespace.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  staffNamespace.on('connection', (socket) => {
    console.log('Staff conectado:', socket.data.user.username);
  });

  const publicNamespace = io.of('/public');
  
  publicNamespace.on('connection', (socket) => {
    console.log('Cliente público conectado');
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.io não inicializado');
  }
  return io;
}
