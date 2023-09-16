const { StatusCodes } = require("./statusCodes.js");
const { ErrorCodes } = require("./errorCodes.js");
const { getImage, updateImage } = require("./database.js");
const fs = require('fs');

const data = JSON.parse(process.argv.slice(2)[0]);

async function output(json) {
	process.stdout.write(JSON.stringify(JSON.stringify(json)));
	await Bun.sleep(1); // Stop outputs being sent at the same time
	return;
}

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
		const imageData = await getImage({ id: data.id });

		if (imageData.status !== StatusCodes.starting) {
			// Has already started/finished
			let img = await getImage({ id: data.id });
			await output({ status: img.status });
			while (img.status === StatusCodes.running) {
				// If running
				await Bun.sleep(5000); // Sleep for 5 seconds
				img = await getImage({ id: data.id });

				await output({ status: img.status });
			}
			await output({ status: img.status, minecraft_file: img.minecraft_file });
			return;
		}

		await updateImage({ id: imageData.id, key: "status", value: StatusCodes.running });
		await output({ status: StatusCodes.running });

		const { Image } = require("image-js");

		let colors = await Bun.file(`savedBlocks.json`).json();

		let nearestColor = require("nearest-color").from(colors);

		
		let mainImage = await Image.load(imageData.original_file); // read image

		await output({ message: `BlockSize: ${Math.min(mainImage.width*mainImage.height / 60244, 16)}` });

		let cachedPhotos = new Map();
		const blockSize = 16; // Quality. Doesn't have to be 16 (This needs to be chosen by the user or the server)
		const minecraftBlockSize = 16;

		for (i = 0; Object.keys(colors).length > i; i++) {
			const key = Object.keys(colors)[i];
			let mc = await Image.load(`texturepack/assets/minecraft/textures/block/${key}`);
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
				await output({ status: StatusCodes.error, erorr_code: error, message: "Image is too small" });
				process.exit(0);
			}
		} else {
			const error = ErrorCodes.image_too_small;
			await output({ status: StatusCodes.error, erorr_code: error, message: "Image is too small" });
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
					await output({ status: StatusCodes.error, erorr_code: error, message: "Failed to add an image block into the final output" });
					process.exit(0);
				}

			}
		}

		const folderPath = `./images/${imageData.id}`;
        const filePah = `/minecraft_image.png`;

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
        }

		await mcImage.save(`${folderPath}${filePah}`);
		await updateImage({ id: imageData.id, key: "minecraft_file", value: `${folderPath}${filePah}` });

		await updateImage({ id: imageData.id, key: "status", value: StatusCodes.done });
		await output({ status: StatusCodes.done });
	} catch (err) {
		await output({ status: StatusCodes.error, erorr_code: ErrorCodes.unknown_error, info: err.toString() });
		process.exit(ErrorCodes.unknown_error);
	}
})();