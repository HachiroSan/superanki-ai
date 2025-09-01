import { File } from '../entities/File';

export interface FileRepository {
  save(file: File): Promise<void>;
  findByPath(path: string): Promise<File | null>;
  findAll(): Promise<File[]>;
  deleteByPath(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
