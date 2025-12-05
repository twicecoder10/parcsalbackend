import multer from 'multer';
import { uploadToAzure, deleteFromAzure, getAzureUrl } from './azureStorage';

// File filter - only images
const imageFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.'));
  }
};

// Multer instances - use memory storage for Azure (files uploaded as buffers)
export const parcelImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 10, // Max 10 files at once
  },
});

export const proofImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5, // Max 5 files at once for proofs
  },
});

// Upload file to Azure Blob Storage
export async function uploadFile(
  file: Express.Multer.File,
  type: 'parcel' | 'proof'
): Promise<{ filename: string; url: string }> {
  if (!file.buffer) {
    throw new Error('File buffer is required for Azure storage');
  }
  return await uploadToAzure(file.buffer, file.originalname, type);
}

// Generate URL for uploaded image in Azure
// Note: filename already includes the folder path (e.g., "parcel/uuid.jpg" or "proof/uuid.jpg")
export function getImageUrl(filename: string): string {
  return getAzureUrl(filename);
}

// Helper to convert filename to URL
export function filenameToUrl(filename: string): string {
  return getImageUrl(filename);
}

// Delete image file from Azure
export async function deleteImageFile(filename: string): Promise<void> {
  // For Azure, filename includes the folder path (e.g., "parcel/uuid.jpg")
  await deleteFromAzure(filename);
}

/**
 * Check if URL is an Azure blob storage URL
 */
function isAzureBlobUrl(url: string): boolean {
  return url.includes('.blob.core.windows.net') || 
         url.includes('azure') || 
         url.match(/(parcel|proof|logo)\//) !== null;
}

/**
 * Extract filename from Azure blob URL or CDN URL
 * Handles both formats:
 * - https://account.blob.core.windows.net/container/parcel/uuid.jpg
 * - https://cdn.example.com/parcel/uuid.jpg
 * - https://account.blob.core.windows.net/container/logo/uuid.jpg
 */
export function extractFilenameFromUrl(url: string): string | null {
  if (!url) return null;
  
  // Only process Azure blob URLs
  if (!isAzureBlobUrl(url)) {
    return null;
  }
  
  try {
    // Try to parse as URL
    const urlObj = new URL(url);
    
    // Extract pathname and remove leading slash
    const pathname = urlObj.pathname.replace(/^\//, '');
    
    // Check if pathname contains 'parcel/', 'proof/', or 'logo/'
    if (pathname.includes('parcel/') || pathname.includes('proof/') || pathname.includes('logo/')) {
      // Return the part after container name (which includes folder name)
      // Path format: container-name/parcel/uuid.jpg or container-name/proof/uuid.jpg
      const parts = pathname.split('/');
      
      // Find the index of 'parcel', 'proof', or 'logo'
      const folderIndex = parts.findIndex(part => part === 'parcel' || part === 'proof' || part === 'logo');
      
      if (folderIndex !== -1) {
        // Return from folder name onwards: "parcel/uuid.jpg", "proof/uuid.jpg", or "logo/uuid.jpg"
        return parts.slice(folderIndex).join('/');
      }
    }
    
    // Fallback: try to extract filename from pathname
    // If it's just the filename with folder prefix
    const filenameMatch = pathname.match(/(parcel|proof|logo)\/.+$/);
    if (filenameMatch) {
      return filenameMatch[0];
    }
    
    return null;
  } catch (error) {
    // If URL parsing fails, try to extract filename manually
    const filenameMatch = url.match(/(parcel|proof|logo)\/[^\/]+\.(jpg|jpeg|png|webp|gif)/i);
    return filenameMatch ? filenameMatch[0] : null;
  }
}

/**
 * Delete image by URL (extracts filename and deletes)
 */
export async function deleteImageByUrl(url: string): Promise<void> {
  const filename = extractFilenameFromUrl(url);
  if (!filename) {
    console.warn(`Could not extract filename from URL: ${url}`);
    return;
  }
  
  try {
    await deleteFromAzure(filename);
  } catch (error: any) {
    // Log error but don't throw - cleanup failures shouldn't break the main operation
    console.error(`Failed to delete image ${filename} from URL ${url}:`, error.message);
  }
}

/**
 * Delete multiple images by URLs
 */
export async function deleteImagesByUrls(urls: string[]): Promise<void> {
  if (!urls || urls.length === 0) return;
  
  await Promise.allSettled(
    urls.map(url => deleteImageByUrl(url))
  );
}
