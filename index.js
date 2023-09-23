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
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg' || file.mimetype === 'image/png')
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
        fileSize: 1024 * 1024 * 10 // 10Mb
    },
    fileFilter: fileFilter
}).single('image');

const sharp = require('sharp');
const { Image } = require('image-js');

const express = require('express');

const app = express();
const ws = require('express-ws')(app);

// set the view engine to ejs
app.set('view engine', 'ejs');

const { addImage, updateImage, getImage, addWebsocket, getUser, addUser, getWebsocket, getWebsockets } = require("./src/database.js");

const opts = {
	points: 50, // 100 points
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


app.post("/upload", async (req, res) => {
	const token = getToken(req);

	const rateLimiterRes = await checkRateLimit(token, 5);
	if(rateLimiterRes === null) return res.status(500).set(headers).send("Internal Server Error");

	const headers = {
		"Retry-After": rateLimiterRes.msBeforeNext / 1000,
		"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
		"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
	}

	if(rateLimiterRes.remainingPoints <= 0) return res.status(429).set(headers).send("Too Many Requests!"); 

	upload(req, res, async function(err) {
				if(err) {
					return res.status(500).send(err.message ? err.message : err.toString());
				}

			if (!req.file) return res.send("Must upload an image.");

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
					
					worker.removeAllListeners('error');
					worker.removeAllListeners('messageerror');
					worker.removeAllListeners('message');
					worker.removeAllListeners('close');

					await worker.terminate();
					console.log("Terminated!");
			});

			return res.set(headers).send({image_id: imageID, user_token: token });
		});
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

			const ejs = path.join(__dirname, "public/image.ejs");

			return res.status(200).set(headers).render(ejs, {filename: image.original_file_name, image_id: image.id});
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
			const getOriginal = req.query.original || "false";
			const width = Number(req.query.width) || null;
			const height = Number(req.query.height) || null;
			const webp = req.query.webp || "false";
			const quality = Number(req.query.quality) || null;
			/*
			const imageID = URL(req.url).searchParams.get("id") || null;
			const getOriginal = URL(req.url).searchParams.get("original") || false;
			const width = Number(URL(req.url).searchParams.get("width")) || null;
			const height = Number(URL(req.url).searchParams.get("height")) || null;
			*/
			const image = await getImage({ id: imageID });

			if (image === null) return res.status(404).set(headers).send(`Unknown image id!`);
			//if (image.status !== StatusCodes.done) return new Response(`Not done creating image!`, { status: 404, headers });
			if (image.minecraft_file === undefined && getOriginal === "false") return res.status(404).set(headers).send(`There is no finished image!`);
			if (image.original_file === undefined && getOriginal === "true") return res.status(404).set(headers).send(`There is no original image!`);

			let imageFile = null;
			let filename = image.original_file_name;

			if(getOriginal === "true") {
				imageFile = sharp(image.original_file).resize({width, height});
			} else {
				imageFile = sharp(image.minecraft_file).resize({width, height});
			}

			if(webp === "true") {
				imageFile = imageFile.webp({lossless: false, quality: quality ? quality : 80});
				filename = filename.slice(0, filename.lastIndexOf(".")) + ".webp";
			} else if(quality) {
				imageFile = imageFile.png({quality})
			}

			headers['Content-Disposition'] = `attachment; filename="${filename}"`;

			return res.status(200).set(headers).send(await imageFile.toBuffer());
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
		return ws.send(JSON.stringify({ status: StatusCodes.error, error: ErrorCodes.unknown_error}));
	}

	if(image.status === StatusCodes.done) {
		return ws.send(JSON.stringify({ minecraft_image: image.minecraft_file, percentage: 100, status: StatusCodes.done}));
	}

	const s = await addWebsocket({id: uuidv4(), user_id: user.id, image_id: image.id, ws});
	console.log(s);

	return;
});

app.get('*', async (req, res) => {
	return res.status(404).send(`${req.path} is an unknown page!`);
});

async function sendToWebsockes({id, user_id, image_id, str = "{}"}) {
	const websockets = await getWebsockets({id, user_id, image_id});

	for(const obj of websockets) {
		if(obj.ws === undefined) continue;
		await obj.ws.send(str);
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

