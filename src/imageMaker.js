const { StatusCodes } = require("./statusCodes.js");
const { ErrorCodes } = require("./errorCodes.js");
const { getImage, updateImage } = require("./database.js");
const fs = require('fs');
const { workerData } = require('node:worker_threads'); // Bun does not support workerData?

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

		if(imageData === null) {
			const error = ErrorCodes.image_not_found;
			postMessage({ status: StatusCodes.error, erorr_code: error, message: "Image could not be found" });
			return process.exit(0);
		}

		if (imageData.status !== StatusCodes.starting) { // Has already started
			let img = await getImage({ id: data.id });

			while (img.status === StatusCodes.running) {
				// If running
				await Bun.sleep(5000); // Sleep for 5 seconds
				img = await getImage({ id: data.id });
				postMessage({ status: img.status});

			}

			postMessage({ status: img.status});
			return;
		}

		await updateImage({ id: imageData.id, key: "status", value: StatusCodes.running });
		postMessage({ status: StatusCodes.running });

		const { Image } = require("image-js");

		let blocks = await Bun.file(`src/savedBlocks.json`).json();

		// Get all blocks for that mc version
		const MC_VERSION = '1.19';
		blocks = blocks[MC_VERSION];

		// Convert to proper format to get nearestColor
		const colors = {};
		for (const key in blocks) {
			colors[key] = blocks[key].color;
		}

		let nearestColor = require("nearest-color").from(colors);

		let mainImage = await Image.load(imageData.original_file); // read image

		const MAX_BLOCKS = 100_000;

		const totalPixels = mainImage.width*mainImage.height;
		const blockSize = Math.sqrt(totalPixels / MAX_BLOCKS);
		const totalBlocks = totalPixels / Math.pow(blockSize, 2);

		postMessage({ message: `totalPixels: ${totalPixels}` });
		postMessage({ message: `blockSize: ${blockSize}` });
		postMessage({ message: `totalBlocks: ${totalBlocks}` });


		let cachedPhotos = new Map();
		const minecraftBlockSize = 16;

		for (i = 0; Object.keys(colors).length > i; i++) {
			const key = Object.keys(colors)[i];

			let mc = await Image.load(`./versions/${MC_VERSION}/assets/minecraft/textures/block/${key}`);

			cachedPhotos.set(key, mc);

		}

		if (mainImage.width - (mainImage.width % blockSize) > blockSize) {
			if (mainImage.height - (mainImage.height % blockSize) > blockSize) {
				if (mainImage.width % blockSize !== 0) {

					mainImage = mainImage.resize({
						width: mainImage.width - (mainImage.width % blockSize),
						height: mainImage.height,
						preserveAspectRatio: false,
					});

				}

				if (mainImage.height % blockSize !== 0) {

					mainImage = mainImage.resize({
						width: mainImage.width,
						height: mainImage.height - (mainImage.height % blockSize),
						preserveAspectRatio: false,
					});

				}
			} else {

				const error = ErrorCodes.image_too_small;

				postMessage({ status: StatusCodes.error, erorr_code: error, message: "Image is too small" });
				process.exit(0);

			}
		} else {

			const error = ErrorCodes.image_too_small;

			postMessage({ status: StatusCodes.error, erorr_code: error, message: "Image is too small" });
			process.exit(0);

		}

		let mcImage = new Image(
			Math.floor(mainImage.width / blockSize) * minecraftBlockSize,
			Math.floor(mainImage.height / blockSize) * minecraftBlockSize
		);

		// get how many slizes
		let widthSlices = Math.floor(mainImage.width / blockSize);
		let heightSlices = Math.floor(mainImage.height / blockSize);

		for (let w = 0; widthSlices > w; w++) {
			// loop width
			for (let h = 0; heightSlices > h; h++) {
				// loop height

				let histograms = await mainImage
					.crop({ x: blockSize * w, y: blockSize * h, width: blockSize, height: blockSize })
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

					postMessage({ status: StatusCodes.error, erorr_code: error, message: "Failed to add an image block into the final output" });
					process.exit(0);

				}

			}
		}

		const folderPath = `./images/${imageData.id}`;
        const filePah = `/minecraft_image.png`;

		postMessage({ message: `${folderPath}${filePah}` })

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
        }

		await mcImage.save(`${folderPath}${filePah}`);
		await updateImage({ id: imageData.id, key: "minecraft_file", value: `${folderPath}${filePah}` });

		await updateImage({ id: imageData.id, key: "status", value: StatusCodes.done });
		postMessage({ status: StatusCodes.done });

	} catch (err) {

		const error = ErrorCodes.unknown_error;

		postMessage({ status: StatusCodes.error, erorr_code: error, info: err.toString() });
		process.exit(error);

	}
})();