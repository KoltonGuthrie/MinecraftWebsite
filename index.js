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
            return new Response("Welcome to Bun!!", {status: 200});
        }

        if(path === '/test') {
            try {
                i++;
                const CHILD_DATA = {
                    id: i,
                };
                console.log("Starting process " + i)

                const proc = Bun.spawn(["bun", "background.js"], {
                    onExit(proc, exitCode, signalCode, error) {
                        console.log(`#${CHILD_DATA.id} Process ${proc.pid} ended with exitCode: ${exitCode}, signalCode: ${signalCode}, and error: ${error || null}`);
                        // Send to websocket
                    },
                });

                return new Response("ok", {status: 200});
            } catch(err) {
                return new Response(err.stack, {status: 500});
            }
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

            const success = server.upgrade(req, { data: { token }, headers: { 'Set-Cookie': str }});
            return success ? undefined : new Response("WebSocket upgrade error", { status: 400 });
        }

        return new Response(`${path} is an unknown page!`, {status: 404});
    },
    websocket: {
        idleTimeout: 60,
        async open(ws) {
            const token = ws.data.token;
            const websocketID = uuidv4();

            let user = getUser({token});

            if(user === null) {
                const userID = uuidv4();
                user = addUser({id: userID, username: "john_doe", token: token});
            }

            const socket = addWebsocket({ id: websocketID, userID: user.id, ws});

            addImage({id: uuidv4(), websocketID: socket.id, userID: user.id, created: new Date().getTime(), status: StatusCodes.running});

            const proc = Bun.spawn(["bun", "background.js"], {
                onExit(proc, exitCode, signalCode, error) {
                    const websocket = getWebsocket({id: socket.id});

                    if(exitCode > 0) {
                        // ERROR
                        console.log(`Process ${proc.id} ended with exitCode: ${exitCode}, signalCode: ${signalCode}, and error: ${error || null}`);
                        updateImage({websocketID: socket.id, key: 'status', value: StatusCodes.error});
                        const msg = {message: "There was an internal error", errorData: error, status: StatusCodes.error}
                        return websocket.send(JSON.stringify(msg));
                    } 
                    // Send to websocket
                    
                    websocket.send({message: `Process ${proc.id} ended with exitCode: ${exitCode}, signalCode: ${signalCode}, and error: ${error || null}`});
                },
            });

            for await (const chunk of proc.stdout) {
                const websocket = getWebsocket({id: socket.id});

                const json = JSON.parse(new TextDecoder().decode(chunk));

                if(Object.keys(StatusCodes)[json?.status] !== undefined) {
                    updateImage({websocketID: socket.id, key: 'status', value: json?.status});
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