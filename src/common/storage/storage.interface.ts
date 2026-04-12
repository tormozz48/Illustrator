export interface IStorageService {
  upload(key: string, data: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
