const { Database = DataBase} = require('sqlite3')

const websockets = new Map(); // Websockets stored in memory (So I can store them as objects)

const file = `db/minecraft_web_database.sqlite`;

init();

function connect() {
	const db = new Database(file, { create: true });
	return db;
}

function init() {
	const db = connect();
	db.run( 'PRAGMA journal_mode = DELETE;' );
	db.run(
		`CREATE TABLE IF NOT EXISTS 'websockets'
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
            'user_id' STRING NOT NULL,
			'original_file_name' STRING,
			'original_file' STRING NOT NULL,
            'minecraft_file' STRING NOT NULL,
            'created' STRING NOT NULL,
            'status' INTEGER NOT NULL
            );`
	);
	//db.close();
}

function updateImage({ id = "%", key, value }) {
    if(!key || !value) return null;
	const db = connect();
    const query = db.prepare(`UPDATE images SET ${key} = ? WHERE id LIKE ?;`,[value, id]);
	query.run();
	//db.close();
    return getImage({ id });
}

function addImage({id, userID, original_file_name, original_file = 'null', minecraft_file = 'null', created, status}) {
	const db = connect();
    const query = db.prepare(`INSERT INTO images(id, user_id, original_file_name, original_file, minecraft_file, created, status) VALUES(?,?,?,?,?,?,?);`,[id, userID, original_file_name, original_file, minecraft_file, created, status]);
	query.run();
	//db.close();
	return getImage({ id });
}

function getImage({ id }) {
	const db = connect();
    const query = db.prepare(`SELECT * FROM images WHERE id LIKE ?;`,[id]);
	const result = query.get();
	//db.close();
	return result;
}

function addUser({ id, username, token }) {
	const db = connect();
	const query = db.prepare(`INSERT INTO users(id, username, token) VALUES(?,?,?);`,[id, username, token]);
	query.finalize();
	//db.close();
	return getUser({ id, username, token });
}

function getUser({ id = "%", username = "%", token = "%" }) {
	const db = connect();
	return db.get(`SELECT * FROM users WHERE id LIKE ? AND username LIKE ? AND token LIKE ?;`, [id, username, token], (err, row) => {
		return row;
	});
	//const result = query.get();
	//db.close();
	//return result;
}

function addWebsocket({ id, userID, imageID, ws }) {
	const db = connect();
	const query = db.prepare(
		`INSERT INTO websockets
        (id, user_id, image_id) VALUES(?,?,?);`,
        [id, userID, imageID]
	);
    query.run();

    websockets.set(id, ws);
	//db.close();

	return getWebsocket({id, userID, data: true});
}

function getWebsocket({id = '%', userID = '%', imageID = '%', data = false}) {
	const db = connect();
	const query = db.prepare(`SELECT * FROM websockets WHERE id LIKE ? AND user_id LIKE ? AND image_id LIKE ?;`, [id, userID, imageID]);
	const result = query.get();
	//db.close();

    if(!result) return null;
    return data ? result : websockets.get(result.id);
}

module.exports = {
	init, updateImage, addImage, getImage, addUser, getUser, addWebsocket, getWebsocket
}