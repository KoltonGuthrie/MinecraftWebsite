const StatusCodes = {
  starting: 0,
  running: 1,
  done: 2,
  error: 3,
};

const imageID = new URL(document.URL).searchParams.get("id");

const socket = new WebSocket(`ws://${document.location.host}?id=${imageID}`);

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;


const minDiff = 150; // px

$(document).ready(function () {
    $('.hero-image').css('background-image', `url(/view?id=${imageID}&original=true&quality=10&width=${windowWidth}&height=${windowHeight}&webp=true)`);

  
    $(".hero").height(window.innerHeight);

    $(window).resize(function () {
		if(Math.abs(window.innerHeight - $(".hero").height()) > minDiff) {
			$(".hero").height(window.innerHeight);
		}
    });

    $('#mc-image').on('load', function() {
      $('#loading').addClass("hide")
      $('.image-container').css("background-color", "#00000000");
    });

    activateWebSocket();

});

function activateWebSocket() {

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
      $('html').animate({ scrollTop: $("#image-anchor").offset().top}, 0);
      $("#mc-image").attr("src", `http://${document.location.host}/view?id=${imageID}&original=false&webp=false`).addClass("zoom");
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

  socket.addEventListener("open", (e) => {document.querySelector("#ws_connected").innerText = "true"});
  socket.addEventListener("close", (e) => {console.warn(`Websocket closed with code: ${e.code}, reason: ${e.reason}`); document.querySelector("#ws_connected").innerText = "false"});

}

function setBar(n) {
  const percentage = Math.min(Math.floor(n), 100);
  $("#bar").css("width", `${percentage}%`);
  $("#percentage").text(`${percentage}%`)
}
