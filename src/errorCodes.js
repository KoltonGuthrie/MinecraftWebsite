const ErrorCodes = {
	none: 0,
    starting_error: 1,
    downloading_error: 2,
    reading_file_error: 3,
    image_too_small: 4,
    image_insert_failed: 5,
    image_not_found: 6,
    unknown_error: 500,
}

module.exports = {
	ErrorCodes,
}