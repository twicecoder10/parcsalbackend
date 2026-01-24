import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { config } from '../config/env';
import { randomUUID } from 'crypto';
import path from 'path';

let blobServiceClient: BlobServiceClient | null = null;
let containerClient: ContainerClient | null = null;

// Initialize Azure Blob Storage client
function initializeAzureStorage(): ContainerClient {
  if (containerClient) {
    return containerClient;
  }

  // Check if connection string is provided
  if (config.azureStorage.connectionString) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      config.azureStorage.connectionString
    );
  } else if (config.azureStorage.accountName && config.azureStorage.accountKey) {
    // Construct connection string from account name and key
    const connectionString = `DefaultEndpointsProtocol=https;AccountName=${config.azureStorage.accountName};AccountKey=${config.azureStorage.accountKey};EndpointSuffix=core.windows.net`;
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  } else {
    throw new Error('Azure Storage configuration is missing. Please provide AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY');
  }

  // Get container client
  containerClient = blobServiceClient.getContainerClient(config.azureStorage.containerName);

  return containerClient;
}

// Ensure container exists
export async function ensureContainerExists(): Promise<void> {
  try {
    const container = initializeAzureStorage();
    await container.createIfNotExists({
      access: 'blob', // Public read access for blob URLs
    });
  } catch (error) {
    console.error('Error ensuring Azure container exists:', error);
    throw error;
  }
}

// Upload file to Azure Blob Storage
export async function uploadToAzure(
  buffer: Buffer,
  originalFilename: string,
  type: 'parcel' | 'proof' | 'label' | 'feedback'
): Promise<{ filename: string; url: string }> {
  await ensureContainerExists();
  
  const container = initializeAzureStorage();
  
  // Generate unique filename
  const extension = path.extname(originalFilename);
  const filename = `${type}/${randomUUID()}${extension}`;
  
  // Get block blob client
  const blockBlobClient: BlockBlobClient = container.getBlockBlobClient(filename);
  
  // Upload file
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: {
      blobContentType: getContentType(extension),
    },
  });

  // Generate URL
  const url = config.azureStorage.cdnUrl
    ? `${config.azureStorage.cdnUrl}/${filename}`
    : blockBlobClient.url;

  return {
    filename,
    url,
  };
}

// Delete file from Azure Blob Storage
export async function deleteFromAzure(filename: string): Promise<void> {
  try {
    const container = initializeAzureStorage();
    const blockBlobClient = container.getBlockBlobClient(filename);
    await blockBlobClient.delete();
  } catch (error: any) {
    // File might not exist, that's okay
    if (error.statusCode !== 404) {
      console.error(`Error deleting file from Azure: ${filename}`, error);
      throw error;
    }
  }
}

// Get content type from file extension
function getContentType(extension: string): string {
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
  };

  return contentTypes[extension.toLowerCase()] || 'application/octet-stream';
}

// Generate URL for file in Azure
export function getAzureUrl(filename: string): string {
  if (config.azureStorage.cdnUrl) {
    return `${config.azureStorage.cdnUrl}/${filename}`;
  }

  const accountName = config.azureStorage.accountName;
  const containerName = config.azureStorage.containerName;
  
  if (!accountName || !containerName) {
    throw new Error('Azure Storage account name and container name are required');
  }

  return `https://${accountName}.blob.core.windows.net/${containerName}/${filename}`;
}

