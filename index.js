require('dotenv').config();
const { parse, serialize } = require("cookie");
const { v4: uuidv4 } = require("uuid");
const { StatusCodes } = require("./src/statusCodes.js");
const fs = require("fs");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const cookieParser = require('cookie-parser');
const multer  = require('multer')
let storage = multer.diskStorage({
	destination: (req, file, cb) => {
		// initial upload path
		let dir = path.join(__dirname, 'images', uuidv4()); // ./uploads/

		if (!fs.existsSync(dir)){
			fs.mkdirSync(dir);
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
const path = require("path");

const express = require('express');

const app = express();
const ws = require('express-ws')(app);


const { addImage, updateImage, getImage, addWebsocket, getUser, addUser, getWebsocket } = require("./src/database.js");

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

	if(rateLimiterRes.remainingPoints <= 0) res.status(429).set(headers).send("Too Many Requests!"); 

	return res.status(200).set(headers).sendFile("public/home.html", {root: __dirname});
});


app.post("/upload", upload.single('image'), async (req, res, next) => {
			const token = getToken(req);

			const rateLimiterRes = await checkRateLimit(token, 5);
			if(rateLimiterRes === null) return res.send("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return res.send("Too Many Requests!", { status: 429 , headers }); 

			console.log(req.body);

			if (!req.file === undefined) return res.send("Must upload an image.");

			const imageID = req.file.destination.slice(req.file.destination.lastIndexOf("\\")+1)
			console.log(req.file)
			let user = getUser({ token });
			console.log(token)
			console.log(user);
			console.log(user === null);

			if (user === null) {
				const userID = uuidv4();
				user = addUser({ id: userID, username: "john_doe", token: token });
			}

			await addImage({
				id: imageID,
				userID: user.id,
				original_file_name: req.file.originalname,
				original_file: req.path,
				created: new Date().getTime(),
				status: StatusCodes.starting,
			});

			console.log('starting')

			return res.set(headers).redirect(`/image?id=${imageID}`);
});

app.get("/image", async (req, res) => {
	const token = getToken(req);

			const rateLimiterRes = await checkRateLimit(token, 2);
			if(rateLimiterRes === null) return res.send("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return res.send("Too Many Requests!", { status: 429 , headers }); 

			const imageID = URL(req.url).searchParams.get("id") || null;
			const image = await getImage({ id: imageID });

			if (image === null) return res.send(`Unknown image id!`, { status: 404, headers });

			return res.sendFile("public/image.html", { status: 200, headers });
		});

app.get("/view", async (req, res) => {
			const token = getToken(req);

			const rateLimiterRes = await checkRateLimit(token, 2);
			if(rateLimiterRes === null) return res.send("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return res.send("Too Many Requests!", { status: 429 , headers }); 

			const imageID = URL(req.url).searchParams.get("id") || null;
			const getOriginal = URL(req.url).searchParams.get("original") || false;
			const width = Number(URL(req.url).searchParams.get("width")) || null;
			const height = Number(URL(req.url).searchParams.get("height")) || null;
			const image = await getImage({ id: imageID });

			if (image === null) return res.send(`Unknown image id!`, { status: 404, headers });
			//if (image.status !== StatusCodes.done) return new Response(`Not done creating image!`, { status: 404, headers });
			if (image.minecraft_file === undefined && getOriginal === false) return res.send(`There is no finished image!`, { status: 404, headers });
			if (image.original_file === undefined && getOriginal === true) return res.send(`There is no original image!`, { status: 404, headers });

			let imageFile = null;

			if(getOriginal) {
				imageFile = fs.readyFileSync(image.original_file)
			} else {
				imageFile = fs.readyFileSync(image.minecraft_file);
			}

			if(width || height) {
				const arrbuf = await imageFile.arrayBuffer();

				const img = await Image.load(arrbuf);
				imageFile = img.resize({width: width, height: height, preserveAspectRatio: true}).toBuffer();;
			}

			headers['Content-Type'] = 'image/png';
			headers['Content-Disposition'] = `attachment; filename="${image.original_file_name || image.id}"`
			
			return res.send(imageFile, { status: 200, headers });
		});

app.get('*', async (req, res) => {
	return res.status(404).send(`${req.path} is an unknown page!`);
})
	

	/*

		if (path === "/ws") {
			let token = cookies.token;

			const rateLimiterRes = await checkRateLimit(token, 1);
			if(rateLimiterRes === null) return new Response("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return new Response("Too Many Requests!", { status: 429 , headers }); 

			const imageID = URL(req.url).searchParams.get("id") || null;

			headers["Set-Cookie"] = cookiesToString(cookies);;
 
			const success = server.upgrade(req, { data: { token, imageID }, headers });
			return success ? undefined : new Response("WebSocket upgrade error", { status: 400 });
		}

	*/
	/*
	websocket: {
		idleTimeout: 60,
		async open(ws) {
			const token = ws.data.token;
			const imageID = ws.data.imageID;
			const websocketID = uuidv4();

			let user = await getUser({ token });

			if (user === null) {
				const userID = uuidv4();
				user = await addUser({ id: userID, username: "john_doe", token: token });
			}

			const socket = await addWebsocket({ id: websocketID, userID: user.id, imageID, ws });

			const CHILD_DATA = {
				socket_id: socket.id,
				id: imageID,
			};

			const worker = new Worker("src/imageMaker.js", {
				workerData: [ JSON.stringify(CHILD_DATA) ],
			});

			worker.addEventListener("error", event => {
				console.log(event);
			});

			worker.addEventListener("messageerror", event => {
				console.log(event);
			});

			worker.addEventListener("message", async e => {
				const websocket = await getWebsocket({ id: socket.id });

				websocket.send(JSON.stringify(e.data));
			});

			worker.addEventListener("close", async e => {
				const websocket = await getWebsocket({ id: CHILD_DATA.socket_id });

					if (e.code !== 0) {
						// Unhandled error
						console.log(`Ended with exitCode: ${e.code}`);
						await updateImage({ id: CHILD_DATA.id, key: "status", value: StatusCodes.error });
						const msg = {
							message: "There was an internal error",
							status: StatusCodes.error,
						};
						return websocket.send(JSON.stringify(msg));
					}

					// Send to websocket
					websocket.send(
						JSON.stringify({info: `Ended with exitCode: ${e.code}`})
					);
			});
			
		},
		message(ws, message) {},
		close(ws) {},
	},
	*/

app.ws('/', async (ws, req) => {
	console.log(ws);
	let token = cookies.token;

	const rateLimiterRes = await checkRateLimit(token, 1);
	if(rateLimiterRes === null) return new Response("Internal Server Error", { status: 500 });

	const headers = {
		"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return new Response("Too Many Requests!", { status: 429 , headers }); 

			const imageID = URL(req.url).searchParams.get("id") || null;

	headers["Set-Cookie"] = cookiesToString(cookies);
	return;
});
	
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

