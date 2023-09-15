const { parse, serialize } = require('cookie');
const { v4: uuidv4 } = require('uuid');
const { StatusCodes } = require('./statusCodes.js')

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
            const formdata = await req.formData();
            const name = formdata.get('name');
            const profilePicture = formdata.get('profilePicture');
            if (!profilePicture) throw new Error('Must upload a profile picture.');
            // write profilePicture to disk
            await Bun.write('profilePicture.png', profilePicture);

            const cookies = parse(req.headers.get("cookie") || "");
            let token = cookies.token;

            let user = await getUser({token});

            if(user === null) {
                const userID = uuidv4();
                user = await addUser({id: userID, username: "john_doe", token: token});
            }

            const imageID = uuidv4();
            await addImage({id: imageID, userID: user.id, created: new Date().getTime(), status: StatusCodes.starting});

            return Response.redirect(`/image?id=${imageID}`);
        }

        if(path === '/image') {
            const imageID = URL(req.url).searchParams.get('id') || null;
            const image = await getImage({id: imageID});

            if(image === null) return new Response(`Unknown image id!`, {status: 404});

            return new Response(Bun.file('image.html'), {status: 200});
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
                id: imageID,
            }

            const proc = Bun.spawn(["bun", "background.js", JSON.stringify(CHILD_DATA)], {
                async onExit(proc, exitCode, signalCode, error) {
                    const websocket = await getWebsocket({id: socket.id});

                    if(exitCode > 0) {
                        // ERROR
                        console.log(`Process ${proc.id} ended with exitCode: ${exitCode}, signalCode: ${signalCode}, and error: ${error || null}`);
                        await updateImage({websocketID: socket.id, key: 'status', value: StatusCodes.error});
                        const msg = {message: "There was an internal error", errorData: error, status: StatusCodes.error}
                        return websocket.send(JSON.stringify(msg));
                    } 
                    // Send to websocket
                    
                    websocket.send(JSON.stringify({message: `Process ${proc.id} ended with exitCode: ${exitCode}, signalCode: ${signalCode}, and error: ${error || null}`}));
                },
            });

            for await (const chunk of proc.stdout) {
                const websocket = await getWebsocket({id: socket.id});

                const json = JSON.parse(new TextDecoder().decode(chunk));

                if(Object.keys(StatusCodes)[json?.status] !== undefined) {
                    await updateImage({websocketID: socket.id, key: 'status', value: json?.status});
                }

                websocket.send(json);

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