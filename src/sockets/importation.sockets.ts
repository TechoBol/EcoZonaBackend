import io from "socket.io";

const importationSocketInstance = (io: io.Server) => {
  io.on("connection", (socket) => {
    socket.on("newImportation", (importation) => {
      socket.broadcast.emit("importation", importation);
    });
  });
};

export default importationSocketInstance;