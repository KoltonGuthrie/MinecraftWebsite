const { StatusCodes } = require("./statusCodes.js");
const { ErrorCodes } = require("./errorCodes.js");
const { getImage, updateImage } = require("./database.js");
const fs = require('fs');
const { workerData, parentPort } = require('node:worker_threads');
const { Image } = require("image-js");
const NearestColor = require("nearest-color");

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  
  function mean(histogram) {
    let total = 0;
    let sum = 0;
  
    for (let i = 0; i < histogram.length; i++) {
      total += histogram[i];
      sum += histogram[i] * i;
    }
    if (total === 0) {
      return 0;
    }
  
    return sum / total;
  }

(async () => {
	try {
		const data = JSON.parse(workerData);

		const imageData = await getImage({ id: data.id });

		if(imageData === null) { // This should NEVER happen!
			const error = ErrorCodes.image_not_found;
			parentPort.postMessage({ status: StatusCodes.error, erorr_code: error, message: "Image could not be found" });
			return process.exit(0);
		}
		
		await updateImage({ id: imageData.id, key: "status", value: StatusCodes.running });
		parentPort.postMessage({ status: StatusCodes.running });

		let blocks = await JSON.parse(fs.readFileSync(`src/savedBlocks.json`));

		// Get all blocks for that mc version
		const MC_VERSION = '1.19';
		blocks = blocks[MC_VERSION];

		// Convert to proper format to get nearestColor
		const colors = {};
		for (const key in blocks) {
			colors[key] = blocks[key].color;
		}

		let nearestColor = NearestColor.from(colors);

		let mainImage = await Image.load(imageData.original_file); // read image

		const MAX_BLOCKS = 100_000;

		let cachedPhotos = new Map();
		const minecraftBlockSize = 16;

		for (i = 0; Object.keys(colors).length > i; i++) {
			const key = Object.keys(colors)[i];

			let mc = await Image.load(`./versions/${MC_VERSION}/assets/minecraft/textures/block/${key}`);

			cachedPhotos.set(key, mc);

		}

		const fact = Math.sqrt(MAX_BLOCKS / (mainImage.width * mainImage.height));
		mainImage = mainImage.resize({ factor: fact });

		let mcImage = new Image(mainImage.width * minecraftBlockSize,mainImage.height * minecraftBlockSize);

		// get how many slizes
		let widthSlices = Math.floor(mainImage.width);
		let heightSlices = Math.floor(mainImage.height);

		const totalBlocks = widthSlices * heightSlices;

		let lastSend = 0;
		let runs = 0;
		for (let w = 0; widthSlices > w; w++) {
			// loop width
			for (let h = 0; heightSlices > h; h++) {
				// loop height
				runs++;

				const percentage = runs / totalBlocks * 100;
				if(new Date().getTime() - lastSend > 100 ) {
					parentPort.postMessage({percentage: percentage})
					lastSend = new Date().getTime();
				};
				

				let histograms = await mainImage
					.crop({ x: w, y: h, width: 1, height: 1 })
					.colorDepth(8)
					.getHistograms({ maxSlots: mainImage.maxValue + 1 });

				let result = new Array(histograms.length);
				for (let c = 0; c < histograms.length; c++) {

					let histogram = histograms[c];
					result[c] = Math.floor(mean(histogram));

				}

				try {

					let blockImage = cachedPhotos.get(nearestColor(rgbToHex(result[0], result[1], result[2])).name);

					await mcImage.insert(await blockImage, {
						x: minecraftBlockSize * w,
						y: minecraftBlockSize * h,
						inPlace: true,
					});

				} catch (e) {

					const error = ErrorCodes.image_insert_failed;

					parentPort.postMessage({ status: StatusCodes.error, erorr_code: error, message: "Failed to add an image block into the final output" });
					process.exit(0);

				}

			}
		}

		parentPort.postMessage({percentage: 99}) // Send 99% before the file saves

		const folderPath = `./images/${imageData.id}`;
        const filePath = `/minecraft_image.png`;

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, {recursive: true});
        }

		await mcImage.save(`${folderPath}${filePath}`);
		await updateImage({ id: imageData.id, key: "minecraft_file", value: `${folderPath}${filePath}` });

		await updateImage({ id: imageData.id, key: "status", value: StatusCodes.done });
		
		parentPort.postMessage({ minecraft_image: `${folderPath}${filePath}`, percentage: 100, status: StatusCodes.done})

	} catch (err) {
		// TODO Save error code into the database
		const error = ErrorCodes.unknown_error;

		parentPort.postMessage({ status: StatusCodes.error, erorr_code: error, info: err.toString() });
		process.exit(error);

	}
})();