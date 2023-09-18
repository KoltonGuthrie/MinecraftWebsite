let minDiff = 150; // px

$(document).ready(function () {
    $(".hero").height(window.innerHeight);

    $(window).resize(function () {
		if(Math.abs(window.innerHeight - $(".hero").height()) > minDiff) {
			$(".hero").height(window.innerHeight);
		}
    });
});