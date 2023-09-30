let minDiff = 150; // px

$(window).on('pageshow', function(){
    $('#file').val("");
	$("#file").prop("disabled", false);
});

$(document).ready(function () {
	console.log('ready ' + new Date().getTime());
	$("#file").prop("disabled", false);
	
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
			$(".loading").removeClass("hide");
			$(".loading-bar").removeClass("hide");
			$("#upload-form").submit();
			$("#file").prop("disabled", true);
		} else {
			alertify.error("Please select a file");
		}
	});

	$("#upload-form").on("submit", function(e) {
		e.preventDefault();

		$.ajax({
		  type: "POST",
		  url: "upload",
		  data: new FormData(this),
		  contentType: false,
          cache: false,
          processData:false,
		  xhr: function () {
			  const xhr = new window.XMLHttpRequest();

			  xhr.upload.addEventListener("progress", function(evt) {
				if (evt.lengthComputable) {
					var percentComplete = ((evt.loaded / evt.total) * 100);
					$(".bar").css("width", `${percentComplete}%`);
					$(".percentage").text(`${Math.floor(percentComplete)}%`);
				}
			}, false);
			return xhr;
		  },
		  success: function(e) {
			window.location = `image/?id=${e.image_id}`;
		  },
		  error: function(e) {
			if(e.status === 429) {
				alertify.error(`${e.status}: ${e.statusText}`);
				alertify.warning(`You have sent too many request. Please try again.`);
			} else {
				alertify.error(`${e.status}: ${e.statusText}`);
			}

			$(".bar").css("width", `0%`);
			$(".percentage").text('');
			$(".loading").addClass("hide");
			$(".loading-bar").addClass("hide");
			$("#file").prop("disabled", false);
		  }
		});
	});

});
