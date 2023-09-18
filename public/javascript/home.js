let minDiff = 150; // px

$(document).ready(function () {
    $(".hero").height(window.innerHeight);

	$('#upload-form')[0].reset()

    $(window).resize(function () {
		if(Math.abs(window.innerHeight - $(".hero").height()) > minDiff) {
			$(".hero").height(window.innerHeight);
		}
    });
    
	$(".file-upload").on("click", function () {
		$("#upload-form input[type='file']").click();
	});

	$("#file").on("change", function (e) {
		const file = $(this).prop("files")[0]?.["name"] || "";

		$(".file-name").text(file);

		if ($(this).val() !== "") {
			$("#loading").removeClass("hide");
			$("#upload-form").submit();
		} else {
			alertify.error("Please select a file");
		}
	});
});
