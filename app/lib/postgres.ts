import dayjs from 'dayjs';
import pg from 'pg';
import { typeDb } from './backup';

// This is just a simple example of a function that connects to a Postgres database and counts the number of records in a table.
// After it will be shown in ui to the user.
export async function countDatabaseRows(settings: typeDb, tableName="orders") {

  console.info('counting rows...', settings);
  console.log({
    host: settings.host,
    user: settings.user,
    password: settings.password,
    database: settings.database,
    port: parseInt(settings.port),
  });
  
  const client = new pg.Client({
    host: settings.host,
    user: settings.user,
    password: settings.password,
    database: settings.database,
    port: parseInt(settings.port),
  });

  await client.connect();

  const res = await client.query(`
    SELECT
      COUNT(*) AS count,
      (SELECT MAX(created_at) FROM ${tableName}) AS last_sale
    FROM orders;
  `);

  const { count, last_sale } = res.rows[0];

  await client.end();

  return { count, last_sale: dayjs(last_sale).add(-3, 'hours').format('DD/MM/YYYY HH:mm') };
}
