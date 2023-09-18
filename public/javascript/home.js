let minDiff = 150; // px

$(window).on('pageshow', function(){
    $('#file').val("");
	$("#file").prop("disabled", false);
});

$(document).ready(function () {
	console.log('ready ' + new Date().getTime())
	
    $(".hero").height(window.innerHeight);

    $(window).resize(function () {
		if(Math.abs(window.innerHeight - $(".hero").height()) > minDiff) {
			$(".hero").height(window.innerHeight);
		}
    });
    
	$(".file-upload").on("click", function () {
		$("#file").click();
	});

	$("#file").on("change", function (e) {
		const file = $(this).prop("files")[0]?.["name"] || "";

		$(".file-name").text(file);

		if ($(this).val() !== "") {
			
			$("#loading").removeClass("hide");
			$("#upload-form").submit();
			$("#file").prop("disabled", true);
			
		} else {
			alertify.error("Please select a file");
		}
	});
});
