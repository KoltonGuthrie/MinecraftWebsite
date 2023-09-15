const { StatusCodes } = require("./statusCodes.js");
const { ErrorCodes } = require("./errorCodes.js");

function output(str) {
    process.stdout.write(JSON.stringify(str));
	return;
}

(async () => {
	try {
		output({ status: StatusCodes.running });

		await Bun.sleep(Math.random() * 1000 * 10);

		output({ status: StatusCodes.done });
	} catch (err) {
		output({ status: StatusCodes.error, erorr_code: ErrorCodes.unknown_error, error: err.toString() });
		process.exit(ErrorCodes.unknown_error);
	}
})();
