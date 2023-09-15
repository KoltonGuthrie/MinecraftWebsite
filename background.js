const { StatusCodes } = require("./statusCodes.js");
const { ErrorCodes } = require("./errorCodes.js");
const { getImage } = require('./database.js');

const data = JSON.parse(process.argv.slice(2)[0]);

async function output(json) {
    process.stdout.write(JSON.stringify(JSON.stringify(json)));
	await Bun.sleep(1); // Outputs were being sent at the same time
	return;
}

(async () => {
	
	try {

		let id = null;

		await output({ message: `I have an id of: ${id}` });

		await output({ status: StatusCodes.running });

		await output({message: data})

		/*
		const { Image } = require("image-js");

		let colors = await Bun.file(`savedBlocks.json`).json();

		let nearestColor = require("nearest-color").from(colors);

		let cachedPhotos = new Map();
		
		for (i = 0; Object.keys(colors).length > i; i++) {
			const key = Object.keys(colors)[i];
			let mc = await Image.load(`texturepack/assets/minecraft/textures/block/${key}`);
			cachedPhotos.set(key, mc);
		}

		let mainImage = await Image.load(path); // read imaage
		


		*/









		await output({ status: StatusCodes.done });
	} catch (err) {
		await output({ status: StatusCodes.error, erorr_code: ErrorCodes.unknown_error, error: err.toString() });
		process.exit(ErrorCodes.unknown_error);
	}
})();
