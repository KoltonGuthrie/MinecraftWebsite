const { AsyncDatabase } = require("promised-sqlite3");
const fs = require('fs');
const path = require("path");

const websockets = new Map(); // Websockets stored in memory (So I can store them as objects)

const dir = 'db';
const file = '/minecraft_web_database.sqlite';

init();

async function connect() {

	if (!fs.existsSync(dir)){
		fs.mkdirSync(dir);
	}

	if(!fs.existsSync(path.join(dir, file))) {
		fs.writeFileSync(path.join(dir, file), '');
	}

	const db = await AsyncDatabase.open(path.join(dir, file));
	return db;
}

async function init() {
	const db = await connect();
	await db.run( 'PRAGMA journal_mode = DELETE;' );
	await db.run(
		`CREATE TABLE IF NOT EXISTS 'websockets'
            (
            'id' STRING NOT NULL,
            'user_id' STRING NOT NULL,
			'image_id' STRING NOT NULL
            );`
	);
	await db.run(
		`CREATE TABLE IF NOT EXISTS 'users'
            (
            'id' STRING NOT NULL,
            'username' STRING NOT NULL,
            'token' STRING NOT NULL
            );`
	);
	await db.run(
		`CREATE TABLE IF NOT EXISTS 'images'
            (
            'id' STRING NOT NULL,
            'user_id' STRING NOT NULL,
			'original_file_name' STRING,
			'original_file' STRING NOT NULL,
            'minecraft_file' STRING NOT NULL,
            'created' STRING NOT NULL,
            'status' INTEGER NOT NULL
            );`
	);
	await db.close();
}

async function updateImage({ id = "%", key, value }) {
    if(!key || !value) return null;

	const db = await connect();
    await db.run(`UPDATE images SET ${key} = ? WHERE id LIKE ?;`,[value, id]);
	await db.close();

    return await getImage({ id });
}

async function addImage({id, userID, original_file_name, original_file = 'null', minecraft_file = 'null', created, status}) {
	const db = await connect();
    await db.run(`INSERT INTO images(id, user_id, original_file_name, original_file, minecraft_file, created, status) VALUES(?,?,?,?,?,?,?);`,[id, userID, original_file_name, original_file, minecraft_file, created, status]);
	await db.close();

	return await getImage({ id });
}

async function getImage({ id }) {
	const db = await connect();
    const row = await db.get(`SELECT * FROM images WHERE id LIKE ?;`,[id]);
	await db.close();

	return row || null;
}

async function addUser({ id, username, token }) {
	const db = await connect();
	await db.run(`INSERT INTO users(id, username, token) VALUES(?,?,?);`,[id, username, token]);
	await db.close();

	return await getUser({id, username, token});
}

async function getUser({ id = "%", username = "%", token = "%" }) {
	const db = await connect();
	const row = await db.get(`SELECT * FROM users WHERE id LIKE ? AND username LIKE ? AND token LIKE ?;`, [id, username, token]);
	await db.close();

	return row || null;
}

async function addWebsocket({ id, user_id, image_id, ws }) {
	const db = await connect();
	await db.run(`INSERT INTO websockets(id, user_id, image_id) VALUES(?,?,?);`,[id, user_id, image_id]);
	await db.close();

    websockets.set(id, ws);
	//db.close();

	return await getWebsocket({id, user_id, image_id, data: true});
	//return getWebsocket({id, userID, data: true});
}

async function getWebsocket({id = '%', user_id = '%', image_id = '%', data = false}) {
	const db = await connect();
	const row = await db.get(`SELECT * FROM websockets WHERE id LIKE ? AND user_id LIKE ? AND image_id LIKE ?;`, [id, user_id, image_id]);
	await db.close();

	if(!data) return websockets.get(row.id);
    return row || null;
}


async function getWebsockets({id = '%', user_id = '%', image_id = '%', data = false}) {
	const db = await connect();
	const row = await db.all(`SELECT * FROM websockets WHERE id LIKE ? AND user_id LIKE ? AND image_id LIKE ?;`, [id, user_id, image_id]);
	await db.close();

	if(data) return row;
	
	const arr = [];

	for(let i = 0; i < row.length; i++) {
		const obj = row[i];
		const ws = await getWebsocket({id: obj.id, user_id: obj.user_id, image_id: obj.image_id, data: false});
		if(ws.readyState !== 1) ws = undefined;
		obj["ws"] = ws;
		arr.push(obj);
	}

	return arr;
}

module.exports = {
	init, updateImage, addImage, getImage, addUser, getUser, addWebsocket, getWebsocket, getWebsockets
}