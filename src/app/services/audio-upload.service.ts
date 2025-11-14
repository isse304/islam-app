import { Injectable, inject } from '@angular/core';
import { 
  Storage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject,
  UploadResult 
} from '@angular/fire/storage';

@Injectable({
  providedIn: 'root',
})
export class AudioUploadService {
  private storage = inject(Storage);

  /**
   * Upload audio blob to Firebase Storage
   */
  async uploadRecording(
    audioBlob: Blob,
    assignmentId: string,
    studentId: string
  ): Promise<string> {
    try {
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const extension = this.getFileExtension(audioBlob.type);
      const filename = `assignments/${assignmentId}/submissions/${studentId}_${timestamp}.${extension}`;
      
      // Create storage reference
      const storageRef = ref(this.storage, filename);
      
      // Upload the blob
      const uploadResult: UploadResult = await uploadBytes(storageRef, audioBlob, {
        contentType: audioBlob.type,
        customMetadata: {
          studentId,
          assignmentId,
          uploadedAt: new Date().toISOString(),
        },
      });
      
      // Return the storage path (not download URL for security)
      return uploadResult.ref.fullPath;
    } catch (error: any) {
      console.error('Error uploading audio:', error);
      throw new Error('Failed to upload recording: ' + error.message);
    }
  }

  /**
   * Get download URL for playback (with security rules)
   */
  async getDownloadUrl(storagePath: string): Promise<string> {
    try {
      const storageRef = ref(this.storage, storagePath);
      return await getDownloadURL(storageRef);
    } catch (error: any) {
      console.error('Error getting download URL:', error);
      throw new Error('Failed to get audio URL: ' + error.message);
    }
  }

  /**
   * Delete audio file (for re-recording)
   */
  async deleteRecording(storagePath: string): Promise<void> {
    try {
      const storageRef = ref(this.storage, storagePath);
      await deleteObject(storageRef);
    } catch (error: any) {
      // If file doesn't exist, that's okay
      if (error.code === 'storage/object-not-found') {
        return;
      }
      console.error('Error deleting audio:', error);
      throw new Error('Failed to delete recording: ' + error.message);
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType: string): string {
    const mimeMap: { [key: string]: string } = {
      'audio/webm': 'webm',
      'audio/webm;codecs=opus': 'webm',
      'audio/ogg': 'ogg',
      'audio/ogg;codecs=opus': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
    };

    return mimeMap[mimeType] || 'webm';
  }

  /**
   * Estimate file size in MB
   */
  getFileSizeMB(blob: Blob): number {
    return blob.size / (1024 * 1024);
  }

  /**
   * Check if file size is within limits (e.g., 50 MB max)
   */
  isFileSizeValid(blob: Blob, maxSizeMB: number = 50): boolean {
    return this.getFileSizeMB(blob) <= maxSizeMB;
  }
}

