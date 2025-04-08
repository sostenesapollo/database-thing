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
	console.log('> settings:'result);
	
	try {
		const settings = JSON.parse(result?.value) as typeof presetValues;
		return settings;  
	}catch(e) {
		return {}
	}
}

const backup = () => {
	console.log('Backup triggered.');
	axios.get(`http://localhost:${process.env.PORT}/events?action=backup`).catch(e=>{
		console.log(e);
	})
}

let prevCron = null as string | null;
var task = cron.schedule('0 * * * *', backup, { scheduled: true });

setInterval(async ()=>{
	try {
		const settings = await getSettings()
		const newCron = settings.cron
		
		if(prevCron !== newCron){
			console.log('cron set to', newCron, cronToText(newCron));
			prevCron = newCron;
			
			task.stop()
			task = cron.schedule(newCron, backup, { scheduled: true });	
		}	
	}catch(e) {
		console.log(e);
	}
},1000)

export { prisma };
