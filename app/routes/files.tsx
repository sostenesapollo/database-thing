import { LoaderFunction } from "@remix-run/node"; // Ensure using server-side
import { ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, GetObjectTaggingCommand } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import { getBucketName } from "./backup";
import { PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import { countDatabaseRows } from "~/lib/postgres";

console.log({
  region: process.env?.STORAGE_REGION,
  accessKeyId: process.env?.STORAGE_ACCESS_KEY,
  secretAccess: process.env?.STORAGE_SECRET,
});


const s3 = new S3Client({
  region: process.env?.STORAGE_REGION,
  credentials: {
    accessKeyId: process.env?.STORAGE_ACCESS_KEY,
    secretAccessKey: process.env?.STORAGE_SECRET,
  },
} as any);

export const loader: LoaderFunction = async ({request}: any) => {
    const url = new URL(request.url);
    const bucket = url.searchParams.get("bucket");
  
  const files = await getFilesFromS3(bucket)

  return {
    files: files
  };
};

export const action: LoaderFunction = async ({request}: any) => {
  const { filePath, bucket, key } = await request.json();

  const result = await uploadFile(filePath, bucket, key);

  return { result };
}

export async function getFilesFromS3(bucket: string) {
  const params = { Bucket: bucket };
  const data = await s3.send(new ListObjectsV2Command(params));
  
  const files = data.Contents?.map(async (file) => {
      const tagsData = await s3.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: file.Key }));
      
      return {
          key: file.Key,
          size: file.Size,
          lastModified: file.LastModified,
          tags: tagsData.TagSet, // Add the tags to the file object
      };
  });

  const resolvedFiles = await Promise.all(files || []);
  // console.log(resolvedFiles);
  
  
  // Ordenar os arquivos pelos mais recentes
  const sortedFiles = resolvedFiles?.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

  return sortedFiles;
}

export async function deleteFile(bucket: string, key: string) {    
    const params = {
      Bucket: bucket,
      Key: key
    };

    await s3.send(new DeleteObjectCommand(params));
}

export async function uploadFile(filePath: string, bucket: string, key: string) {
  try {
    // Read the file as a buffer
    const fileContent = await fs.readFile(filePath);

    let count: number | undefined;

    try {
      const rst = await countDatabaseRows();
      count = rst.count;
    } catch (error) {
      console.error('Error getting record count:', error);
    }

    // Prepare tags as a URL-encoded string
    const tags = count !== undefined ? `Count=${encodeURIComponent(count)}` : '';

    // Create the S3 upload parameters
    const params = {
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      Tagging: tags, // Add tags as a URL-encoded string
    };

    // Upload the file to S3
    const result = await s3.send(new PutObjectCommand(params));
    console.log('S3 result', result);
    
    return result; // Indicate successful upload
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

export async function downloadFile(key: string, log=console.log) {
  try {
    const bucket = await getBucketName()
    const params = {
      Bucket: bucket,
      Key: key
    };

    const command = new GetObjectCommand(params);
    const response = await s3.send(command);

    await fs.writeFile(key, response.Body as Buffer);
    console.log(`File downloaded successfully to ${key}`);
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}