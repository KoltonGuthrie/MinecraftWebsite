import { Database } from "bun:sqlite";

const websockets = new Map(); // Websockets stored in memory (So I can store them as objects)

let db = null;
const file = "db/mydb.sqlite";

(async () => {
	try {
		console.log(`Connecting to database ${file}...`);
		db = await new Database(file, { create: true });
		init();
		console.log(`Successfully connected to ${file}`);
	} catch (err) {
		console.error(err);
	}
})();

function init() {
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
}

export function updateImage({ id = "%", websocketID = "%", key, value }) {
    if(!key || !value) return null;
    const query = db.prepare(`UPDATE images SET ${key} = ? WHERE id LIKE ? AND websocket_id LIKE ?;`,[value, id, websocketID]);
	query.run();
    return getImage({ id, websocketID });
}

export function addImage({id, websocketID = 'null', userID, original_file = 'null', minecraft_file = 'null', created, status}) {
    const query = db.prepare(`INSERT INTO images(id, websocket_id, user_id, original_file, minecraft_file, created, status) VALUES(?,?,?,?,?,?,?);`,[id, websocketID, userID, original_file, minecraft_file, created, status]);
	query.run();
	return getImage({ id, websocketID });
}

export function getImage({ id = "%", websocketID = "%" }) {
    const query = db.prepare(`SELECT * FROM images WHERE id LIKE ? AND websocket_id LIKE ?;`,[id, websocketID]);
	return query.get();
}

export function addUser({ id, username, token }) {
	const query = db.prepare(`INSERT INTO users(id, username, token) VALUES(?,?,?);`,[id, username, token]);
	query.run();
	return getUser({ id, username, token });
}

export function getUser({ id = "%", username = "%", token = "%" }) {
	const query = db.prepare(`SELECT * FROM users WHERE id LIKE ? AND username LIKE ? AND token LIKE ?;`,[id, username, token]);
	return query.get();
}

export function addWebsocket({ id, userID, imageID, ws }) {
	const query = db.prepare(
		`INSERT INTO websockets
        (id, user_id, image_id) VALUES
        (?,?,?);`,
        [id, userID, imageID]
	);
    query.run();
    websockets.set(id, ws);
	return getWebsocket({id, userID, data: true});
}

export function getWebsocket({id = '%', userID = '%', image_ID = '%', data = false}) {
	const query = db.prepare(`SELECT * FROM websockets WHERE id LIKE ? AND user_id LIKE ? AND image_id LIKE ?;`, [id, userID, imageID]);
	const socket = query.get();
    if(!socket) return null;
    return data ? socket : websockets.get(socket.id);
}

function close() {
	try {
		db.close();
		return 0;
	} catch (err) {
		console.error(err);
		return 1;
	}
}
