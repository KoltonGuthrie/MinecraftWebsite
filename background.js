const { StatusCodes } = require("./statusCodes.js");
const { ErrorCodes } = require("./errorCodes.js");

const output = function(str) {
    process.stdout.write(str);
}

(async () => {
	try {
		output(JSON.stringify({ status: StatusCodes.running }));

		await Bun.sleep(Math.randdom() * 1000 * 10);

		output(JSON.stringify({ status: StatusCodes.done }));
	} catch (err) {
		process.exit(ErrorCodes.unknown_error);
	}
})();
