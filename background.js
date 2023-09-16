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

		const imageData = await getImage(data.id);

		await output({ message: `My data: ${JSON.stringify(imageData)}` }); // Debug

		if(imageData.status !== StatusCodes.starting) { // Has already started/finished
			let img = await getImage(data.id);
			while(img.status === StatusCodes.running) { // If running
				await Bun.sleep(5000); // Sleep for 5 seconds
				img = await getImage(data.id);

				await output({ status: img.status});
			}
			await output({ status: img.status, minecraft_file: img.minecraft_file });
			return;
		}

		await output({ status: StatusCodes.running });

		await Bun.sleep(10000);

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
