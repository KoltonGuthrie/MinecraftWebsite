import { Database } from "bun:sqlite";

const websockets = new Map(); // Websockets stored in memory (So I can store them as objects)

const file = "db/mydb.sqlite";

(async () => {
	init();
})();

async function connect() {
	return await new Database(file, { create: true });;
}

async function init() {
	const db = await connect();
    db.run(`DROP TABLE IF EXISTS 'websockets';`);
	db.run(
		`CREATE TABLE 'websockets'
            (
            'id' STRING NOT NULL,
            'user_id' STRING NOT NULL,
			'image_id' STRING NOT NULL
            );`
	);
	db.run(
		`CREATE TABLE IF NOT EXISTS 'users'
            (
            'id' STRING NOT NULL,
            'username' STRING NOT NULL,
            'token' STRING NOT NULL
            );`
	);
	db.run(
		`CREATE TABLE IF NOT EXISTS 'images'
            (
            'id' STRING NOT NULL,
            'websocket_id' STRING NOT NULL,
            'user_id' STRING NOT NULL,
			'original_file' STRING NOT NULL,
            'minecraft_file' STRING NOT NULL,
            'created' STRING NOT NULL,
            'status' INTEGER NOT NULL
            );`
	);
	db.close();
}

export async function updateImage({ id = "%", websocketID = "%", key, value }) {
    if(!key || !value) return null;
	const db = await connect();
    const query = db.prepare(`UPDATE images SET ${key} = ? WHERE id LIKE ? AND websocket_id LIKE ?;`,[value, id, websocketID]);
	query.run();
	db.close();
    return getImage({ id, websocketID });
}

export async function addImage({id, websocketID = 'null', userID, original_file = 'null', minecraft_file = 'null', created, status}) {
	const db = await connect();
    const query = db.prepare(`INSERT INTO images(id, websocket_id, user_id, original_file, minecraft_file, created, status) VALUES(?,?,?,?,?,?,?);`,[id, websocketID, userID, original_file, minecraft_file, created, status]);
	query.run();
	db.close();
	return getImage({ id, websocketID });
}

export async function getImage({ id = "%", websocketID = "%" }) {
	const db = await connect();
    const query = db.prepare(`SELECT * FROM images WHERE id LIKE ? AND websocket_id LIKE ?;`,[id, websocketID]);
	const result = query.get();
	db.close();
	return result;
}

export async function addUser({ id, username, token }) {
	const db = await connect();
	const query = db.prepare(`INSERT INTO users(id, username, token) VALUES(?,?,?);`,[id, username, token]);
	query.run();
	db.close();
	return getUser({ id, username, token });
}

export async function getUser({ id = "%", username = "%", token = "%" }) {
	const db = await connect();
	const query = db.prepare(`SELECT * FROM users WHERE id LIKE ? AND username LIKE ? AND token LIKE ?;`,[id, username, token]);
	const result = query.get();
	db.close();
	return result;
}

export async function addWebsocket({ id, userID, imageID, ws }) {
	const db = await connect();
	const query = db.prepare(
		`INSERT INTO websockets
        (id, user_id, image_id) VALUES
        (?,?,?);`,
        [id, userID, imageID]
	);
    query.run();
    websockets.set(id, ws);
	db.close();
	return getWebsocket({id, userID, data: true});
}

export async function getWebsocket({id = '%', userID = '%', imageID = '%', data = false}) {
	const db = await connect();
	const query = db.prepare(`SELECT * FROM websockets WHERE id LIKE ? AND user_id LIKE ? AND image_id LIKE ?;`, [id, userID, imageID]);
	const result = query.get();
	db.close();
    if(!socket) return null;
    return data ? result : websockets.get(socket.id);
}
