const { StatusCodes } = require("./statusCodes.js");

try {
process.stdout.write(JSON.stringify({ status: StatusCodes.running }));

await Bun.sleep(Math.randdom() * 1000 * 10);

process.stdout.write(JSON.stringify({ status: StatusCodes.done }));
} catch(err) {
    process.exit(44);
}
