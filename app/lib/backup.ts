import { spawn, exec, execSync } from 'child_process';
import dayjs from 'dayjs';
import { getBucketName, getDeviceName, getSettings, } from '~/routes/backup';
import { uploadFile } from '~/routes/files';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

export const listBuckets = async () => {
  const client = new S3Client({
    region: process.env.STORAGE_REGION,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
      secretAccessKey: process.env.STORAGE_SECRET || '',
    }
  });

  try {
    const command = new ListBucketsCommand({});
    const response = await client.send(command);
    
    const buckets = response?.Buckets?.map(e=>e.Name) || [];

    return buckets;
  } catch (err) {
    console.log("Error to list buckets:", err);
    return []
  }
};

export const restoreDatabase = async (file: string, log=console.log) => {
  const settings = await getSettings()
  const { databaseType, user, password, host, port, database, redisPassword } = settings;

  log(`Using settings: ${JSON.stringify(settings)}`);

  try {
    if(!file) return log({ error: 'File not provided' });

    const filePath = path.resolve(file);    
    await fs.access(filePath, fs.constants.F_OK);
    log({success: `File exists: [${file}]` });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      log({error: `File not found: [${file}]` });
    } else {
      log({ error: `Error checking file: ${error.message}`});
    }
  }

  const POSTGRES = `postgres:16-alpine`
  const backupFilePath = path.join(process.cwd(), file);

  try {
    
    const dropDatabaseCmd = `
      docker exec \
        -e PGPASSWORD=${password} \
        $(docker ps | grep ${POSTGRES} | awk '{print $1}') \
        psql -U ${user} -d postgres -c "DROP DATABASE ${database} WITH (FORCE);"
    `;
    console.log(dropDatabaseCmd);
    
    const output = execSync(dropDatabaseCmd, { encoding: 'utf8' });
    
    log({success: output.toString() })
    log({success: 'Database dropped successfully' });
  } catch (error: any) {
    log({error: `Error dropping database: ${error.stderr}`});
  }

  try {
    const createDatabaseCmd = `docker exec $(docker ps | grep ${POSTGRES} | awk '{print $1}') psql -U ${user} -d postgres -c "CREATE DATABASE ${database};"`;
    
    execSync(createDatabaseCmd, { stdio: 'inherit' });
    log({success: 'Database created successfully'});
  } catch (error: any) {
    log({error: `Error creating database: ${error.stderr}`});
  }

  try {
    log('Restoring database...');
    log(settings)
    const restoreCmd = `gunzip -c ${backupFilePath} | pg_restore --dbname="${databaseType}://${user}:${password}@${host}:${port}/${database}"`;
    
    execSync(restoreCmd, { stdio: 'inherit' });
    log({success: 'Database restored successfully'});
  }catch (error: any) {
    log({error: `Error restoring database: ${error.stderr}`});
  }

  try {
    console.log('Using password:', redisPassword);
    
    const rediCmd = `docker exec $(docker ps | grep redis | awk '{print $1}') redis-cli -a ${redisPassword} flushall`;
    const output = execSync(rediCmd, { encoding: 'utf8' });

    log({success: output.toString()})
    log({success: 'REDIS flushed successfully'});
  } catch (error: any) {
    log({error: `Error flushing redis: ${error?.stderr}`});
  }

};

export type typeDb = { user: string, password: string, host: string, port: string, database: string }

export const getDbSettingsById = async (id: string) => {
  const settings = await getSettings()
  return settings.databases.find(e=>e.id===id)
}

export const backupDatabase = async (databaseSettingsId: string, log = console.log) => {
  
  const dbSettings = await getDbSettingsById(databaseSettingsId)

  const { user, password, host, port, database, device, bucket } = dbSettings;

  const DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}`;
  const formattedDate = dayjs().format('YYYY-MM-DD____HH:mm:ss');
  const filename = `${device}__${bucket}__${formattedDate}.tar.gz`;
  const path = filename;

  try {
      log('Starting database backup...');
      log('>>>> The database to dump is: '+DATABASE_URL)
      // Using spawn to run the backup in a non-blocking way
      const backupProcess = spawn('sh', ['-c', `pg_dump --dbname=${DATABASE_URL} --format=custom | gzip > "./${path}"`]);

      backupProcess.stdout.on('data', (data) => log(`stdout: ${data}`));
      backupProcess.stderr.on('data', (data) => log(`stderr: ${data}`));

      backupProcess.on('close', async (code) => {
          if (code === 0) {
              log({ success: `Backup completed successfully: ${path}` });
              
              try {
                  log('Uploading file to s3...');
                  await uploadFile(path, bucket, filename);
                  log({ success: 'File uploaded successfully' });

                  // Trigger CURL step asynchronously
                  await triggerCurlStep(console.log, filename);
              } catch (error: any) {
                  log({ error: 'Error uploading or removing backup file' });
                  log({ error: error.message });
              } finally {
                log('Removing .tar.gz files...');
                await removeTarGzFiles();
                log({ success: 'File removed successfully' });

                log('Cleanup S3');
                try {
                  await s3CleanupScript(console.log);
                } catch (error: any) {
                  log({ error: 'Error cleaning up S3' });
                  log({ error: error.message });
                }

              }
          } else {
              log({ error: `Backup process exited with code ${code}` });
          }
      });
  } catch (error: any) {
      log({ error: 'Error during database backup' });
      log({ error: error.message });
  }
};

const TIMEOUT = 30000; // 30 seconds

const triggerCurlStep = async (log = console.log, filename: string) => {
  try {

    const settings = await getSettings();

    console.log('>>>>>>>> CURL step', settings.action);

    if (!settings.action || (!settings.action.includes('curl') && !settings.action.includes('--data-raw'))) {
      log('Invalid Curl');
      return;
    }

    log('Create local script file.');
    
    const size = await getFilesFromS3izeInMB(filename)

    console.log(settings);

    const actionText = settings.action
      .replaceAll('$file', filename)
      .replaceAll('$size', size)
      .replaceAll('$device', settings.device)

    await fs.writeFile('script.sh', actionText);

    if (settings.action) {
      log(`Executing file script.sh`);

      // Create a promise that will reject after 30 seconds
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Execution time exceeded 30 seconds')), TIMEOUT)
      );

      // Create a promise that will execute the script asynchronously
      const executeScript = new Promise((resolve, reject) => {
        exec('sh script.sh', (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Execution error: ${stderr || error.message}`));
          } else {
            log(stdout);
            resolve('Execution completed');
          }
        });
      });

      // Run both promises, whichever finishes first
      await Promise.race([executeScript, timeout]);

      log({ success: `Action Script executed successfully.` });
    }
  } catch (error: any) {
    log({ error: 'Error in script execution: ' + error.message });
    log({ error: error.message });
  }
};

const TIMEOUT_CLEANUP = 40000;

const s3CleanupScript = async (log = console.log) => {
  try {
    log(`Running S3 cleanup script`);

    // Create a promise that will reject after 30 seconds
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Execution time exceeded for S3 Cleanup')), TIMEOUT_CLEANUP)
    );

    const settings = await getSettings()

    
    const executeScript = new Promise((resolve, reject) => {
      console.log('Starting the script execution...');
      
      exec('sh ./cleanup-s3-script.sh', {
        env: {
          BUCKET_NAME: settings.bucket,
          FILES_TO_KEEP: String(settings.s3MaxFilesToKeep),
          ...process.env, // Garante que outras variáveis de ambiente também estejam disponíveis
        }
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Execution error: ${stderr || error.message}`));
        } else {
          console.log('Script executed successfully');
          console.log('STDOUT:', stdout);
          console.log('STDERR:', stderr);
          resolve('Execution completed');
        }
      });
    });
    
    // Run both promises, whichever finishes first
    await Promise.race([executeScript, timeout]);

    log({ success: `Action Script executed successfully.` });
  
  } catch (error: any) {
    log({ error: 'Error in script execution: ' + error.message });
    log({ error: error.message });
  }
};

// s3CleanupScript(console.log).catch(console.error);

// backupDatabase().then(console.log).catch(console.error);

async function removeTarGzFiles() {
  try {
    const directoryPath = process.cwd(); // Get the current working directory
    const files = await fs.readdir(directoryPath);
    
    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      if (path.extname(filePath) === '.gz') {
        await fs.unlink(filePath);
      }
    }
  } catch (error: any) {
    console.error(`Error removing .tar.gz files: ${error.message}`);
  }
}

export async function removeFile(file: string) {
  const filePath = path.resolve(file); // Resolves the file path to an absolute path
  await fs.unlink(filePath);
}

const getFilesFromS3izeInMB = async (filePath: string): Promise<string> => {
  try {
    const stats = await fs.stat(filePath);
    const fileSizeInBytes = stats.size;
    const fileSizeInMB = fileSizeInBytes / (1024 * 1024); // Convert bytes to MB
    return `${fileSizeInMB} mb`;
  } catch (error) {
    return `File ${filePath} not found`;
  }
};