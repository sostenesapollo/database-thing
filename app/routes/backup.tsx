import { Button } from "~/components/ui/button";
import { Link, useLoaderData } from "@remix-run/react";
import { Check, Cloud, DatabaseBackup, Download, Trash, Upload, X } from "lucide-react";
import { ThemeToggle } from "./resources.theme-toggle";
import { prisma } from "~/db.server";
import { Input } from "~/components/ui/input";
import { useEffect, useState } from "react";
import axios from 'axios';
import { deleteFile, downloadFile, getFilesFromS3 } from "./files";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import dayjs from '../../node_modules/dayjs/esm/index';
import { countDatabaseRows } from "~/lib/postgres";
import { listBuckets, removeFile, restoreDatabase } from "~/lib/backup";
import { twMerge } from "tailwind-merge";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { cronToText } from "~/lib/cron";

const presetValues = {
  databases: [{
    id: '112343',
    name: 'Main Database',
    enabled: true,
    expanded: false,
    // Database settings
    databaseType: 'postgresql',
    user: 'postgres',
    password: 'postgres',
    host: 'localhost',
    port: '5432',
    database: 'pedegas',
    // S3 and Cron settings
    device: 'mac',
    bucket: 'pedegasbackups',
    s3MaxFilesToKeep: 5,
    cron: '0 * * * *',
    // Redis settings
    redisHost: 'localhost',
    redisUser: '',
    redisPort: '6379',
    redisPassword: 'eYVX7EwVmmxKPCDmwMtyKVge8oLd2t81',
    // Action
    action: '',
  }],
};

export async function action({ request }: any) {
  const body = await request.json();
  // console.log('body', body);

  try {
    const count =await countDatabaseRows()
    // console.log(count);
    
  }catch(e){
    console.log('Eror to count records:', e);
  }
  
  if(body.action === 'delete') {
    const bucket = await getBucketName()
    console.log('remove', body, bucket);
    await deleteFile(bucket, body.key);
  }
  
  if(body.action === 'update') {
    await prisma.setting.updateMany({ where: { key: 'settings' }, data: { value: JSON.stringify({
      ...body.result,
    }) } });
  }

  if(body.action === 'restore') {
    const key = body.key;
    console.log('Baixando arquivo localmente.', body.key);
    await downloadFile(key)
    console.log('Baixado com sucesso.', body.key);
    console.log('Restaurando banco de dados.', body.key);
    await restoreDatabase(key, null);
    console.log('Restaurado com sucesso.', body.key);
    console.log('Removendo arquivo localmente.', body.key);
    await removeFile(key);
    console.log('Removido com sucesso.', body.key);
  }

  return {};
}

export async function getSettings() {
  const result = await prisma.setting.findFirst();
  const settings = JSON.parse(result?.value) as typeof presetValues;
  return settings;  
}

export async function getBucketName() {
  const result = await prisma.setting.findFirst();
  const settings = JSON.parse(result?.value);
  return settings['bucket'];  
}

export async function getDeviceName() {
  const result = await prisma.setting.findFirst();
  const settings = JSON.parse(result?.value);
  return settings['device'];  
}

export async function loader() {
  const result = await prisma.setting.findFirst();
  const parsedResult = JSON.parse(result?.value || JSON.stringify({}));
  const errors = [];

  const dbResults: { count:number, last_sale:string}[] = []

  for(const db of parsedResult.databases){
    dbResults[db.name] = { count: 0, last_sale: '' }
    try {
      const res = await countDatabaseRows(db, 'orders')
      dbResults[db.name].count = res.count;
      dbResults[db.name].last_sale = res.last_sale;
    } catch (e) {
      console.error('> Error to count Records:', e.message);
      errors.push(e)
    }
  }

  let buckets: (string | undefined)[] = [] ;
  try {
    buckets = await listBuckets()
  } catch (e) {
    console.error('>', e.message, e);
    errors.push('Error to list buckets')
  }

  return {
    date: new Date(),
    result: parsedResult,
    buckets,
    dbResults,
    errors
  };
}

const Loading = ({className=""}) => <svg aria-hidden="true" className={`inline w-6 h-6 mr-2 text-gray-50 animate-spin dark:text-gray-200 fill-pink-600 ${className}`} viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
<path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
</svg>

export default function Index() {
  const _data = useLoaderData<typeof loader>();
  const [data, setData] = useState({
    ..._data,
    result: {
      ..._data.result,
      files: [],
      databases: _data.result.databases || [{
        id: '1',
        name: 'Main Database',
        enabled: true,
        databaseType: 'postgresql',
        user: 'postgres',
        password: 'postgres',
        host: 'localhost',
        port: '5432',
        database: 'pedegas',
      }]
    }
  });

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<string>('all');
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [clickedId, setClickedId] = useState<number | null>(null);
  const [files, setFiles] = useState<{}[]>([]);

  const _setSelectedBucket = async (bucketName: string) => {
    setSelectedBucket(bucketName);
    try {
      console.log('Loading files... from bucket', bucketName)
      const result = await axios.get(`/files?bucket=${bucketName}`)
      console.log(result?.data?.files)
      setFiles(result?.data?.files || [])
    } catch (e) {
      toast.error('Error to list files from bucket')
    }
  }

  const update = async (db: any) => {
    setSavingIds((ids) => [...ids, db.id]);
    try {
      await axios.post('/backup', {...data, action: 'update', files: undefined, buckets: undefined});
      if(data.error) {
        window.location.reload();
      }
      setSuccessMessage(`${db.name} atualizado com sucesso.`);
      reloadFiles();
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (error) {
      console.error('Falha na atualização:', error);
    } finally {
      setSavingIds((ids) => ids.filter(id => id !== db.id));
    }
  };

  const remove = async (key: string) => {
    try {
      await axios.post('/backup', {key, action: 'delete'});
      setSuccessMessage('Removido com sucesso.');
      reloadFiles();
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (error) {
      console.error('Falha ao remover:', error);
    }
  }

  const reloadFiles = () => {
    axios.get('/files').then((response) => {
      setData((data)=>({...data, files: response.data.files}));
    })
  }

  const newBackup = async () => {
    setAction(()=> 'backup' as any)
  };

  const restore = async (fileKey: string) => {
    setClickedId(id);
    setAction(()=> 'restore' as any)
    restore(file.key)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData((prevData) => ({
      ...prevData,
      result: { 
        ...prevData.result,
        [name]: value
      }
    }));
  };

  const [messages, setMessages] = useState<string[]>([]);

  const [action, setAction] = useState(null);

  useEffect(() => {
    let eventSource = null as any;
  
    if(!action) return;
  
    console.log('>>>', action);
  
    if(action === 'restore') {
      eventSource = new EventSource("/events?action=restore&file="+clickedId);
    } else if(action === 'backup') {
      eventSource = new EventSource("/events?action=backup");
    }
  
    setLoading(true)
  
    eventSource.onmessage = (event: any) => {
      const data = JSON.parse(event.data);
      
      if(data.message.error) {
        toast.error(data.message?.error, {autoClose: 10000});
      }else if(data.message.success){
        toast.success(data.message?.success, {autoClose: 10000});
      } else {
        toast.info(data.message, {autoClose: 10000});
      }

      // setMessages((prevMessages) => [...prevMessages, data.message]);
    };
  
    eventSource.onerror = () => {
      setLoading(()=>false)
      setAction(null)
      console.error("EventSource failed");
      eventSource.close();
    };
  
    return () => {
      console.log('finished.');
      reloadFiles();
      eventSource?.close();
    };
  }, [action]);

  const textCron = cronToText(data.result.cron);
  const isSaveDisabled = textCron?.error;

  // Add database form
  const addDatabase = () => {
    const newId = Date.now().toString();
    setData((prevData) => ({
      ...prevData,
      result: {
        ...prevData.result,
        databases: [...prevData.result.databases, {
          id: newId,
          name: 'New Database',
          enabled: true,
          databaseType: 'postgresql',
          user: '',
          password: '',
          host: 'localhost',
          port: '5432',
          database: '',
          bucket: data?.buckets?.at(0)
        }]
      }
    }));
    setLastAddedId(newId);
  };

  useEffect(() => {
    if (lastAddedId) {
      const input = document.querySelector(`input[data-id="${lastAddedId}"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
        setLastAddedId(null);
      }
    }
  }, [lastAddedId]);

  // Remove database
  const removeDatabase = async (id: string) => {
    setData((prevData) => ({
      ...prevData,
      result: {
        ...prevData.result,
        databases: prevData.result.databases.filter(db => db.id !== id)
      }
    }));
    await remove(id)
  };

  // Handle database change
  const handleDatabaseChange = (id: string, field: string, value: string) => {
    setData((prevData) => ({
      ...prevData,
      result: {
        ...prevData.result,
        databases: prevData.result.databases.map(db => 
          db.id === id ? { ...db, [field]: value } : db
        )
      }
    }));
  };

  const toggleExpand = (id: string) => {
    setData((prevData) => ({
      ...prevData,
      result: {
        ...prevData.result,
        databases: prevData.result.databases.map(db => 
          db.id === id ? { ...db, expanded: !db.expanded } : db
        )
      }
    }));
  };

  // Handle Enter key on database name
  const handleKeyPress = (e: React.KeyboardEvent, db: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      update(db);
    }
  };

  return (
    <>
      <ToastContainer 
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        style={{ 
          zIndex: 9999,
          position: 'fixed',
          top: 20,
          right: 20,
        }}
      />

      <section className="relative">
        <div className="flex">
          <div>
            <pre>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
          <div>
            {messages.map((message: any, index) => (
              message?.error ? 
                <p key={index} className="bg-red-300 px-2">{message.error}</p> :
                <p key={index} className="bg-green-400">{message}</p>
            ))}
          </div>
        </div>   

        <nav className="flex items-center justify-between p-4 w-full">
          <Link to="/" className="flex items-center space-x-2">
            <DatabaseBackup className="h-8 w-8" />
            <h1 className="text-xl font-semibold">Database Thing</h1>
          </Link>
          <ThemeToggle />
        </nav>

        {successMessage &&(
          <span className={`fixed bottom-4 right-4 bg-green-600 text-white p-3 rounded shadow-lg transition-transform duration-500 ${successMessage ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {successMessage}
          </span>
        )}
        
        {data?.error && (
          <span className={`fixed bottom-4 right-4 bg-red-600 text-white p-3 rounded shadow-lg transition-transform duration-500 opacity-100 z-10 translate-y-0`}>
            Error check the logs:
            <pre>
            {JSON.stringify(data?.error, null, 2)}
            </pre>
          </span>
        )}

        <div className="container flex flex-col space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Database Configurations</h2>
            <Button 
              type="button" 
              onClick={addDatabase}
              className="bg-green-600"
            >
              Add Database
            </Button>
          </div>

          {data?.result?.databases?.map((db) => {
            const isSaving = savingIds.includes(db.id);
            
            return (
              <div key={db.id} className="border rounded-lg shadow-sm">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4 flex-1">
                    {/* {db.id} */}
                    <Input
                      placeholder="Database Name"
                      value={db.name}
                      onChange={(e) => handleDatabaseChange(db.id, 'name', e.target.value)}
                      onKeyPress={(e) => handleKeyPress(e, db)}
                      disabled={isSaving}
                      className="max-w-xs font-bold"
                      data-id={db.id}
                    />
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={db.enabled}
                        onChange={(e) => handleDatabaseChange(db.id, 'enabled', e.target.checked)}
                        disabled={isSaving}
                        className="mr-2"
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      className='bg-green-600' 
                      onClick={() => update(db)}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loading className="mr-2 h-4 w-4" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2"/>
                          Save
                        </>
                      )}
                    </Button>
                    <Button 
                      type="button"
                      onClick={() => toggleExpand(db.id)}
                      variant="outline"
                      disabled={isSaving}
                    >
                      {db.expanded ? 'Show Less' : 'Show More'}
                    </Button>
                    <Button 
                      type="button"
                      onClick={() => removeDatabase(db.id)}
                      className="bg-red-600"
                      disabled={isSaving}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {db.expanded && (
                  <div className="p-4 border-t">
                    {/* Database Settings */}
                    <div className="mb-6">
                      <h3 className="font-bold text-lg mb-4">Database Settings</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Database Type</label>
                          <Input
                            value={db.databaseType}
                            onChange={(e) => handleDatabaseChange(db.id, 'databaseType', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">User</label>
                          <Input
                            value={db.user}
                            onChange={(e) => handleDatabaseChange(db.id, 'user', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Password</label>
                          <Input
                            type="password"
                            value={db.password}
                            onChange={(e) => handleDatabaseChange(db.id, 'password', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Host</label>
                          <Input
                            value={db.host}
                            onChange={(e) => handleDatabaseChange(db.id, 'host', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Port</label>
                          <Input
                            value={db.port}
                            onChange={(e) => handleDatabaseChange(db.id, 'port', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Database</label>
                          <Input
                            value={db.database}
                            onChange={(e) => handleDatabaseChange(db.id, 'database', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                      </div>
                    </div>

                    {/* S3 and Cron Settings */}
                    <div className="mb-6">
                      <h3 className="font-bold text-lg mb-4">S3 and Cron Settings</h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Device Label</label>
                          <Input
                            value={db.device}
                            onChange={(e) => handleDatabaseChange(db.id, 'device', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Bucket</label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                            value={db.bucket}
                            onChange={(e) => handleDatabaseChange(db.id, 'bucket', e.target.value)}
                            disabled={isSaving}
                          >
                            {data?.buckets?.map((bucket) => (
                              <option key={bucket} value={bucket}>{bucket}</option>
                            ))}
                          </select>
                        </div>
                        {JSON.stringify(db, null, 2)}

                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Files to Keep</label>
                          <Input
                            type="number"
                            min={1}
                            value={db.s3MaxFilesToKeep}
                            onChange={(e) => handleDatabaseChange(db.id, 's3MaxFilesToKeep', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Cron</label>
                          <Input
                            value={db.cron}
                            onChange={(e) => handleDatabaseChange(db.id, 'cron', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                          <div className={twMerge(
                            cronToText(db.cron)?.error ? 'text-red-500' : 'text-gray-500'
                          )}>
                            {cronToText(db.cron)?.text}
                            {cronToText(db.cron)?.error}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Redis Settings */}
                    <div className="mb-6">
                      <h3 className="font-bold text-lg mb-4">Redis Settings</h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Host</label>
                          <Input
                            value={db.redisHost}
                            onChange={(e) => handleDatabaseChange(db.id, 'redisHost', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">User</label>
                          <Input
                            value={db.redisUser}
                            onChange={(e) => handleDatabaseChange(db.id, 'redisUser', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Port</label>
                          <Input
                            value={db.redisPort}
                            onChange={(e) => handleDatabaseChange(db.id, 'redisPort', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="flex flex-col">
                          <label className="mb-2 font-medium">Password</label>
                          <Input
                            type="password"
                            value={db.redisPassword}
                            onChange={(e) => handleDatabaseChange(db.id, 'redisPassword', e.target.value)}
                            onKeyPress={(e) => handleKeyPress(e, db)}
                            disabled={isSaving}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action After Success */}
                    <div>
                      <h3 className="font-bold text-lg mb-4">Action After Success</h3>
                      <textarea
                        value={db.action}
                        onChange={(e) => handleDatabaseChange(db.id, 'action', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                        rows={3}
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="container w-full flex flex-col mt-3">
          <div className="mb-4 flex flex-row justify-between items-center">
              <label className="font-medium">Filtrar por Banco de Dados:</label>
              <select
                className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={selectedBucket}
                onChange={(e) => _setSelectedBucket(e.target.value)}
              >
                <option value="all">Todos os Buckets</option>
                {data?.buckets?.map((bucket) => (
                  <option key={bucket} value={bucket}>
                    {bucket}
                  </option>
                ))}
              </select>
          </div>

          <Table>
            <TableCaption>
              Arquivos do bucket S3 {selectedBucket !== 'all' && `para ${selectedBucket}`}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Tamanho</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Nome do Arquivo - Chave</TableHead>
                <TableHead>Banco de Dados</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files?.map((file, id) => (
                <TableRow key={file.key}>
                  <TableCell>
                    {Math.round(file.size / 1000000)} mb
                  </TableCell>
                  <TableCell>
                    {file.tags?.map((tag) => (
                      <span key={tag.Key} className="mr-2 bg-blue-700 text-white text-xs p-1 rounded-xl">
                        {tag.Key}: {tag.Value}
                      </span>
                    ))}
                  </TableCell>
                  <TableCell className="font-medium">{file.key}</TableCell>
                  <TableCell>
                    {file.tags?.find(tag => tag.Key === 'database')?.Value || '-'}
                  </TableCell>
                  <TableCell>{dayjs(new Date(file.lastModified)).format('DD / MM / YYYY')}</TableCell>
                  <TableCell>{dayjs(new Date(file.lastModified)).format('HH:mm')}</TableCell>
                  <TableCell className="flex flex-col">
                    <div className="flex">
                      <button
                        type="button"
                        className={twMerge(
                          "pr-2 text-white bg-blue-500 border border-blue-700 hover:bg-blue-700 hover:text-white focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-full text-sm text-center inline-flex items-center dark:border-blue-500 dark:text-blue-500 dark:hover:text-white dark:focus:ring-blue-800 dark:hover:bg-blue-500",
                          id === clickedId && 'bg-green-600'
                        )}
                        onClick={() => {
                          setClickedId(id)
                          setAction('restore' as any)
                          restore(file.key)
                        }}
                      >
                        {id === clickedId ? <Loading className="ml-3"/> : <Download className="m-1"/>}
                        {id === clickedId ? 'Restaurando...' : 'Restaurar'}
                      </button>
                      <button
                        type="button"
                        className={"ml-2 text-white bg-red-600 border border-red-700 hover:bg-red-700 hover:text-white focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-full text-sm text-center inline-flex items-center dark:border-red-500 dark:text-red-500 dark:hover:text-white dark:focus:ring-red-800 dark:hover:bg-red-500"}
                        onClick={() => {
                          if (window.confirm(`Tem certeza que deseja remover o arquivo ${file.key}?`)) {
                            remove(file.key);
                          }
                        }}
                      >
                        <Trash className="m-1"/>
                      </button>
                    </div>
                  </TableCell>
                  
                </TableRow>
              ))}
            </TableBody>
          </Table>     

        </div>
      </section>
    </>
  );
}
