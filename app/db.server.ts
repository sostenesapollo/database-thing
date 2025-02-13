import { PrismaClient } from "@prisma/client";
import cron from 'node-cron';
import axios from "axios";
import { cronToText } from "./lib/cron";

let prisma: PrismaClient;

declare global {
	var __db__: PrismaClient;
}

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// in production we'll have a single connection to the DB.
if (process.env.NODE_ENV === "production") {
	prisma = getClient();
} else {
	if (!global.__db__) {
		global.__db__ = getClient();
	}
	prisma = global.__db__;
}

function getClient() {
	const client = new PrismaClient({
		// datasources: {
		// 	db: {
		// 		url: process.env.DATABASE_URL,
		// 	},
		// },
	});
	client.$connect();
	return client;
}

async function getSettings() {
	const result = await prisma.setting.findFirst();
	try {
		const settings = JSON.parse(result?.value) as typeof presetValues;
		return settings;  
	}catch(e) {
		console.log('Error in get settings', e)
		return {}
	}
}

const backup = (name, databaseId) => () => {
	console.log('backup')
	if(!databaseId) {
		return console.log('No database ID provided.');
	}
	console.log(`🟢 Backup triggered for ${name}`);
	axios.get(`http://localhost:${process.env.PORT}/events?action=backup&databaseId=${databaseId}`).catch(e=>{
		console.log(e);
	})
}

let prevSettingsAll = [];
var task = cron.schedule('0 * * * *', backup(null, null), { scheduled: true });

setInterval(async ()=>{

	try {
		const settingsAll = await getSettings()
		// This loop is just to verify is there's any update in settings using database
		settingsAll?.databases?.forEach(databaseSettings=>{
			const newCron = databaseSettings.cron
			const prevCron = prevSettingsAll?.find(prev=>prev.id === databaseSettings.id)?.cron

			// if(!databaseSettings.enabled) {
			// 	console.log(`${databaseSettings.name} is disabled`)
			// } else {
			// 	console.log()
			// }

			if(databaseSettings.enabled) {
				console.log('ok', databaseSettings.name, databaseSettings.id)
				backup(databaseSettings.name, databaseSettings.id)()
			}

			if (prevCron !== newCron) {
				console.log(`${databaseSettings.name} cron set to`, newCron, cronToText(newCron));
				prevSettingsAll = settingsAll?.databases;

				task.stop()
				task = cron.schedule(newCron, backup(databaseSettings.name, databaseSettings.id), {scheduled: true});
			}
		})
	}catch(e) {
		console.log('Error in CRON interval')
		console.log(e);
	}
},3000)

export { prisma };
