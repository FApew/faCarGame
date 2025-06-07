const socket = io()

socket.on("ip", (data) => {
    document.body.innerHTML = data
})