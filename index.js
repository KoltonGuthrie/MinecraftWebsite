require('dotenv').config();
const stream = require('stream');
const { parse, serialize } = require("cookie");
const { v4: uuidv4 } = require("uuid");
const { StatusCodes } = require("./src/statusCodes.js");
const fs = require("fs");
const { Worker } = require('worker_threads');
const { RateLimiterMemory } = require("rate-limiter-flexible");
const cookieParser = require('cookie-parser');
const multer  = require('multer')
const path = require("path");
let storage = multer.diskStorage({
	destination: (req, file, cb) => {
		// initial upload path
		let dir = path.join(__dirname, 'images', uuidv4()); // ./uploads/

		if (!fs.existsSync(dir)){
			fs.mkdirSync(dir, { recursive: true });
		}

		cb( null, dir );
	},

	// pass function that may generate unique filename if needed
	filename: (req, file, cb) => {
	  cb(
		null, 
		"original.png"
	  );
	}
})

const fileFilter = (req, file, cb) =>
{
    // reject a file
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png')
    {
        cb(null, true);
    }
    else
    {
        cb(null, false);
    }
};

const upload = multer({
	storage: storage,
    limits:
    {
        fileSize: 1024 * 1024 * 50 // TODO find out what this is haha
    },
    fileFilter: fileFilter
});

const sharp = require('sharp');
const { Image } = require('image-js');


const express = require('express');

const app = express();
const ws = require('express-ws')(app);


const { addImage, updateImage, getImage, addWebsocket, getUser, addUser, getWebsocket, getWebsockets } = require("./src/database.js");

const opts = {
	points: 100, // 100 points
	duration: 1 * 60, // Per min
	};

const rateLimiter = new RateLimiterMemory(opts);

app.use(cookieParser());
app.use(express.static('public'));

app.get("/", async (req, res) => {

	const token = getToken(req);

	const rateLimiterRes = await checkRateLimit(token, 1);
	if(rateLimiterRes === null) return res.status(500).send("Internal Server Error");

	const headers = {
		"Retry-After": rateLimiterRes.msBeforeNext / 1000,
		"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
		"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
	}

	if(rateLimiterRes.remainingPoints <= 0) return res.status(429).set(headers).send("Too Many Requests!"); 

	return res.status(200).set(headers).sendFile("public/home.html", {root: __dirname});
});


app.post("/upload", upload.single('image'), async (req, res, next) => {
			const token = getToken(req);

			const rateLimiterRes = await checkRateLimit(token, 5);
			if(rateLimiterRes === null) return res.status(500).set(headers).send("Internal Server Error");

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return res.status(429).set(headers).send("Too Many Requests!"); 


			if (!req.file === undefined) return res.send("Must upload an image.");

			const imageID = path.basename(req.file.destination);

			let user = await getUser({ token });
			
			if (user === null) {
				const userID = uuidv4();
				user = await addUser({ id: userID, username: "john_doe", token: token });
			}

			await addImage({
				id: imageID,
				userID: user.id,
				original_file_name: req.file.originalname,
				original_file: req.file.path,
				created: new Date().getTime(),
				status: StatusCodes.starting,
			});

			const CHILD_DATA = {
				id: imageID,
			};

			const worker = new Worker("./src/imageMaker.js", {
				workerData: [ JSON.stringify(CHILD_DATA) ],
			});

			worker.on("error", event => {
				console.log(event);
			});

			worker.on("messageerror", event => {
				console.log(event);
			});

			worker.on("message", async e => {
				await sendToWebsockes({image_id: CHILD_DATA.id, str: JSON.stringify(e)});
			});

			worker.on("close", async e => {
					if (e.code !== 0) {
						// Unhandled error
						console.log(`Ended with exitCode: ${e.code}`);
						await updateImage({ id: CHILD_DATA.id, key: "status", value: StatusCodes.error });
						const msg = {
							message: "There was an internal error",
							status: StatusCodes.error,
						};
						return await sendToWebsockes({image_id: CHILD_DATA.id, str: JSON.stringify(msg)})
						//return websocket.send(JSON.stringify(msg));
					}

					// Send to websocket
					await sendToWebsockes({image_id: CHILD_DATA.id, str: JSON.stringify({info: `Ended with exitCode: ${e.code}`})})
					//websocket.send(JSON.stringify({info: `Ended with exitCode: ${e.code}`}));
			});

			return res.set(headers).send({image_id: imageID, user_token: token });
});

app.get("/image", async (req, res) => {
	const token = getToken(req);

			const rateLimiterRes = await checkRateLimit(token, 2);
			if(rateLimiterRes === null) return res.status(500).send("Internal Server Error");

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return res.status(429).set(headers).send("Too Many Requests!"); 

			const imageID = req.query.id || null;
			const image = await getImage({ id: imageID });

			if (image === null) return res.status(404).set(headers).send(`Unknown image id!`);

			return res.status(200).set(headers).sendFile("public/image.html", {root: __dirname});
		});

app.get("/view", async (req, res) => {
			const token = getToken(req);

			const rateLimiterRes = await checkRateLimit(token, 2);
			if(rateLimiterRes === null) return res.status(500).send("Internal Server Error");

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return res.status(429).set(headers).send("Too Many Requests!"); 

			const imageID = req.query.id || null;
			const getOriginal = req.query.id || false;
			const width = Number(req.query.width) || null;
			const height = Number(req.query.height) || null;
			/*
			const imageID = URL(req.url).searchParams.get("id") || null;
			const getOriginal = URL(req.url).searchParams.get("original") || false;
			const width = Number(URL(req.url).searchParams.get("width")) || null;
			const height = Number(URL(req.url).searchParams.get("height")) || null;
			*/
			const image = await getImage({ id: imageID });

			if (image === null) return res.status(404).set(headers).send(`Unknown image id!`);
			//if (image.status !== StatusCodes.done) return new Response(`Not done creating image!`, { status: 404, headers });
			if (image.minecraft_file === undefined && getOriginal === false) return res.status(404).set(headers).send(`There is no finished image!`);
			if (image.original_file === undefined && getOriginal === true) return res.status(404).set(headers).send(`There is no original image!`);

			let imageFile = null;

			if(getOriginal) {
				imageFile = fs.readFileSync(image.original_file)
			} else {
				imageFile = fs.readFileSync(image.minecraft_file);
			}

			if(width || height) {
				const arrbuf = imageFile.buffer;

				const img = await Image.load(arrbuf);
				imageFile = img.resize({width: width, height: height, preserveAspectRatio: true}).toBuffer();
			}

			const readStream = new stream.PassThrough();
			readStream.end(imageFile);

			return readStream.pipe(res).status(200).set(headers);
		});

app.ws('/', async (ws, req) => {
	let token = getToken(req);

	const rateLimiterRes = await checkRateLimit(token, 1);
	if(rateLimiterRes === null) return ws.close(1011, "Internal Server Error");

	const headers = {
		"Retry-After": rateLimiterRes.msBeforeNext / 1000,
		"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
		"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
	}

	if(rateLimiterRes.remainingPoints <= 0) return ws.close(1013, "Too Many Requests!"); 

	const imageID = req.query.id || null;

	if(imageID === null) return ws.close(1011, "Unknown image");

	const image = await getImage({id: imageID});
	if(image === null) return ws.close(1011, "Unknown image");

	const user = await getUser({token});
	if(user === null) return ws.close(1011, "Unknown user");

	if(image.status === StatusCodes.error) {
		// TODO Fetch errorcode from database
		return ws.send({ status: StatusCodes.error, error: ErrorCodes.unknown_error})
	}

	if(image.status === StatusCodes.done) {
		return ws.send({ minecraft_image: image.minecraft_file, percentage: 100, status: StatusCodes.done})
	}

	await addWebsocket({id: uuidv4(), user_id: user.id, image_id: image.id, ws});

	return;
});

app.get('*', async (req, res) => {
	return res.status(404).send(`${req.path} is an unknown page!`);
});

async function sendToWebsockes({id, user_id, image_id, str = "{}"}) {
	const websockets = await getWebsockets({id, user_id, image_id});

	for(_ of websockets) {
		if(_.ws === undefined) break;
		_.ws.send(str);
	}
	return;
}
	
app.listen(process.env.PORT);
console.log(`Listening on localhost:${process.env.PORT}`);


function getToken(req) {
	let token = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

	// TODO check if token is value token
	if(req.cookies?.token !== undefined) {
		token = req.cookies?.token;
	}
	
	return token;
}

function cookiesToString(c) {
	let s = "";
	for (k in c) {
		const value = c[k];

		s += serialize(k, value) + ";";
	}
	return s;
}

async function checkRateLimit(token, amount) {
	if(token === undefined || amount === undefined) return null;;
	let rateLimiterRes = null;

	try {
		rateLimiterRes = await rateLimiter.consume(token, amount);
	} catch(rate) {
		rateLimiterRes = rate;
	}

	return rateLimiterRes;
}

