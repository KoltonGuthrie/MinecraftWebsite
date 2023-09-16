import { Database } from "bun:sqlite";

const websockets = new Map(); // Websockets stored in memory (So I can store them as objects)

const file = "db/mydb.sqlite";

init();

async function connect() {
	const db = await new Database(file, { create: true });
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
			'original_file' STRING NOT NULL,
            'minecraft_file' STRING NOT NULL,
            'created' STRING NOT NULL,
            'status' INTEGER NOT NULL
            );`
	);
	await db.close();
}

export async function updateImage({ id = "%", key, value }) {
    if(!key || !value) return null;
	const db = await connect();
    const query = await db.prepare(`UPDATE images SET ${key} = ? WHERE id LIKE ?;`,[value, id]);
	await query.run();
	await db.close();
    return await getImage({ id });
}

export async function addImage({id, websocketID = 'null', userID, original_file = 'null', minecraft_file = 'null', created, status}) {
	const db = await connect();
    const query = await db.prepare(`INSERT INTO images(id, user_id, original_file, minecraft_file, created, status) VALUES(?,?,?,?,?,?,?);`,[id, userID, original_file, minecraft_file, created, status]);
	await query.run();
	await db.close();
	return await getImage({ id });
}

export async function getImage({ id = "%"}) {
	const db = await connect();
    const query = await db.prepare(`SELECT * FROM images WHERE id LIKE ?;`,[id, websocketID]);
	const result = await query.get();
	await db.close();
	return result;
}

export async function addUser({ id, username, token }) {
	const db = await connect();
	const query = await db.prepare(`INSERT INTO users(id, username, token) VALUES(?,?,?);`,[id, username, token]);
	await query.run();
	await db.close();
	return await getUser({ id, username, token });
}

export async function getUser({ id = "%", username = "%", token = "%" }) {
	const db = await connect();
	const query = await db.prepare(`SELECT * FROM users WHERE id LIKE ? AND username LIKE ? AND token LIKE ?;`,[id, username, token]);
	const result = await query.get();
	await db.close();
	return result;
}

export async function addWebsocket({ id, userID, imageID, ws }) {
	const db = await connect();
	const query = await db.prepare(
		`INSERT INTO websockets
        (id, user_id, image_id) VALUES(?,?,?);`,
        [id, userID, imageID]
	);
    await query.run();

    websockets.set(id, ws);
	await db.close();

	return await getWebsocket({id, userID, data: true});
}

export async function getWebsocket({id = '%', userID = '%', imageID = '%', data = false}) {
	const db = await connect();
	const query = await db.prepare(`SELECT * FROM websockets WHERE id LIKE ? AND user_id LIKE ? AND image_id LIKE ?;`, [id, userID, imageID]);
	const result = await query.get();
	await db.close();

    if(!result) return null;
    return data ? result : websockets.get(result.id);
}
