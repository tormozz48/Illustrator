import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WS_NAMESPACE_BOOKS } from '../../common/constants';

@WebSocketGateway({
  namespace: WS_NAMESPACE_BOOKS,
  cors: { origin: '*' },
})
export class BooksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(BooksGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { bookId: string },
  ) {
    const room = `book:${data.bookId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { event: 'joined', data: { room } };
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { bookId: string },
  ) {
    const room = `book:${data.bookId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} left room ${room}`);
  }

  // Methods called by worker (via Redis pub/sub relay or direct injection)
  emitBookStatus(bookId: string, status: string) {
    this.server.to(`book:${bookId}`).emit('book:status', { bookId, status });
  }

  emitVariantGenerated(bookId: string, chapterNum: number, sceneId: number, variant: any) {
    this.server.to(`book:${bookId}`).emit('chapter:variant-generated', {
      bookId, chapterNum, sceneId, variant,
    });
  }

  emitGenerationDone(bookId: string, chapterNum: number) {
    this.server.to(`book:${bookId}`).emit('chapter:generation-done', { bookId, chapterNum });
  }

  emitGenerationError(bookId: string, chapterNum: number, error: string) {
    this.server.to(`book:${bookId}`).emit('chapter:generation-error', { bookId, chapterNum, error });
  }
}
