export type MediaType = 'image' | 'video';

export interface ProjectMedia {
  storage: 'local' | 's3';
  type: MediaType;
  url?: string;  // only S3
  key?: string;  // only S3
  path?: string; // only local
}
