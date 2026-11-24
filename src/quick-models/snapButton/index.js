import { buttonTool } from "../button-parts.js";
import maleFoot from "./maleFoot.js";
import stud from "./stud.js";
import socket from "./socket.js";
import femaleFoot from "./femaleFoot.js";

export default buttonTool("snapButton", "急钮", { maleFoot, stud, socket, femaleFoot }, {
  "domed": [
    36.5,
    25.77,
    13.52,
    0.0
  ],
  "flat": [
    36.5,
    25.77,
    13.52,
    2.16
  ],
  "cut": [
    36.5,
    25.77,
    13.52,
    2.16
  ]
});
