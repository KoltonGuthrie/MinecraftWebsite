const { parse, serialize } = require("cookie");
const { v4: uuidv4 } = require("uuid");
const { StatusCodes } = require("./src/statusCodes.js");
const fs = require("fs");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const sharp = require('sharp');
const { Image } = require('image-js');

const { addImage, updateImage, getImage, addWebsocket, getUser, addUser, getWebsocket } = require("./src/database.js");

const opts = {
	points: 100, // 100 points
	duration: 1 * 60, // Per min
	};

const rateLimiter = new RateLimiterMemory(opts);

const BASE_PATH = "./public";

const server = Bun.serve({
	port: process.env.PORT,
	async fetch(req, res) {
		const path = URL(req.url).pathname.toLowerCase();
 
		// All request will receive a token cookie if it does not exist
		const cookies = parse(req.headers.get("cookie") || "");

		// TODO Get IP and use it as the "token" if one does not exist
		if (cookies.token === undefined) {
			cookies.token = uuidv4();
		}

		if (path === "/") {
			const rateLimiterRes = await checkRateLimit(cookies.token, 1);
			if(rateLimiterRes === null) return new Response("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return new Response("Too Many Requests!", { status: 429 , headers }); 
			return new Response(Bun.file("public/home.html"), { status: 200, headers });
		}

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

		if (path === "/upload") {
			const rateLimiterRes = await checkRateLimit(cookies.token, 5);
			if(rateLimiterRes === null) return new Response("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return new Response("Too Many Requests!", { status: 429 , headers }); 

			const imageID = uuidv4();

			let formdata = null;
			try {
				formdata = await req.formData();
			} catch(err) {
				return new Response("Unable to find form data");
			}
			const name = formdata.get("name");
			const photo = formdata.get("image");
			if (!photo?.size) return new Response("Must upload an image.");

            const dir = __dirname;
			const folderPath = `${dir}/images/${imageID}`;
			const filePah = `/original.png`;

			if (!fs.existsSync(folderPath)) {
				fs.mkdirSync(folderPath);
			}

			await Bun.write(`${folderPath}${filePah}`, photo);

			let token = cookies.token;

			let user = await getUser({ token });

			if (user === null) {
				const userID = uuidv4();
				user = await addUser({ id: userID, username: "john_doe", token: token });
			}

			await addImage({
				id: imageID,
				userID: user.id,
				original_file_name: photo.name,
				original_file: `${folderPath}${filePah}`,
				created: new Date().getTime(),
				status: StatusCodes.starting,
			});

			console.log('starting')

			return Response.redirect(`/image?id=${imageID}`, { headers });
		}

		if (path === "/image") {
			const rateLimiterRes = await checkRateLimit(cookies.token, 2);
			if(rateLimiterRes === null) return new Response("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return new Response("Too Many Requests!", { status: 429 , headers }); 

			const imageID = URL(req.url).searchParams.get("id") || null;
			const image = await getImage({ id: imageID });

			if (image === null) return new Response(`Unknown image id!`, { status: 404, headers });

			return new Response(Bun.file("public/image.html"), { status: 200, headers });
		}

		if (path === "/view") {
			const rateLimiterRes = await checkRateLimit(cookies.token, 2);
			if(rateLimiterRes === null) return new Response("Internal Server Error", { status: 500 });

			const headers = {
				"Retry-After": rateLimiterRes.msBeforeNext / 1000,
				"X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
				"X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
			}

			if(rateLimiterRes.remainingPoints <= 0) return new Response("Too Many Requests!", { status: 429 , headers }); 

			const imageID = URL(req.url).searchParams.get("id") || null;
			const getOriginal = URL(req.url).searchParams.get("original") || false;
			const width = Number(URL(req.url).searchParams.get("width")) || null;
			const height = Number(URL(req.url).searchParams.get("height")) || null;
			const image = await getImage({ id: imageID });

			if (image === null) return new Response(`Unknown image id!`, { status: 404, headers });
			//if (image.status !== StatusCodes.done) return new Response(`Not done creating image!`, { status: 404, headers });
			if (image.minecraft_file === undefined && getOriginal === false) return new Response(`There is no finished image!`, { status: 404, headers });
			if (image.original_file === undefined && getOriginal === true) return new Response(`There is no original image!`, { status: 404, headers });

			let imageFile = null;

			if(getOriginal) {
				imageFile = Bun.file(image.original_file)
			} else {
				imageFile = Bun.file(image.minecraft_file);
			}

			if(width || height) {
				const arrbuf = await imageFile.arrayBuffer();

				const img = await Image.load(arrbuf);
				imageFile = img.resize({width: width, height: height, preserveAspectRatio: true}).toBuffer();;
			}

			headers['Content-Type'] = 'image/png';
			headers['Content-Disposition'] = `attachment; filename="${image.original_file_name || image.id}"`
			
			return new Response(imageFile, { status: 200, headers });
		}

        const filePath = BASE_PATH + new URL(req.url).pathname;
        if(fs.existsSync(filePath)) {
            return new Response(Bun.file(filePath));
        }

		const headers = {};

		headers["Set-Cookie"] = cookiesToString(cookies);

		return new Response(`${path} is an unknown page!`, { status: 404, headers });
	},
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

			on_error = function(e) {
				console.log(e);
			}

			worker.addEventListener("error", on_error);

			on_message_error = function(e) {
				console.log(e);
			}

			worker.addEventListener("messageerror", on_message_error);

			on_message = async function(e) {
				const websocket = await getWebsocket({ id: socket.id });

				websocket.send(JSON.stringify(e.data));
			}

			worker.addEventListener("message", on_message);

			on_close = async function(e) {
				// TODO Remove once https://github.com/oven-sh/bun/issues/5709 is fixed
				worker.removeEventListener("error", on_error);
				worker.removeEventListener("messageerror", on_message_error);
				worker.removeEventListener("message", on_message);
				worker.removeEventListener("close", on_close);

				delete worker;
				await Bun.shrink();
				await Bun.gc(true);

				const websocket = await getWebsocket({ id: CHILD_DATA.socket_id });

					// TODO if worker closes and is inhandled, even if it is not the one making the image, it will updateImage(stauts: 3)
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
			}


			worker.addEventListener("close", on_close);
			
		},
		message(ws, message) {},
		close(ws) {},
	},
});

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

console.log(`Listening on localhost:${server.port}`);
