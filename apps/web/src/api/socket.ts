import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/books', {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function joinBook(bookId: string) {
  getSocket().emit('join', { bookId });
}

export function leaveBook(bookId: string) {
  getSocket().emit('leave', { bookId });
}

export function onBookStatus(callback: (data: { bookId: string; status: string }) => void) {
  getSocket().on('book:status', callback);
  return () => { getSocket().off('book:status', callback); };
}

export function onVariantGenerated(
  callback: (data: { bookId: string; chapterNum: number; sceneId: number; variant: any }) => void,
) {
  getSocket().on('chapter:variant-generated', callback);
  return () => { getSocket().off('chapter:variant-generated', callback); };
}

export function onGenerationDone(
  callback: (data: { bookId: string; chapterNum: number }) => void,
) {
  getSocket().on('chapter:generation-done', callback);
  return () => { getSocket().off('chapter:generation-done', callback); };
}

export function onGenerationError(
  callback: (data: { bookId: string; chapterNum: number; error: string }) => void,
) {
  getSocket().on('chapter:generation-error', callback);
  return () => { getSocket().off('chapter:generation-error', callback); };
}
