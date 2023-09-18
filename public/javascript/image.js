const StatusCodes = {
  starting: 0,
  running: 1,
  done: 2,
  error: 3,
};

const imageID = new URL(document.URL).searchParams.get("id");

const minDiff = 150; // px

$(document).ready(function () {
    $('.hero-image').css('background-image', `url(/view?id=${imageID}&original=true)`);
  
    $(".hero").height(window.innerHeight);

    $(window).resize(function () {
		if(Math.abs(window.innerHeight - $(".hero").height()) > minDiff) {
			$(".hero").height(window.innerHeight);
		}
    });

    
});



const socket = new WebSocket(`ws://${document.location.host}/ws?id=${imageID}`);

socket.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  console.log(msg);

  if(msg?.percentage) {
    setBar(msg.percentage);

    if(msg.percentage === 100) {
      $('.creating').text("Done!");
      $('.creating').addClass('done');
    }
  }

  if (msg?.minecraft_image) {
    $("#mc-image").attr("src", `http://${document.location.host}/view?id=${imageID}`);
    const viewer = new Viewer(document.querySelector('#mc-image'), {
      
      button: false,
      navbar: false,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        prev: false,
        play: {
        show: false,
        size: 'large',
        },
        next: false,
        rotateLeft: false,
        rotateRight: false,
        flipHorizontal: false,
        flipVertical: false,
      },
      movable: true,
      title: false,
      zoomRatio: 0.3,
      minZoomRatio: 0.05,

    });
    return;
  }
});

socket.addEventListener("error", (e) => {
  console.error(e);
});

socket.addEventListener("open", (e) => (document.querySelector("#ws_connected").innerText = "true"));
socket.addEventListener("close", (e) => (document.querySelector("#ws_connected").innerText = "false"));

function setBar(n) {
  const percentage = Math.min(Math.ceil(n), 100);
  document.querySelector("#bar").style.width = `${percentage}%`;
  $("#percentage").text(`${percentage}%`)
}
