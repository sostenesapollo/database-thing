import { LoaderFunction } from "@remix-run/node";
import {backupDatabase, restoreDatabase} from "~/lib/backup";
import { downloadFile } from "./files";

const logger = (sendEvent:any) => (message: any) => {
  sendEvent({ message });
  console.log(message);
}

export const loader: LoaderFunction = async ({ request }) => {
  try {
  const url = new URL(request.url);
  const action = url.searchParams.get("action")
  const file = url.searchParams.get("file") as string
  
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: any) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      };
      
      const log = logger(sendEvent)

      let isClosed = false;
      
      const closeStream = () => {
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      };

      log('Backup started');

      if(action === 'backup'){
        const databaseId = url.searchParams.get("databaseId")

        backupDatabase(databaseId).then((msg)=>{
          log({success: 'Backup completed' });
          log({success: msg });
          closeStream();
        }).catch(e=>{
          console.log('Error to backup', e)
          log({ error: e.message })
          closeStream();
        })
      } else if(action === 'restore'){
        log(`Downloading file [${file}] from S3...`);

        downloadFile(file, log)
          .then(()=>{
            log({success: 'Download from S3 successfull' });
            
            restoreDatabase(file, log).then((msg)=>{
              log({success: 'Process completed'});

              closeStream();
            }).catch(e=>{
              log({ error: e.message })
              closeStream();
            })
          })
          .catch(e=>{
            log({ error: e.message })
            closeStream();
          })
      } else {
        log(`action not defined.`);
        closeStream();
      }

      // Handle request abortion
      request.signal.addEventListener('abort', () => {
        closeStream();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
  } catch (e) {
    console.error(e);
    return new Response(e.message, { status: 500 });
  }
};
