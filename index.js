const { parse, serialize } = require('cookie');
const { v4: uuidv4 } = require('uuid');
const { StatusCodes } = require('./statusCodes.js')
const fs = require('fs');

const { addImage, updateImage, getImage, addWebsocket, getUser, addUser, getWebsocket } = require('./database.js');

let i = 0;

const server = Bun.serve({
    port: 8888,
    async fetch(req, res) {
        const path = URL(req.url).pathname.toLowerCase();

        if(path === '/') {
            return new Response(Bun.file('index.html'), {status: 200});
        }

        if(path === '/ws') {
            const cookies = parse(req.headers.get("cookie") || "");
            let token = cookies.token;

            if(token === undefined) {
                cookies.token = uuidv4();
            }

            let str = "";
            for (k in cookies) {
                const key = k;
                const value = cookies[key];

                str += serialize(key, value) + ';';
            }

            const imageID = URL(req.url).searchParams.get('id') || null;

            const success = server.upgrade(req, { data: { token, imageID }, headers: { 'Set-Cookie': str }});
            return success ? undefined : new Response("WebSocket upgrade error", { status: 400 });
        }

        if (path === '/upload') {
            const imageID = uuidv4();

            const formdata = await req.formData();
            const name = formdata.get('name');
            const photo = formdata.get('profilePicture');
            if (!photo) throw new Error('Must upload a profile picture.');

            const folderPath = `./images/${imageID}`;
            const filePah = `/original.png`;

            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath);
            }

            await Bun.write(`${folderPath}${filePah}`, photo);

            const cookies = parse(req.headers.get("cookie") || "");
            let token = cookies.token;

            let user = await getUser({token});

            if(user === null) {
                const userID = uuidv4();
                user = await addUser({id: userID, username: "john_doe", token: token});
            }

            await addImage({id: imageID, userID: user.id, original_file: `${folderPath}${filePah}`, created: new Date().getTime(), status: StatusCodes.starting});

            return Response.redirect(`/image?id=${imageID}`);
        }

        if(path === '/image') {
            const imageID = URL(req.url).searchParams.get('id') || null;
            const image = await getImage({id: imageID});

            if(image === null) return new Response(`Unknown image id!`, {status: 404});

            return new Response(Bun.file('image.html'), {status: 200});
        }

        if(path === '/view') {
            const imageID = URL(req.url).searchParams.get('id') || null;
            const image = await getImage({id: imageID});

            if(image === null) return new Response(`Unknown image id!`, {status: 404});
            if(image.status !== StatusCodes.done) return new Response(`Not done creating image!`, {status: 404});
            if(image.minecraft_image === undefined) return new Response(`There is no finished image!`, {status: 404});

            return new Response(Bun.file(image.minecraft_image), {status: 200});
        }

        return new Response(`${path} is an unknown page!`, {status: 404});
    },
    websocket: {
        idleTimeout: 60,
        async open(ws) {
            const token = ws.data.token;
            const imageID = ws.data.imageID;
            const websocketID = uuidv4();

            let user = await getUser({token});

            if(user === null) {
                const userID = uuidv4();
                user = await addUser({id: userID, username: "john_doe", token: token});
            }

            const socket = await addWebsocket({ id: websocketID, userID: user.id, imageID, ws});

            const CHILD_DATA = {
                socket_id: socket.id,
                id: imageID,
            }

            const proc = Bun.spawn(["bun", "background.js", JSON.stringify(CHILD_DATA)], {
                async onExit(proc, exitCode, signalCode, error) {
                    const websocket = await getWebsocket({id: CHILD_DATA.socket_id});

                    if(exitCode > 0) {
                        // Unhandled error
                        console.log(`Process ${proc.id} ended with exitCode: ${exitCode}, signalCode: ${signalCode}, and error: ${error || null}`);
                        await updateImage({id: CHILD_DATA.id, key: 'status', value: StatusCodes.error});
                        const msg = {message: "There was an internal error", errorData: error, status: StatusCodes.error}
                        return websocket.send(JSON.stringify(msg));
                    } 
                    // Send to websocket
                    
                    websocket.send(JSON.stringify({message: `Process ${proc.id} ended with exitCode: ${exitCode}, signalCode: ${signalCode}, and error: ${error || null}`}));
                },
            });

            // Data taken from the process
            for await (const chunk of proc.stdout) {
                const websocket = await getWebsocket({id: socket.id});

                const json = JSON.parse(JSON.parse(new TextDecoder().decode(chunk)));

                websocket.send(JSON.stringify(json));

            }

          },
        message(ws, message) {
            const msg = `${ws.data.username}: ${message}`;
            console.log(msg);
          },
        close(ws) {
            const msg = `${ws.data.username} has left the chat`;
            console.log(msg);
          },

    },
  });

  console.log(`Listening on localhost:${server.port}`);